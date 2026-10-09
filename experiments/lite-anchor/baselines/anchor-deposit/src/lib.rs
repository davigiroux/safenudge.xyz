// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Davi Giroux

//! `programs/safenudge` with every instruction but `deposit` removed. Size baseline only.

use anchor_lang::prelude::*;

declare_id!("GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc");

pub mod deposit;
pub mod errors;
pub mod events;
pub mod state;

use deposit::*;

#[program]
pub mod safenudge {
    use super::*;

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.handler()
    }
}
