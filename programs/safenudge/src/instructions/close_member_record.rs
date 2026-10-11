use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::state::{
    record_retention_end, GroupConfig, MemberRecord, STATUS_CANCELLED, STATUS_COMPLETED,
};

/// Closes one MemberRecord of a settled group and returns its rent to the recorded rent payer.
///
/// Permissionless. The caller chooses only which record to close. The destination is
/// `member_record.rent_payer`. Settlement reads every record, so a record must not close while
/// the group is Open or Active. Completed and Cancelled never revert and `join_group` needs
/// Open, so a closed record cannot be created again in this group. After settlement the record
/// stays open for `RECORD_RETENTION_SECS`. Each close lowers `group_config.current_members`,
/// which `close_group` needs at zero before it frees the group code.
#[derive(Accounts)]
pub struct CloseMemberRecord<'info> {
    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = (group_config.status == STATUS_COMPLETED || group_config.status == STATUS_CANCELLED) @ SafeNudgeError::InvalidGroupStatus,
        constraint = Clock::get()?.unix_timestamp >= record_retention_end(group_config.settled_at)? @ SafeNudgeError::RecordRetentionNotElapsed,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"member", group_config.key().as_ref(), member_record.member.as_ref()],
        bump = member_record.bump,
        constraint = rent_payer.key() == member_record.rent_payer @ SafeNudgeError::InvalidRentPayer,
        close = rent_payer,
    )]
    pub member_record: Account<'info, MemberRecord>,

    /// CHECK: receives lamports and nothing else. It is never read, never deserialized, and is
    /// not a signer or an authority. The constraint on `member_record` pins its key to the
    /// wallet that signed and paid at join_group, so the caller cannot redirect the rent.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
}

impl<'info> CloseMemberRecord<'info> {
    pub fn handler(ctx: Context<CloseMemberRecord>) -> Result<()> {
        let group_config = &mut ctx.accounts.group_config;
        group_config.current_members = group_config
            .current_members
            .checked_sub(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        Ok(())
    }
}
