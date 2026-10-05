use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, STATUS_CANCELLED, STATUS_COMPLETED};

/// Pays the vault rent that settlement left in GroupConfig to the recorded rent payer.
///
/// Permissionless. The caller chooses nothing: the destination is `group_config.rent_payer`
/// and the amount is whatever GroupConfig holds above its own rent-exempt minimum. GroupConfig
/// keeps that minimum, so it is never closed and its group code stays taken.
#[derive(Accounts)]
pub struct RefundVaultRent<'info> {
    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = (group_config.status == STATUS_COMPLETED || group_config.status == STATUS_CANCELLED) @ SafeNudgeError::InvalidGroupStatus,
        // A raw constraint, not `has_one`: Anchor runs every `has_one` before
        // any raw constraint, and the status check must come first.
        constraint = rent_payer.key() == group_config.rent_payer @ SafeNudgeError::InvalidRentPayer,
    )]
    pub group_config: Account<'info, GroupConfig>,

    /// CHECK: receives lamports and nothing else. It is never read, never deserialized, and is
    /// not a signer or an authority. The constraint on `group_config` pins its key to the
    /// wallet that signed and paid at create_group, so the caller cannot redirect the refund.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
}

impl<'info> RefundVaultRent<'info> {
    pub fn handler(ctx: Context<RefundVaultRent>) -> Result<()> {
        let group_config = &ctx.accounts.group_config;
        let surplus = lamports_above_rent_floor(&group_config.to_account_info())?;

        group_config.sub_lamports(surplus)?;
        ctx.accounts.rent_payer.add_lamports(surplus)?;

        Ok(())
    }
}

/// Zero when the account holds its rent-exempt minimum or less.
fn lamports_above_rent_floor(account: &AccountInfo) -> Result<u64> {
    let rent_floor = Rent::get()?.minimum_balance(account.data_len());
    Ok(account.lamports().saturating_sub(rent_floor))
}
