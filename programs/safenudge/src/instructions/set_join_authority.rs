use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, JoinGate, STATUS_OPEN};

/// Creates the JoinGate of an Open group with no members, so every later join needs `authority`.
///
/// `init` makes it once per group. Requiring zero members means the gate covers every member
/// the group will ever have.
#[derive(Accounts)]
pub struct SetJoinAuthority<'info> {
    pub creator: Signer<'info>,

    /// Pays the join_gate rent. Must be the group's recorded rent payer, so close_group can
    /// return that rent to the same wallet as the GroupConfig rent.
    #[account(mut)]
    pub rent_payer: Signer<'info>,

    #[account(
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_OPEN @ SafeNudgeError::InvalidGroupStatus,
        constraint = group_config.current_members == 0 @ SafeNudgeError::GroupHasMembers,
        // Raw constraints, not `has_one`: Anchor runs every `has_one` before
        // any raw constraint, and the status check must come first.
        constraint = creator.key() == group_config.creator @ SafeNudgeError::UnauthorizedCreator,
        constraint = rent_payer.key() == group_config.rent_payer @ SafeNudgeError::InvalidRentPayer,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        init,
        payer = rent_payer,
        space = 8 + JoinGate::INIT_SPACE,
        seeds = [b"join", group_config.key().as_ref()],
        bump,
    )]
    pub join_gate: Account<'info, JoinGate>,

    pub system_program: Program<'info, System>,
}

impl<'info> SetJoinAuthority<'info> {
    pub fn handler(&mut self, authority: Pubkey) -> Result<()> {
        // ── Checks ──────────────────────────────────────────
        // Neither key can ever authorize a join, so either would block every join, the
        // creator's own included. The default key is the System Program ID, which never signs.
        // Anchor decodes an optional account slot that holds this program's ID as `None`, so
        // `join_authority` could never be that key.
        require!(
            authority != Pubkey::default() && authority != crate::ID,
            SafeNudgeError::InvalidJoinAuthority
        );

        // ── Effects ─────────────────────────────────────────
        self.join_gate.authority = authority;

        Ok(())
    }
}
