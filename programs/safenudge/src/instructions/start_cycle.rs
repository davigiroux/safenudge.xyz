use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::events::CycleStarted;
use crate::state::{GroupConfig, STATUS_ACTIVE, STATUS_OPEN};

#[derive(Accounts)]
pub struct StartCycle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_OPEN @ SafeNudgeError::InvalidGroupStatus,
        has_one = creator @ SafeNudgeError::UnauthorizedCreator,
        constraint = group_config.current_members >= 2 @ SafeNudgeError::InsufficientMembers,
    )]
    pub group_config: Account<'info, GroupConfig>,
}

impl<'info> StartCycle<'info> {
    pub fn handler(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // ── Effects ─────────────────────────────────────────
        self.group_config.status = STATUS_ACTIVE;
        self.group_config.cycle_start = clock.unix_timestamp;

        emit!(CycleStarted {
            group: self.group_config.key(),
            members: self.group_config.current_members,
            cycle_start: self.group_config.cycle_start,
            cycle_end: self.group_config.cycle_end()?,
        });

        Ok(())
    }
}
