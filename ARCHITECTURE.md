# SafeNudge — Architecture Document

## Overview

SafeNudge is a Solana program (smart contract) with a React/TypeScript frontend. The program manages group savings vaults with commitment enforcement. The frontend provides the user interface for creating groups, joining, depositing, and viewing group status.

**Stack:**
- Program: Rust / Anchor framework
- Frontend: React / TypeScript / Vite
- Wallet: @solana/wallet-adapter (Phantom, Backpack)
- On-ramp: Ramp Network SDK (@ramp-network/ramp-instant-sdk)
- Token: USDC (SPL Token) on Solana devnet
- Hosting: Vercel
- Deployment target: Solana devnet

---

## Program Architecture

### Account Structure

The program uses three account types, all derived as PDAs.

#### GroupConfig

Stores the group's parameters and state. Created once per group.

```rust
#[account]
#[derive(InitSpace)]
pub struct GroupConfig {
    pub creator: Pubkey,           // 32 — group creator, can start cycle / emergency cancel
    pub mint: Pubkey,              // 32 — USDC mint address
    pub deposit_amount: u64,       // 8  — fixed deposit per period (in token smallest unit)
    pub frequency: u8,             // 1  — 0 = weekly, 1 = biweekly, 2 = monthly
    pub total_periods: u8,         // 1  — number of deposit periods in the cycle
    pub max_members: u8,           // 1  — max group size (2-10)
    pub current_members: u8,       // 1  — current member count
    pub penalty_type: u8,          // 1  — 0 = fixed amount, 1 = percentage
    pub penalty_value: u64,        // 8  — fixed amount in token units, or basis points (e.g., 500 = 5%)
    pub status: u8,                // 1  — 0 = open, 1 = active, 2 = completed, 3 = cancelled
    pub cycle_start: i64,          // 8  — Unix timestamp when creator started the cycle
    pub current_period: u8,        // 1  — current period number (0-indexed)
    pub bump: u8,                  // 1  — PDA bump
}
// Seeds: [b"group", group_code.as_bytes()]
// Space: 8 (discriminator) + 32 + 32 + 8 + 1 + 1 + 1 + 1 + 1 + 8 + 1 + 8 + 1 + 1 = 104
```

#### MemberRecord

Stores an individual member's state within a group. One per member per group.

```rust
#[account]
#[derive(InitSpace)]
pub struct MemberRecord {
    pub group: Pubkey,             // 32 — reference to the GroupConfig PDA
    pub member: Pubkey,            // 32 — member's wallet address
    pub total_deposited: u64,      // 8  — total tokens deposited
    pub deposits_made: u8,         // 1  — number of on-time deposits (including initial)
    pub periods_deposited: [bool; 52], // 52 — bitmap of which periods were deposited (max 52 weeks)
    pub has_claimed: bool,         // 1  — whether member has claimed distribution
    pub bump: u8,                  // 1  — PDA bump
}
// Seeds: [b"member", group_config.key().as_ref(), member.key().as_ref()]
// Space: 8 + 32 + 32 + 8 + 1 + 52 + 1 + 1 = 135
```

#### GroupVault

Not a custom account. This is a standard SPL Token Account whose address
*is itself* a PDA, and whose authority *is itself* (self-as-authority pattern).

```
// Seeds: [b"vault", group_config.key().as_ref()]
// The token account's address is derived at these seeds, and
// `token::authority` on the same `init` constraint also points at this
// address — so the vault signs its own transfers via CPI with the same
// seeds.
```

There is no separate `vault_authority` account. Only the program can move
tokens in and out via CPI with PDA signer seeds; no human wallet has
authority over the vault. The trade-off vs. a separate authority PDA is
simpler accounts (one PDA, one constraint) at the cost of slightly less
flexibility for future programs that might want to grant the authority
to a different account — for SafeNudge's MVP, the vault never needs a
non-self authority.

When integrating with a yield protocol in v2, the same self-as-authority
PDA can sign CPIs to deposit / withdraw idle funds; the integration adds
the yield program's accounts but does not change the vault's authority
model.

### Instruction Set

#### 1. `create_group`

Creates a new savings group.

**Accounts:**
- `creator` (signer, mut) — pays for account creation
- `group_config` (init) — PDA derived from group code
- `vault` (init) — PDA-owned token account for USDC
- `mint` — USDC mint
- `token_program` — SPL Token program
- `associated_token_program`
- `system_program`

**Args:**
- `group_code: String` — human-readable code (max 32 chars, used as PDA seed)
- `deposit_amount: u64` — amount per period
- `frequency: u8` — 0/1/2 for weekly/biweekly/monthly
- `total_periods: u8` — number of periods (1-52)
- `max_members: u8` — max size (2-10)
- `penalty_type: u8` — 0 = fixed, 1 = percentage
- `penalty_value: u64` — amount or basis points

**Validation:**
- `deposit_amount > 0`
- `frequency` in [0, 1, 2]
- `total_periods` in [1, 52]
- `max_members` in [2, 10]
- `penalty_type` in [0, 1]
- If percentage, `penalty_value <= 5000` (max 50%)
- `group_code` length 1-32 chars, alphanumeric + hyphens only

**Effects:**
- Creates `GroupConfig` with status = Open (0)
- Creates vault token account owned by vault PDA

---

#### 2. `join_group`

A member joins the group and makes their initial deposit.

**Accounts:**
- `member` (signer, mut)
- `group_config` (mut) — increments member count
- `member_record` (init) — PDA for this member in this group
- `member_token_account` (mut) — member's USDC token account (source)
- `vault` (mut) — group's USDC vault (destination)
- `mint`
- `token_program`
- `system_program`

**Args:** None (deposit amount comes from `group_config.deposit_amount`)

**Validation:**
- `group_config.status == Open (0)`
- `group_config.current_members < group_config.max_members`
- Member doesn't already have a `MemberRecord` for this group (PDA uniqueness handles this)
- Member has sufficient USDC balance

**Effects:**
- Creates `MemberRecord` with `total_deposited = deposit_amount`, `deposits_made = 1`, `periods_deposited[0] = true`
- Transfers `deposit_amount` from member to vault via CPI
- Increments `group_config.current_members`

---

#### 3. `start_cycle`

Creator locks the group and begins the deposit cycle.

**Accounts:**
- `creator` (signer) — must match `group_config.creator`
- `group_config` (mut)

**Args:** None

**Validation:**
- `creator.key() == group_config.creator`
- `group_config.status == Open (0)`
- `group_config.current_members >= 2` (need at least 2 members)

**Effects:**
- Sets `group_config.status = Active (1)`
- Sets `group_config.cycle_start = Clock::get().unix_timestamp`
- Sets `group_config.current_period = 0` (first period started when members joined)

---

#### 4. `deposit`

A member makes a periodic deposit during an active cycle.

**Accounts:**
- `member` (signer)
- `group_config` (mut) — to read cycle timing
- `member_record` (mut) — to update deposit tracking
- `member_token_account` (mut)
- `vault` (mut)
- `mint`
- `token_program`

**Args:** None

**Validation:**
- `group_config.status == Active (1)`
- `member_record.member == member.key()`
- `member_record.group == group_config.key()`
- Current period (derived from `cycle_start`, `frequency`, and `Clock::get()`) is valid
- Member hasn't already deposited for the current period (`periods_deposited[current] == false`)

**Period calculation:**
```
elapsed = now - cycle_start
period_duration = match frequency {
    0 => 7 * 86400,     // weekly
    1 => 14 * 86400,    // biweekly  
    2 => 30 * 86400,    // monthly (simplified to 30 days)
}
current_period = min(elapsed / period_duration, total_periods - 1)
```

**Effects:**
- Transfers `deposit_amount` from member to vault
- Sets `member_record.periods_deposited[current_period] = true`
- Increments `member_record.deposits_made`
- Adds to `member_record.total_deposited`

---

#### 5. `distribute`

Settles the cycle. Calculates penalties and distributes funds. Anyone can trigger this.

**Accounts:**
- `payer` (signer) — pays for transaction fees
- `creator` (mut, validated against `group_config.creator` via `has_one`) — receives vault rent on close
- `group_config` (mut)
- `vault` (mut) — source of all distributions; signs its own transfers (self-as-authority)
- `mint`
- `token_program`
- Plus: remaining accounts are pairs of `[member_record, member_token_account]` for each member

**Args:** None

**Validation:**
- `group_config.status == Active (1)`
- Cycle has ended: `Clock::get().unix_timestamp >= cycle_start + (total_periods * period_duration)`
- All member records are passed in remaining accounts
- Number of member records matches `group_config.current_members`
- Each `member_record` account is owned by this program and matches the canonical `["member", group, member]` PDA
- No `member_record` is passed twice
- Each paired `member_token_account` is owned by `member_record.member` and uses `group_config.mint`

**Distribution logic:**
```
for each member:
    missed = total_periods - member.deposits_made
    if penalty_type == Fixed:
        penalty = missed * penalty_value
    else: // Percentage
        penalty = missed * (deposit_amount * penalty_value / 10000)
    
    // Cap penalty at total deposited (can't lose more than you put in)
    penalty = min(penalty, member.total_deposited)
    member_payout = member.total_deposited - penalty
    total_penalties += penalty

// Split collected penalties among fully compliant members
compliant_count = members where deposits_made == total_periods
if compliant_count > 0:
    bonus_per_compliant = total_penalties / compliant_count
    
for each member:
    payout = member_payout
    if member.deposits_made == total_periods:
        payout += bonus_per_compliant
    
    // Transfer payout from vault to member via CPI with PDA signer seeds
    transfer_checked(vault -> member_token_account, payout)
    member.has_claimed = true
```

**Effects:**
- Transfers calculated amounts from vault to each member
- Sets `group_config.status = Completed (2)`
- Closes vault account, returns rent to creator

---

#### 6. `emergency_cancel`

Creator cancels the cycle. All deposits returned without penalties.

**Accounts:**
- `creator` (signer) — must match `group_config.creator`
- `group_config` (mut)
- `vault` (mut) — signs its own transfers (self-as-authority)
- `mint`
- `token_program`
- Plus: remaining accounts are pairs of `[member_record, member_token_account]` for each member

The same canonical-PDA + ATA-owner + uniqueness validations as `distribute` apply to every member pair.

**Args:** None

**Validation:**
- `creator.key() == group_config.creator`
- `group_config.status == Open (0) || group_config.status == Active (1)`

**Effects:**
- Returns each member's `total_deposited` from vault to their token account
- Sets `group_config.status = Cancelled (3)`
- Closes vault account, returns rent to creator

---

### PDA Derivation Summary

| Account | Seeds | Purpose |
|---------|-------|---------|
| GroupConfig | `["group", group_code]` | Group parameters and state |
| MemberRecord | `["member", group_config_key, member_key]` | Per-member deposit tracking |
| Vault | `["vault", group_config_key]` | SPL Token account; address and authority both derived at these seeds (self-as-authority) |

### Error Codes

```rust
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
    #[msg("Member count mismatch in distribution")]
    MemberCountMismatch,
}
```

---

## Frontend Architecture

### Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- @solana/wallet-adapter-react + @solana/wallet-adapter-react-ui
- @coral-xyz/anchor (program client)
- @ramp-network/ramp-instant-sdk (Pix on-ramp)
- Tailwind CSS
- i18next (PT-BR / EN localization)

### Pages

**Landing / Home**
- Connect wallet button (WalletMultiButton)
- "Create Group" CTA
- "Join Group" with code input
- List of user's active groups (derived from MemberRecord accounts)

**Create Group**
- Form: group code, deposit amount, frequency, periods, max members, penalty config
- Preview card showing the full cycle summary
- "Create" button (triggers `create_group` instruction)

**Group Dashboard** (`/group/:code`)
- Group info card: parameters, status, member count
- Member list with deposit streaks (green/red per period)
- Current period indicator and countdown to next deadline
- "Deposit" button (if active cycle and current period not yet deposited)
- "Start Cycle" button (creator only, if status is Open)
- "Emergency Cancel" button (creator only)
- "Add Funds" button (opens Ramp widget for Pix on-ramp)
- Distribution summary (if cycle completed)

**Join Group** (`/join/:code`)
- Group preview (parameters, current members)
- "Join & Deposit" button (triggers `join_group`)
- If wallet has insufficient USDC, prompt Ramp widget first

### Ramp Network Integration

```typescript
import { RampInstantSDK } from '@ramp-network/ramp-instant-sdk';

const openRamp = (walletAddress: string) => {
  new RampInstantSDK({
    hostAppName: 'SafeNudge',
    hostLogoUrl: 'https://safenudge.xyz/logo.png',
    swapAsset: 'SOLANA_USDC',
    userAddress: walletAddress,
    hostApiKey: RAMP_API_KEY,
    variant: 'auto',
  })
  .on('PURCHASE_SUCCESSFUL', (event) => {
    // Refresh USDC balance in UI
  })
  .show();
};
```

### Localization

i18next with two namespaces:
- `common` — shared UI strings (buttons, labels, errors)
- `groups` — group-specific copy (creation form labels, status messages, penalty explanations)

Default locale: `pt-BR`. Fallback: `en`. Language toggle in the header.

All user-facing strings go through `t()`. No hardcoded Portuguese or English in components.

### State Management

Minimal — React state + Anchor program reads. No Redux or Zustand needed.

- Wallet state: `@solana/wallet-adapter-react` hooks
- Program data: `useQuery`-style pattern with `program.account.groupConfig.fetch()` and `program.account.memberRecord.fetch()`
- UI state: React `useState` for forms, modals, loading states

### Transaction Flow UX

Every write operation follows this pattern:

1. User clicks action button
2. Button enters loading state ("Waiting for signature...")
3. Wallet popup appears, user signs
4. Button updates ("Confirming...")
5. Transaction confirms (~400ms on devnet)
6. UI refreshes with new state
7. Toast notification: success or error with details

---

## Yield Integration (v2 Architecture)

The vault is designed to support yield routing without program changes to the core flow.

### How It Would Work

A new instruction `deploy_to_yield` would:
1. Transfer USDC from the vault to a Kamino K-Lend deposit
2. Receive kUSDC (Kamino's receipt token) back into a PDA-owned token account
3. Track the kUSDC balance in a new `YieldPosition` account

At distribution time (`distribute` instruction, v2):
1. Withdraw kUSDC back to USDC via Kamino CPI
2. Calculate yield earned (total withdrawn - total originally deposited)
3. Distribute yield proportionally to compliant members as a bonus

### Why Kamino K-Lend

- Largest Solana USDC lending market (200M+ TVL within weeks of V2 launch)
- Institutional-grade (Gauntlet risk management)
- Clean CPI interface for deposits and withdrawals
- Variable APY from organic lending demand (not inflationary rewards)

### MVP Constraint

The vault token account is architecturally ready for this. The PDA authority can sign CPIs to any program. The only addition is the yield protocol's program ID and accounts in the instruction context. No changes to the core savings/penalty logic are required.

---

## Deployment

### Devnet (Hackathon)

```
anchor build
anchor deploy --provider.cluster devnet
```

- Program ID: generated on first deploy, stored in `Anchor.toml` and `lib.rs`
- USDC: use devnet USDC mint or create a test SPL token
- Frontend: Vercel, connected to GitHub repo, auto-deploys from `main`
- Environment variables: `VITE_SOLANA_RPC_URL`, `VITE_PROGRAM_ID`, `VITE_USDC_MINT`, `VITE_RAMP_API_KEY`

### Testing Strategy

**Program (Anchor tests in TypeScript):**
- `create_group`: valid params, invalid params (boundary testing), duplicate group codes
- `join_group`: join with deposit, join when full, join when cycle already started
- `start_cycle`: creator-only, minimum 2 members, status validation
- `deposit`: on-time deposit, duplicate deposit (same period), deposit after cycle ends
- `distribute`: correct penalty calculation (fixed + percentage), redistribution to compliant members, edge cases (all miss, none miss, partial)
- `emergency_cancel`: creator-only, full refund verification, status transitions

**Frontend:**
- TypeScript type checking (`tsc --noEmit`)
- Build validation (`vite build`)
- Manual testing on devnet with Phantom wallet

---

## Project Structure

```
safenudge/
├── programs/
│   └── safenudge/
│       └── src/
│           ├── lib.rs              # Program entry point
│           ├── instructions/
│           │   ├── mod.rs
│           │   ├── create_group.rs
│           │   ├── join_group.rs
│           │   ├── start_cycle.rs
│           │   ├── deposit.rs
│           │   ├── distribute.rs
│           │   └── emergency_cancel.rs
│           ├── state/
│           │   ├── mod.rs
│           │   ├── group_config.rs
│           │   └── member_record.rs
│           └── errors.rs
├── tests/
│   └── safenudge.ts                # Anchor integration tests
├── app/                            # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── i18n/
│   │   │   ├── pt-BR/
│   │   │   └── en/
│   │   ├── utils/
│   │   └── idl/                    # Auto-generated from anchor build
│   ├── package.json
│   └── vite.config.ts
├── Anchor.toml
├── Cargo.toml
├── CONCEPT.md
├── ARCHITECTURE.md
├── CLAUDE.md
└── README.md
```

---

## Security Architecture

### Threat Model

SafeNudge holds user funds in a PDA-controlled vault. The primary threats are:

| Threat | Mitigation |
|--------|------------|
| Admin key compromise (Drift-style) | No admin keys. No upgrade authority. Creator can only emergency_cancel (returns funds to members, never to an arbitrary address). |
| Vault drain via unauthorized transfer | Vault authority is a PDA. Only the program can sign transfers. All transfer destinations are validated MemberRecord PDAs. |
| Token confusion (deposit wrong token) | `transfer_checked` validates mint and decimals at CPI level. GroupConfig stores expected mint; all instructions verify against it. |
| Penalty manipulation (overpay/underpay) | Penalty math uses checked arithmetic. Penalty capped at `total_deposited`. Distribution verified: sum of payouts equals vault balance. |
| State machine bypass | Status enum enforces one-directional transitions. Every instruction validates current status as first check. |
| Fake member injection | MemberRecord PDA derived from `[group_config_key, member_key]`. Anchor's `init` constraint prevents duplicates. `has_one` validates group membership. |
| Frontrunning distribution | Distribution is permissionless and deterministic. Calling it first vs last produces identical results. No MEV opportunity. |
| Durable nonce pre-signing | No time-sensitive admin actions. `start_cycle` captures `Clock::get()` at execution time, not from arguments. Period calculation uses on-chain clock. |
| Rounding dust in distribution | Final member receives vault remainder (`vault_balance - sum_of_previous_payouts`) instead of calculated amount, ensuring zero residual. |

### Instruction Security Matrix

| Instruction | Who can call | Fund movement | Status required | Key validation |
|-------------|-------------|---------------|-----------------|----------------|
| `create_group` | Anyone (signer pays) | None | N/A (creates new) | Group code format, param ranges |
| `join_group` | Anyone (becomes member) | Member -> Vault | Open | Group not full, valid mint |
| `start_cycle` | Creator only | None | Open | `creator == signer`, members >= 2 |
| `deposit` | Members only | Member -> Vault | Active | Valid MemberRecord, correct period, not already deposited |
| `distribute` | Anyone | Vault -> All Members | Active (cycle ended) | All member records present, cycle time elapsed |
| `emergency_cancel` | Creator only | Vault -> All Members (pro-rata) | Open or Active | `creator == signer` |

### Program Constraints Template

Every instruction context MUST follow this pattern:

```rust
#[derive(Accounts)]
pub struct ExampleInstruction<'info> {
    // 1. Signer with appropriate access control
    #[account(mut)]
    pub signer: Signer<'info>,
    
    // 2. Group config with status check as constraint
    #[account(
        mut,
        seeds = [b"group", group_config.group_code.as_bytes()],
        bump = group_config.bump,
        constraint = group_config.status == STATUS_ACTIVE @ SafeNudgeError::InvalidGroupStatus,
    )]
    pub group_config: Account<'info, GroupConfig>,
    
    // 3. Member record with ownership validation
    #[account(
        mut,
        seeds = [b"member", group_config.key().as_ref(), signer.key().as_ref()],
        bump = member_record.bump,
        has_one = group @ SafeNudgeError::InvalidGroupStatus,
        has_one = member @ SafeNudgeError::UnauthorizedCreator,
    )]
    pub member_record: Account<'info, MemberRecord>,
    
    // 4. Vault with mint validation. Self-as-authority: the token
    //    account's address and authority are both the same PDA.
    #[account(
        mut,
        seeds = [b"vault", group_config.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    // 5. Mint must match group config
    #[account(
        constraint = mint.key() == group_config.mint @ SafeNudgeError::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

### Checked Arithmetic Convention

```rust
// REQUIRED: all numeric operations
let penalty = missed_periods
    .checked_mul(penalty_per_period)
    .ok_or(SafeNudgeError::ArithmeticOverflow)?;

let payout = total_deposited
    .checked_sub(penalty)
    .ok_or(SafeNudgeError::ArithmeticOverflow)?;

// FORBIDDEN: raw operators
let penalty = missed_periods * penalty_per_period;  // NEVER
let payout = total_deposited - penalty;              // NEVER
```

### No Upgrade Authority

After deploying to devnet, the program's upgrade authority should be explicitly set to `None` for the hackathon submission. This demonstrates that no individual can modify the program after deployment — the same property that makes Bitcoin's rules credible.

```bash
solana program set-upgrade-authority <PROGRAM_ID> --final
```

For development iterations, keep upgrade authority until final deployment. Document this in the README.

---

## Task Breakdown

### Phase 1 — Program Core (6-8 hours)

1. **Scaffold project** — `anchor init safenudge`, configure `Anchor.toml` for devnet
2. **Define state** — `GroupConfig` and `MemberRecord` structs with `InitSpace`
3. **`create_group`** — PDA creation, validation, vault init
4. **`join_group`** — member PDA creation, initial deposit CPI
5. **`start_cycle`** — status transition, timestamp capture
6. **`deposit`** — period calculation, deposit tracking, CPI transfer
7. **Tests for Phase 1** — all instructions above with happy path + error cases

### Phase 2 — Distribution & Cancel (4-6 hours)

8. **`distribute`** — penalty calculation, redistribution logic, vault drain, PDA signer
9. **`emergency_cancel`** — pro-rata refund, vault drain
10. **Distribution tests** — all penalty scenarios: fixed/percentage, partial compliance, all compliant, all missed, cap at total deposited
11. **Edge case tests** — 2-member groups, 10-member groups, single-period cycles

### Phase 3 — Frontend (6-8 hours)

12. **Scaffold frontend** — Vite + React + TypeScript, wallet-adapter setup, Anchor client init
13. **Create Group page** — form, validation, instruction call
14. **Join Group page** — group preview, join + deposit flow
15. **Group Dashboard** — member list, streak visualization, deposit/start/cancel actions
16. **Ramp integration** — "Add funds" button with Ramp widget
17. **i18n setup** — PT-BR + EN translations, language toggle

### Phase 4 — Polish & Deploy (2-3 hours)

18. **Devnet deployment** — program deploy, frontend env vars, Vercel setup
19. **End-to-end testing** — full flow with real wallets on devnet
20. **README** — setup instructions, demo link, architecture overview

**Total estimated: 18-25 hours**

---

*SafeNudge Architecture v1.1 (Security-First) — Davi Giroux — April 2026*
