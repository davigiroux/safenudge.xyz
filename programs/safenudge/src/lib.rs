use anchor_lang::prelude::*;

declare_id!("88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB");

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod safenudge {
    use super::*;

    pub fn create_group(
        ctx: Context<CreateGroup>,
        group_code: String,
        deposit_amount: u64,
        frequency: u8,
        total_periods: u8,
        max_members: u8,
        penalty_type: u8,
        penalty_value: u64,
    ) -> Result<()> {
        ctx.accounts.handler(
            group_code,
            deposit_amount,
            frequency,
            total_periods,
            max_members,
            penalty_type,
            penalty_value,
            &ctx.bumps,
        )
    }

    pub fn join_group(ctx: Context<JoinGroup>) -> Result<()> {
        ctx.accounts.handler(&ctx.bumps)
    }

    pub fn start_cycle(ctx: Context<StartCycle>) -> Result<()> {
        ctx.accounts.handler()
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.handler()
    }

    pub fn distribute<'info>(ctx: Context<'_, '_, 'info, 'info, Distribute<'info>>) -> Result<()> {
        Distribute::handler(ctx)
    }

    pub fn emergency_cancel<'info>(ctx: Context<'_, '_, 'info, 'info, EmergencyCancel<'info>>) -> Result<()> {
        EmergencyCancel::handler(ctx)
    }
}
