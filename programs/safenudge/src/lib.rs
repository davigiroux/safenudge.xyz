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

// Mainnet program ID (issue #20), deployed 2026-10-19. The keypair was generated on
// the deploy machine and is backed up off-machine; it never enters this repository.
// The Squad vault, not this keypair, holds the upgrade authority.
// `devnet` shortens `MAX_FREQUENCY` and `RECORD_RETENTION_SECS` for testing. Built
// together with `mainnet`, it would give the mainnet program devnet timing.
#[cfg(all(feature = "mainnet", feature = "devnet"))]
compile_error!("the mainnet and devnet features are mutually exclusive");

#[cfg(feature = "mainnet")]
pub const MAINNET_PROGRAM_ID: &str = "98poy9z9Z2MTz2TXW5W2LfnWosRubJYLbNzAjCYZeYFc";

#[cfg(feature = "mainnet")]
declare_id!("98poy9z9Z2MTz2TXW5W2LfnWosRubJYLbNzAjCYZeYFc");

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::GroupTerms;

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
// Mainnet recipient: the Squads v4 vault (2-of-3, vault index 0) that also holds
// the mainnet upgrade authority (ADR-0001). It is a PDA with no private key, so
// `init_treasury` and `withdraw_fees` each run as a multisig proposal.
#[cfg(feature = "mainnet")]
pub const FEE_RECIPIENT: Pubkey = pubkey!("3M4JicDnPbSbXboGW8Wz7DyDGTTAFqH27TseSTzAQ3PX");

// Devnet recipient. It replaced FobkDn4r…, whose key was lost. With no signer for the old
// recipient, `init_treasury` was uncallable on devnet: no treasury could be created, so every
// fee-bearing `distribute` failed with `TreasuryNotInitialized`.
#[cfg(all(feature = "devnet", not(feature = "mainnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("2jwEs8aP8TvdDFeDJL5bYdnXZkbnexaCJTVns3dqeS3e");

// Test-only fallback. The matching private key is committed at
// tests/fixtures/fee-recipient.json so CI can exercise the withdraw_fees happy
// path — treat it as public. Devnet deploys MUST build with `--features devnet`
// so the real devnet fee recipient is embedded instead of this key.
#[cfg(not(any(feature = "mainnet", feature = "devnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("A3xewgQHyKpHHVC87mmiYkFo8qBgq4dz2UTw3XtANXvy");

/// True when the compiled-in `FEE_RECIPIENT` is a real key, not `Pubkey::default()`.
/// Every cluster sets one now; the check stays so a build with a default recipient
/// skips the fee instead of trapping it (issue #44 H-4). Deterministic
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

    /// Joins with the first deposit. `expected_terms` must equal the group's terms.
    /// `expected_joins`, when given, must equal the member's JoinTally count before this join
    /// (0 for a first join). A gated group requires it.
    pub fn join_group(
        ctx: Context<JoinGroup>,
        expected_terms: GroupTerms,
        expected_joins: Option<u32>,
    ) -> Result<()> {
        ctx.accounts.handler(&ctx.bumps, expected_terms, expected_joins)
    }

    pub fn leave_group(ctx: Context<LeaveGroup>) -> Result<()> {
        ctx.accounts.handler()
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

    /// Returns every member's deposits and closes the vault. With no members, burns any
    /// balance in the vault first: `mint` must then be writable, or it fails with
    /// `MintNotWritable`.
    pub fn emergency_cancel<'info>(ctx: Context<'info, EmergencyCancel<'info>>) -> Result<()> {
        EmergencyCancel::handler(ctx)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        WithdrawFees::handler(ctx)
    }

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        InitTreasury::handler(ctx)
    }

    pub fn refund_vault_rent(ctx: Context<RefundVaultRent>) -> Result<()> {
        RefundVaultRent::handler(ctx)
    }

    pub fn close_member_record(ctx: Context<CloseMemberRecord>) -> Result<()> {
        CloseMemberRecord::handler(ctx)
    }

    pub fn close_group<'info>(ctx: Context<'info, CloseGroup<'info>>) -> Result<()> {
        CloseGroup::handler(ctx)
    }

    /// Closes one member's JoinTally after the group at its address is closed. `member` is only
    /// a seed of `join_tally`, read through `#[instruction(member: Pubkey)]`.
    pub fn close_join_tally(ctx: Context<CloseJoinTally>, member: Pubkey) -> Result<()> {
        let _ = member;
        CloseJoinTally::handler(ctx)
    }

    /// Makes every later join_group of an Open, empty group require the signature of
    /// `authority`. Once per group; there is no instruction to change or remove it.
    pub fn set_join_authority(ctx: Context<SetJoinAuthority>, authority: Pubkey) -> Result<()> {
        ctx.accounts.handler(authority)
    }
}

#[cfg(all(test, feature = "mainnet"))]
mod mainnet_build_tests {
    use super::*;

    #[test]
    fn mainnet_build_pins_the_program_id_and_the_squad_vault() {
        assert_eq!(ID.to_string(), MAINNET_PROGRAM_ID);
        assert_eq!(ID.to_string(), "98poy9z9Z2MTz2TXW5W2LfnWosRubJYLbNzAjCYZeYFc");
        assert_eq!(FEE_RECIPIENT.to_string(), "3M4JicDnPbSbXboGW8Wz7DyDGTTAFqH27TseSTzAQ3PX");
        assert!(fee_recipient_configured());
        assert!(!cfg!(feature = "devnet"));
        assert_eq!(state::MAX_FREQUENCY, 2);
        assert_eq!(state::RECORD_RETENTION_SECS, 2_592_000);
    }
}
