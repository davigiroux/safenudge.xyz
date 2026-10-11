use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::events::MemberJoined;
use crate::state::{GroupConfig, JoinGate, MemberRecord, STATUS_OPEN};

#[derive(Accounts)]
pub struct JoinGroup<'info> {
    pub member: Signer<'info>,

    /// Pays the member_record rent and is recorded as the destination of that rent when the
    /// record is closed. May be the same key as `member`.
    #[account(mut)]
    pub rent_payer: Signer<'info>,

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
        payer = rent_payer,
        space = 8 + MemberRecord::INIT_SPACE,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub member_record: Account<'info, MemberRecord>,

    /// Must be the member's canonical ATA for the group mint (pins owner and
    /// mint too). Settlement derives each member's ATA deterministically, so
    /// accepting any other token account here would brick the whole group at
    /// distribute time (issue #44 M-3).
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = member,
        associated_token::token_program = token_program,
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

    /// CHECK: the seeds pin the address to `["join", group_config]`, and the handler reads it
    /// only when this program owns it. Only `set_join_authority` can create a program-owned
    /// account at that address, so a program-owned account here is this group's JoinGate, and
    /// `try_deserialize` still checks its discriminator. Any other owner means no gate: a wallet
    /// can send lamports to the address, but cannot make it program-owned.
    #[account(
        seeds = [b"join", group_config.key().as_ref()],
        bump,
    )]
    pub join_gate: UncheckedAccount<'info>,

    /// Must sign when the group has a JoinGate. Ignored when it has none.
    pub join_authority: Option<Signer<'info>>,
}

impl<'info> JoinGroup<'info> {
    pub fn handler(&mut self, bumps: &JoinGroupBumps) -> Result<()> {
        // ── Checks ──────────────────────────────────────────
        if self.join_gate.owner == &crate::ID {
            let gate = JoinGate::try_deserialize(&mut &self.join_gate.try_borrow_data()?[..])?;
            let approved = self
                .join_authority
                .as_ref()
                .is_some_and(|signer| signer.key() == gate.authority);
            require!(approved, SafeNudgeError::JoinNotApproved);
        }

        // ── Effects ─────────────────────────────────────────
        let member_record = &mut self.member_record;
        member_record.group = self.group_config.key();
        member_record.member = self.member.key();
        member_record.rent_payer = self.rent_payer.key();
        member_record.total_deposited = self.group_config.deposit_amount;
        member_record.deposits_made = 1;
        member_record.periods_deposited = [false; 52];
        member_record.periods_deposited[0] = true;
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
        let cpi_ctx = CpiContext::new(self.token_program.key(), cpi_accounts);
        transfer_checked(
            cpi_ctx,
            self.group_config.deposit_amount,
            self.mint.decimals,
        )?;

        emit!(MemberJoined {
            group: self.group_config.key(),
            member: self.member.key(),
            rent_payer: self.rent_payer.key(),
            amount: self.group_config.deposit_amount,
            current_members: self.group_config.current_members,
        });

        Ok(())
    }
}
