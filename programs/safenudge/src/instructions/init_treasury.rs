use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::SafeNudgeError;
use crate::FEE_RECIPIENT;

/// One-shot, per-mint creation of the protocol treasury token account.
///
/// Signed and paid for by the compile-time `FEE_RECIPIENT`, so a permissionless
/// `distribute` caller can never be forced to fund rent for an account only the
/// fee recipient controls (issue #44 / H-3). Must run once per supported mint
/// before the first fee-charging settlement on that mint; `distribute` fails
/// with `TreasuryNotInitialized` (retriable, funds stay in the vault) until it
/// has. No group account is involved, so no status check applies.
#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(
        mut,
        constraint = fee_recipient.key() == FEE_RECIPIENT @ SafeNudgeError::UnauthorizedRecipient,
    )]
    pub fee_recipient: Signer<'info>,

    /// PDA with authority over all treasury token accounts. Holds no data.
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury_authority: SystemAccount<'info>,

    /// Canonical ATA of (mint, treasury_authority). `init` (not
    /// `init_if_needed`): calling twice fails, which is fine for a one-shot.
    #[account(
        init,
        payer = fee_recipient,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Any mint — groups are per-mint (`group_config.mint`) while the treasury
    /// authority PDA is global, so the protocol holds one ATA per supported mint.
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitTreasury<'info> {
    pub fn handler(_ctx: Context<InitTreasury>) -> Result<()> {
        // All work happens in the account constraints (`init` creates the ATA).
        Ok(())
    }
}
