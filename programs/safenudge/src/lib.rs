// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Davi Giroux

use anchor_lang::prelude::*;

// Cluster-gated program ID, mirroring the `FEE_RECIPIENT` pattern below.
// Devnet, localnet and the LiteSVM suite all share the devnet ID; mainnet
// gets a dedicated one so a mainnet deploy can never land on the devnet
// program. Keep `Anchor.toml` and the frontend's `VITE_PROGRAM_ID` in step
// with whichever branch is built.
#[cfg(not(feature = "mainnet"))]
declare_id!("GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc");

// A mainnet build is refused until it is configured, rather than producing
// a deployable artifact pointed at placeholder values. Both of these must
// be replaced before the `compile_error!` is removed (issue #20):
//
//   1. `MAINNET_PROGRAM_ID` below — the pubkey of a mainnet program keypair
//      generated with `solana-keygen new -o <path>` and backed up off-machine.
//      Losing it after the first deploy means that program ID can never be
//      redeployed to.
//   2. `FEE_RECIPIENT`'s `mainnet` branch — the Squads multisig vault
//      address. While it is `Pubkey::default()`, `distribute` skips the
//      protocol fee entirely and mainnet collects no revenue (issue #44 H-4).
//
// Deleting this `compile_error!` without doing both is the failure it exists
// to prevent. `anchor build` and CI never pass `--features mainnet`, so this
// gate costs nothing until someone deliberately builds for mainnet.
#[cfg(feature = "mainnet")]
compile_error!(
    "mainnet build is not configured: set MAINNET_PROGRAM_ID and the mainnet \
     FEE_RECIPIENT in programs/safenudge/src/lib.rs, then remove this \
     compile_error!. See issue #20."
);

/// Placeholder mainnet program ID. Not deployable — the `compile_error!`
/// above fires first. Present so a `--features mainnet` build reports one
/// clear error instead of a cascade of missing-`ID` failures.
#[cfg(feature = "mainnet")]
pub const MAINNET_PROGRAM_ID: &str = "11111111111111111111111111111111";

#[cfg(feature = "mainnet")]
declare_id!("11111111111111111111111111111111");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

/// Protocol fee charged on the penalty pool at distribute time, in basis points.
/// 500 bps = 5%. Constant — no runtime override.
pub const PROTOCOL_FEE_BPS: u64 = 500;

// `FEE_RECIPIENT` is the only address allowed to withdraw accumulated fees from
// the treasury, and the only signer allowed to (and paying to) create treasury
// token accounts via `init_treasury`. Per-cluster via cargo features (mirrors
// how Anchor handles per-cluster `declare_id!`). Build with `--features devnet`
// or `--features mainnet` to swap; the fallback is used by `anchor test` and
// local validators.
//
// Mainnet placeholder is the System Program ID (== `Pubkey::default()`). While
// it is in place, `fee_recipient_configured()` is false: `distribute` skips the
// protocol fee entirely (the full penalty pool is redistributed to compliant
// members — nothing accumulates, nothing is burned) and `init_treasury` /
// `withdraw_fees` are uncallable (the system program cannot sign). Replace via
// issue #20 before any mainnet deploy that should collect fees.
#[cfg(feature = "mainnet")]
pub const FEE_RECIPIENT: Pubkey = pubkey!("11111111111111111111111111111111");

#[cfg(all(feature = "devnet", not(feature = "mainnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("FobkDn4rY18j5UAhigt5kAGsMyqP8PDxXGMH94TgG2sh");

// Test-only fallback. The matching private key is committed at
// tests/fixtures/fee-recipient.json so CI can exercise the withdraw_fees happy
// path — treat it as public. Devnet deploys MUST build with `--features devnet`
// so the real devnet fee recipient is embedded instead of this key.
#[cfg(not(any(feature = "mainnet", feature = "devnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("A3xewgQHyKpHHVC87mmiYkFo8qBgq4dz2UTw3XtANXvy");

/// True when the compiled-in `FEE_RECIPIENT` is a real key. The mainnet
/// placeholder is `Pubkey::default()` (the System Program ID); until issue #20
/// replaces it, the protocol fee is skipped at distribute time. Deterministic
/// per build — `FEE_RECIPIENT` is a compile-time constant, so this folds to a
/// constant boolean.
pub fn fee_recipient_configured() -> bool {
    FEE_RECIPIENT != Pubkey::default()
}

#[program]
pub mod safenudge {
    use super::*;

    pub fn create_group(
        ctx: Context<CreateGroup>,
        group_code: String,
        deposit_amount: u64,
        frequency: u8,
        total_periods: u8,
        max_members: u8,
        penalty_type: u8,
        penalty_value: u64,
    ) -> Result<()> {
        ctx.accounts.handler(
            group_code,
            deposit_amount,
            frequency,
            total_periods,
            max_members,
            penalty_type,
            penalty_value,
            &ctx.bumps,
        )
    }

    pub fn join_group(ctx: Context<JoinGroup>) -> Result<()> {
        ctx.accounts.handler(&ctx.bumps)
    }

    pub fn start_cycle(ctx: Context<StartCycle>) -> Result<()> {
        ctx.accounts.handler()
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.handler()
    }

    pub fn distribute<'info>(ctx: Context<'info, Distribute<'info>>) -> Result<()> {
        Distribute::handler(ctx)
    }

    pub fn emergency_cancel<'info>(ctx: Context<'info, EmergencyCancel<'info>>) -> Result<()> {
        EmergencyCancel::handler(ctx)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        WithdrawFees::handler(ctx)
    }

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        InitTreasury::handler(ctx)
    }
}
