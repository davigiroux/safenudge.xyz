use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{validate_member_pair, GroupConfig, STATUS_ACTIVE, STATUS_CANCELLED, STATUS_OPEN};

#[derive(Accounts)]
pub struct EmergencyCancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        has_one = creator @ SafeNudgeError::UnauthorizedCreator,
        constraint = (group_config.status == STATUS_OPEN || group_config.status == STATUS_ACTIVE) @ SafeNudgeError::InvalidGroupStatus,
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

impl<'info> EmergencyCancel<'info> {
    pub fn handler(ctx: Context<'info, EmergencyCancel<'info>>) -> Result<()> {
        let group = &ctx.accounts.group_config;

        // ── Checks ──────────────────────────────────────────

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
        let decimals = ctx.accounts.mint.decimals;

        // ── Pass 1: Read each member's total_deposited ──────

        let mut refund_amounts: Vec<u64> = Vec::with_capacity(member_count);
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

            refund_amounts.push(member_record.total_deposited);
        }

        // ── Effects ─────────────────────────────────────────

        ctx.accounts.group_config.status = STATUS_CANCELLED;

        // ── Interactions: Transfer refunds ───────────────────

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
                refund_amounts[i]
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

        // Close vault, return rent to creator
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
