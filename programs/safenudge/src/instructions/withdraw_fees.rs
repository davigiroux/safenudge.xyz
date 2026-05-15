use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::FEE_RECIPIENT;

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        constraint = recipient.key() == FEE_RECIPIENT @ SafeNudgeError::UnauthorizedRecipient,
    )]
    pub recipient: Signer<'info>,

    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury_authority: SystemAccount<'info>,

    #[account(
        mut,
        constraint = treasury_token_account.owner == treasury_authority.key() @ SafeNudgeError::InvalidTokenAccountOwner,
        constraint = treasury_token_account.mint == mint.key() @ SafeNudgeError::InvalidMint,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = recipient_token_account.owner == FEE_RECIPIENT @ SafeNudgeError::InvalidTokenAccountOwner,
        constraint = recipient_token_account.mint == mint.key() @ SafeNudgeError::InvalidMint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> WithdrawFees<'info> {
    pub fn handler(ctx: Context<WithdrawFees>) -> Result<()> {
        let amount = ctx.accounts.treasury_token_account.amount;
        if amount == 0 {
            return Ok(());
        }

        let bump_bytes = [ctx.bumps.treasury_authority];
        let signer_seeds: &[&[u8]] = &[b"treasury", &bump_bytes];
        let signer = &[signer_seeds];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.treasury_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.treasury_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        );
        transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        Ok(())
    }
}
