//! SafeNudge's `deposit`, ported from Anchor to lite-anchor.
//!
//! Same program ID, account layouts, PDA seeds, instruction discriminator, error codes and event
//! bytes as `programs/safenudge`, so the same client and the same test transactions drive both.
#![no_std]

use lite_anchor::prelude::*;
use solana_compiler_builtins as _;

pub mod deposit;
pub mod errors;
pub mod events;
pub mod state;

pub use deposit::*;

/// Same as `programs/safenudge` (non-mainnet builds).
pub const ID: Address = address!("GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc");

#[program]
pub mod safenudge {
    use super::*;

    /// Records the member's deposit for the current period and moves it into the vault.
    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.handler()
    }
}
