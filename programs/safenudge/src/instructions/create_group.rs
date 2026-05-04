use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, STATUS_OPEN};

#[derive(Accounts)]
#[instruction(group_code: String)]
pub struct CreateGroup<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + GroupConfig::INIT_SPACE,
        seeds = [b"group", group_code.as_bytes()],
        bump,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = vault,
        token::token_program = token_program,
        seeds = [b"vault", group_config.key().as_ref()],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateGroup<'info> {
    pub fn handler(
        &mut self,
        group_code: String,
        deposit_amount: u64,
        frequency: u8,
        total_periods: u8,
        max_members: u8,
        penalty_type: u8,
        penalty_value: u64,
        bumps: &CreateGroupBumps,
    ) -> Result<()> {
        // ── Checks ──────────────────────────────────────────
        require!(
            !group_code.is_empty() && group_code.len() <= 32,
            SafeNudgeError::InvalidGroupCode
        );
        require!(
            group_code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
            SafeNudgeError::InvalidGroupCode
        );
        require!(deposit_amount > 0, SafeNudgeError::InvalidDepositAmount);
        require!(frequency <= 2, SafeNudgeError::InvalidFrequency);
        require!(
            total_periods >= 1 && total_periods <= 52,
            SafeNudgeError::InvalidPeriodCount
        );
        require!(
            max_members >= 2 && max_members <= 10,
            SafeNudgeError::InvalidGroupSize
        );
        require!(penalty_type <= 1, SafeNudgeError::InvalidPenaltyConfig);
        if penalty_type == 1 {
            require!(penalty_value <= 5000, SafeNudgeError::InvalidPenaltyConfig);
        }

        // ── Effects ─────────────────────────────────────────
        let group = &mut self.group_config;
        group.group_code = group_code;
        group.creator = self.creator.key();
        group.mint = self.mint.key();
        group.deposit_amount = deposit_amount;
        group.frequency = frequency;
        group.total_periods = total_periods;
        group.max_members = max_members;
        group.current_members = 0;
        group.penalty_type = penalty_type;
        group.penalty_value = penalty_value;
        group.status = STATUS_OPEN;
        group.cycle_start = 0;
        group.bump = bumps.group_config;

        Ok(())
    }
}
