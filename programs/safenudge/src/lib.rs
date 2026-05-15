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
// the treasury. Per-cluster via cargo features (mirrors how Anchor handles
// per-cluster `declare_id!`). Build with `--features devnet` or `--features
// mainnet` to swap; the fallback is used by `anchor test` and local validators.
//
// Mainnet placeholder is the System Program ID — no ATA can be owned by it,
// so any mainnet `distribute` would fail loudly at the recipient-ATA-owner
// constraint until the placeholder is replaced. See issue #20.
#[cfg(feature = "mainnet")]
pub const FEE_RECIPIENT: Pubkey = pubkey!("11111111111111111111111111111111");

#[cfg(all(feature = "devnet", not(feature = "mainnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("FobkDn4rY18j5UAhigt5kAGsMyqP8PDxXGMH94TgG2sh");

#[cfg(not(any(feature = "mainnet", feature = "devnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("FobkDn4rY18j5UAhigt5kAGsMyqP8PDxXGMH94TgG2sh");

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
}
