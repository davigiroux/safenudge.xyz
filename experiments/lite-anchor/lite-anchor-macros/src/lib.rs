//! Proc macros for lite-anchor.
//!
//! These run inside the compiler on the host, so they can hash, decode base58 and parse Rust with
//! the full standard library. Only the code they emit has to be `no_std`.

use proc_macro::TokenStream;
use proc_macro2::{Span, TokenStream as TokenStream2};
use quote::{format_ident, quote};
use sha2::{Digest, Sha256};
use syn::parse::{Parse, ParseStream};
use syn::punctuated::Punctuated;
use syn::{
    parse_macro_input, Attribute, Data, DeriveInput, Expr, Fields, FnArg, Ident, Item, ItemEnum,
    ItemMod, ItemStruct, LitByteStr, LitStr, Pat, Token, Type,
};

/// First 8 bytes of `sha256(preimage)`: Anchor's discriminator scheme.
fn discriminator(preimage: &str) -> [u8; 8] {
    let hash = Sha256::digest(preimage.as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&hash[..8]);
    out
}

fn bytes_literal(bytes: &[u8]) -> TokenStream2 {
    quote! { [#(#bytes),*] }
}

// ── address! ────────────────────────────────────────────────────────────────

/// `address!("base58")`: decodes an address at compile time into a constant `Address`.
#[proc_macro]
pub fn address(input: TokenStream) -> TokenStream {
    let lit = parse_macro_input!(input as LitStr);
    let decoded = match bs58::decode(lit.value()).into_vec() {
        Ok(bytes) if bytes.len() == 32 => bytes,
        Ok(bytes) => {
            let msg = format!("address decodes to {} bytes, expected 32", bytes.len());
            return syn::Error::new(lit.span(), msg).to_compile_error().into();
        }
        Err(e) => {
            return syn::Error::new(lit.span(), format!("invalid base58: {e}"))
                .to_compile_error()
                .into()
        }
    };
    let bytes = bytes_literal(&decoded);
    quote! { ::lite_anchor::Address::new_from_array(#bytes) }.into()
}

// ── #[account] ──────────────────────────────────────────────────────────────

struct AccountArgs {
    discriminator: Option<LitByteStr>,
}

impl Parse for AccountArgs {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        if input.is_empty() {
            return Ok(Self {
                discriminator: None,
            });
        }
        let key: Ident = input.parse()?;
        if key != "discriminator" {
            return Err(syn::Error::new(
                key.span(),
                "expected `discriminator = b\"...\"`",
            ));
        }
        input.parse::<Token![=]>()?;
        let lit: LitByteStr = input.parse()?;
        if lit.value().len() != 8 {
            return Err(syn::Error::new(lit.span(), "discriminator must be 8 bytes"));
        }
        Ok(Self {
            discriminator: Some(lit),
        })
    }
}

/// `#[account]` / `#[account(discriminator = b"8 bytes")]` on a struct with named fields.
///
/// Lays the struct out `#[repr(C, packed)]` so its bytes are its fields in order, as Borsh writes
/// them, and implements `AccountData`. Every field must be `ZeroCopy`: integers, `Address`, and
/// arrays of those. `bool` is rejected because not every byte is a valid `bool`; use `u8`.
/// Without an explicit discriminator it is `sha256("account:<Name>")[..8]`, as in Anchor.
#[proc_macro_attribute]
pub fn account(args: TokenStream, input: TokenStream) -> TokenStream {
    let args = parse_macro_input!(args as AccountArgs);
    let item = parse_macro_input!(input as ItemStruct);
    let name = &item.ident;

    let Fields::Named(fields) = &item.fields else {
        return syn::Error::new_spanned(&item, "#[account] needs named fields")
            .to_compile_error()
            .into();
    };
    if let Some(repr) = item.attrs.iter().find(|a| a.path().is_ident("repr")) {
        return syn::Error::new_spanned(repr, "#[account] sets the repr itself")
            .to_compile_error()
            .into();
    }

    let disc = match &args.discriminator {
        Some(lit) => lit.value(),
        None => discriminator(&format!("account:{name}")).to_vec(),
    };
    let disc = bytes_literal(&disc);
    let field_tys = fields.named.iter().map(|f| &f.ty);

    quote! {
        #[derive(Clone, Copy)]
        #[repr(C, packed)]
        #item

        // SAFETY: `packed` gives alignment 1 and no padding, and every field is `ZeroCopy`
        // (checked below), so any bytes of the right length are a valid value.
        unsafe impl ::lite_anchor::zero_copy::ZeroCopy for #name {}
        unsafe impl ::lite_anchor::zero_copy::AccountData for #name {}

        impl ::lite_anchor::zero_copy::Discriminator for #name {
            const DISCRIMINATOR: [u8; 8] = #disc;
        }

        const _: () = {
            #( ::lite_anchor::zero_copy::assert_zero_copy::<#field_tys>(); )*
            assert!(::core::mem::align_of::<#name>() == 1);
        };
    }
    .into()
}

// ── #[event] ────────────────────────────────────────────────────────────────

/// `#[event]` on a struct whose fields have a fixed-size Borsh encoding. `emit()` writes
/// `sha256("event:<Name>")[..8]` followed by the fields to the log, byte for byte what Anchor's
/// `emit!` writes, so existing log decoders keep working.
#[proc_macro_attribute]
pub fn event(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);
    let name = &item.ident;
    let Fields::Named(fields) = &item.fields else {
        return syn::Error::new_spanned(&item, "#[event] needs named fields")
            .to_compile_error()
            .into();
    };
    let disc = bytes_literal(&discriminator(&format!("event:{name}")));
    let idents: Vec<_> = fields
        .named
        .iter()
        .map(|f| f.ident.as_ref().unwrap())
        .collect();
    let tys: Vec<_> = fields.named.iter().map(|f| &f.ty).collect();

    quote! {
        #item

        impl ::lite_anchor::event::Event for #name {
            const DISCRIMINATOR: [u8; 8] = #disc;

            #[inline(always)]
            fn emit(&self) {
                use ::lite_anchor::event::BorshFixed;
                const SIZE: usize = 8 #( + <#tys as BorshFixed>::SIZE )*;
                let mut buf = [0u8; SIZE];
                buf[..8].copy_from_slice(&<Self as ::lite_anchor::event::Event>::DISCRIMINATOR);
                let mut offset = 8usize;
                #(
                    BorshFixed::write(&self.#idents, &mut buf[offset..]);
                    offset += <#tys as BorshFixed>::SIZE;
                )*
                let _ = offset;
                ::lite_anchor::event::log_data(&[&buf]);
            }
        }
    }
    .into()
}

// ── #[error_code] ───────────────────────────────────────────────────────────

/// `#[error_code]` on a fieldless enum. Variant `i` becomes `ProgramError::Custom(6000 + i)`, as
/// in Anchor. `#[msg("...")]` is kept as `msg()` for clients and tests; it is not logged on-chain.
#[proc_macro_attribute]
pub fn error_code(_args: TokenStream, input: TokenStream) -> TokenStream {
    let mut item = parse_macro_input!(input as ItemEnum);
    let name = item.ident.clone();
    let mut arms = Vec::new();
    for variant in &mut item.variants {
        if !matches!(variant.fields, Fields::Unit) || variant.discriminant.is_some() {
            return syn::Error::new_spanned(&*variant, "#[error_code] variants are plain names")
                .to_compile_error()
                .into();
        }
        let msg = take_msg(&mut variant.attrs).unwrap_or_else(|| variant.ident.to_string());
        let ident = &variant.ident;
        arms.push(quote! { Self::#ident => #msg });
    }

    quote! {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        #[repr(u32)]
        #item

        impl #name {
            /// The code the program returns, `6000 + index`.
            pub const fn code(self) -> u32 {
                ::lite_anchor::error::ERROR_CODE_OFFSET + self as u32
            }

            pub const fn msg(self) -> &'static str {
                match self { #(#arms),* }
            }
        }

        impl ::core::convert::From<#name> for ::lite_anchor::ProgramError {
            #[inline(always)]
            fn from(e: #name) -> Self {
                ::lite_anchor::ProgramError::Custom(e.code())
            }
        }
    }
    .into()
}

fn take_msg(attrs: &mut Vec<Attribute>) -> Option<String> {
    let idx = attrs.iter().position(|a| a.path().is_ident("msg"))?;
    let attr = attrs.remove(idx);
    attr.parse_args::<LitStr>().ok().map(|l| l.value())
}

// ── #[derive(Accounts)] ─────────────────────────────────────────────────────

/// One `#[account(...)]` field attribute.
#[derive(Default)]
struct FieldConstraints {
    mutable: bool,
    signer: bool,
    seeds: Option<Vec<Expr>>,
    /// `Some(None)` for a bare `bump` (canonical search), `Some(Some(e))` for `bump = e`.
    bump: Option<Option<Expr>>,
    has_one: Vec<(Ident, Option<Expr>)>,
    raw: Vec<(Expr, Option<Expr>)>,
    address: Option<(Expr, Option<Expr>)>,
}

fn parse_custom_error(input: ParseStream) -> syn::Result<Option<Expr>> {
    if input.peek(Token![@]) {
        input.parse::<Token![@]>()?;
        Ok(Some(input.parse()?))
    } else {
        Ok(None)
    }
}

impl Parse for FieldConstraints {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut c = FieldConstraints::default();
        while !input.is_empty() {
            if input.peek(Token![mut]) {
                input.parse::<Token![mut]>()?;
                c.mutable = true;
            } else {
                let key: Ident = input.parse()?;
                match key.to_string().as_str() {
                    "signer" => c.signer = true,
                    "seeds" => {
                        input.parse::<Token![=]>()?;
                        let content;
                        syn::bracketed!(content in input);
                        let seeds = Punctuated::<Expr, Token![,]>::parse_terminated(&content)?;
                        c.seeds = Some(seeds.into_iter().collect());
                    }
                    "bump" => {
                        if input.peek(Token![=]) {
                            input.parse::<Token![=]>()?;
                            c.bump = Some(Some(input.parse()?));
                        } else {
                            c.bump = Some(None);
                        }
                    }
                    "has_one" => {
                        input.parse::<Token![=]>()?;
                        let target: Ident = input.parse()?;
                        c.has_one.push((target, parse_custom_error(input)?));
                    }
                    "constraint" => {
                        input.parse::<Token![=]>()?;
                        let expr: Expr = input.parse()?;
                        c.raw.push((expr, parse_custom_error(input)?));
                    }
                    "address" => {
                        input.parse::<Token![=]>()?;
                        let expr: Expr = input.parse()?;
                        c.address = Some((expr, parse_custom_error(input)?));
                    }
                    other => {
                        return Err(syn::Error::new(
                            key.span(),
                            format!("unsupported constraint `{other}`"),
                        ))
                    }
                }
            }
            if !input.is_empty() {
                input.parse::<Token![,]>()?;
            }
        }
        if c.seeds.is_some() != c.bump.is_some() {
            return Err(input.error("`seeds` and `bump` go together"));
        }
        Ok(c)
    }
}

/// Last path segment of a field type: `Account<T>` → `Account`.
fn type_name(ty: &Type) -> Option<String> {
    match ty {
        Type::Path(p) => p.path.segments.last().map(|s| s.ident.to_string()),
        _ => None,
    }
}

fn error_or(custom: &Option<Expr>, default: TokenStream2) -> TokenStream2 {
    match custom {
        Some(e) => quote! { ::core::convert::Into::<::lite_anchor::ProgramError>::into(#e) },
        None => quote! { ::lite_anchor::ProgramError::from(#default) },
    }
}

/// `#[derive(Accounts)]`: validates the instruction's accounts in Anchor's order.
///
/// 1. Each field is built from the account at its position, which runs the field type's own
///    checks (signer, owner, discriminator, token layout).
/// 2. Mutable `Account`, `TokenAccount` and `Mint` fields must be distinct accounts (2040).
/// 3. Each field's constraints run in field order: `seeds`/`bump`, `mut`, `signer`, `has_one`,
///    `constraint`, `address`. Constraint expressions can name any field.
#[proc_macro_derive(Accounts, attributes(account))]
pub fn derive_accounts(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    match derive_accounts_impl(&input) {
        Ok(ts) => ts.into(),
        Err(e) => e.to_compile_error().into(),
    }
}

fn derive_accounts_impl(input: &DeriveInput) -> syn::Result<TokenStream2> {
    let name = &input.ident;
    let Data::Struct(data) = &input.data else {
        return Err(syn::Error::new_spanned(
            input,
            "#[derive(Accounts)] needs a struct",
        ));
    };
    let Fields::Named(fields) = &data.fields else {
        return Err(syn::Error::new_spanned(
            input,
            "#[derive(Accounts)] needs named fields",
        ));
    };

    let mut idents = Vec::new();
    let mut tys = Vec::new();
    let mut constraints = Vec::new();
    for field in &fields.named {
        let mut attrs = field.attrs.iter().filter(|a| a.path().is_ident("account"));
        let c = match attrs.next() {
            Some(attr) => attr.parse_args()?,
            None => FieldConstraints::default(),
        };
        // Anchor merges repeated attributes. Rejecting them beats silently dropping constraints.
        if let Some(extra) = attrs.next() {
            return Err(syn::Error::new_spanned(
                extra,
                "put all of a field's constraints in one #[account(...)]",
            ));
        }
        idents.push(field.ident.clone().unwrap());
        tys.push(field.ty.clone());
        constraints.push(c);
    }
    let len = idents.len();
    let slots: Vec<Ident> = (0..len).map(|i| format_ident!("__account_{}", i)).collect();

    let build = idents.iter().zip(&tys).zip(&slots).map(|((ident, ty), slot)| {
        quote! {
            let #ident: #ty = ::lite_anchor::FromAccountView::from_account_view(#slot, program_id)?;
        }
    });

    // Anchor's duplicate check covers mutable fields that serialize on exit. Here no field
    // serializes on exit, but a duplicate would still alias two views of one account.
    let dup_candidates: Vec<&Ident> = idents
        .iter()
        .zip(&tys)
        .zip(&constraints)
        .filter(|((_, ty), c)| {
            c.mutable
                && matches!(
                    type_name(ty).as_deref(),
                    Some("Account" | "TokenAccount" | "Mint")
                )
        })
        .map(|((ident, _), _)| ident)
        .collect();
    let mut dup_checks = Vec::new();
    for (i, a) in dup_candidates.iter().enumerate() {
        for b in &dup_candidates[i + 1..] {
            dup_checks.push(quote! {
                if ::lite_anchor::FromAccountView::address(&#a)
                    == ::lite_anchor::FromAccountView::address(&#b)
                {
                    return Err(::lite_anchor::error::ErrorCode::ConstraintDuplicateMutableAccount.into());
                }
            });
        }
    }

    let checks = idents.iter().zip(&constraints).map(|(ident, c)| {
        let mut out = Vec::new();
        if let (Some(seeds), Some(bump)) = (&c.seeds, &c.bump) {
            let seeds = seeds
                .iter()
                .map(|s| quote! { ::lite_anchor::pda::seed(&(#s)) });
            // One expression statement, so temporaries in seed expressions (such as a `load()`
            // guard) live until the check is done.
            out.push(match bump {
                Some(bump) => quote! {
                    ::lite_anchor::pda::verify_with_bump(
                        &[#(#seeds),*],
                        #bump,
                        program_id,
                        ::lite_anchor::FromAccountView::address(&#ident),
                    )?;
                },
                None => quote! {
                    ::lite_anchor::pda::verify_canonical(
                        &[#(#seeds),*],
                        program_id,
                        ::lite_anchor::FromAccountView::address(&#ident),
                    )?;
                },
            });
        }
        if c.mutable {
            out.push(quote! {
                if !::lite_anchor::FromAccountView::view(&#ident).is_writable() {
                    return Err(::lite_anchor::error::ErrorCode::ConstraintMut.into());
                }
            });
        }
        if c.signer {
            out.push(quote! {
                if !::lite_anchor::FromAccountView::view(&#ident).is_signer() {
                    return Err(::lite_anchor::error::ErrorCode::ConstraintSigner.into());
                }
            });
        }
        for (target, err) in &c.has_one {
            let err = error_or(
                err,
                quote! { ::lite_anchor::error::ErrorCode::ConstraintHasOne },
            );
            out.push(quote! {
                if #ident.load()?.#target != *::lite_anchor::FromAccountView::address(&#target) {
                    return Err(#err);
                }
            });
        }
        for (expr, err) in &c.raw {
            let err = error_or(
                err,
                quote! { ::lite_anchor::error::ErrorCode::ConstraintRaw },
            );
            out.push(quote! {
                if !(#expr) {
                    return Err(#err);
                }
            });
        }
        if let Some((expr, err)) = &c.address {
            let err = error_or(
                err,
                quote! { ::lite_anchor::error::ErrorCode::ConstraintAddress },
            );
            out.push(quote! {
                if *::lite_anchor::FromAccountView::address(&#ident) != (#expr) {
                    return Err(#err);
                }
            });
        }
        quote! { #(#out)* }
    });

    let (impl_generics, ty_generics, where_clause) = input.generics.split_for_impl();
    Ok(quote! {
        impl #impl_generics ::lite_anchor::Accounts for #name #ty_generics #where_clause {
            const LEN: usize = #len;

            #[inline(always)]
            fn try_accounts(
                program_id: &::lite_anchor::Address,
                accounts: &[::lite_anchor::AccountView],
            ) -> ::lite_anchor::Result<Self> {
                let [#(#slots,)* ..] = accounts else {
                    return Err(::lite_anchor::error::ErrorCode::AccountNotEnoughKeys.into());
                };
                #(#build)*
                #(#dup_checks)*
                #(#checks)*
                Ok(Self { #(#idents),* })
            }
        }
    })
}

// ── #[program] ──────────────────────────────────────────────────────────────

/// `#[program]` on a module of handlers `pub fn name(ctx: Context<Accounts>, args...) -> Result<()>`.
///
/// Generates the entrypoint and a dispatcher that matches `sha256("global:<name>")[..8]`, decodes
/// the arguments, validates the accounts and calls the handler, in Anchor's order. Unknown or
/// short instruction data fails with `InstructionFallbackNotFound` (101), as in Anchor 1.0. The
/// entrypoint is left out under the `no-entrypoint` feature, so other crates can link the program.
#[proc_macro_attribute]
pub fn program(_args: TokenStream, input: TokenStream) -> TokenStream {
    let module = parse_macro_input!(input as ItemMod);
    match program_impl(&module) {
        Ok(ts) => ts.into(),
        Err(e) => e.to_compile_error().into(),
    }
}

fn program_impl(module: &ItemMod) -> syn::Result<TokenStream2> {
    let mod_name = &module.ident;
    let Some((_, items)) = &module.content else {
        return Err(syn::Error::new_spanned(
            module,
            "#[program] needs an inline module",
        ));
    };

    let mut branches = Vec::new();
    let mut disc_consts = Vec::new();
    for item in items {
        let Item::Fn(f) = item else { continue };
        if !matches!(f.vis, syn::Visibility::Public(_)) {
            continue;
        }
        let fn_name = &f.sig.ident;
        let mut inputs = f.sig.inputs.iter();
        let Some(FnArg::Typed(ctx)) = inputs.next() else {
            return Err(syn::Error::new_spanned(
                &f.sig,
                "first argument must be `ctx: Context<T>`",
            ));
        };
        let accounts_ty = context_accounts_type(&ctx.ty)
            .ok_or_else(|| syn::Error::new_spanned(&ctx.ty, "expected `Context<T>`"))?;

        let mut arg_names = Vec::new();
        let mut arg_reads = Vec::new();
        for arg in inputs {
            let FnArg::Typed(arg) = arg else {
                unreachable!()
            };
            let Pat::Ident(pat) = &*arg.pat else {
                return Err(syn::Error::new_spanned(
                    &arg.pat,
                    "arguments must be plain names",
                ));
            };
            let ident = &pat.ident;
            let ty = &arg.ty;
            arg_reads.push(quote! {
                let #ident = <#ty as ::lite_anchor::ix::IxArg>::read(&mut __args)?;
            });
            arg_names.push(ident.clone());
        }

        let disc = discriminator(&format!("global:{fn_name}"));
        let disc_lit = bytes_literal(&disc);
        let const_name = Ident::new(&fn_name.to_string().to_uppercase(), Span::call_site());
        disc_consts.push(quote! { pub const #const_name: [u8; 8] = #disc_lit; });

        branches.push(quote! {
            if let Some(__rest) = data.strip_prefix(&instruction::#const_name) {
                let mut __args: &[u8] = __rest;
                #(#arg_reads)*
                let mut __accounts =
                    <#accounts_ty as ::lite_anchor::Accounts>::try_accounts(program_id, accounts)?;
                let __ctx = ::lite_anchor::Context {
                    program_id,
                    accounts: &mut __accounts,
                    remaining_accounts: accounts
                        .get(<#accounts_ty as ::lite_anchor::Accounts>::LEN..)
                        .unwrap_or(&[]),
                };
                return #mod_name::#fn_name(__ctx #(, #arg_names)*);
            }
        });
    }

    Ok(quote! {
        #module

        /// Instruction discriminators, `sha256("global:<name>")[..8]`.
        pub mod instruction {
            #(#disc_consts)*
        }

        /// Matches the instruction discriminator and runs its handler.
        pub fn dispatch(
            program_id: &::lite_anchor::Address,
            accounts: &mut [::lite_anchor::AccountView],
            data: &[u8],
        ) -> ::lite_anchor::ProgramResult {
            let accounts: &[::lite_anchor::AccountView] = accounts;
            #(#branches)*
            Err(::lite_anchor::error::ErrorCode::InstructionFallbackNotFound.into())
        }

        #[cfg(not(feature = "no-entrypoint"))]
        #[allow(dead_code)]
        mod __lite_anchor_entrypoint {
            ::lite_anchor::pinocchio::program_entrypoint!(super::dispatch, { ::lite_anchor::MAX_ACCOUNTS });
            ::lite_anchor::pinocchio::no_allocator!();
            ::lite_anchor::pinocchio::nostd_panic_handler!();
        }
    })
}

/// `Context<'_, T>` or `Context<T>` → `T`.
fn context_accounts_type(ty: &Type) -> Option<&Type> {
    let Type::Path(p) = ty else { return None };
    let seg = p.path.segments.last()?;
    if seg.ident != "Context" {
        return None;
    }
    let syn::PathArguments::AngleBracketed(args) = &seg.arguments else {
        return None;
    };
    args.args.iter().find_map(|a| match a {
        syn::GenericArgument::Type(t) => Some(t),
        _ => None,
    })
}
