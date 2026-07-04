// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Davi Giroux

use anchor_lang::prelude::*;

declare_id!("88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB");

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
