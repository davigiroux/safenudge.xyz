use lite_anchor::event::Event;
use lite_anchor::math::checked_div_i64;
use lite_anchor::prelude::*;

use crate::errors::SafeNudgeError;
use crate::events::DepositMade;
use crate::state::{period_duration_secs, GroupConfig, MemberRecord, STATUS_ACTIVE};

/// Same accounts, order and constraints as `programs/safenudge/src/instructions/deposit.rs`.
#[derive(Accounts)]
pub struct Deposit {
    pub member: Signer,

    #[account(
        mut,
        seeds = [b"group", group_config.load()?.group_code()?],
        bump = group_config.load()?.bump,
        constraint = group_config.load()?.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<GroupConfig>,

    #[account(
        mut,
        seeds = [b"member", group_config.address(), member.address()],
        bump = member_record.load()?.bump,
        constraint = member_record.load()?.group == *group_config.address(),
        constraint = member_record.load()?.member == *member.address(),
    )]
    pub member_record: Account<MemberRecord>,

    #[account(
        mut,
        constraint = *member_token_account.mint() == group_config.load()?.mint @ SafeNudgeError::InvalidMint,
        constraint = member_token_account.owner() == member.address(),
    )]
    pub member_token_account: TokenAccount,

    #[account(
        mut,
        seeds = [b"vault", group_config.address()],
        bump,
    )]
    pub vault: TokenAccount,

    #[account(
        constraint = *mint.address() == group_config.load()?.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: Mint,

    pub token_program: TokenProgram,
}

impl Deposit {
    pub fn handler(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        let (current_period, amount, deposits_made) = {
            let group = self.group_config.load()?;
            let mut record = self.member_record.load_mut()?;

            // ── Checks ──────────────────────────────────────────

            let period_duration = period_duration_secs(group.frequency)?;

            require!(
                clock.unix_timestamp < group.cycle_end()?,
                SafeNudgeError::CycleEnded
            );

            let elapsed = clock
                .unix_timestamp
                .checked_sub(group.cycle_start)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let max_period = group
                .total_periods
                .checked_sub(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            // `elapsed.checked_div(period_duration)` in the original. Upstream BPF cannot emit
            // signed division yet; see `lite_anchor::math`.
            let elapsed_period = checked_div_i64(elapsed, period_duration)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let current_period = core::cmp::min(
                u8::try_from(elapsed_period).map_err(|_| SafeNudgeError::ArithmeticOverflow)?,
                max_period,
            );
            let slot = usize::from(current_period);

            require!(
                record.periods_deposited[slot] == 0,
                SafeNudgeError::AlreadyDeposited
            );

            // ── Effects ─────────────────────────────────────────

            record.periods_deposited[slot] = 1;
            record.deposits_made = record
                .deposits_made
                .checked_add(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            record.total_deposited = record
                .total_deposited
                .checked_add(group.deposit_amount)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            (current_period, group.deposit_amount, record.deposits_made)
            // Both guards drop here, before the CPI.
        };

        // ── Interactions: transfer deposit to vault ──────────

        self.token_program.transfer_checked(
            &self.member_token_account,
            &self.mint,
            &self.vault,
            self.member.view(),
            amount,
            self.mint.decimals(),
        )?;

        DepositMade {
            group: *self.group_config.address(),
            member: *self.member.address(),
            period: current_period,
            amount,
            deposits_made,
        }
        .emit();

        Ok(())
    }
}
