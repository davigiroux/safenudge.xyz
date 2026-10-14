use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::events::GroupClosed;
use crate::state::{GroupConfig, JoinGate, STATUS_CANCELLED, STATUS_COMPLETED};

/// Closes a settled GroupConfig, and its JoinGate when it has one, and pays all their lamports to
/// the recorded rent payer.
///
/// Permissionless. The destination is `group_config.rent_payer`. A new group with the same code
/// gets this address and so the same member and join gate PDAs. `current_members` counts open
/// MemberRecords and is never too low, so zero proves no old record is left for the new group to
/// inherit, and closing the gate here means the new group starts with none.
///
/// JoinTally accounts are per member and outlive the group; `close_join_tally` closes each one
/// afterwards. A tally left open carries its count into a later group at this code.
#[derive(Accounts)]
pub struct CloseGroup<'info> {
    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = (group_config.status == STATUS_COMPLETED || group_config.status == STATUS_CANCELLED) @ SafeNudgeError::InvalidGroupStatus,
        constraint = group_config.current_members == 0 @ SafeNudgeError::GroupHasOpenRecords,
        // A raw constraint, not `has_one`: Anchor runs every `has_one` before
        // any raw constraint, and the status check must come first.
        constraint = rent_payer.key() == group_config.rent_payer @ SafeNudgeError::InvalidRentPayer,
        close = rent_payer,
    )]
    pub group_config: Account<'info, GroupConfig>,

    /// CHECK: receives lamports and nothing else. It is never read, never deserialized, and is
    /// not a signer or an authority. The constraint on `group_config` pins its key to the
    /// wallet that signed and paid at create_group, so the caller cannot redirect the rent.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,

    /// CHECK: the seeds pin the address to `["join", group_config]`, and the handler reads it
    /// only when this program owns it. Only `set_join_authority` can create a program-owned
    /// account at that address, and `Account::try_from` still checks its owner and
    /// discriminator before the close. Any other owner means the group has no gate.
    #[account(
        mut,
        seeds = [b"join", group_config.key().as_ref()],
        bump,
    )]
    pub join_gate: UncheckedAccount<'info>,
}

impl<'info> CloseGroup<'info> {
    pub fn handler(ctx: Context<'info, CloseGroup<'info>>) -> Result<()> {
        let accounts: &'info CloseGroup<'info> = ctx.accounts;
        let mut join_gate_lamports = 0;
        if accounts.join_gate.owner == &crate::ID {
            let join_gate = Account::<JoinGate>::try_from(accounts.join_gate.as_ref())?;
            join_gate_lamports = join_gate.get_lamports();
            join_gate.close(accounts.rent_payer.to_account_info())?;
        }

        // Anchor closes `group_config` after this handler returns, so its lamports are still here.
        emit!(GroupClosed {
            group: accounts.group_config.key(),
            rent_payer: accounts.rent_payer.key(),
            lamports: accounts.group_config.get_lamports(),
            join_gate_lamports,
        });
        Ok(())
    }
}
