use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::events::MemberLeft;
use crate::state::{GroupConfig, MemberRecord, STATUS_OPEN};

/// Returns a member's deposit while the group is Open and closes the member record.
#[derive(Accounts)]
pub struct LeaveGroup<'info> {
    pub member: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_OPEN @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump = member_record.bump,
        constraint = rent_payer.key() == member_record.rent_payer @ SafeNudgeError::InvalidRentPayer,
        close = rent_payer,
    )]
    pub member_record: Account<'info, MemberRecord>,

    /// CHECK: receives lamports and nothing else. It is never read, never deserialized, and is
    /// not a signer or an authority. The constraint on `member_record` pins its key to the
    /// wallet that signed and paid at join_group, so the member cannot redirect the rent.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = member,
        token::token_program = token_program,
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

impl<'info> LeaveGroup<'info> {
    pub fn handler(&mut self, bumps: &LeaveGroupBumps) -> Result<()> {
        let refund = self.member_record.total_deposited;

        self.group_config.current_members = self
            .group_config
            .current_members
            .checked_sub(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        let group_key = self.group_config.key();
        let bump_bytes = [bumps.vault];
        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &bump_bytes];
        let signer = &[signer_seeds];

        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.member_token_account.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.vault.to_account_info(),
        };
        let cpi_ctx =
            CpiContext::new_with_signer(self.token_program.key(), cpi_accounts, signer);
        transfer_checked(cpi_ctx, refund, self.mint.decimals)?;

        emit!(MemberLeft {
            group: group_key,
            member: self.member.key(),
            refund,
            current_members: self.group_config.current_members,
        });

        Ok(())
    }
}
