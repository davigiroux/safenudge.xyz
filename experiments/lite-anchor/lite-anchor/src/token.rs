//! SPL Token and Token-2022 accounts, checked as `anchor_spl::token_interface` checks them.

use pinocchio::cpi::invoke;
use pinocchio::error::ProgramError;
use pinocchio::instruction::{InstructionAccount, InstructionView};
use pinocchio::{AccountView, Address};

use crate::accounts::SYSTEM_PROGRAM_ID;
use crate::error::ErrorCode;
use crate::{FromAccountView, Result};

/// `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
pub const TOKEN_PROGRAM_ID: Address =
    crate::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/// `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
pub const TOKEN_2022_PROGRAM_ID: Address =
    crate::address!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const ACCOUNT_LEN: usize = 165;
const MINT_LEN: usize = 82;
const MULTISIG_LEN: usize = 355;
/// Token-2022 writes the account type at this offset when an account has extensions.
const ACCOUNT_TYPE_OFFSET: usize = ACCOUNT_LEN;
const ACCOUNT_TYPE_MINT: u8 = 1;
const ACCOUNT_TYPE_ACCOUNT: u8 = 2;

#[inline(always)]
fn is_token_program(id: &Address) -> bool {
    *id == TOKEN_PROGRAM_ID || *id == TOKEN_2022_PROGRAM_ID
}

/// Owner checks shared by token accounts and mints, in Anchor's `InterfaceAccount` order.
#[inline(always)]
fn check_token_owner(view: &AccountView) -> Result<()> {
    if view.owned_by(&SYSTEM_PROGRAM_ID) && view.lamports() == 0 {
        return Err(ErrorCode::AccountNotInitialized.into());
    }
    if !is_token_program(view.owner()) {
        return Err(ErrorCode::AccountOwnedByWrongProgram.into());
    }
    Ok(())
}

#[inline(always)]
fn address_at(data: &[u8], offset: usize) -> Address {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&data[offset..offset + 32]);
    Address::new_from_array(bytes)
}

/// A token account of either token program.
///
/// Rejects what `StateWithExtensions::<Account>::unpack` rejects at the base level: the multisig
/// length, a short account, an uninitialized account, and extension data not marked as an
/// account. It does not walk the TLV extension entries; the token program does that on any CPI
/// that moves funds.
#[derive(Clone, Copy)]
pub struct TokenAccount {
    view: AccountView,
    mint: Address,
    owner: Address,
    amount: u64,
}

impl FromAccountView for TokenAccount {
    #[inline(always)]
    fn from_account_view(view: &AccountView, _program_id: &Address) -> Result<Self> {
        check_token_owner(view)?;
        let data = view.try_borrow()?;
        if data.len() < ACCOUNT_LEN || data.len() == MULTISIG_LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        // `state`: 0 = uninitialized, 1 = initialized, 2 = frozen.
        match data[108] {
            0 => return Err(ProgramError::UninitializedAccount),
            1 | 2 => {}
            _ => return Err(ProgramError::InvalidAccountData),
        }
        if data.len() > ACCOUNT_LEN && data[ACCOUNT_TYPE_OFFSET] != ACCOUNT_TYPE_ACCOUNT {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut amount = [0u8; 8];
        amount.copy_from_slice(&data[64..72]);
        Ok(Self {
            view: *view,
            mint: address_at(&data, 0),
            owner: address_at(&data, 32),
            amount: u64::from_le_bytes(amount),
        })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

impl TokenAccount {
    /// Mint, as read when the instruction started.
    #[inline(always)]
    pub fn mint(&self) -> &Address {
        &self.mint
    }

    /// Token owner (not the account's program owner), as read when the instruction started.
    #[inline(always)]
    pub fn owner(&self) -> &Address {
        &self.owner
    }

    /// Balance as read when the instruction started. Stale after a CPI that moves tokens, as
    /// Anchor's is until `reload()`.
    #[inline(always)]
    pub fn amount(&self) -> u64 {
        self.amount
    }
}

/// A mint of either token program, with the same base-level checks as [`TokenAccount`].
#[derive(Clone, Copy)]
pub struct Mint {
    view: AccountView,
    decimals: u8,
}

impl FromAccountView for Mint {
    #[inline(always)]
    fn from_account_view(view: &AccountView, _program_id: &Address) -> Result<Self> {
        check_token_owner(view)?;
        let data = view.try_borrow()?;
        if data.len() < MINT_LEN || data.len() == MULTISIG_LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        // `is_initialized` is a Borsh bool: anything but 0 or 1 is invalid.
        match data[45] {
            0 => return Err(ProgramError::UninitializedAccount),
            1 => {}
            _ => return Err(ProgramError::InvalidAccountData),
        }
        if data.len() > MINT_LEN
            && (data.len() <= ACCOUNT_TYPE_OFFSET || data[ACCOUNT_TYPE_OFFSET] != ACCOUNT_TYPE_MINT)
        {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self {
            view: *view,
            decimals: data[44],
        })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

impl Mint {
    #[inline(always)]
    pub fn decimals(&self) -> u8 {
        self.decimals
    }
}

/// The SPL Token or Token-2022 program, as Anchor's `Interface<TokenInterface>`.
#[derive(Clone, Copy)]
pub struct TokenProgram {
    view: AccountView,
}

impl FromAccountView for TokenProgram {
    #[inline(always)]
    fn from_account_view(view: &AccountView, _program_id: &Address) -> Result<Self> {
        if !is_token_program(view.address()) {
            return Err(ErrorCode::InvalidProgramId.into());
        }
        if !view.executable() {
            return Err(ErrorCode::InvalidProgramExecutable.into());
        }
        Ok(Self { view: *view })
    }

    #[inline(always)]
    fn view(&self) -> &AccountView {
        &self.view
    }
}

impl TokenProgram {
    /// `TransferChecked`: moves `amount` from `from` to `to`, signed by `authority`. The token
    /// program checks `mint` and `decimals` against both accounts.
    #[inline(always)]
    pub fn transfer_checked(
        &self,
        from: &TokenAccount,
        mint: &Mint,
        to: &TokenAccount,
        authority: &AccountView,
        amount: u64,
        decimals: u8,
    ) -> Result<()> {
        // Instruction 12: tag, amount (u64 LE), decimals.
        let mut data = [0u8; 10];
        data[0] = 12;
        data[1..9].copy_from_slice(&amount.to_le_bytes());
        data[9] = decimals;
        let metas = [
            InstructionAccount::writable(from.view.address()),
            InstructionAccount::readonly(mint.view.address()),
            InstructionAccount::writable(to.view.address()),
            InstructionAccount::readonly_signer(authority.address()),
        ];
        let ix = InstructionView {
            program_id: self.view.address(),
            data: &data,
            accounts: &metas,
        };
        invoke(&ix, &[&from.view, &mint.view, &to.view, authority])
    }
}
