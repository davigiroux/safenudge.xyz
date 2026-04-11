# Phase 1: Program Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold Anchor project, define state accounts, implement `create_group`, `join_group`, `start_cycle`, `deposit` instructions with full test coverage.

**Architecture:** Anchor program with 2 PDA account types (GroupConfig, MemberRecord) and a self-authority PDA vault token account. Each instruction validates status first, uses checked arithmetic, follows CEI pattern (Checks-Effects-Interactions), and uses `transfer_checked` for all token CPIs.

**Tech Stack:** Rust / Anchor 0.30+, anchor-spl token_interface, TypeScript / mocha / anchor-bankrun for tests

---

## File Structure

```
safenudge.xyz/
├── Anchor.toml
├── Cargo.toml                              # workspace root
├── package.json                            # test deps
├── tsconfig.json
├── .gitignore
├── programs/
│   └── safenudge/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                      # program entry, instruction routing
│           ├── errors.rs                   # SafeNudgeError enum
│           ├── state/
│           │   ├── mod.rs
│           │   ├── group_config.rs         # GroupConfig account struct
│           │   └── member_record.rs        # MemberRecord account struct
│           └── instructions/
│               ├── mod.rs
│               ├── create_group.rs
│               ├── join_group.rs
│               ├── start_cycle.rs
│               └── deposit.rs
└── tests/
    └── safenudge.ts                        # all integration tests
```

---

### Task 1: Scaffold Anchor Project

**Files:**
- Create: `Anchor.toml`, `Cargo.toml`, `programs/safenudge/Cargo.toml`, `programs/safenudge/src/lib.rs`, `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
# Cargo.toml (project root)
[workspace]
members = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
```

- [ ] **Step 2: Create program Cargo.toml**

```toml
# programs/safenudge/Cargo.toml
[package]
name = "safenudge"
version = "0.1.0"
description = "Group accountability savings protocol on Solana"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "safenudge"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

- [ ] **Step 3: Create skeleton lib.rs**

```rust
// programs/safenudge/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod safenudge {
    use super::*;

    pub fn create_group(ctx: Context<CreateGroupPlaceholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateGroupPlaceholder {}
```

- [ ] **Step 4: Create Anchor.toml**

```toml
# Anchor.toml
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.localnet]
safenudge = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

- [ ] **Step 5: Create package.json**

```json
{
  "name": "safenudge",
  "version": "0.1.0",
  "scripts": {
    "test": "npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/spl-token": "^0.4.9",
    "@solana/web3.js": "^1.95.8"
  },
  "devDependencies": {
    "anchor-bankrun": "^0.5.0",
    "solana-bankrun": "^0.4.0",
    "chai": "^4.4.1",
    "mocha": "^10.7.3",
    "ts-mocha": "^10.0.0",
    "typescript": "^5.6.3",
    "@types/chai": "^4.3.0",
    "@types/mocha": "^10.0.0"
  }
}
```

- [ ] **Step 6: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "types": ["mocha", "chai"],
    "typeRoots": ["./node_modules/@types"],
    "lib": ["es2015"],
    "module": "commonjs",
    "target": "es6",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 7: Create .gitignore**

```
target/
node_modules/
test-ledger/
.anchor/
.env
app/.env
```

- [ ] **Step 8: Create placeholder test file**

```typescript
// tests/safenudge.ts
import { assert } from "chai";

describe("safenudge", () => {
  it("placeholder", () => {
    assert.ok(true);
  });
});
```

- [ ] **Step 9: Build, generate keypair, sync program ID**

Run:
```bash
mkdir -p programs/safenudge/src
# (create all files from steps 1-8 first)
NO_DNA=1 anchor build
```

After build succeeds, run:
```bash
anchor keys sync
```

This updates `declare_id!()` in `lib.rs` and `Anchor.toml` with the generated program ID. Verify with:
```bash
anchor keys list
```
Expected: outputs the program public key (e.g., `safenudge: <PUBKEY>`).

- [ ] **Step 10: Install test dependencies**

Run:
```bash
npm install
```

- [ ] **Step 11: Commit**

```bash
git add Anchor.toml Cargo.toml package.json tsconfig.json .gitignore programs/ tests/
git commit -m "feat(program): scaffold Anchor project"
```

---

### Task 2: Define State Structs and Error Codes

**Files:**
- Create: `programs/safenudge/src/errors.rs`, `programs/safenudge/src/state/mod.rs`, `programs/safenudge/src/state/group_config.rs`, `programs/safenudge/src/state/member_record.rs`
- Modify: `programs/safenudge/src/lib.rs`

- [ ] **Step 1: Create errors.rs**

```rust
// programs/safenudge/src/errors.rs
use anchor_lang::prelude::*;

#[error_code]
pub enum SafeNudgeError {
    #[msg("Group is not in the correct status for this action")]
    InvalidGroupStatus,
    #[msg("Group is full")]
    GroupFull,
    #[msg("Only the group creator can perform this action")]
    UnauthorizedCreator,
    #[msg("Group needs at least 2 members to start")]
    InsufficientMembers,
    #[msg("Cycle has not ended yet")]
    CycleNotEnded,
    #[msg("Already deposited for this period")]
    AlreadyDeposited,
    #[msg("Cycle has ended, no more deposits accepted")]
    CycleEnded,
    #[msg("Invalid group code format")]
    InvalidGroupCode,
    #[msg("Invalid penalty configuration")]
    InvalidPenaltyConfig,
    #[msg("Invalid frequency value")]
    InvalidFrequency,
    #[msg("Invalid group size")]
    InvalidGroupSize,
    #[msg("Invalid period count")]
    InvalidPeriodCount,
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Token mint does not match group configuration")]
    InvalidMint,
    #[msg("Member count mismatch in distribution")]
    MemberCountMismatch,
}
```

- [ ] **Step 2: Create group_config.rs**

```rust
// programs/safenudge/src/state/group_config.rs
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GroupConfig {
    /// Human-readable group code, used as PDA seed
    #[max_len(32)]
    pub group_code: String,
    /// Group creator wallet — can start_cycle and emergency_cancel
    pub creator: Pubkey,
    /// USDC mint address
    pub mint: Pubkey,
    /// Fixed deposit amount per period (token smallest unit)
    pub deposit_amount: u64,
    /// 0 = weekly, 1 = biweekly, 2 = monthly
    pub frequency: u8,
    /// Number of deposit periods in the cycle (1-52)
    pub total_periods: u8,
    /// Max group size (2-10)
    pub max_members: u8,
    /// Current member count
    pub current_members: u8,
    /// 0 = fixed amount, 1 = percentage (basis points)
    pub penalty_type: u8,
    /// Penalty value: fixed amount in token units, or basis points (500 = 5%)
    pub penalty_value: u64,
    /// 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled
    pub status: u8,
    /// Unix timestamp when cycle started
    pub cycle_start: i64,
    /// Current period number (0-indexed)
    pub current_period: u8,
    /// PDA bump for group_config
    pub bump: u8,
}

/// Status constants
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_COMPLETED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
```

- [ ] **Step 3: Create member_record.rs**

```rust
// programs/safenudge/src/state/member_record.rs
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct MemberRecord {
    /// Reference to the GroupConfig PDA
    pub group: Pubkey,
    /// Member's wallet address
    pub member: Pubkey,
    /// Total tokens deposited across all periods
    pub total_deposited: u64,
    /// Number of on-time deposits made (including initial)
    pub deposits_made: u8,
    /// Per-period deposit tracking (max 52 periods)
    pub periods_deposited: [bool; 52],
    /// Whether member has claimed distribution payout
    pub has_claimed: bool,
    /// PDA bump for member_record
    pub bump: u8,
}
```

- [ ] **Step 4: Create state/mod.rs**

```rust
// programs/safenudge/src/state/mod.rs
pub mod group_config;
pub mod member_record;

pub use group_config::*;
pub use member_record::*;
```

- [ ] **Step 5: Update lib.rs to reference modules**

Replace the entire `lib.rs` with:

```rust
// programs/safenudge/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("KEEP_EXISTING_PROGRAM_ID");

pub mod errors;
pub mod state;

#[program]
pub mod safenudge {}
```

**Important:** Keep the program ID that `anchor keys sync` generated in Step 9 of Task 1. Do not replace it.

- [ ] **Step 6: Verify build**

Run:
```bash
NO_DNA=1 anchor build
```
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add programs/safenudge/src/
git commit -m "feat(program): define GroupConfig, MemberRecord state + error codes"
```

---

### Task 3: create_group Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/instructions/create_group.rs`
- Modify: `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Write tests for create_group**

Replace `tests/safenudge.ts` with:

```typescript
// tests/safenudge.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

// IDL is generated by anchor build
const IDL = require("../target/idl/safenudge.json");

describe("safenudge", () => {
  let context: any;
  let provider: BankrunProvider;
  let program: Program;
  let payer: Keypair;
  let usdcMint: PublicKey;
  let mintAuthority: Keypair;

  const DECIMALS = 6;

  before(async () => {
    context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    program = new Program(IDL, provider);
    payer = provider.wallet.payer;

    // Create mock USDC mint
    mintAuthority = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        DECIMALS,
        mintAuthority.publicKey,
        null,
        TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, [payer, mintKeypair]);
    usdcMint = mintKeypair.publicKey;
  });

  // ─── Helpers ──────────────────────────────────────────────

  function getGroupPda(groupCode: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("group"), Buffer.from(groupCode)],
      program.programId
    );
  }

  function getVaultPda(groupConfig: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), groupConfig.toBuffer()],
      program.programId
    );
  }

  function getMemberPda(groupConfig: PublicKey, member: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("member"), groupConfig.toBuffer(), member.toBuffer()],
      program.programId
    );
  }

  async function createFundedMember(amount: number): Promise<{ keypair: Keypair; tokenAccount: PublicKey }> {
    const keypair = Keypair.generate();

    // Fund with SOL
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx, [payer]);

    // Create ATA and mint USDC
    const ata = getAssociatedTokenAddressSync(usdcMint, keypair.publicKey);
    const tokenTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, keypair.publicKey, usdcMint),
      createMintToInstruction(usdcMint, ata, mintAuthority.publicKey, amount)
    );
    await provider.sendAndConfirm(tokenTx, [payer, mintAuthority]);

    return { keypair, tokenAccount: ata };
  }

  // ─── create_group tests ───────────────────────────────────

  describe("create_group", () => {
    it("creates a group with valid params", async () => {
      const groupCode = "test-group-1";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(
          groupCode,
          new anchor.BN(10_000_000), // 10 USDC
          0,  // weekly
          4,  // 4 periods
          5,  // max 5 members
          0,  // fixed penalty
          new anchor.BN(2_000_000)  // 2 USDC penalty
        )
        .accounts({
          creator: payer.publicKey,
          groupConfig: groupConfigPda,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const group = await program.account.groupConfig.fetch(groupConfigPda);
      assert.equal(group.groupCode, groupCode);
      assert.equal(group.creator.toBase58(), payer.publicKey.toBase58());
      assert.equal(group.mint.toBase58(), usdcMint.toBase58());
      assert.equal(group.depositAmount.toNumber(), 10_000_000);
      assert.equal(group.frequency, 0);
      assert.equal(group.totalPeriods, 4);
      assert.equal(group.maxMembers, 5);
      assert.equal(group.currentMembers, 0);
      assert.equal(group.penaltyType, 0);
      assert.equal(group.penaltyValue.toNumber(), 2_000_000);
      assert.equal(group.status, 0); // Open
    });

    it("fails with invalid frequency", async () => {
      const groupCode = "bad-freq";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 3, 4, 5, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidFrequency");
      }
    });

    it("fails with invalid group size", async () => {
      const groupCode = "bad-size";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 11, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupSize");
      }
    });

    it("fails with invalid penalty config (percentage > 50%)", async () => {
      const groupCode = "bad-penalty";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 5, 1, new anchor.BN(5001))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidPenaltyConfig");
      }
    });

    it("fails with invalid group code (special chars)", async () => {
      const groupCode = "bad code!@#";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 5, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupCode");
      }
    });
  });
});
```

- [ ] **Step 2: Create instructions/mod.rs**

```rust
// programs/safenudge/src/instructions/mod.rs
pub mod create_group;

pub use create_group::*;
```

- [ ] **Step 3: Create create_group.rs**

```rust
// programs/safenudge/src/instructions/create_group.rs
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, STATUS_OPEN};

#[derive(Accounts)]
#[instruction(group_code: String)]
pub struct CreateGroup<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + GroupConfig::INIT_SPACE,
        seeds = [b"group", group_code.as_bytes()],
        bump,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = vault,
        seeds = [b"vault", group_config.key().as_ref()],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateGroup<'info> {
    pub fn handler(
        &mut self,
        group_code: String,
        deposit_amount: u64,
        frequency: u8,
        total_periods: u8,
        max_members: u8,
        penalty_type: u8,
        penalty_value: u64,
        bumps: &CreateGroupBumps,
    ) -> Result<()> {
        // ── Checks ──────────────────────────────────────────

        // Group code: 1-32 chars, alphanumeric + hyphens only
        require!(
            !group_code.is_empty() && group_code.len() <= 32,
            SafeNudgeError::InvalidGroupCode
        );
        require!(
            group_code
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-'),
            SafeNudgeError::InvalidGroupCode
        );

        require!(deposit_amount > 0, SafeNudgeError::InvalidDepositAmount);
        require!(frequency <= 2, SafeNudgeError::InvalidFrequency);
        require!(
            total_periods >= 1 && total_periods <= 52,
            SafeNudgeError::InvalidPeriodCount
        );
        require!(
            max_members >= 2 && max_members <= 10,
            SafeNudgeError::InvalidGroupSize
        );
        require!(penalty_type <= 1, SafeNudgeError::InvalidPenaltyConfig);
        if penalty_type == 1 {
            require!(penalty_value <= 5000, SafeNudgeError::InvalidPenaltyConfig);
        }

        // ── Effects ─────────────────────────────────────────

        let group = &mut self.group_config;
        group.group_code = group_code;
        group.creator = self.creator.key();
        group.mint = self.mint.key();
        group.deposit_amount = deposit_amount;
        group.frequency = frequency;
        group.total_periods = total_periods;
        group.max_members = max_members;
        group.current_members = 0;
        group.penalty_type = penalty_type;
        group.penalty_value = penalty_value;
        group.status = STATUS_OPEN;
        group.cycle_start = 0;
        group.current_period = 0;
        group.bump = bumps.group_config;

        // ── Interactions: none ──────────────────────────────

        Ok(())
    }
}
```

- [ ] **Step 4: Update lib.rs with create_group routing**

```rust
// programs/safenudge/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("KEEP_EXISTING_PROGRAM_ID");

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
}
```

- [ ] **Step 5: Build and run tests**

```bash
NO_DNA=1 anchor build
anchor test --skip-local-validator
```

Expected: all 5 create_group tests pass.

- [ ] **Step 6: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add create_group instruction with validation + tests"
```

---

### Task 4: join_group Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/join_group.rs`
- Modify: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Add join_group tests to tests/safenudge.ts**

Add inside the top-level `describe("safenudge")` block, after the `create_group` describe:

```typescript
  // ─── join_group tests ─────────────────────────────────────

  describe("join_group", () => {
    const joinGroupCode = "join-test";
    let joinGroupPda: PublicKey;
    let joinVaultPda: PublicKey;

    before(async () => {
      [joinGroupPda] = getGroupPda(joinGroupCode);
      [joinVaultPda] = getVaultPda(joinGroupPda);

      await program.methods
        .createGroup(joinGroupCode, new anchor.BN(10_000_000), 0, 4, 3, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: joinGroupPda, vault: joinVaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("member joins with deposit", async () => {
      const { keypair: member, tokenAccount: memberAta } = await createFundedMember(100_000_000);
      const [memberPda] = getMemberPda(joinGroupPda, member.publicKey);

      await program.methods
        .joinGroup()
        .accounts({
          member: member.publicKey,
          groupConfig: joinGroupPda,
          memberRecord: memberPda,
          memberTokenAccount: memberAta,
          vault: joinVaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([member])
        .rpc();

      const record = await program.account.memberRecord.fetch(memberPda);
      assert.equal(record.member.toBase58(), member.publicKey.toBase58());
      assert.equal(record.group.toBase58(), joinGroupPda.toBase58());
      assert.equal(record.totalDeposited.toNumber(), 10_000_000);
      assert.equal(record.depositsMade, 1);
      assert.equal(record.periodsDeposited[0], true);
      assert.equal(record.periodsDeposited[1], false);

      const group = await program.account.groupConfig.fetch(joinGroupPda);
      assert.equal(group.currentMembers, 1);
    });

    it("fails when group is full", async () => {
      // Create a group with max 2 members, fill it
      const code = "full-group";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 2, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Join 2 members
      for (let i = 0; i < 2; i++) {
        const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
        const [mPda] = getMemberPda(gPda, m.publicKey);
        await program.methods.joinGroup()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m])
          .rpc();
      }

      // Third member should fail
      const { keypair: extra, tokenAccount: extraAta } = await createFundedMember(100_000_000);
      const [extraPda] = getMemberPda(gPda, extra.publicKey);

      try {
        await program.methods.joinGroup()
          .accounts({
            member: extra.publicKey, groupConfig: gPda, memberRecord: extraPda,
            memberTokenAccount: extraAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([extra])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "GroupFull");
      }
    });

    it("fails when cycle is active", async () => {
      const code = "active-group";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Join 2 members then start
      for (let i = 0; i < 2; i++) {
        const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
        const [mPda] = getMemberPda(gPda, m.publicKey);
        await program.methods.joinGroup()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m])
          .rpc();
      }

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Try to join after cycle started
      const { keypair: late, tokenAccount: lateAta } = await createFundedMember(100_000_000);
      const [latePda] = getMemberPda(gPda, late.publicKey);

      try {
        await program.methods.joinGroup()
          .accounts({
            member: late.publicKey, groupConfig: gPda, memberRecord: latePda,
            memberTokenAccount: lateAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([late])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupStatus");
      }
    });
  });
```

**Note:** The "fails when cycle is active" test depends on `start_cycle` being implemented (Task 5). If running tests incrementally, this test will fail until Task 5 is complete. You can temporarily skip it with `it.skip(...)`.

- [ ] **Step 2: Create join_group.rs**

```rust
// programs/safenudge/src/instructions/join_group.rs
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_OPEN};

#[derive(Accounts)]
pub struct JoinGroup<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

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
        payer = member,
        space = 8 + MemberRecord::INIT_SPACE,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub member_record: Account<'info, MemberRecord>,

    #[account(
        mut,
        constraint = member_token_account.mint == group_config.mint @ SafeNudgeError::InvalidMint,
        constraint = member_token_account.owner == member.key(),
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
}

impl<'info> JoinGroup<'info> {
    pub fn handler(&mut self, bumps: &JoinGroupBumps) -> Result<()> {
        // ── Checks: done by account constraints ─────────────

        // ── Effects ─────────────────────────────────────────

        let record = &mut self.member_record;
        record.group = self.group_config.key();
        record.member = self.member.key();
        record.total_deposited = self.group_config.deposit_amount;
        record.deposits_made = 1;
        record.periods_deposited = [false; 52];
        record.periods_deposited[0] = true; // join deposit = period 0
        record.has_claimed = false;
        record.bump = bumps.member_record;

        self.group_config.current_members = self
            .group_config
            .current_members
            .checked_add(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        // ── Interactions: transfer deposit to vault ──────────

        let cpi_accounts = TransferChecked {
            from: self.member_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.member.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        token_interface::transfer_checked(
            cpi_ctx,
            self.group_config.deposit_amount,
            self.mint.decimals,
        )?;

        Ok(())
    }
}
```

- [ ] **Step 3: Update instructions/mod.rs**

```rust
// programs/safenudge/src/instructions/mod.rs
pub mod create_group;
pub mod join_group;

pub use create_group::*;
pub use join_group::*;
```

- [ ] **Step 4: Add join_group to lib.rs**

Add inside `#[program] pub mod safenudge { ... }`:

```rust
    pub fn join_group(ctx: Context<JoinGroup>) -> Result<()> {
        ctx.accounts.handler(&ctx.bumps)
    }
```

- [ ] **Step 5: Build and run tests**

```bash
NO_DNA=1 anchor build
anchor test --skip-local-validator
```

Expected: all create_group tests pass + "member joins with deposit" and "fails when group is full" pass. The "fails when cycle is active" test will fail until start_cycle is implemented — skip it for now.

- [ ] **Step 6: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add join_group instruction with deposit CPI + tests"
```

---

### Task 5: start_cycle Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/start_cycle.rs`
- Modify: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Add start_cycle tests to tests/safenudge.ts**

Add inside the top-level `describe("safenudge")` block:

```typescript
  // ─── start_cycle tests ────────────────────────────────────

  describe("start_cycle", () => {
    it("creator starts cycle with 2+ members", async () => {
      const code = "start-test";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Join 2 members
      for (let i = 0; i < 2; i++) {
        const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
        const [mPda] = getMemberPda(gPda, m.publicKey);
        await program.methods.joinGroup()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m])
          .rpc();
      }

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 1); // Active
      assert.ok(group.cycleStart.toNumber() > 0);
    });

    it("fails when non-creator tries to start", async () => {
      const code = "non-creator";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 2; i++) {
        const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
        const [mPda] = getMemberPda(gPda, m.publicKey);
        await program.methods.joinGroup()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m])
          .rpc();
      }

      const impostor = Keypair.generate();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: impostor.publicKey, lamports: anchor.web3.LAMPORTS_PER_SOL })
      );
      await provider.sendAndConfirm(fundTx, [payer]);

      try {
        await program.methods.startCycle()
          .accounts({ creator: impostor.publicKey, groupConfig: gPda })
          .signers([impostor])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "UnauthorizedCreator");
      }
    });

    it("fails with fewer than 2 members", async () => {
      const code = "solo-group";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Only 1 member joins
      const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
      const [mPda] = getMemberPda(gPda, m.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
          memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m])
        .rpc();

      try {
        await program.methods.startCycle()
          .accounts({ creator: payer.publicKey, groupConfig: gPda })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InsufficientMembers");
      }
    });

    it("fails when already active", async () => {
      const code = "double-start";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 2; i++) {
        const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
        const [mPda] = getMemberPda(gPda, m.publicKey);
        await program.methods.joinGroup()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m])
          .rpc();
      }

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      try {
        await program.methods.startCycle()
          .accounts({ creator: payer.publicKey, groupConfig: gPda })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupStatus");
      }
    });
  });
```

- [ ] **Step 2: Create start_cycle.rs**

```rust
// programs/safenudge/src/instructions/start_cycle.rs
use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, STATUS_ACTIVE, STATUS_OPEN};

#[derive(Accounts)]
pub struct StartCycle<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_OPEN @ SafeNudgeError::InvalidGroupStatus,
        has_one = creator @ SafeNudgeError::UnauthorizedCreator,
        constraint = group_config.current_members >= 2 @ SafeNudgeError::InsufficientMembers,
    )]
    pub group_config: Account<'info, GroupConfig>,
}

impl<'info> StartCycle<'info> {
    pub fn handler(&mut self) -> Result<()> {
        // ── Checks: done by account constraints ─────────────

        // ── Effects ─────────────────────────────────────────

        let clock = Clock::get()?;
        self.group_config.status = STATUS_ACTIVE;
        self.group_config.cycle_start = clock.unix_timestamp;
        self.group_config.current_period = 0;

        // ── Interactions: none ──────────────────────────────

        Ok(())
    }
}
```

- [ ] **Step 3: Update instructions/mod.rs**

```rust
// programs/safenudge/src/instructions/mod.rs
pub mod create_group;
pub mod join_group;
pub mod start_cycle;

pub use create_group::*;
pub use join_group::*;
pub use start_cycle::*;
```

- [ ] **Step 4: Add start_cycle to lib.rs**

Add inside `#[program] pub mod safenudge { ... }`:

```rust
    pub fn start_cycle(ctx: Context<StartCycle>) -> Result<()> {
        ctx.accounts.handler()
    }
```

- [ ] **Step 5: Un-skip the join_group "fails when cycle is active" test**

If you skipped it in Task 4, remove the `.skip`.

- [ ] **Step 6: Build and run tests**

```bash
NO_DNA=1 anchor build
anchor test --skip-local-validator
```

Expected: all previous tests pass + all 4 start_cycle tests pass + the previously-skipped join_group test passes.

- [ ] **Step 7: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add start_cycle instruction with creator/member checks + tests"
```

---

### Task 6: deposit Instruction

**Files:**
- Create: `programs/safenudge/src/instructions/deposit.rs`
- Modify: `programs/safenudge/src/instructions/mod.rs`, `programs/safenudge/src/lib.rs`, `tests/safenudge.ts`

- [ ] **Step 1: Add deposit tests to tests/safenudge.ts**

Add this import at the top (alongside existing imports):

```typescript
import { Clock } from "solana-bankrun";
```

Add inside the top-level `describe("safenudge")` block:

```typescript
  // ─── deposit tests ────────────────────────────────────────

  describe("deposit", () => {
    it("member deposits for current period (period 1 after time advance)", async () => {
      const code = "deposit-ok";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1])
        .rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2])
        .rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance clock by 8 days (into period 1 for weekly)
      const currentClock = await context.banksClient.getClock();
      context.setClock(
        new Clock(
          currentClock.slot,
          currentClock.epochStartTimestamp,
          currentClock.epoch,
          currentClock.leaderScheduleEpoch,
          currentClock.unixTimestamp + BigInt(8 * 86400)
        )
      );

      // Member 1 deposits for period 1
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey,
          groupConfig: gPda,
          memberRecord: m1Pda,
          memberTokenAccount: m1Ata,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1])
        .rpc();

      const record = await program.account.memberRecord.fetch(m1Pda);
      assert.equal(record.depositsMade, 2); // join deposit + period 1
      assert.equal(record.totalDeposited.toNumber(), 10_000_000); // 5M + 5M
      assert.equal(record.periodsDeposited[0], true);
      assert.equal(record.periodsDeposited[1], true);
      assert.equal(record.periodsDeposited[2], false);
    });

    it("fails with duplicate deposit for same period", async () => {
      const code = "dup-deposit";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
      const [mPda] = getMemberPda(gPda, m.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
          memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m])
        .rpc();

      // Need 2nd member to start
      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2])
        .rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Period 0 already deposited via join — try to deposit again for period 0
      // Clock is still in period 0 (no advancement)
      try {
        await program.methods.deposit()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "AlreadyDeposited");
      }
    });

    it("fails when cycle not active", async () => {
      const code = "not-active";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
      const [mPda] = getMemberPda(gPda, m.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
          memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m])
        .rpc();

      // Don't start cycle — try to deposit
      try {
        await program.methods.deposit()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupStatus");
      }
    });
  });
```

- [ ] **Step 2: Create deposit.rs**

```rust
// programs/safenudge/src/instructions/deposit.rs
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::SafeNudgeError;
use crate::state::{GroupConfig, MemberRecord, STATUS_ACTIVE};

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub member: Signer<'info>,

    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,

    #[account(
        mut,
        seeds = [b"member", group_config.key().as_ref(), member.key().as_ref()],
        bump = member_record.bump,
        constraint = member_record.group == group_config.key() @ SafeNudgeError::InvalidGroupStatus,
        constraint = member_record.member == member.key(),
    )]
    pub member_record: Account<'info, MemberRecord>,

    #[account(
        mut,
        constraint = member_token_account.mint == group_config.mint @ SafeNudgeError::InvalidMint,
        constraint = member_token_account.owner == member.key(),
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
}

impl<'info> Deposit<'info> {
    pub fn handler(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // ── Checks ──────────────────────────────────────────

        // Calculate period duration in seconds
        let period_duration: i64 = match self.group_config.frequency {
            0 => 7_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            1 => 14_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            2 => 30_i64.checked_mul(86400).ok_or(SafeNudgeError::ArithmeticOverflow)?,
            _ => return Err(SafeNudgeError::InvalidFrequency.into()),
        };

        // Check cycle hasn't ended
        let cycle_duration = (self.group_config.total_periods as i64)
            .checked_mul(period_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let cycle_end = self
            .group_config
            .cycle_start
            .checked_add(cycle_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        require!(
            clock.unix_timestamp < cycle_end,
            SafeNudgeError::CycleEnded
        );

        // Calculate current period
        let elapsed = clock
            .unix_timestamp
            .checked_sub(self.group_config.cycle_start)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let max_period = self
            .group_config
            .total_periods
            .checked_sub(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let current_period = std::cmp::min(
            (elapsed / period_duration) as u8,
            max_period,
        );

        // Check not already deposited for this period
        require!(
            !self.member_record.periods_deposited[current_period as usize],
            SafeNudgeError::AlreadyDeposited
        );

        // ── Effects ─────────────────────────────────────────

        self.member_record.periods_deposited[current_period as usize] = true;
        self.member_record.deposits_made = self
            .member_record
            .deposits_made
            .checked_add(1)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        self.member_record.total_deposited = self
            .member_record
            .total_deposited
            .checked_add(self.group_config.deposit_amount)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;

        // ── Interactions: transfer deposit to vault ──────────

        let cpi_accounts = TransferChecked {
            from: self.member_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.member.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        token_interface::transfer_checked(
            cpi_ctx,
            self.group_config.deposit_amount,
            self.mint.decimals,
        )?;

        Ok(())
    }
}
```

- [ ] **Step 3: Update instructions/mod.rs**

```rust
// programs/safenudge/src/instructions/mod.rs
pub mod create_group;
pub mod deposit;
pub mod join_group;
pub mod start_cycle;

pub use create_group::*;
pub use deposit::*;
pub use join_group::*;
pub use start_cycle::*;
```

- [ ] **Step 4: Add deposit to lib.rs**

Add inside `#[program] pub mod safenudge { ... }`:

```rust
    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.handler()
    }
```

- [ ] **Step 5: Build and run all tests**

```bash
NO_DNA=1 anchor build
anchor test --skip-local-validator
```

Expected: all tests pass (5 create_group + 3 join_group + 4 start_cycle + 3 deposit = 15 tests).

- [ ] **Step 6: Commit**

```bash
git add programs/safenudge/src/ tests/safenudge.ts
git commit -m "feat(program): add deposit instruction with period calc + time-based tests"
```

---

## Post-Implementation Notes

### What's Ready for Phase 2

Phase 1 provides the foundation:
- State structs with all fields needed for distribution and cancellation
- Vault PDA with self-authority (ready for PDA-signed outbound transfers)
- Period tracking via `[bool; 52]` array
- Penalty configuration stored on GroupConfig

Phase 2 (`distribute`, `emergency_cancel`) will add PDA-signed CPI transfers FROM the vault using:
```rust
let seeds = &[b"vault".as_ref(), self.group_config.key().as_ref(), &[ctx.bumps.vault]];
let signer_seeds = &[&seeds[..]];
let cpi_ctx = CpiContext::new_with_signer(token_program, transfer_accounts, signer_seeds);
```

### Bankrun Clock Notes

The deposit happy path test uses `context.setClock()` to advance time. If bankrun's `setClock` doesn't work with your version, alternative approaches:
1. Use `context.warpToSlot()` if available
2. Use `solana-test-validator` with admin RPC clock manipulation
3. Create a test-only instruction that overrides `cycle_start` to a past timestamp (remove before production)

### Potential Adjustments During Implementation

- If `anchor-bankrun` version is incompatible, pin to `0.4.0` and `solana-bankrun@0.3.0`
- If `InterfaceAccount` causes issues, fall back to `Account<'info, anchor_spl::token::TokenAccount>` with `anchor_spl::token::Token` program
- If `anchor keys sync` doesn't auto-update lib.rs, manually copy the program ID from `anchor keys list`
