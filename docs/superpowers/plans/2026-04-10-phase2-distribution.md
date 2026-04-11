# Phase 2: Distribution & Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `distribute` and `emergency_cancel` instructions with full penalty math, PDA-signed vault outbound transfers, and comprehensive test coverage including edge cases.

**Architecture:** Both instructions iterate remaining accounts (pairs of [member_record, member_token_account]), validate each pair, compute payouts, and transfer from vault using PDA signer seeds. The vault is self-authority (seeds = [b"vault", group_config_key]) — same PDA is both the token account and its own authority.

**Tech Stack:** Rust / Anchor 0.30+, anchor-spl token_interface, TypeScript / mocha / anchor-bankrun

---

## File Structure

```
programs/safenudge/src/instructions/
├── mod.rs                    # add distribute + emergency_cancel exports
├── distribute.rs             # NEW — penalty calc + redistribution + vault drain
└── emergency_cancel.rs       # NEW — pro-rata refund + vault drain
tests/
└── safenudge.ts              # add distribute + cancel + edge case + integration tests
```

---

### Task 1: distribute Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/distribute.rs`
- Modify: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Create distribute.rs**

The distribute instruction uses remaining_accounts for member records and token accounts. The handler performs two passes:
1. Calculate each member's penalty and base payout, count compliant members, sum total penalties
2. Transfer computed payouts (base payout + bonus for compliant members) from vault to each member

Key patterns:
- Remaining accounts come as pairs: [member_record_account_info, member_token_account_info]
- Must manually deserialize MemberRecord from account_info using `Account::try_from`
- Vault signs transfers with PDA seeds: `[b"vault", group_config.key(), &[vault_bump]]`
- Last member gets vault remainder (not calculated amount) to prevent dust
- After all transfers, close vault token account (return rent to payer)

```rust
// programs/safenudge/src/instructions/distribute.rs
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_ACTIVE, STATUS_COMPLETED};

#[derive(Accounts)]
pub struct Distribute<'info> {
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
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = mint.key() == group_config.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Distribute<'info> {
    pub fn handler(ctx: Context<'_, '_, '_, 'info, Distribute<'info>>) -> Result<()> {
        let group_config = &ctx.accounts.group_config;
        let clock = Clock::get()?;

        // ── Checks ──────────────────────────────────────────

        // Verify cycle has ended
        let period_duration: i64 = match group_config.frequency {
            0 => 7_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            1 => 14_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            2 => 30_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            _ => return Err(SafeNudgeError::InvalidFrequency.into()),
        };
        let cycle_duration = (group_config.total_periods as i64)
            .checked_mul(period_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let cycle_end = group_config
            .cycle_start
            .checked_add(cycle_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            clock.unix_timestamp >= cycle_end,
            SafeNudgeError::CycleNotEnded
        );

        // Validate remaining accounts: pairs of [member_record, member_token_account]
        let remaining = &ctx.remaining_accounts;
        require!(
            remaining.len() == (group_config.current_members as usize) * 2,
            SafeNudgeError::MemberCountMismatch
        );

        let member_count = group_config.current_members as usize;
        let total_periods = group_config.total_periods;
        let deposit_amount = group_config.deposit_amount;
        let penalty_type = group_config.penalty_type;
        let penalty_value = group_config.penalty_value;
        let decimals = ctx.accounts.mint.decimals;
        let group_key = ctx.accounts.group_config.key();
        let vault_bump = ctx.bumps.vault;

        // ── Pass 1: Calculate penalties and payouts ──────────

        let mut member_payouts: Vec<u64> = Vec::with_capacity(member_count);
        let mut total_penalties: u64 = 0;
        let mut compliant_count: u64 = 0;

        for i in 0..member_count {
            let member_record_info = &remaining[i * 2];

            // Deserialize and validate member record
            let member_record_data = member_record_info.try_borrow_data()?;
            // Skip 8-byte discriminator
            let member_record = MemberRecord::try_deserialize(
                &mut &member_record_data[..],
            )?;

            // Validate member record belongs to this group
            require!(
                member_record.group == group_key,
                SafeNudgeError::InvalidGroupStatus
            );

            let missed = (total_periods as u64)
                .checked_sub(member_record.deposits_made as u64)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            let penalty = if penalty_type == 0 {
                // Fixed penalty
                missed
                    .checked_mul(penalty_value)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?
            } else {
                // Percentage penalty (basis points)
                let per_period_penalty = deposit_amount
                    .checked_mul(penalty_value)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?
                    .checked_div(10000)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?;
                missed
                    .checked_mul(per_period_penalty)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?
            };

            // Cap penalty at total deposited
            let capped_penalty = std::cmp::min(penalty, member_record.total_deposited);

            let base_payout = member_record
                .total_deposited
                .checked_sub(capped_penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            total_penalties = total_penalties
                .checked_add(capped_penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;

            if member_record.deposits_made == total_periods {
                compliant_count = compliant_count
                    .checked_add(1)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            }

            member_payouts.push(base_payout);
        }

        // Calculate bonus for compliant members
        let bonus_per_compliant = if compliant_count > 0 {
            total_penalties
                .checked_div(compliant_count)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?
        } else {
            0
        };

        // ── Pass 2: Add bonus to compliant members ──────────

        // Re-read member records to check compliance for bonus
        for i in 0..member_count {
            let member_record_info = &remaining[i * 2];
            let member_record_data = member_record_info.try_borrow_data()?;
            let member_record = MemberRecord::try_deserialize(
                &mut &member_record_data[..],
            )?;

            if member_record.deposits_made == total_periods && bonus_per_compliant > 0 {
                member_payouts[i] = member_payouts[i]
                    .checked_add(bonus_per_compliant)
                    .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            }
        }

        // ── Interactions: Transfer payouts from vault ────────

        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &[vault_bump]];

        for i in 0..member_count {
            let member_token_account_info = &remaining[i * 2 + 1];
            let mut payout = member_payouts[i];

            // Last member gets vault remainder to prevent dust
            if i == member_count - 1 {
                let vault_data = ctx.accounts.vault.to_account_info();
                let vault_account = TokenAccount::try_deserialize(
                    &mut &vault_data.try_borrow_data()?[..],
                )?;
                payout = vault_account.amount;
            }

            if payout > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: member_token_account_info.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    &[signer_seeds],
                );
                token_interface::transfer_checked(cpi_ctx, payout, decimals)?;
            }

            // Mark member as claimed
            let member_record_info = &remaining[i * 2];
            let mut member_record_data = member_record_info.try_borrow_mut_data()?;
            // has_claimed is at offset: 32 (group) + 32 (member) + 8 (total_deposited) + 1 (deposits_made) + 52 (periods) = 125
            // But with discriminator in serialized form: 8 + 125 = 133
            // Actually, use proper offset. MemberRecord fields:
            // discriminator: 8, group: 32, member: 32, total_deposited: 8, deposits_made: 1, periods_deposited: 52, has_claimed: 1, bump: 1
            // has_claimed offset = 8 + 32 + 32 + 8 + 1 + 52 = 133
            member_record_data[133] = 1; // true
        }

        // ── Set status to Completed ─────────────────────────

        ctx.accounts.group_config.status = STATUS_COMPLETED;

        // ── Close vault account ─────────────────────────────

        let close_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            close_accounts,
            &[signer_seeds],
        );
        token_interface::close_account(close_ctx)?;

        Ok(())
    }
}
```

**Important implementation notes:**
- The handler takes `Context` directly (not `&mut self`) because we need access to `ctx.remaining_accounts` and `ctx.bumps` simultaneously. This is a different pattern from the other instructions.
- `MemberRecord::try_deserialize` reads the full account data including discriminator.
- Direct byte manipulation for `has_claimed` avoids re-serialization overhead. Calculate the exact byte offset from the MemberRecord struct layout.
- The last-member-gets-remainder pattern prevents rounding dust from being locked in the vault.

- [ ] **Step 2: Update instructions/mod.rs**

Add:
```rust
pub mod distribute;
pub use distribute::*;
```

- [ ] **Step 3: Update lib.rs**

Add entrypoint. Note the different signature — `distribute` uses the Context-level handler pattern:
```rust
    pub fn distribute<'info>(ctx: Context<'_, '_, '_, 'info, Distribute<'info>>) -> Result<()> {
        Distribute::handler(ctx)
    }
```

- [ ] **Step 4: Add distribute tests to tests/safenudge.ts**

Add these tests inside the `describe("safenudge")` block:

```typescript
  describe("distribute", () => {
    it("distributes correctly when all members are compliant", async () => {
      const code = "dist-all-ok";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);
      const depositAmt = 5_000_000; // 5 USDC

      // Create group: weekly, 2 periods, fixed 1 USDC penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmt), 0, 2, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Two members join (period 0 deposited)
      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      const m2 = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.keypair.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2.keypair]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance to period 1, both deposit
      const clock1 = await context.banksClient.getClock();
      context.setClock(new Clock(
        clock1.slot, clock1.epochStartTimestamp, clock1.epoch,
        clock1.leaderScheduleEpoch, clock1.unixTimestamp + BigInt(8 * 86400)
      ));

      await program.methods.deposit()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1.keypair]).rpc();

      await program.methods.deposit()
        .accounts({
          member: m2.keypair.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m2.keypair]).rpc();

      // Advance past cycle end (2 periods * 7 days = 14 days from start)
      const clock2 = await context.banksClient.getClock();
      context.setClock(new Clock(
        clock2.slot + BigInt(1), clock2.epochStartTimestamp, clock2.epoch,
        clock2.leaderScheduleEpoch, clock2.unixTimestamp + BigInt(8 * 86400)
      ));

      // Distribute — all compliant, no penalties, each gets their deposits back
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: true, isSigner: false },
          { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: true, isSigner: false },
          { pubkey: m2.tokenAccount, isWritable: true, isSigner: false },
        ])
        .rpc();

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2); // Completed

      // Each member deposited 5M * 2 periods = 10M. No penalties. Gets 10M back.
      // Vault should be closed (account doesn't exist)
    });

    it("distributes with penalties: one member misses deposits", async () => {
      const code = "dist-penalty";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);
      const depositAmt = 10_000_000; // 10 USDC

      // Create group: weekly, 2 periods, fixed 2 USDC penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmt), 0, 2, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      const m2 = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.keypair.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2.keypair]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance to period 1 — only m1 deposits, m2 skips
      const clock1 = await context.banksClient.getClock();
      context.setClock(new Clock(
        clock1.slot, clock1.epochStartTimestamp, clock1.epoch,
        clock1.leaderScheduleEpoch, clock1.unixTimestamp + BigInt(8 * 86400)
      ));

      await program.methods.deposit()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1.keypair]).rpc();

      // Advance past cycle end
      const clock2 = await context.banksClient.getClock();
      context.setClock(new Clock(
        clock2.slot + BigInt(1), clock2.epochStartTimestamp, clock2.epoch,
        clock2.leaderScheduleEpoch, clock2.unixTimestamp + BigInt(8 * 86400)
      ));

      // m1: deposited 2 periods (10M*2=20M), 0 missed, penalty=0, compliant
      // m2: deposited 1 period (10M), missed 1, penalty=2M, NOT compliant
      // Total penalties: 2M, distributed to m1 (only compliant member)
      // m1 payout: 20M + 2M = 22M
      // m2 payout: 10M - 2M = 8M
      // Total: 30M = vault balance (20M from m1 + 10M from m2)

      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: true, isSigner: false },
          { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: true, isSigner: false },
          { pubkey: m2.tokenAccount, isWritable: true, isSigner: false },
        ])
        .rpc();

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("fails when cycle has not ended", async () => {
      const code = "dist-early";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      const m2 = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.keypair.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2.keypair]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Try to distribute immediately (cycle not ended)
      try {
        await program.methods.distribute()
          .accounts({
            payer: payer.publicKey, groupConfig: gPda, vault: vPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: true, isSigner: false },
            { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
            { pubkey: m2Pda, isWritable: true, isSigner: false },
            { pubkey: m2.tokenAccount, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "CycleNotEnded");
      }
    });
  });
```

- [ ] **Step 5: Build and run tests**

```bash
NO_DNA=1 anchor build
NODE_OPTIONS='--no-experimental-strip-types' npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Expected: all 15 Phase 1 tests + 3 distribute tests = 18 passing.

**Note:** The distribute instruction is complex. If `try_deserialize` or `try_borrow_mut_data` patterns don't work as expected, the implementer should:
- Try using `AccountLoader` or manual deserialization via `borsh::BorshDeserialize`
- For `has_claimed` update, consider serializing the full MemberRecord back instead of byte manipulation
- The exact byte offset for `has_claimed` depends on borsh serialization order — verify against the actual account data

- [ ] **Step 6: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add distribute instruction with penalty calc + PDA-signed transfers"
```

---

### Task 2: emergency_cancel Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/emergency_cancel.rs`
- Modify: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Create emergency_cancel.rs**

Simpler than distribute — no penalty calculation. Returns each member's `total_deposited` from vault.

```rust
// programs/safenudge/src/instructions/emergency_cancel.rs
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_ACTIVE, STATUS_CANCELLED, STATUS_OPEN};

#[derive(Accounts)]
pub struct EmergencyCancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        has_one = creator @ SafeNudgeError::UnauthorizedCreator,
        constraint = group_config.status == STATUS_OPEN || group_config.status == STATUS_ACTIVE
            @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

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

impl<'info> EmergencyCancel<'info> {
    pub fn handler(ctx: Context<'_, '_, '_, 'info, EmergencyCancel<'info>>) -> Result<()> {
        let group_config = &ctx.accounts.group_config;
        let group_key = ctx.accounts.group_config.key();
        let vault_bump = ctx.bumps.vault;
        let decimals = ctx.accounts.mint.decimals;
        let member_count = group_config.current_members as usize;

        // Validate remaining accounts
        let remaining = &ctx.remaining_accounts;
        require!(
            remaining.len() == member_count * 2,
            SafeNudgeError::MemberCountMismatch
        );

        let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &[vault_bump]];

        // Return each member's total_deposited
        for i in 0..member_count {
            let member_record_info = &remaining[i * 2];
            let member_token_account_info = &remaining[i * 2 + 1];

            let member_record_data = member_record_info.try_borrow_data()?;
            let member_record = MemberRecord::try_deserialize(
                &mut &member_record_data[..],
            )?;

            require!(
                member_record.group == group_key,
                SafeNudgeError::InvalidGroupStatus
            );

            let refund = member_record.total_deposited;

            if refund > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: member_token_account_info.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    &[signer_seeds],
                );
                token_interface::transfer_checked(cpi_ctx, refund, decimals)?;
            }
        }

        // Set status to Cancelled
        ctx.accounts.group_config.status = STATUS_CANCELLED;

        // Close vault
        let close_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            close_accounts,
            &[signer_seeds],
        );
        token_interface::close_account(close_ctx)?;

        Ok(())
    }
}
```

- [ ] **Step 2: Update mod.rs + lib.rs**

Add `emergency_cancel` to mod.rs exports and lib.rs entrypoint:
```rust
    pub fn emergency_cancel<'info>(ctx: Context<'_, '_, '_, 'info, EmergencyCancel<'info>>) -> Result<()> {
        EmergencyCancel::handler(ctx)
    }
```

- [ ] **Step 3: Add emergency_cancel tests**

```typescript
  describe("emergency_cancel", () => {
    it("creator cancels during open — full refund", async () => {
      const code = "cancel-open";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: true, isSigner: false },
          { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
        ])
        .rpc();

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 3); // Cancelled
    });

    it("creator cancels during active — full refund", async () => {
      const code = "cancel-active";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      const m2 = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.keypair.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2.keypair]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: true, isSigner: false },
          { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: true, isSigner: false },
          { pubkey: m2.tokenAccount, isWritable: true, isSigner: false },
        ])
        .rpc();

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 3);
    });

    it("fails when non-creator tries to cancel", async () => {
      const code = "cancel-unauth";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const impostor = Keypair.generate();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: impostor.publicKey, lamports: anchor.web3.LAMPORTS_PER_SOL })
      );
      await provider.sendAndConfirm(fundTx, [payer]);

      try {
        await program.methods.emergencyCancel()
          .accounts({
            creator: impostor.publicKey, groupConfig: gPda, vault: vPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([])
          .signers([impostor])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "UnauthorizedCreator");
      }
    });

    it("fails when group is already completed", async () => {
      // This test requires a completed group — use the "dist-all-ok" group
      // or create a new full lifecycle. Simplest: test against a cancelled group.
      const code = "cancel-done";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m1 = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.keypair.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.keypair.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1.tokenAccount, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1.keypair]).rpc();

      // Cancel first time
      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: true, isSigner: false },
          { pubkey: m1.tokenAccount, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Try to cancel again
      try {
        await program.methods.emergencyCancel()
          .accounts({
            creator: payer.publicKey, groupConfig: gPda, vault: vPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        // Status is Cancelled (3), not Open or Active
        const errStr = e.message || e.toString();
        assert.ok(
          errStr.includes("InvalidGroupStatus") || errStr.includes("0x1770") || errStr.includes("AccountNotInitialized"),
          `Expected InvalidGroupStatus error, got: ${errStr.substring(0, 200)}`
        );
      }
    });
  });
```

- [ ] **Step 4: Build and run**

```bash
NO_DNA=1 anchor build
NODE_OPTIONS='--no-experimental-strip-types' npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Expected: 18 + 4 = 22 tests passing.

- [ ] **Step 5: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add emergency_cancel instruction with pro-rata refund + tests"
```

---

### Task 3: Distribution Edge Case Tests

**Files:**
- Modify: `tests/safenudge.ts`

These tests verify the penalty math and conservation of funds invariant. Add inside the `distribute` describe block:

- [ ] **Step 1: Add percentage penalty test**

Test distribute with percentage-based penalties instead of fixed. Create group with penalty_type=1, penalty_value=500 (5%).

- [ ] **Step 2: Add "all members missed equally" test**

When all members have equal misses, penalties cancel out and each gets their deposits back minus penalty. If no one is compliant, penalties should still be redistributed proportionally or remain unclaimed (depending on implementation — verify with the code that when compliant_count=0, bonus_per_compliant=0 and the penalty pool stays in vault dust or gets distributed to last member via remainder).

- [ ] **Step 3: Add "penalty capped at total_deposited" test**

Create a scenario where penalty would exceed a member's total_deposited. Verify the cap works (member loses at most what they deposited).

- [ ] **Step 4: Run tests, commit**

```bash
NODE_OPTIONS='--no-experimental-strip-types' npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
git add tests/safenudge.ts
git commit -m "test(program): add distribution edge case tests (percentage, all-missed, penalty-cap)"
```

---

### Task 4: Full Lifecycle Integration Test

**Files:**
- Modify: `tests/safenudge.ts`

- [ ] **Step 1: Add integration test**

Full cycle: create → 3 members join → start → 4 weekly deposits (some members miss some periods) → distribute → verify payouts and conservation of funds.

This test should:
1. Track each member's token balance before and after
2. Verify sum of all payouts = sum of all deposits (conservation)
3. Verify vault balance is 0 after distribution

- [ ] **Step 2: Run tests, commit**

```bash
NODE_OPTIONS='--no-experimental-strip-types' npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
git add tests/safenudge.ts
git commit -m "test(program): add full lifecycle integration test with conservation check"
```

---

## Implementation Notes

### PDA-Signed Transfer Pattern (vault → member)

```rust
let signer_seeds: &[&[u8]] = &[b"vault", group_key.as_ref(), &[vault_bump]];
let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, &[signer_seeds]);
token_interface::transfer_checked(cpi_ctx, amount, decimals)?;
```

### Remaining Accounts Deserialization

```rust
let member_record_info = &ctx.remaining_accounts[i * 2];
let data = member_record_info.try_borrow_data()?;
let record = MemberRecord::try_deserialize(&mut &data[..])?;
```

### Conservation of Funds Invariant

In every distribution test, verify: `sum(all_payouts) == sum(all_deposits)` and vault balance == 0 after distribution.

### Potential Pitfalls

1. **Borrow checker with remaining_accounts** — can't hold mutable and immutable borrows simultaneously. Process transfers one at a time.
2. **Vault reload after transfers** — after each transfer, the vault's cached amount is stale. For the last-member-remainder pattern, re-read vault balance from account_info.
3. **has_claimed byte offset** — verify the exact borsh serialization offset. If byte manipulation causes issues, serialize the full MemberRecord back.
4. **CloseAccount after transfers** — vault must be empty (balance == 0) before closing.
