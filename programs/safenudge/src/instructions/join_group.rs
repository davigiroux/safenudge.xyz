use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_OPEN};

#[derive(Accounts)]
pub struct JoinGroup<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_OPEN @ SafeNudgeError::InvalidGroupStatus,
        constraint = group_config.current_members < group_config.max_members @ SafeNudgeError::GroupFull,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        init,
        payer = member,
        space = 8 + MemberRecord::INIT_SPACE,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub member_record: Account<'info, MemberRecord>,

    #[account(
        mut,
        constraint = member_token_account.mint == group_config.mint @ SafeNudgeError::InvalidMint,
        constraint = member_token_account.owner == member.key(),
    )]
    pub member_token_account: InterfaceAccount<'info, TokenAccount>,

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
    pub system_program: Program<'info, System>,
}

impl<'info> JoinGroup<'info> {
    pub fn handler(&mut self, bumps: &JoinGroupBumps) -> Result<()> {
        // ── Effects ─────────────────────────────────────────
        let member_record = &mut self.member_record;
        member_record.group = self.group_config.key();
        member_record.member = self.member.key();
        member_record.total_deposited = self.group_config.deposit_amount;
        member_record.deposits_made = 1;
        member_record.periods_deposited = [false; 52];
        member_record.periods_deposited[0] = true;
        member_record.has_claimed = false;
        member_record.bump = bumps.member_record;

        self.group_config.current_members = self
            .group_config
            .current_members
            .checked_add(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        // ── Interactions ────────────────────────────────────
        let cpi_accounts = TransferChecked {
            from: self.member_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.member.to_account_info(),
            mint: self.mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        transfer_checked(
            cpi_ctx,
            self.group_config.deposit_amount,
            self.mint.decimals,
        )?;

        Ok(())
    }
}
