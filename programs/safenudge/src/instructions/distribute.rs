use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_ACTIVE, STATUS_COMPLETED};

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
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

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Distribute<'info> {
    pub fn handler(ctx: Context<'_, '_, 'info, 'info, Distribute<'info>>) -> Result<()> {
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

            // The member_record must be owned by this program; otherwise an
            // attacker could craft a fake account with arbitrary contents.
            require_keys_eq!(
                *record_info.owner,
                crate::ID,
                SafeNudgeError::InvalidAccountOwner
            );

            // Deserialize member record
            let data = record_info.try_borrow_data()?;
            let mut data_slice: &[u8] = &data;
            let member_record = MemberRecord::try_deserialize(&mut data_slice)
                .map_err(|_| SafeNudgeError::MemberCountMismatch)?;

            // Validate member record belongs to this group
            require!(
                member_record.group == group_key,
                SafeNudgeError::MemberCountMismatch
            );

            // Validate the account key matches the canonical member PDA so
            // a caller cannot pass a forged record with arbitrary contents.
            let (expected_record, _) = Pubkey::find_program_address(
                &[b"member", group_key.as_ref(), member_record.member.as_ref()],
                &crate::ID,
            );
            require_keys_eq!(
                *record_info.key,
                expected_record,
                SafeNudgeError::InvalidMemberRecord
            );

            // Reject duplicate records — without this, a caller could pass
            // the same member_record N times with their own ATA each time.
            require!(
                !seen_records.contains(record_info.key),
                SafeNudgeError::DuplicateMemberRecord
            );
            seen_records.push(*record_info.key);

            // Destination token account must belong to the member and use
            // the configured mint. transfer_checked validates the mint at
            // CPI time, but only an explicit owner check prevents payouts
            // being routed to an arbitrary ATA.
            let token_account =
                InterfaceAccount::<TokenAccount>::try_from(token_info)?;
            require_keys_eq!(
                token_account.owner,
                member_record.member,
                SafeNudgeError::InvalidTokenAccountOwner
            );
            require_keys_eq!(token_account.mint, mint_key, SafeNudgeError::InvalidMint);

            let deposits_made = member_record.deposits_made as u64;
            let missed = (total_periods as u64)
                .checked_sub(deposits_made)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            // Calculate penalty
            let raw_penalty = if missed == 0 {
                0u64
            } else {
                match penalty_type {
                    0 => {
                        // Fixed: penalty = missed * penalty_value
                        missed
                            .checked_mul(penalty_value)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                    }
                    1 => {
                        // Percentage: penalty = missed * (deposit_amount * penalty_value / 10000)
                        let per_period = deposit_amount
                            .checked_mul(penalty_value)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                            .checked_div(10000)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
                        missed
                            .checked_mul(per_period)
                            .ok_or(SafeNudgeError::ArithmeticOverflow)?
                    }
                    _ => return Err(SafeNudgeError::InvalidFrequency.into()),
                }
            };

            // Cap penalty at total deposited
            let penalty = std::cmp::min(raw_penalty, member_record.total_deposited);

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

        // When no one is compliant there is no one to redistribute penalties
        // to. Refund each member their full deposit (same semantics as
        // emergency_cancel) so the outcome doesn't depend on the order the
        // caller placed members in remaining_accounts.
        let bonus_per_compliant = if compliant_count > 0 {
            total_penalties
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

        // ── Interactions: Transfer payouts ───────────────────

        let vault_bump = ctx.bumps.vault;
        let bump_bytes = [vault_bump];
        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &bump_bytes];
        let signer = &[signer_seeds];

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
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                transfer_checked(cpi_ctx, amount, decimals)?;
            }
        }

        // Close vault, return rent to payer
        let close_cpi = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            close_cpi,
            signer,
        );
        close_account(close_ctx)?;

        Ok(())
    }
}
