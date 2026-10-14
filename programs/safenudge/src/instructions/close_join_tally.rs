use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::state::JoinTally;

#[derive(Accounts)]
#[instruction(member: Pubkey)]
pub struct CloseJoinTally<'info> {
    /// CHECK: never read; its key is a seed of `join_tally`. Only `create_group` makes a
    /// program-owned account at a group address, and `close_group` hands it back to the system
    /// program, so an owner other than this program means no group lives there now. A new group
    /// at the freed code is program-owned again, and the close fails until that group closes.
    #[account(
        constraint = group_config.owner != &crate::ID @ SafeNudgeError::GroupNotClosed,
    )]
    pub group_config: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"tally", group_config.key().as_ref(), member.as_ref()],
        bump,
        constraint = rent_payer.key() == join_tally.rent_payer @ SafeNudgeError::InvalidRentPayer,
        close = rent_payer,
    )]
    pub join_tally: Account<'info, JoinTally>,

    /// CHECK: receives lamports and nothing else. It is never read, never deserialized, and is
    /// not a signer or an authority. The constraint on `join_tally` pins its key to the wallet
    /// that paid at the first join_group, so the caller cannot redirect the rent.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
}

impl<'info> CloseJoinTally<'info> {
    pub fn handler(_ctx: Context<CloseJoinTally>) -> Result<()> {
        Ok(())
    }
}
