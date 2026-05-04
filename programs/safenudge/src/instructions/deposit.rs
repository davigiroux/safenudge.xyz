use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_ACTIVE};

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub member: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump = member_record.bump,
        constraint = member_record.group == group_config.key(),
        constraint = member_record.member == member.key(),
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
}

impl<'info> Deposit<'info> {
    pub fn handler(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // ── Checks ──────────────────────────────────────────

        // Calculate period duration in seconds
        let period_duration: i64 = match self.group_config.frequency {
            0 => 7_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            1 => 14_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            2 => 30_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            _ => return Err(SafeNudgeError::InvalidFrequency.into()),
        };

        // Check cycle hasn't ended
        let cycle_duration = (self.group_config.total_periods as i64)
            .checked_mul(period_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let cycle_end = self.group_config.cycle_start
            .checked_add(cycle_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(clock.unix_timestamp < cycle_end, SafeNudgeError::CycleEnded);

        // Calculate current period
        let elapsed = clock.unix_timestamp
            .checked_sub(self.group_config.cycle_start)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let max_period = self.group_config.total_periods
            .checked_sub(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let elapsed_period = elapsed
            .checked_div(period_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let current_period = std::cmp::min(elapsed_period as u8, max_period);

        // Check not already deposited for this period
        require!(
            !self.member_record.periods_deposited[current_period as usize],
            SafeNudgeError::AlreadyDeposited
        );

        // ── Effects ─────────────────────────────────────────

        self.member_record.periods_deposited[current_period as usize] = true;
        self.member_record.deposits_made = self.member_record.deposits_made
            .checked_add(1).ok_or(SafeNudgeError::ArithmeticOverflow)?;
        self.member_record.total_deposited = self.member_record.total_deposited
            .checked_add(self.group_config.deposit_amount)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        // ── Interactions: transfer deposit to vault ──────────

        let cpi_accounts = TransferChecked {
            from: self.member_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.member.to_account_info(),
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
