use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::events::{GroupSettled, MemberSettled};
use crate::state::{validate_member_pair, GroupConfig, STATUS_ACTIVE, STATUS_COMPLETED};

#[derive(Accounts)]
pub struct Distribute<'info> {
    /// Permissionless caller triggering settlement. Pays only the transaction fee, never rent.
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
        bump = group_config.vault_bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = mint.key() == group_config.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Distribute<'info> {
    pub fn handler(ctx: Context<'info, Distribute<'info>>) -> Result<()> {
        let clock = Clock::get()?;
        let group = &ctx.accounts.group_config;

        // ── Checks ──────────────────────────────────────────
        require!(
            clock.unix_timestamp >= group.cycle_end()?,
            SafeNudgeError::CycleNotEnded
        );

        // Remaining accounts: pairs of [member_record, member_token_account], one per member.
        let member_count = group.current_members as usize;
        let expected_remaining = member_count
            .checked_mul(2)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            ctx.remaining_accounts.len() == expected_remaining,
            SafeNudgeError::MemberCountMismatch
        );

        let group_key = ctx.accounts.group_config.key();
        let mint_key = ctx.accounts.mint.key();
        let decimals = ctx.accounts.mint.decimals;

        let mut settled: Vec<MemberSettled> = Vec::with_capacity(member_count);
        let mut seen_records: Vec<Pubkey> = Vec::with_capacity(member_count);
        let mut total_deposited: u64 = 0;
        for pair in ctx.remaining_accounts.chunks_exact(2) {
            let record = validate_member_pair(&pair[0], &pair[1], &group_key, &mint_key, &mut seen_records)?;
            total_deposited = total_deposited
                .checked_add(record.total_deposited)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            settled.push(MemberSettled {
                group: group_key,
                member: record.member,
                deposited: record.total_deposited,
                payout: record.total_deposited,
            });
        }

        require!(
            ctx.accounts.vault.amount >= total_deposited,
            SafeNudgeError::VaultShortfall
        );

        // ── Effects ─────────────────────────────────────────
        ctx.accounts.group_config.status = STATUS_COMPLETED;
        ctx.accounts.group_config.settled_at = clock.unix_timestamp;

        // ── Interactions ────────────────────────────────────
        let vault_bump = ctx.accounts.group_config.vault_bump;
        let bump_bytes = [vault_bump];
        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &bump_bytes];
        let signer = &[signer_seeds];

        let last = member_count.saturating_sub(1);
        for (i, pair) in ctx.remaining_accounts.chunks_exact(2).enumerate() {
            // The last member also gets any tokens sent to the vault from outside the program,
            // so the vault empties and can close.
            if i == last {
                ctx.accounts.vault.reload()?;
                settled[i].payout = ctx.accounts.vault.amount;
            }
            let amount = settled[i].payout;
            if amount > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: pair[1].clone(),
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

        let close_cpi = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.group_config.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            close_cpi,
            signer,
        );
        close_account(close_ctx)?;

        let mut total_paid: u64 = 0;
        for event in settled {
            total_paid = total_paid
                .checked_add(event.payout)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            emit!(event);
        }
        emit!(GroupSettled {
            group: group_key,
            members: ctx.accounts.group_config.current_members,
            total_paid,
        });

        Ok(())
    }
}
