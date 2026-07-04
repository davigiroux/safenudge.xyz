use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{validate_member_pair, GroupConfig, STATUS_ACTIVE, STATUS_COMPLETED};
use crate::PROTOCOL_FEE_BPS;

#[derive(Accounts)]
pub struct Distribute<'info> {
    /// Permissionless caller triggering settlement. Pays only the transaction
    /// fee — never rent (the treasury ATA is pre-created via `init_treasury`).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: rent recipient. Validated by `has_one = creator` on group_config —
    /// must match the wallet stored at group creation time. distribute is
    /// permissionless so the creator does not sign; we only need their pubkey.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        has_one = creator,
        constraint = group_config.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"vault", group_config.key().as_ref()],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = mint.key() == group_config.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// PDA that owns the protocol treasury ATA. Holds no data; SystemAccount
    /// validates ownership and gives Anchor the seed/bump derivation it needs
    /// to sign the withdraw_fees CPI later.
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury_authority: SystemAccount<'info>,

    /// Treasury ATA for this mint, created ahead of time by FEE_RECIPIENT via
    /// `init_treasury` — never initialized here, so a permissionless caller
    /// can't be griefed into paying its rent. Optional: required only when a
    /// protocol fee is due this settlement (enforced in the handler); when
    /// passed, the associated_token constraints pin it to the canonical ATA of
    /// (mint, treasury_authority), so no other destination can receive the fee.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: Option<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Distribute<'info> {
    pub fn handler(ctx: Context<'info, Distribute<'info>>) -> Result<()> {
        let clock = Clock::get()?;
        let group = &ctx.accounts.group_config;

        // ── Checks ──────────────────────────────────────────

        // Calculate period duration in seconds
        let period_duration: i64 = match group.frequency {
            0 => 7_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            1 => 14_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            2 => 30_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            _ => return Err(SafeNudgeError::InvalidFrequency.into()),
        };

        // Check cycle has ended
        let cycle_duration = (group.total_periods as i64)
            .checked_mul(period_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let cycle_end = group
            .cycle_start
            .checked_add(cycle_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            clock.unix_timestamp >= cycle_end,
            SafeNudgeError::CycleNotEnded
        );

        // Validate remaining accounts: pairs of [member_record, member_token_account]
        let member_count = group.current_members as usize;
        let expected_remaining = member_count
            .checked_mul(2)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            ctx.remaining_accounts.len() == expected_remaining,
            SafeNudgeError::MemberCountMismatch
        );

        let group_key = ctx.accounts.group_config.key();
        let total_periods = group.total_periods;
        let deposit_amount = group.deposit_amount;
        let penalty_type = group.penalty_type;
        let penalty_value = group.penalty_value;
        let decimals = ctx.accounts.mint.decimals;

        // ── Pass 1: Calculate penalties and payouts ──────────

        struct MemberPayout {
            payout: u64,
            is_compliant: bool,
            total_deposited: u64,
        }

        let mut member_payouts: Vec<MemberPayout> = Vec::with_capacity(member_count);
        let mut total_penalties: u64 = 0;
        let mut compliant_count: u64 = 0;
        let mut seen_records: Vec<Pubkey> = Vec::with_capacity(member_count);
        let mint_key = ctx.accounts.mint.key();

        for i in 0..member_count {
            let record_idx = i.checked_mul(2).ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let token_idx = record_idx
                .checked_add(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let record_info = &ctx.remaining_accounts[record_idx];
            let token_info = &ctx.remaining_accounts[token_idx];

            let member_record = validate_member_pair(
                record_info,
                token_info,
                &group_key,
                &mint_key,
                &mut seen_records,
            )?;

            let deposits_made = member_record.deposits_made as u64;
            let missed = (total_periods as u64)
                .checked_sub(deposits_made)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            // Calculate penalty in u128 so no admissible input can overflow
            // before the total_deposited cap clamps it (issue #44 H-1: a fixed
            // penalty_value near u64::MAX used to error out at checked_mul and
            // permanently brick settlement). missed <= 52 and both factors are
            // u64, so every intermediate provably fits in u128; the checked_*
            // calls are kept per the arithmetic rules but are unreachable.
            let raw_penalty: u128 = if missed == 0 {
                0
            } else {
                match penalty_type {
                    0 => {
                        // Fixed: penalty = missed * penalty_value
                        (missed as u128)
                            .checked_mul(penalty_value as u128)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                    }
                    1 => {
                        // Percentage: penalty = missed * (deposit_amount * penalty_value / 10000)
                        let per_period = (deposit_amount as u128)
                            .checked_mul(penalty_value as u128)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                            .checked_div(10000)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
                        (missed as u128)
                            .checked_mul(per_period)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                    }
                    _ => return Err(SafeNudgeError::InvalidPenaltyConfig.into()),
                }
            };

            // Cap penalty at total deposited; the cap also makes the narrowing
            // back to u64 infallible (result <= total_deposited <= u64::MAX).
            let penalty = u64::try_from(std::cmp::min(
                raw_penalty,
                member_record.total_deposited as u128,
            ))
            .map_err(|_| SafeNudgeError::ArithmeticOverflow)?;

            let base_payout = member_record
                .total_deposited
                .checked_sub(penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            let is_compliant = deposits_made == total_periods as u64;
            if is_compliant {
                compliant_count = compliant_count
                    .checked_add(1)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            }

            total_penalties = total_penalties
                .checked_add(penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            member_payouts.push(MemberPayout {
                payout: base_payout,
                is_compliant,
                total_deposited: member_record.total_deposited,
            });
        }

        // 5% protocol fee skimmed off the penalty pool before redistribution.
        // When no one is compliant, the pro-rata refund branch (below) returns
        // each member their full deposit and `total_penalties` is logically
        // forgiven — fee must be zero so that branch is preserved.
        //
        // The fee is also skipped entirely while FEE_RECIPIENT is the
        // compile-time placeholder (mainnet builds until issue #20): the full
        // penalty pool then flows into `redistributable` below, so nothing
        // accumulates in a treasury no one can withdraw from (issue #44 H-4).
        let protocol_fee: u64 = if compliant_count == 0 || !crate::fee_recipient_configured() {
            0
        } else {
            total_penalties
                .checked_mul(PROTOCOL_FEE_BPS)
                .and_then(|x| x.checked_div(10_000))
                .ok_or(SafeNudgeError::ArithmeticOverflow)?
        };

        // Fee-evasion guard: distribute is permissionless, so the caller must
        // not be able to dodge the fee by omitting the treasury account. When
        // a fee is due the canonical treasury ATA must be passed and exist
        // (created via init_treasury); otherwise settlement is blocked — not
        // bricked — until FEE_RECIPIENT initializes it. Still the Checks
        // phase (CEI): nothing has been mutated yet.
        require!(
            protocol_fee == 0 || ctx.accounts.treasury_token_account.is_some(),
            SafeNudgeError::TreasuryNotInitialized
        );

        let redistributable = total_penalties
            .checked_sub(protocol_fee)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        let bonus_per_compliant = if compliant_count > 0 {
            redistributable
                .checked_div(compliant_count)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?
        } else {
            0
        };

        let mut final_payouts: Vec<u64> = Vec::with_capacity(member_count);
        for mp in &member_payouts {
            let final_payout = if compliant_count == 0 {
                mp.total_deposited
            } else if mp.is_compliant {
                mp.payout
                    .checked_add(bonus_per_compliant)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?
            } else {
                mp.payout
            };
            final_payouts.push(final_payout);
        }

        // ── Effects ─────────────────────────────────────────

        ctx.accounts.group_config.status = STATUS_COMPLETED;

        // ── Interactions ────────────────────────────────────

        let vault_bump = ctx.bumps.vault;
        let bump_bytes = [vault_bump];
        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &bump_bytes];
        let signer = &[signer_seeds];

        // Fee transfer goes first so the last-member dust path naturally sees
        // the post-fee remainder via vault.reload().
        if protocol_fee > 0 {
            let treasury = ctx
                .accounts
                .treasury_token_account
                .as_ref()
                .ok_or(SafeNudgeError::TreasuryNotInitialized)?; // unreachable; guarded above
            let fee_cpi_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: treasury.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let fee_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                fee_cpi_accounts,
                signer,
            );
            transfer_checked(fee_ctx, protocol_fee, decimals)?;
        }

        for i in 0..member_count {
            let token_idx = i
                .checked_mul(2)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?
                .checked_add(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let member_token_info = &ctx.remaining_accounts[token_idx];

            // Last member gets vault remainder to prevent dust
            let amount = if i == member_count.checked_sub(1).ok_or(SafeNudgeError::ArithmeticOverflow)? {
                ctx.accounts.vault.reload()?;
                ctx.accounts.vault.amount
            } else {
                final_payouts[i]
            };

            if amount > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: member_token_info.clone(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    cpi_accounts,
                    signer,
                );
                transfer_checked(cpi_ctx, amount, decimals)?;
            }
        }

        // Close vault, return rent to creator (matches emergency_cancel and
        // ARCHITECTURE.md). distribute is permissionless, so the rent must
        // not go to the caller.
        let close_cpi = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            close_cpi,
            signer,
        );
        close_account(close_ctx)?;

        Ok(())
    }
}
