# lite-anchor (experiment)

Anchor-style account validation for `no_std` Solana programs, built with **upstream** nightly Rust and [`sbpf-linker`](https://github.com/blueshift-gg/sbpf-linker) instead of the Solana platform-tools fork. SafeNudge's `deposit` instruction is ported to it, and a LiteSVM harness checks that the port behaves exactly like the Anchor program.

**Status:** an experiment. Nothing in `programs/safenudge` depends on it, nothing here is deployed, and none of it has been audited. SafeNudge stays on Anchor.

## Why this works

Proc macros run inside the compiler on the host, so `#[derive(Accounts)]` can use `syn`, SHA-256 and the rest of `std`. Only the code they generate runs on-chain and has to be `no_std`. What keeps Anchor off the upstream toolchain is its runtime crates, not its macros.

The port reads the same way as the original:

```rust
#[derive(Accounts)]
pub struct Deposit {
    pub member: Signer,

    #[account(
        mut,
        seeds = [b"group", group_config.load()?.group_code()?],
        bump = group_config.load()?.bump,
        constraint = group_config.load()?.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<GroupConfig>,
    // ...
}
```

The main difference is that accounts are zero-copy. `#[account]` lays a struct out `#[repr(C, packed)]`, so its bytes are its fields in order: the same bytes Borsh writes for fixed-size fields. `load()` and `load_mut()` read and write in place, and nothing is deserialized, serialized back or allocated.

## Results

`deposit`, same transaction and starting state, in LiteSVM 0.18 with the mainnet feature set. The Anchor programs were built with `cargo build-sbf` from Solana CLI 4.3.0 (CI pins 3.1.10, so CI's build may differ slightly).

| | Anchor (full program) | Anchor (`deposit` only) | lite-anchor |
|---|---:|---:|---:|
| `.so` size | 355,864 B | 151,480 B | **15,536 B** |
| CU, SPL Token | 22,335 | 22,325 | **8,414** (−62%) |
| CU, Token-2022 | 24,027 | 24,017 | **10,103** (−58%) |

CU figures include the token program CPI (105 CU for SPL Token, 1,791 for Token-2022). Without it, the program itself spends 22,230 CU under Anchor and 8,309 under lite-anchor.

Most of the 8,309 CU is fixed runtime cost that both builds pay. The four PDA derivations cost 1,500 CU each: one each for the group and member records (stored bumps), and two for the vault, whose canonical bump search finds 254 on its second try. The CPI's base cost is 946. Everything else (entrypoint, account checks, handler, clock read, event log) comes to about 1,360 CU in lite-anchor, against about 15,280 in Anchor.

Something both builds could use: storing the vault's bump in `GroupConfig` would save 1,500 CU per bump the search skips. That's a layout change for `programs/safenudge`, so it's out of scope here.

## What the harness checks

`harness/tests/deposit_parity.rs` loads three builds at the real program ID: the deployed Anchor program, the Anchor `deposit`-only baseline, and the lite port. It runs 25 tests on each, from identical starting state, and requires the **same result or error code, the same bytes in every account afterwards, and the same event bytes** in the log. Only compute units may differ.

Scenarios: SPL Token and Token-2022 happy paths, the last period, a clock just before `cycle_start` (period 0) and a full period before it (overflow), and the errors a caller can trigger. That covers the program's errors (`AlreadyDeposited`, `CycleEnded`, `InvalidGroupStatus`, `InvalidMint` for either mint mismatch), the framework's (wrong signer, wrong owner, wrong discriminator, wrong PDA, wrong token program, not writable, duplicate mutable account, too few accounts, unknown instruction) and the token account's state (uninitialized, frozen, insufficient balance).

I checked the harness by breaking the port on purpose. Dropping the token-owner constraint failed the matching test: the token program still blocks the transfer, but with its own error code instead of Anchor's 2003. Swapping two event fields failed all five success cases.

## Toolchain findings

1. **Signed division doesn't compile.** `i64::checked_div` makes LLVM emit the BPF v4 signed `div`, which SBPF rejects at link time with `div64 instruction has off: 1, imm: 0 supposed to be zeros`. The article's config disables `ldsx`, `movsx` and `gotox`, but not this. With `--disable-sdiv-smod` (now in `.cargo/config.toml`), LLVM says what's wrong instead: `unsupported signed division, please convert to unsigned div/mod`. The platform-tools fork handles this for you. `lite_anchor::math::checked_div_i64` does it with unsigned division and is tested against `i64::checked_div` on edge values. `deposit` needs it because a clock slightly before `cycle_start` truncates to period 0. **This is worth reporting upstream** (sbpf-linker or solana-compiler-builtins).
2. **Harmless linker warning.** `unable to open LLVM shared lib .../libLLVM-23-rust-1.101.0-nightly.so: dlopen failed`. That file is a 44-byte linker script, not a library. The linker falls back to `libLLVM.so.23.1-…`, and the output runs.
3. **LiteSVM 0.18 needs rustc 1.97.1.** The stable toolchain here is 1.97.0, so the whole experiment, tests included, uses `+nightly`.

## Run it

```bash
rustup toolchain install nightly --component rust-src
cargo +nightly install sbpf-linker            # 0.2.3
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # cargo build-sbf, for the Anchor builds

experiments/lite-anchor/build.sh              # builds all three programs, runs the tests
```

Or step by step, from `experiments/lite-anchor/`:

```bash
cargo +nightly build-bpf -p safenudge-lite                            # → target/deploy/safenudge_lite.so
cargo +nightly test -p harness -- --nocapture compute_unit_report    # the table above
```

Versions used: nightly rustc 1.101.0 (2026-10-08), sbpf-linker 0.2.3, pinocchio 0.11.2, solana-compiler-builtins 0.1.0, LiteSVM 0.18.0, Anchor 1.0.2.

## Layout

| path | what |
|---|---|
| `lite-anchor/` | on-chain runtime, `no_std`: `Signer`, `Account<T>`, `TokenAccount`, `Mint`, `TokenProgram`, PDA checks, events, errors |
| `lite-anchor-macros/` | `#[derive(Accounts)]`, `#[account]`, `#[event]`, `#[error_code]`, `#[program]`, `address!` |
| `examples/safenudge-lite/` | `deposit` ported; same program ID, layouts, seeds, discriminators, error codes, event bytes |
| `baselines/anchor-deposit/` | `programs/safenudge` cut down to `deposit`, built with `cargo build-sbf`; own workspace |
| `harness/` | LiteSVM parity tests and the CU report |
| `.cargo/config.toml` | the article's config, plus `--disable-sdiv-smod` and the build alias |

## What lite-anchor matches, and what it doesn't

Matches Anchor 1.0: instruction discriminators, `sha256("global:<name>")[..8]`, with unknown or short data failing as 101; account and event discriminators; event encoding; framework error codes (2000, 2003, 2006, 2040, 3002, 3005, 3007, 3008, 3010…); program errors from 6000; and the order of checks: build every field, check duplicate mutable accounts, then each field's `seeds`, `mut`, `signer`, `has_one`, `constraint`, `address`.

Observable differences:
- No `Instruction: Deposit` log line, and no `AnchorError …` log on failure. The error **code** is the same, so clients mapping codes (as `app/` does) are unaffected; anything parsing log text is not.
- `TokenAccount`/`Mint` check the base layout and the Token-2022 account type byte, but don't walk TLV extensions. The token program does on any CPI that moves funds.
- A zero-copy read accepts any nonzero byte as "deposited", where Borsh would reject a `bool` other than 0 or 1. Only the program writes these accounts, so the difference can't show up in practice.

Not built yet: `init`, `close`, `realloc`, `ctx.bumps`, variable-size account fields, non-fixed-size instruction args or events, and **IDL generation**. The frontend calls `program.methods.deposit()` through an Anchor IDL, so a port of more than one instruction needs it. [`pinocchio-idl`](https://crates.io/crates/pinocchio-idl), on crates.io, says it generates Anchor-compatible IDLs from Pinocchio programs. I haven't evaluated it.

## Prior art

- [Pinocchio](https://github.com/anza-xyz/pinocchio) is the base layer used here: entrypoint, account views, CPI.
- Typhoon and others build Anchor-style frameworks on Pinocchio. Not evaluated here. The new part in this experiment is the upstream-toolchain build and the byte-for-byte parity harness against a real Anchor program.
- `cargo-build-sbpf` on crates.io wraps the same upstream build as a cargo subcommand.

## Next steps

1. Report the signed division gap upstream.
2. Port `join_group` and `leave_group`, which need `init` and `close`.
3. IDL generation, or an evaluation of `pinocchio-idl`, so the frontend can call the port.
4. A CI job for this directory (nightly, sbpf-linker, Solana CLI), if the experiment continues.
