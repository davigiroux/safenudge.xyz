use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::events::GroupSettled;
use crate::state::settlement::{settle, MemberDeposits, Settlement};
use crate::state::{validate_member_pair, GroupConfig, STATUS_ACTIVE, STATUS_COMPLETED};
use crate::PROTOCOL_FEE_BPS;

#[derive(Accounts)]
pub struct Distribute<'info> {
    /// Permissionless caller triggering settlement. Pays only the transaction
    /// fee — never rent (the treasury ATA is pre-created via `init_treasury`).
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"vault", group_config.key().as_ref()],
        bump = group_config.vault_bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = mint.key() == group_config.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// PDA that owns the protocol treasury ATA. Holds no data; SystemAccount
    /// validates ownership and gives Anchor the seed/bump derivation it needs
    /// to sign the withdraw_fees CPI later.
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury_authority: SystemAccount<'info>,

    /// Treasury ATA for this mint, created ahead of time by FEE_RECIPIENT via
    /// `init_treasury` — never initialized here, so a permissionless caller
    /// can't be griefed into paying its rent. Optional: required only when a
    /// protocol fee is due this settlement (enforced in the handler); when
    /// passed, the associated_token constraints pin it to the canonical ATA of
    /// (mint, treasury_authority), so no other destination can receive the fee.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: Option<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Distribute<'info> {
    pub fn handler(ctx: Context<'info, Distribute<'info>>) -> Result<()> {
        let clock = Clock::get()?;
        let group = &ctx.accounts.group_config;

        // ── Checks ──────────────────────────────────────────

        require!(
            clock.unix_timestamp >= group.cycle_end()?,
            SafeNudgeError::CycleNotEnded
        );

        // Validate remaining accounts: pairs of [member_record, member_token_account]
        let member_count = group.current_members as usize;
        let expected_remaining = member_count
            .checked_mul(2)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            ctx.remaining_accounts.len() == expected_remaining,
            SafeNudgeError::MemberCountMismatch
        );

        let group_key = ctx.accounts.group_config.key();
        let terms = group.terms();
        let decimals = ctx.accounts.mint.decimals;
        let mint_key = ctx.accounts.mint.key();

        let mut deposits: Vec<MemberDeposits> = Vec::with_capacity(member_count);
        let mut seen_records: Vec<Pubkey> = Vec::with_capacity(member_count);
        for pair in ctx.remaining_accounts.chunks_exact(2) {
            let member_record =
                validate_member_pair(&pair[0], &pair[1], &group_key, &mint_key, &mut seen_records)?;
            deposits.push(MemberDeposits {
                member: member_record.member,
                total_deposited: member_record.total_deposited,
                deposits_made: member_record.deposits_made,
            });
        }

        // The fee is skipped entirely if FEE_RECIPIENT is ever `Pubkey::default()` (no cluster
        // sets that now): the full penalty pool is then redistributed, so nothing accumulates in
        // a treasury no one can withdraw from (issue #44 H-4).
        let fee_bps = if crate::fee_recipient_configured() { PROTOCOL_FEE_BPS } else { 0 };
        let Settlement {
            members: mut settled,
            protocol_fee,
            compliant_count,
            total_deposited,
        } = settle(group_key, &terms, &deposits, fee_bps)?;

        require!(
            ctx.accounts.vault.amount >= total_deposited,
            SafeNudgeError::VaultShortfall
        );

        // Fee-evasion guard: distribute is permissionless, so the caller must
        // not be able to dodge the fee by omitting the treasury account. When
        // a fee is due the canonical treasury ATA must be passed and exist
        // (created via init_treasury); otherwise settlement is blocked — not
        // bricked — until FEE_RECIPIENT initializes it.
        require!(
            protocol_fee == 0 || ctx.accounts.treasury_token_account.is_some(),
            SafeNudgeError::TreasuryNotInitialized
        );

        // ── Effects ─────────────────────────────────────────

        ctx.accounts.group_config.status = STATUS_COMPLETED;
        ctx.accounts.group_config.settled_at = clock.unix_timestamp;

        // ── Interactions ────────────────────────────────────

        let vault_bump = ctx.accounts.group_config.vault_bump;
        let bump_bytes = [vault_bump];
        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &bump_bytes];
        let signer = &[signer_seeds];

        // Fee transfer goes first so the last-member dust path naturally sees
        // the post-fee remainder via vault.reload().
        if protocol_fee > 0 {
            let treasury = ctx
                .accounts
                .treasury_token_account
                .as_ref()
                .ok_or(SafeNudgeError::TreasuryNotInitialized)?; // unreachable; guarded above
            let fee_cpi_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: treasury.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let fee_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                fee_cpi_accounts,
                signer,
            );
            transfer_checked(fee_ctx, protocol_fee, decimals)?;
        }

        for i in 0..member_count {
            let token_idx = i
                .checked_mul(2)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?
                .checked_add(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let member_token_info = &ctx.remaining_accounts[token_idx];

            // Last member gets vault remainder to prevent dust
            let amount = if i == member_count.checked_sub(1).ok_or(SafeNudgeError::ArithmeticOverflow)? {
                ctx.accounts.vault.reload()?;
                settled[i].payout = ctx.accounts.vault.amount;
                ctx.accounts.vault.amount
            } else {
                settled[i].payout
            };

            if amount > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: member_token_info.clone(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    cpi_accounts,
                    signer,
                );
                transfer_checked(cpi_ctx, amount, decimals)?;
            }
        }

        let vault_rent_escrow = ctx.accounts.group_config.to_account_info();
        let close_cpi = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: vault_rent_escrow,
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            close_cpi,
            signer,
        );
        close_account(close_ctx)?;

        let mut total_penalties_charged: u64 = 0;
        let mut total_paid: u64 = 0;
        for event in settled {
            total_penalties_charged = total_penalties_charged
                .checked_add(event.penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            total_paid = total_paid
                .checked_add(event.payout)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            emit!(event);
        }
        emit!(GroupSettled {
            group: group_key,
            members: ctx.accounts.group_config.current_members,
            compliant_count,
            total_penalties: total_penalties_charged,
            protocol_fee,
            total_paid,
        });

        Ok(())
    }
}
