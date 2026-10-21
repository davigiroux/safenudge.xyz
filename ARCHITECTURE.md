# SafeNudge — Architecture Document

## Overview

SafeNudge is a Solana program (smart contract) that manages group savings vaults with commitment enforcement. SafePool is its client (see "Clients").

**Stack:**
- Program: Rust / Anchor framework
- Tests: TypeScript on LiteSVM
- Token: any SPL Token or Token-2022 mint the mint rule accepts (USDC on devnet, BRS on mainnet)
- Clusters: devnet and mainnet

---

## Program Architecture

### Account Structure

The program uses five account types, all derived as PDAs. `GroupConfig`, `MemberRecord` and `JoinTally` each record a `rent_payer`. See "Rent payer" below. `JoinGate` is optional: a group has one only when its creator gated it. `JoinTally` belongs to a member at a group address, not to one group, and outlives `close_group`.

**Group types.** A group with other rules than a simple group, such as a yield group, gets its own account type and instructions, never a mode field in `GroupConfig`. An optional feature of a simple group lives in its own account at a fixed PDA; `JoinGate` is the first. See [ADR-0003](./docs/adr/0003-join-gate-and-group-types.md).

#### GroupConfig

Stores the group's parameters and state. Created once per group. `close_group` closes it after settlement, once `current_members` is zero. Until then the PDA keeps the group code taken, so a later group cannot reuse the code and inherit the old group's member records. See "Group code reuse after close" under Security.

Every fixed-size field comes before `group_code`, the only variable-length field. Each field above `group_code` therefore sits at the same byte offset in every group, and clients can `memcmp`-filter on it.

```rust
#[account(discriminator = b"snGroup4")]
#[derive(InitSpace)]
pub struct GroupConfig {
    pub creator: Pubkey,           // offset 8,   32 bytes. Can start_cycle and emergency_cancel
    pub rent_payer: Pubkey,        // offset 40,  32 bytes. Paid the rent of this account and of the vault
    pub mint: Pubkey,              // offset 72,  32 bytes. USDC mint address
    pub deposit_amount: u64,       // offset 104, 8 bytes.  Fixed deposit per period (token smallest unit)
    pub penalty_value: u64,        // offset 112, 8 bytes.  Fixed amount in token units, or basis points (500 = 5%)
    pub cycle_start: i64,          // offset 120, 8 bytes.  Unix timestamp of start_cycle. 0 while Open
    pub settled_at: i64,           // offset 128, 8 bytes.  Unix timestamp of distribute or emergency_cancel. 0 until then
    pub frequency: u8,             // offset 136. 0 = weekly, 1 = biweekly, 2 = monthly (3 = 5min, devnet builds)
    pub total_periods: u8,         // offset 137. Number of deposit periods in the cycle
    pub max_members: u8,           // offset 138. Max group size (2-10)
    pub current_members: u8,       // offset 139. Open member records: +1 join_group, -1 leave_group and close_member_record
    pub penalty_type: u8,          // offset 140. 0 = fixed amount, 1 = percentage
    pub status: u8,                // offset 141. 0 = open, 1 = active, 2 = completed, 3 = cancelled
    pub bump: u8,                  // offset 142. PDA bump
    pub vault_bump: u8,            // offset 143. Canonical bump of the vault PDA, stored by create_group
    pub reserved: [u8; 64],        // offset 144, 64 bytes. Zero. Room for later fixed-size fields
    #[max_len(32)]
    pub group_code: String,        // offset 208, 4 + up to 32 bytes. Group code, used as PDA seed
}
// Seeds: [b"group", group_code.as_bytes()]
// Space: 8 (discriminator) + 32 * 3 + 8 * 4 + 1 * 8 + 64 + (4 + 32) = 244
```

The size is pinned at compile time (`const _: () = assert!(8 + GroupConfig::INIT_SPACE == 244)`), and a unit test in `state/group_config.rs` serializes a `GroupConfig` and checks each offset above.

`reserved` is padding for fields added later. A new fixed-size field takes bytes from the front of it, so `group_code` and every offset above stay where they are, and a group written by the earlier binary reads the new field as zero. A field added that way needs no settlement of live groups, as long as zero is a valid value for it. The padding costs 325,120 lamports of rent per group at 5,080 lamports per byte, and `close_group` returns it.

`vault_bump` is the only stored bump that is not the account's own. `create_group` takes it from the `init` constraint on the vault, which finds the canonical bump, so it is canonical by construction. `join_group`, `leave_group`, `deposit`, `distribute` and `emergency_cancel` check the vault with `bump = group_config.vault_bump`: one derivation instead of a search from 255 that costs 1,500 compute units per bump tried. `leave_group`, `distribute` and `emergency_cancel` also sign vault transfers with it. A wrong value would fail the seeds check and move no funds, and the tests compare the stored value with `findProgramAddressSync` and settle a group whose vault bump is below 255 on every path (issue #92).

#### MemberRecord

Stores an individual member's state within a group. One per member per group. `leave_group` closes it while the group is Open. `close_member_record` closes it after the group is Completed or Cancelled.

```rust
#[account(discriminator = b"snMembr3")]
#[derive(InitSpace)]
pub struct MemberRecord {
    pub group: Pubkey,             // offset 8,   32 bytes. The GroupConfig PDA
    pub member: Pubkey,            // offset 40,  32 bytes. Member's wallet address
    pub rent_payer: Pubkey,        // offset 72,  32 bytes. Paid this record's rent
    pub total_deposited: u64,      // offset 104, 8 bytes.  Total tokens deposited
    pub deposits_made: u8,         // offset 112. Number of on-time deposits (including initial)
    pub periods_deposited: [bool; 52], // offset 113, 52 bytes. Which periods were deposited (max 52 weeks)
    pub bump: u8,                  // offset 165. Canonical PDA bump, from the init constraint
    pub reserved: [u8; 32],        // offset 166, 32 bytes. Zero. Room for later fields
}
// Seeds: [b"member", group_config.key().as_ref(), member.key().as_ref()]
// Space: 8 (discriminator) + 32 * 3 + 8 + 1 + 52 + 1 + 32 = 198
```

Settlement derives each record's address from the stored `bump` with `create_program_address`, one hash, in place of a bump search per member.

#### JoinGate

Makes every `join_group` of one group need the signature of `authority`. `set_join_authority` creates it while the group is Open and has no member, and `close_group` closes it. A group without one is open to anyone with the code.

```rust
#[account(discriminator = b"snJoinG1")]
#[derive(InitSpace)]
pub struct JoinGate {
    pub authority: Pubkey,  // offset 8. Must sign every join_group of the group
}
// Space: 8 + 32 = 40. The address names the group, so the account stores nothing else
```

#### JoinTally

Counts the joins of one member at one group address. `join_group` creates it at the member's first join and adds one at every join. `leave_group` and `close_member_record` never touch it, so it keeps the count across a leave and a rejoin, and it outlives `close_group`. Only `close_join_tally` closes it, once no group lives at its group address. See [ADR-0004](./docs/adr/0004-join-tally.md).

```rust
#[account(discriminator = b"snTally1")]
#[derive(InitSpace)]
pub struct JoinTally {
    pub rent_payer: Pubkey,  // offset 8,  32 bytes. Paid this account's rent at the first join_group. A later join never rewrites it
    pub joins: u32,          // offset 40, 4 bytes.  Successful join_group calls of this member at this group address. Never 0 on a stored tally
}
// Seeds: [b"tally", group_config.key().as_ref(), member.key().as_ref()]
// Space: 8 + 32 + 4 = 44. The address names the group and the member, so the account stores neither, and no bump
```

The size is pinned at compile time, and a unit test in `state/join_tally.rs` checks each offset.

A join authority reads the tally to tell a wallet that joined and left from one that never joined. It derives the address from the group and the member, and reads `joins` as a little-endian `u32` at offset 40. An address that this program does not own means 0. To spend each approval once, the authority stores `joins` when it approves a join, and co-signs only a `join_group` whose `expected_joins` is that stored value. The program refuses the join when the tally holds any other count (`JoinCountMismatch`), so a co-signed approval lands at most once, however many messages the authority signed for it. Within one group instance the count only grows, so the check is exact there. Across instances at one code it is not. See "Tally inherited at a freed code" and "Tally closed then count restarts" under Security.

An authority must also bind each approval to the group instance it was made for, and never let it outlive that `GroupConfig` account. A stored `joins` value means nothing in a later group at the same code: an absent or closed tally reads 0 again, and a reset count can grow back to the stored value.

#### Rent payer

`rent_payer` is the wallet that signed and paid the account rent at `create_group` or `join_group`. It equals the creator or the member when they pay for themselves. The program writes it once and never changes it. Every rent refund goes to that wallet and to no other:

| Rent | Paid at | Returned by | Destination |
|------|---------|-------------|-------------|
| GroupConfig (244 bytes) | `create_group` | `close_group`, after settlement and once every member record is closed | `group_config.rent_payer` |
| Vault (165 bytes) | `create_group` | `refund_vault_rent`, after `distribute` or `emergency_cancel` closed the vault into GroupConfig | `group_config.rent_payer` |
| JoinGate (40 bytes) | `set_join_authority` | `close_group`, in the same instruction as `GroupConfig` | `group_config.rent_payer` |
| JoinTally (44 bytes) | the member's first `join_group` at the group address | `close_join_tally`, once no group lives at that address | `join_tally.rent_payer` |
| MemberRecord (198 bytes) | `join_group` | `leave_group` while the group is Open, or `close_member_record` 30 days after settlement | `member_record.rent_payer` |

`distribute` and `emergency_cancel` name no rent recipient. They close the vault into the GroupConfig PDA, so the instructions that move member tokens credit no lamports to an address outside the program.

#### Accounts in the previous layout

Both accounts use explicit discriminators (`snGroup4`, `snMembr3`). A `GroupConfig` written before `reserved` existed carries `snGroup3` and is 180 bytes, and a `MemberRecord` carries `snMembr2` and is 166 bytes; every instruction rejects them with `AccountDiscriminatorMismatch`. A `GroupConfig` written before `vault_bump` existed carries `snGroup2` and is 179 bytes; every instruction rejects it with `AccountDiscriminatorMismatch`. An account written before `rent_payer` existed carries Anchor's default discriminator and a different field order. Every instruction rejects it with `AccountDiscriminatorMismatch` (`InvalidMemberRecord` for a member record passed to settlement), and the TypeScript client's `.all()` skips it. There is no migration instruction. See "Upgrades that change an account layout" under Deployment.

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
- `creator` (signer) — recorded as `group_config.creator`. Pays nothing, so a creator with no SOL can sign
- `rent_payer` (signer, mut) — pays the rent of `group_config` and `vault`. Recorded as `group_config.rent_payer`. May be the same key as `creator`
- `group_config` (init, payer = `rent_payer`) — PDA derived from group code
- `vault` (init, payer = `rent_payer`) — PDA-owned token account for the group mint
- `mint` — the group mint. Must pass the mint rule below
- `token_program` — SPL Token or Token-2022
- `system_program`

**Args:**
- `group_code: String` — human-readable code (max 32 chars, used as PDA seed)
- `deposit_amount: u64` — amount per period
- `frequency: u8` — 0/1/2 for weekly/biweekly/monthly. Devnet builds also accept 3, a five-minute period, so a full lifecycle can be driven through the app in one sitting; the arm is compiled out of every other build
- `total_periods: u8` — number of periods (1-52)
- `max_members: u8` — max size (2-10)
- `penalty_type: u8` — 0 = fixed, 1 = percentage
- `penalty_value: u64` — amount or basis points

**Validation:**
- `deposit_amount > 0`
- `frequency` in [0, 1, 2], or [0, 1, 2, 3] under `--features devnet` (see `MAX_FREQUENCY`)
- `total_periods` in [1, 52]
- `max_members` in [2, 10]
- `penalty_type` in [0, 1]
- If fixed, `penalty_value <= deposit_amount` (per missed period; an unbounded value used to allow groups whose settlement math overflowed — issue #44 H-1)
- If percentage, `penalty_value <= 5000` (max 50%)
- `group_code` length 1-32 chars, alphanumeric + hyphens only
- `mint` passes the mint rule (`UnsupportedMint`)

**Mint rule.** The program records each deposit as `deposit_amount` and later pays that amount back. That is only true for a mint where a transfer delivers what it sends and where no other party can move, block, or destroy vault tokens. `create_group` therefore rejects, with `UnsupportedMint`:

- The native mint of SPL Token and of Token-2022. A wrapped-SOL account cannot be burned, so one lamport sent to the vault would block the cancel of a group with no members.
- A Token-2022 mint with any extension outside this allowlist: `MetadataPointer`, `TokenMetadata`, `InterestBearingConfig`. Rejected examples: `TransferFeeConfig` (the vault receives less than the recorded deposit, so the first member out is paid with other members' tokens and the last one cannot be paid), `TransferHook`, `PermanentDelegate`, `NonTransferable`, `DefaultAccountState`, `MintCloseAuthority`, `Pausable`, `ScaledUiAmount`, the group extensions, and the confidential-transfer family.
- A Token-2022 mint with an extension type that this build cannot parse. Anchor's vault `init` reads the mint's extension list first and fails with `InvalidAccountData`. If it did not, the mint rule treats an unreadable list as unsupported.

A legacy SPL mint has no extensions and passes. A freeze authority is allowed, because USDC has one; see the frozen-account rows in the threat model. The rule is `extensions_supported` in `state/supported_mint.rs`, a pure function over the extension types. The rule runs only at `create_group`: a mint cannot gain a rejected extension after it is initialized.

**Effects:**
- Creates `GroupConfig` with status = Open (0), `rent_payer` = the `rent_payer` signer, `settled_at` = 0
- Creates vault token account owned by vault PDA

---

#### 2. `join_group`

A member joins the group and makes their initial deposit.

**Accounts:**
- `member` (signer) — recorded as `member_record.member` and authority of the deposit transfer. Pays no SOL, so a member with no SOL can sign
- `rent_payer` (signer, mut) — pays the `member_record` rent, and the `join_tally` rent at the member's first join. Recorded as `member_record.rent_payer`, and as `join_tally.rent_payer` when the tally is created. May be the same key as `member`. It is not a token authority: the deposit always comes from the member's own token account
- `group_config` (mut) — increments member count
- `member_record` (init, payer = `rent_payer`) — PDA for this member in this group
- `member_token_account` (mut) — member's canonical ATA for the group mint (source). Enforced via `associated_token::` constraints. Settlement pays any token account the member owns for the mint
- `vault` (mut) — group's USDC vault (destination)
- `mint`
- `token_program`
- `system_program`
- `join_gate` — the address `["join", group_config]`, enforced by seeds. It may hold nothing
- `join_authority` (optional signer) — must sign when a `JoinGate` exists at `join_gate`. Ignored otherwise
- `instructions_sysvar` — address pinned to the instructions sysvar. Read only for a gated group
- `join_tally` (mut, `init_if_needed`, payer = `rent_payer`). Seeds `["tally", group_config, member]`. The last account, so earlier positions do not move

**Args:**
- `expected_terms: GroupTerms` — `{ creator, deposit_amount, frequency, total_periods, penalty_type, penalty_value }`, the terms the client showed the member. The deposit amount the program moves still comes from `group_config.deposit_amount`
- `expected_joins: Option<u32>`. When given, the member's tally count before this join, 0 for a first join

**Validation:**
- `group_config.status == Open (0)`
- `group_config.current_members < group_config.max_members`
- `expected_terms` equals the group's terms (`TermsMismatch`). See "Join signed for one group lands in another" under Security
- Member doesn't already have a `MemberRecord` for this group (PDA uniqueness handles this)
- When this program owns `join_gate`, it must deserialize as a `JoinGate`, and `join_authority` must be present, sign, and equal `join_gate.authority` (`JoinNotApproved`). A system-owned address, with or without lamports, means the group has no gate
- For a gated group, instruction 0 of the transaction is not `AdvanceNonceAccount` (`DurableNonceNotAllowed`). See "Approval replayed in a later group at the same code" under Security
- For a gated group, `expected_joins` is given (`ExpectedJoinsRequired`)
- When `expected_joins` is given, it equals `join_tally.joins` before the increment (`JoinCountMismatch`). An open group may omit it
- An existing `join_tally` must be owned by this program and carry the `JoinTally` discriminator (Anchor's `init_if_needed` checks). A system-owned address, with or without lamports, gets a new tally
- Member has sufficient USDC balance

**Effects:**
- Creates `MemberRecord` with `total_deposited = deposit_amount`, `deposits_made = 1`, `periods_deposited[0] = true`, `rent_payer` = the `rent_payer` signer
- Transfers `deposit_amount` from member to vault via CPI
- Increments `group_config.current_members`
- Creates `JoinTally` at the first join, with `rent_payer` = the `rent_payer` signer. The handler sets `rent_payer` only when `joins == 0`, which holds only for a tally created in this instruction, so a rejoin keeps the first payer
- Increments `join_tally.joins`

The tally costs a sponsor 873,760 lamports at a member's first join at a group address, on top of the 1,656,080 lamports of the record (1,493,520 before the 32 reserved bytes). A rejoin pays the record rent only. The figures come from `getMinimumBalanceForRentExemption` on devnet and mainnet on 2026-10-13. LiteSVM's default rent gives 1,197,120 and 2,268,960. The tally adds 7,745 compute units to a join when its canonical bump is found at the first try, and 1,500 more for each further try. Over 256 member keys, 223 joins added at most 10,776, 250 added at most 13,745, and 6 added more than 15,000, at most 16,745. The search cannot be skipped with a bump passed by the client: a non-canonical bump gives a second tally address at 0. A gated create transaction (`create_group`, `set_join_authority` and `join_group`) with a 32-character code is 880 bytes, under the 1,232-byte limit (829 before `expected_terms` added 51 bytes).

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
period_duration = period_duration_secs(frequency)   // state/group_config.rs
    0 => 7 * 86400,     // weekly
    1 => 14 * 86400,    // biweekly
    2 => 30 * 86400,    // monthly (simplified to 30 days)
    3 => 300,           // five minutes, --features devnet only
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
- `payer` (signer) — pays for transaction fees only, never rent
- `group_config` (mut) — also receives the vault's rent when the vault closes
- `vault` (mut) — source of all distributions; signs its own transfers (self-as-authority)
- `mint`
- `treasury_authority` (PDA, seeds `[b"treasury"]`)
- `treasury_token_account` (mut, **optional**) — canonical ATA of `(mint, treasury_authority)`, pinned by `associated_token::` constraints when passed. Required only when a protocol fee is due this settlement; created ahead of time via `init_treasury`, never here (issue #44 H-3: `init_if_needed` let permissionless callers be rent-griefed)
- `token_program`
- Plus: remaining accounts are pairs of `[member_record, member_token_account]` for each member

**Args:** None

**Validation:**
- `group_config.status == Active (1)`
- Cycle has ended: `Clock::get().unix_timestamp >= cycle_start + (total_periods * period_duration)`
- All member records are passed in remaining accounts
- Number of member records matches `group_config.current_members`
- Each `member_record` account is owned by this program and matches the canonical `["member", group, member]` PDA, derived with the record's stored bump
- No `member_record` is passed twice
- Each paired `member_token_account` is owned by `member_record.member` and uses `group_config.mint`
- The computed payouts plus the protocol fee equal the members' `total_deposited`, less rounding dust smaller than the number of compliant members (`SettlementImbalance`). The vault holds at least that total (`VaultShortfall`)
- If `protocol_fee > 0`, `treasury_token_account` must be passed and initialized (`TreasuryNotInitialized` otherwise — settlement is blocked, not bricked, until `FEE_RECIPIENT` runs `init_treasury`; funds stay in the vault and the call is retriable). The fee cannot be dodged by omitting the account.

**Distribution logic:**
```
for each member:
    missed = total_periods - member.deposits_made
    // Penalty math is computed in u128 so no admissible input can overflow
    // before the cap clamps it (issue #44 H-1); the narrowing back to u64
    // is infallible because the result is <= total_deposited.
    if penalty_type == Fixed:
        penalty = missed * penalty_value
    else: // Percentage, multiplied before divided, so it rounds once
        penalty = missed * deposit_amount * penalty_value / 10000
    
    // Cap penalty at total deposited (can't lose more than you put in)
    penalty = min(penalty, member.total_deposited)
    member_payout = member.total_deposited - penalty
    total_penalties += penalty

// Protocol fee: 5% of the penalty pool. Skipped (0) when no one is
// compliant (pro-rata refund branch) or when FEE_RECIPIENT is
// Pubkey::default() (fee_recipient_configured() == false) — the
// full pool is then redistributed, nothing accumulates or is burned
// (issue #44 H-4).
compliant_count = members where deposits_made == total_periods
protocol_fee = (compliant_count == 0 || !fee_recipient_configured())
    ? 0
    : total_penalties * PROTOCOL_FEE_BPS / 10_000
redistributable = total_penalties - protocol_fee

// Split remaining penalties among fully compliant members
if compliant_count > 0:
    bonus_per_compliant = redistributable / compliant_count

// Fee CPI first (if protocol_fee > 0), so the last-member dust path sees
// the post-fee vault balance.
transfer_checked(vault -> treasury_token_account, protocol_fee)

for each member:
    if compliant_count == 0:
        payout = member.total_deposited   // full refund, no penalties
    else:
        payout = member_payout
        if member.deposits_made == total_periods:
            payout += bonus_per_compliant
    // The last member in remaining-accounts order gets the vault balance
    // (vault.reload()) in place of `payout`: their payout plus the rounding
    // dust and any tokens sent to the vault outside the program. The caller
    // picks the order, so the caller picks who gets the dust, under one
    // token unit per compliant member. See "Frontrunning distribution".
    
    // Transfer payout from vault to member via CPI with PDA signer seeds
    transfer_checked(vault -> member_token_account, payout)
```

**Effects:**
- Transfers calculated amounts from vault to each member
- Sets `group_config.status = Completed (2)` and `group_config.settled_at` to the clock time
- Closes the vault account into `group_config`. `refund_vault_rent` then pays that rent to `group_config.rent_payer`

---

#### 6. `emergency_cancel`

Creator cancels the cycle. All deposits returned without penalties.

**Accounts:**
- `creator` (signer) — must match `group_config.creator`. Receives nothing
- `group_config` (mut) — also receives the vault's rent when the vault closes
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
- Sets `group_config.status = Cancelled (3)` and `group_config.settled_at` to the clock time
- Closes the vault account into `group_config`. The creator gains no lamports, so a creator whose rent another wallet paid cannot collect the vault rent by creating and cancelling groups

**A group with no members.** `leave_group` makes this an ordinary state. No member is owed anything, so any balance in the vault is tokens that someone sent to it outside the program. A token account with a balance cannot close, so one donated unit would otherwise block the cancel. When `current_members == 0` and the vault balance is above zero, the instruction burns that balance with `burn_checked`, signed by the vault PDA, and then closes the vault. No token moves to any address.

- The burn changes the mint supply, so the transaction must mark `mint` writable. The IDL lists `mint` as read-only, because every other cancel only reads it. If the vault of an empty group holds tokens and `mint` is read-only, the instruction fails with `MintNotWritable` and changes nothing.
- A client that cancels a group with no members should always mark `mint` writable. A writable `mint` with an empty vault burns nothing, and a donation that lands just before the cancel then cannot make it fail.
- With one or more members nothing is burned and `mint` stays read-only: the last-listed member receives the vault balance, as before.
- The burn cannot run on a vault that the freeze authority of the mint froze. No instruction moves tokens out of a frozen vault, for a group of any size.
- Sending the balance to the treasury token account was rejected. That account exists only after `FEE_RECIPIENT` runs `init_treasury` for the mint, so the creator's cancel would depend on another party.

---

#### 7. `withdraw_fees`

Drains the protocol treasury to the configured `FEE_RECIPIENT`. Only `FEE_RECIPIENT` can call it, because the `recipient` signer must equal that compile-time key.

**Accounts:**
- `recipient` (signer) — must equal compile-time `FEE_RECIPIENT`
- `treasury_authority` (PDA, seeds `[b"treasury"]`)
- `treasury_token_account` — must be owned by `treasury_authority` and use the configured mint
- `recipient_token_account` — must be owned by `FEE_RECIPIENT` and use the same mint
- `mint`
- `token_program`

**Args:** None

**Validation:**
- `recipient.key() == FEE_RECIPIENT`
- `treasury_token_account.owner == treasury_authority.key()`
- `recipient_token_account.owner == FEE_RECIPIENT`
- Both token accounts use `mint`

**Effects:**
- Transfers `treasury_token_account.amount` to `recipient_token_account` via CPI signed by the treasury PDA
- Fails with `NoFeesToWithdraw` when the treasury balance is zero (issue #44 L-6: a silent no-op made the recipient pay a tx fee to learn nothing)
- Treasury account stays open across withdrawals (cheaper than re-init each cycle)

---

#### 8. `init_treasury`

One-shot, per-mint creation of the protocol treasury ATA. Signed and paid for by the compile-time `FEE_RECIPIENT`, so a permissionless `distribute` caller can never be forced to fund rent for an account only the fee recipient controls (issue #44 H-3).

**Accounts:**
- `fee_recipient` (signer, mut) — must equal compile-time `FEE_RECIPIENT`; pays the ATA rent
- `treasury_authority` (PDA, seeds `[b"treasury"]`)
- `treasury_token_account` (init) — canonical ATA of `(mint, treasury_authority)`; plain `init`, so a second call for the same mint fails
- `mint` — any mint; groups are per-mint while the treasury authority PDA is global, so the protocol holds one ATA per supported mint
- `token_program`, `associated_token_program`, `system_program`

**Args:** None

**Validation:**
- `fee_recipient.key() == FEE_RECIPIENT` (`UnauthorizedRecipient`)

**Effects:**
- Creates the treasury ATA for the given mint (all work happens in account constraints)

**Ops runbook:** before the first fee-charging settlement on a cluster, `FEE_RECIPIENT` must run `init_treasury` for each supported mint (USDC at minimum). Until then, fee-charging `distribute` calls fail with `TreasuryNotInitialized` (retriable); fee-free settlements are unaffected. On mainnet `FEE_RECIPIENT` is the Squads vault, so `init_treasury` is a multisig proposal, and it must execute for BRS (`BRSxQRUaGswjLs7ewcH7uXj3r7SgmfKSSLLXyCKHZtUo`) before the first mainnet group with a missed deposit settles.

---

#### 9. `refund_vault_rent`

Pays the vault rent that settlement left in `GroupConfig` to the wallet that paid it. Anyone can call it.

**Accounts:**
- `group_config` (mut) — source of the lamports
- `rent_payer` (mut) — must equal `group_config.rent_payer`. Receives lamports only. The program never reads it

**Args:** None

**Validation, in this order:**
- `group_config.status == Completed (2) || group_config.status == Cancelled (3)` (`InvalidGroupStatus`)
- `rent_payer.key() == group_config.rent_payer` (`InvalidRentPayer`)

The second check is a raw `constraint`, not `has_one`. Anchor 1.0.2 runs every `has_one` before any raw constraint, and the status check must run first.

**Effects:**
- Moves `group_config` lamports above the rent-exempt minimum for its 180 bytes to `rent_payer`
- When nothing is above the minimum, succeeds and moves nothing. A second call, or a call batched with other instructions, cannot fail for that reason
- Never takes `group_config` below the rent-exempt minimum, so the account stays open until `close_group`
- Lamports that anyone sends to `group_config` also go to `rent_payer` on the next call

The amount follows the rent rate at the time of the call. If the rate is lower than at `create_group`, the refund includes part of the rent paid for `GroupConfig` itself, which the rent payer also funded. If the rate is higher, the refund is smaller or zero.

---

#### 10. `close_member_record`

Closes one `MemberRecord` of a settled group and returns its rent to the wallet that paid it. Anyone can call it, once the retention period after settlement has passed. One record per instruction: a client puts up to 10 of them, plus `refund_vault_rent`, in one transaction (1,023 bytes with 10 different rent payers).

**Accounts:**
- `group_config` (mut) — `current_members` goes down by one
- `member_record` (mut, `close = rent_payer`) — seeds `["member", group_config, member_record.member]` with the stored bump
- `rent_payer` (mut) — must equal `member_record.rent_payer`. Receives lamports only. The program never reads it

**Args:** None

**Validation, in this order:**
- `group_config.status == Completed (2) || group_config.status == Cancelled (3)` (`InvalidGroupStatus`)
- `Clock::get().unix_timestamp >= group_config.settled_at + RECORD_RETENTION_SECS` (`RecordRetentionNotElapsed`)
- `member_record` is the canonical PDA for this group (`ConstraintSeeds`). The seeds include the group key, so a record of another group cannot pass
- `rent_payer.key() == member_record.rent_payer` (`InvalidRentPayer`)

**Effects:**
- Decrements `group_config.current_members` with `checked_sub`
- Transfers all lamports of the record to `rent_payer` and closes the record

Settlement reads every member record, so a record cannot close while the group is Open or Active. Completed and Cancelled never revert and `join_group` requires Open, so a closed record cannot be created again in this group. The decrement keeps `current_members` equal to the number of open records, which `close_group` checks before it frees the group code. A second close of the same record fails with `AccountNotInitialized`.

`RECORD_RETENTION_SECS` is 2,592,000 (30 days). Devnet builds use 300, in the same `cfg!(feature = "devnet")` style as `MAX_FREQUENCY`. Clients read the member records of a settled group to show each member's result, so the records stay open for that period. After it, anyone can close them. A client that lists a wallet's groups through its member records then stops listing that group, and a client must not compute payouts from the records that remain.

---

#### 11. `leave_group`

A member leaves a group that has not started. The member gets the first deposit back, the member record closes, and the seat is free again. This is the member's exit when the creator of an Open group never starts or cancels it.

**Accounts:**
- `member` (signer) — must be the wallet in the record seeds. Not writable and pays no SOL, so a member with no SOL can leave when another wallet pays the transaction fee
- `group_config` (mut) — decrements the member count
- `member_record` (mut, `close = rent_payer`) — seeds `["member", group_config, member]` with the stored bump
- `rent_payer` (mut) — must equal `member_record.rent_payer`. Receives lamports only. It does not sign, and the program never reads it
- `member_token_account` (mut) — destination. Any token account for the group mint that the signer owns (`token::mint`, `token::authority`, `token::token_program`). It does not have to be the canonical ATA: settlement accepts any token account of a member too, and a member whose ATA is frozen needs a way out
- `vault` (mut) — source. Signs its own transfer
- `mint`
- `token_program`

**Args:** None

**Validation.** Anchor first loads every account, then runs the constraints. So two groups of checks exist, and every load check comes before every constraint, the status check included.

At load, in account order:
- `member` signed (`AccountNotSigner`)
- `member_record` exists (`AccountNotInitialized`). This is what a wallet with no record gets, and a member who already left
- `member_token_account` and `vault` exist and are token accounts (`AccountNotInitialized`). After `distribute` or `emergency_cancel` the vault is closed, so a leave sent then fails here and never reaches the status check

Then the constraints, in this order:
- `group_config.status == Open (0)` (`InvalidGroupStatus`). An Active group fails here
- `member_record` is the canonical PDA for this group and this signer (`ConstraintSeeds`)
- `rent_payer.key() == member_record.rent_payer` (`InvalidRentPayer`)
- `member_token_account` has the group mint and the signer as owner (`ConstraintTokenMint`, `ConstraintTokenOwner`)
- `vault` is the PDA of this group (`ConstraintSeeds`)
- `mint.key() == group_config.mint` (`InvalidMint`)

**Effects:**
- Decrements `group_config.current_members` with `checked_sub`
- Transfers `member_record.total_deposited` from the vault to `member_token_account` with `transfer_checked`. While a group is Open this always equals `deposit_amount`
- Closes `member_record` and pays its lamports to `rent_payer`. The 30-day retention of `close_member_record` does not apply: the group never settled, so there is no result to keep

After a leave the same wallet can join again, and `join_group` writes a fresh record with the rent payer of that join. `start_cycle` counts only the members that remain, so it fails with `InsufficientMembers` if leaves took the group under 2. A client must treat `AccountNotInitialized` from a leave as "the group is no longer Open", the same as `InvalidGroupStatus`.

The record rent goes to the wallet that paid it and to no other. A member whose rent a sponsor paid gets tokens and no lamports from a leave, so repeated join and leave moves no lamports from the sponsor to the member. Each join needs the sponsor's signature.

A leave pays exactly the recorded deposit. Tokens that someone sent to the vault outside the program stay there. If the group later has no members, `emergency_cancel` burns them (see `emergency_cancel`).

---

#### 12. `close_group`

Closes the `GroupConfig` of a settled group that has no member record left, and pays every lamport in it to the wallet that paid its rent. Anyone can call it.

**Accounts:**
- `group_config` (mut, `close = rent_payer`) — seeds `["group", group_config.group_code]` with the stored bump
- `rent_payer` (mut) — must equal `group_config.rent_payer`. Receives lamports only. The program never reads it
- `join_gate` (mut) — the address `["join", group_config]`, enforced by seeds. It may hold nothing

**Args:** None

**Validation, in this order:**
- `group_config.status == Completed (2) || group_config.status == Cancelled (3)` (`InvalidGroupStatus`)
- `group_config.current_members == 0` (`GroupHasOpenRecords`)
- `rent_payer.key() == group_config.rent_payer` (`InvalidRentPayer`), a raw `constraint` for the same reason as in `refund_vault_rent`

**Effects:**
- Transfers all lamports of `group_config` to `rent_payer` and closes the account. That includes the vault rent that settlement moved into it, when `refund_vault_rent` was not sent first: 3,053,080 lamports in total (1,564,640 for 180 bytes plus 1,488,440 for the 165-byte vault)
- When this program owns `join_gate`, closes that `JoinGate` to `rent_payer` too (853,440 lamports for 40 bytes). See "Gate inherited at a freed code" under Security
- Leaves every `JoinTally` of the group open. `close_join_tally` closes each one afterwards

The lamport figures above come from `getMinimumBalanceForRentExemption` on devnet and mainnet on 2026-10-11. The program reads rent from the `Rent` sysvar at runtime, so the figures are examples only.

`current_members` counts open member records for the whole life of a group: `join_group` adds one, and `leave_group` and `close_member_record` subtract one. No other instruction creates or closes a record. So zero proves that no record of this group exists, and a later `create_group` with the same code, which derives the same `GroupConfig` address and so the same `["member", group_config, member]` addresses, finds nothing to inherit. A new instruction that creates or closes a member record must change `current_members` in the same instruction.

There is no retention check. A group with records waits for them, and their retention already applies. A group with no member at settlement, an emptied Open group that the creator cancelled, can close at once.

Records closed before `close_member_record` decremented the count left `current_members` above zero. `close_group` fails for such a group with `GroupHasOpenRecords`, and the group stays open as before.

A client sends `close_group` after the last `close_member_record`. After it, the group code is free: anyone can create a group with it, at the same addresses. A client must not hand out a code it used before, and must not treat a group address as unique over time.

A new group at a freed code inherits no member record and no join gate. It does inherit every join tally still open at that address, with its count. A client that wants the next group to start from 0 sends `close_join_tally` for each member after `close_group`. See "Tally inherited at a freed code" under Security.

---

#### 13. `set_join_authority`

Gates an Open group with no member: from then on every `join_group` needs the signature of `authority`. Once per group.

**Accounts:**
- `creator` (signer) — must equal `group_config.creator`
- `rent_payer` (signer, mut) — must equal `group_config.rent_payer`. Pays the `join_gate` rent, so `close_group` returns it with the `GroupConfig` rent
- `group_config` — seeds `["group", group_config.group_code]` with the stored bump
- `join_gate` (init, payer = `rent_payer`) — seeds `["join", group_config]`
- `system_program`

**Args:** `authority: Pubkey`

**Validation, in this order:**
- `group_config.status == Open (0)` (`InvalidGroupStatus`)
- `group_config.current_members == 0` (`GroupHasMembers`)
- `creator.key() == group_config.creator` (`UnauthorizedCreator`)
- `rent_payer.key() == group_config.rent_payer` (`InvalidRentPayer`)
- `authority` is neither `Pubkey::default()` nor the program ID (`InvalidJoinAuthority`). The default key is the System Program ID, which never signs, and Anchor reads the program ID in an optional account slot as "no account". Either gate would block every join
- A second call fails because `join_gate` already exists

**Effects:**
- Creates `JoinGate` with `authority`

There is no instruction to change or remove the authority.

Send `set_join_authority` in the same transaction as `create_group`, before the creator's `join_group`. See "Gate set after a join" under Security.

A backend that holds the authority checks every message it co-signs. See "Co-signed join widened by the client" under Security.

---

#### 14. `close_join_tally`

Closes one member's `JoinTally` once no group lives at its group address, and pays its rent to the wallet that paid it. Anyone can call it.

**Accounts:**
- `group_config`. The group address the tally counts joins at. Never read. Must not be owned by this program
- `join_tally` (mut, `close = rent_payer`). Seeds `["tally", group_config, member]`
- `rent_payer` (mut). Must equal `join_tally.rent_payer`. Receives lamports only. The program never reads it

**Args:** `member: Pubkey`. A seed of `join_tally` only

**Validation, in this order:**
- `group_config` is not owned by this program (`GroupNotClosed`). Only `create_group` makes a program-owned account at a group address, and `close_group` returns it to the System Program. So a program-owned account there is a live group of any status, and a new group at the freed code blocks the close again until that group closes too
- `join_tally` matches the seeds, so `member` cannot name another member's tally (`ConstraintSeeds`)
- `rent_payer.key() == join_tally.rent_payer` (`InvalidRentPayer`)

**Effects:**
- Transfers all lamports of `join_tally` to `rent_payer` and closes the account (873,760 lamports for 44 bytes, plus any lamports sent to the address)

The handler does nothing. Every check is a constraint, and Anchor's `close` moves the lamports after the handler returns. The instruction emits no event.

---

### Treasury (protocol fee accumulator)

**Pattern:** PDA-controlled SPL token account, no admin authority.

```rust
// Authority — holds no data, only seeds
// Seeds: [b"treasury"]
pub treasury_authority: SystemAccount<'info>

// Token account — canonical ATA of (mint, treasury_authority)
// Created once per mint via `init_treasury` (fee recipient signs and pays);
// `distribute` only ever transfers into it, never creates it.
pub treasury_token_account: InterfaceAccount<'info, TokenAccount>
```

**Fee math (in `distribute` after Pass 1):**

```rust
let protocol_fee = if compliant_count == 0 || !fee_recipient_configured() {
    // Pro-rata refund branch has no penalty pool to skim from; a
    // default FEE_RECIPIENT (no cluster uses one now) disables the
    // fee entirely so nothing accumulates in an unwithdrawable treasury.
    0
} else {
    total_penalties.checked_mul(PROTOCOL_FEE_BPS)?.checked_div(10_000)?
};
let redistributable = total_penalties.checked_sub(protocol_fee)?;
let bonus_per_compliant = if compliant_count > 0 {
    redistributable.checked_div(compliant_count)?
} else {
    0
};
```

The fee CPI runs **before** any member-payout CPIs so the "last member gets vault remainder" dust path naturally sees the post-fee balance via `vault.reload()`.

**Recipient is compile-time, per cluster.** No instruction can change `FEE_RECIPIENT` at runtime — preserves the no-admin-backdoor invariant. Cluster gating mirrors how Anchor handles per-cluster `declare_id!`:

```rust
#[cfg(feature = "mainnet")]
pub const FEE_RECIPIENT: Pubkey = pubkey!("3M4JicDn..."); // Squads v4 vault, 2-of-3

#[cfg(all(feature = "devnet", not(feature = "mainnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("2jwEs8aP...");

// Test-only fallback: matching private key is committed at
// tests/fixtures/fee-recipient.json so CI exercises init_treasury and the
// withdraw_fees happy path. Treat it as public.
#[cfg(not(any(feature = "mainnet", feature = "devnet")))]
pub const FEE_RECIPIENT: Pubkey = pubkey!("A3xewgQH...");
```

**Default recipient:** if `FEE_RECIPIENT` were `Pubkey::default()`, `fee_recipient_configured()` would be false: `distribute` would skip the protocol fee (the full penalty pool redistributed, nothing accumulating in a treasury no one could withdraw from) and `init_treasury` / `withdraw_fees` would be uncallable. Every cluster sets a real recipient now; on mainnet it is the Squads vault, so `init_treasury` and `withdraw_fees` each run as a multisig proposal.

Build per cluster: `anchor build`, `anchor build -- --features devnet`, `anchor build --ignore-keys -- --features mainnet`. **Devnet deploys MUST build with `--features devnet`** — a plain build embeds the test fixture key (whose private half is public in this repo) as the fee recipient. The mainnet program ID and recipient were set in issue #20; a mainnet build also runs `mainnet_build_tests` under `cargo test --features mainnet`, and `mainnet` with `devnet` does not compile.

**Mainnet deploy.** Build with `anchor build --ignore-keys -- --features mainnet`: without `--ignore-keys`, anchor compares `declare_id!` with the local `target/deploy` keypair and fails. Never run `anchor keys sync`, which rewrites `declare_id!` to that local key. Before deploying, check that `target/idl/safenudge.json` has `address` `98poy9z9Z2MTz2TXW5W2LfnWosRubJYLbNzAjCYZeYFc`. Deploy with `solana program deploy --program-id <mainnet program keypair>` from a single-use deployer key, then move the upgrade authority to the Squad vault `3M4JicDnPbSbXboGW8Wz7DyDGTTAFqH27TseSTzAQ3PX` in the next transaction (`--skip-new-upgrade-authority-signer-check`). Before the first mainnet group settles with a penalty, the vault runs `init_treasury` for the group mint.

**Mainnet deployment record (2026-10-19).**

| | |
|---|---|
| Program | `98poy9z9Z2MTz2TXW5W2LfnWosRubJYLbNzAjCYZeYFc` |
| ProgramData | `GH4q8T3vU9MfkJuDwThhK8rd7ChRvBndeNmdnnyhV9gV` |
| Upgrade authority | Squad vault `3M4JicDnPbSbXboGW8Wz7DyDGTTAFqH27TseSTzAQ3PX` (vault 0 of multisig `VWgaKaDZg59EobucU1zappymft9BQarUTbtgxJEmiFt`, 2-of-3) |
| Source | `e3d1a4b`, Solana CLI 3.1.10, anchor-cli 1.0.2, built on macOS |
| Binary | 488,016 bytes, sha256 `7ad1ddd1ab0467d201e2ab9da8c442cd154d404bc64a0d7ab39ed0c61c034999`; the on-chain bytes hash the same |
| ProgramData size | 732,024 bytes of program space (1.5×); the account is 732,069 bytes with its 45-byte header, 3.71956076 SOL rent at 5,080 lamports per byte |
| Deployed | slot 458982364; authority moved at slot 458983835 |

The build is not byte-for-byte reproducible across operating systems: the same commit built on Linux has the same size but a different hash, because the platform tools differ per OS and embed their paths. Both binaries carry the mainnet program ID and the Squad vault, and neither carries a devnet or test key. An upgrade should build with `solana-verify` (Docker) so anyone can reproduce its hash.

Read rent from the cluster (`solana rent <bytes>`), never from a per-byte rate remembered from older docs: mainnet charged 5,080 lamports per byte on this date, not 6,960.

---

### Events

Handlers write events with `emit!` (`programs/safenudge/src/events.rs`) as their last step, after every mutation and CPI. A failed transaction carries no event. Fields are flat, amounts are raw token units, and events add no accounts or arguments. See [docs/monitoring.md](./docs/monitoring.md) section 3 for the rationale and how monitoring consumes them.

| Event | Emitted by | Fields |
|-------|------------|--------|
| `GroupCreated` | `create_group` | `group`, `creator`, `rent_payer`, `mint`, `deposit_amount`, `total_periods`, `max_members` |
| `MemberJoined` | `join_group` | `group`, `member`, `rent_payer`, `amount`, `current_members` (after the join), `joins` (this member's joins at this group address, this join included) |
| `MemberLeft` | `leave_group` | `group`, `member`, `refund`, `current_members` (after the leave) |
| `CycleStarted` | `start_cycle` | `group`, `members`, `cycle_start`, `cycle_end` (`GroupConfig::cycle_end`, the time `distribute` checks) |
| `DepositMade` | `deposit` | `group`, `member`, `period` (zero-based), `amount`, `deposits_made` |
| `MemberSettled` | `distribute`, once per member | `group`, `member`, `deposited`, `penalty` (charged; 0 when no member is compliant), `payout` (sent; the last member's includes the rounding remainder) |
| `GroupSettled` | `distribute`, after every `MemberSettled` | `group`, `members`, `compliant_count`, `total_penalties`, `protocol_fee`, `total_paid`. `total_paid + protocol_fee` equals the vault balance before settlement |
| `GroupCancelled` | `emergency_cancel` | `group`, `creator`, `members`, `refunded_total`, `burned` (non-zero only for a group with no members) |
| `FeesWithdrawn` | `withdraw_fees` | `recipient`, `mint`, `amount` |
| `JoinAuthoritySet` | `set_join_authority` | `group`, `creator`, `authority` |
| `GroupClosed` | `close_group` | `group`, `rent_payer`, `lamports` (`GroupConfig` balance, the vault rent included when `refund_vault_rent` never ran), `join_gate_lamports` (0 without a gate) |

`init_treasury`, `refund_vault_rent`, `close_member_record` and `close_join_tally` emit nothing. `close_group` emits before Anchor closes `GroupConfig` at the end of the instruction, so `lamports` is the amount that close pays.

### PDA Derivation Summary

| Account | Seeds | Purpose |
|---------|-------|---------|
| GroupConfig | `["group", group_code]` | Group parameters and state. Closed by `close_group` after settlement, once no member record is left |
| MemberRecord | `["member", group_config_key, member_key]` | Per-member deposit tracking. Closed by `leave_group` while Open, or by `close_member_record` after settlement |
| JoinGate | `["join", group_config_key]` | Join authority of a gated group. Created by `set_join_authority`, closed by `close_group` |
| JoinTally | `["tally", group_config_key, member_key]` | Joins of one member at one group address. Created by the first `join_group`, closed by `close_join_tally` after `close_group` |
| Vault | `["vault", group_config_key]` | SPL Token account; address and authority both derived at these seeds (self-as-authority). Its bump is stored in `group_config.vault_bump` |
| TreasuryAuthority | `["treasury"]` | Authority over the protocol-fee ATA; holds no data |
| TreasuryATA | canonical ATA of `(mint, TreasuryAuthority)` | Accumulates 5% of every penalty pool until `withdraw_fees` is called; created once per mint via `init_treasury` (fee recipient signs and pays) |

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
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Token mint does not match group configuration")]
    InvalidMint,
    #[msg("Member count mismatch in distribution")]
    MemberCountMismatch,
    #[msg("Account is not owned by this program")]
    InvalidAccountOwner,
    #[msg("Member record does not match the canonical PDA for its member")]
    InvalidMemberRecord,
    #[msg("Destination token account does not belong to the expected member")]
    InvalidTokenAccountOwner,
    #[msg("The same member record was passed more than once")]
    DuplicateMemberRecord,
    #[msg("Recipient is not the configured FEE_RECIPIENT")]
    UnauthorizedRecipient,
    #[msg("Treasury has no fees to withdraw")]
    NoFeesToWithdraw,
    #[msg("Protocol treasury token account for this mint has not been initialized")]
    TreasuryNotInitialized,
    #[msg("Rent refund destination does not match the recorded rent payer")]
    InvalidRentPayer,
    #[msg("Member records stay open for the retention period after settlement")]
    RecordRetentionNotElapsed,
    #[msg("This mint cannot be used for a group")]
    UnsupportedMint,
    #[msg("Mint must be writable to cancel a group with no members whose vault holds tokens")]
    MintNotWritable,
    #[msg("Close every member record before closing the group")]
    GroupHasOpenRecords,
    #[msg("The join authority can only be set before anyone joins")]
    GroupHasMembers,
    #[msg("The join authority cannot be the default public key or the program ID")]
    InvalidJoinAuthority,
    #[msg("This group needs its join authority to approve the join")]
    JoinNotApproved,
    #[msg("A gated join cannot use a durable nonce")]
    DurableNonceNotAllowed,
    #[msg("Close the group before closing a join tally")]
    GroupNotClosed,
    #[msg("The member's join count no longer matches the approved join")]
    JoinCountMismatch,
    #[msg("A gated join must name the member's expected join count")]
    ExpectedJoinsRequired,
}
```

---

## Clients

The program's client is SafePool, a separate app in a private repository by the same author. It copies `idl/` at a pinned commit and checks for drift in its own CI. The hackathon web app that lived in `app/` and served safenudge.xyz was retired in October 2026; its code is in this repository's history.

---

## Yield Integration (v2 Architecture)

A yield group is its own group type (see "Group types" under Account Structure). The design below is one candidate; the yield shape is not chosen.

### How It Would Work

A yield group's own instruction `deploy_to_yield` would:
1. Transfer USDC from the vault to a Kamino K-Lend deposit
2. Receive kUSDC (Kamino's receipt token) back into a PDA-owned token account
3. Track the kUSDC balance in a new `YieldPosition` account

At distribution time (the yield group's own distribute):
1. Withdraw kUSDC back to USDC via Kamino CPI
2. Calculate yield earned (total withdrawn - total originally deposited)
3. Distribute yield proportionally to compliant members as a bonus

### Why Kamino K-Lend

- Largest Solana USDC lending market (200M+ TVL within weeks of V2 launch)
- Institutional-grade (Gauntlet risk management)
- Clean CPI interface for deposits and withdrawals
- Variable APY from organic lending demand (not inflationary rewards)

### MVP Constraint

The PDA authority can sign CPIs to any program, so a yield vault can move funds into a yield protocol. That transfer is an exception to the rule that vault funds go only to members, and it lives only in the yield group's instructions, which pay one fixed, validated destination. Penalty math and member checks are shared as plain functions. Simple groups keep their instructions and their audit surface unchanged.

---

## Deployment

### Devnet

```
anchor build -- --features devnet
anchor deploy --provider.cluster devnet
```

- Program ID: generated on first deploy, stored in `Anchor.toml` and `lib.rs`
- USDC: use devnet USDC mint or create a test SPL token

### Upgrades that change an account layout

This rule applies to every cluster, not only devnet.

Before you upgrade a deployed program to a build that changes the layout or the discriminator of `GroupConfig` or `MemberRecord`, settle or cancel every live group with the binary that is deployed now. After the upgrade, every instruction rejects an account in the previous layout with `AccountDiscriminatorMismatch`. The tokens in the vault of such a group cannot be withdrawn, and its group code stays taken. There is no migration instruction.

The `rent_payer` change is such an upgrade. It also changes the interface that every client compiles against, so each client must repin the IDL and change its calls in the same release window:

- `create_group` and `join_group` take a new required signer, `rent_payer`, in the second account position. Later accounts move down one position.
- `distribute` no longer takes `creator`. `group_config` and every later account move up one position.
- `creator` in `create_group` and `emergency_cancel`, and `member` in `join_group`, are no longer writable.
- `GroupConfig` and `MemberRecord` have new field orders, sizes (179 and 166 bytes at the time; `GroupConfig` is 180 since issue #92), and discriminators. Any hard-coded `memcmp` offset or account decoder must change.
- Vault rent is no longer paid inside settlement. A client that wants it returned sends `refund_vault_rent`.
- Two instructions and two error codes are new: `refund_vault_rent`, `close_member_record`, `InvalidRentPayer`, `RecordRetentionNotElapsed`.

`leave_group` changes no layout and no existing account list, so it needs no settlement of live groups. Four things change for a client. `current_members` can now go down while a group is Open. A client that cancels a group with no members should mark `mint` writable (see `emergency_cancel`). `create_group` rejects mints outside the mint rule with `UnsupportedMint`. And two error codes are new, appended after the existing ones: `UnsupportedMint` (6025) and `MintNotWritable` (6026).

`close_group` also changes no layout, so it needs no settlement of live groups. For a client: `close_member_record` now writes `group_config`, so the account must be writable; `close_group` is a new instruction; and `GroupHasOpenRecords` (6027) is a new error code. A group whose records were closed under the previous binary can never be closed (see `close_group`).

The join gate changes no layout of an existing account either. `JoinGate` is a new account. For a client: `join_group` takes three more accounts after `system_program`, `join_gate`, the optional signer `join_authority` and `instructions_sysvar`, so earlier positions do not move; `close_group` takes `join_gate` after `rent_payer`; `set_join_authority` is new; and `GroupHasMembers` (6028), `InvalidJoinAuthority` (6029), `JoinNotApproved` (6030) and `DurableNonceNotAllowed` (6031) are new error codes. An Anchor client derives `join_gate` from the IDL seeds and fills `instructions_sysvar` from its fixed address. It fills an omitted optional signer with the provider wallet, so a client must pass `joinAuthority: null` for an open group, or the authority for a gated one.

The join tally changes no layout of an existing account. `JoinTally` is a new account. For a client: `join_group` takes the argument `expected_joins: Option<u32>`, which a gated join must set, and `join_tally` as its last account, after `instructions_sysvar`, so earlier positions do not move. A client on the previous IDL sends no argument and fails with `InstructionDidNotDeserialize`. `close_join_tally` is new, `MemberJoined` gains `joins`, and `GroupNotClosed` (6032), `JoinCountMismatch` (6033) and `ExpectedJoinsRequired` (6034) are new error codes. An Anchor client derives `join_tally` from the IDL seeds. Clients repin the IDL in the same release window as the upgrade.

The stored vault bump (issue #92) is a layout change of `GroupConfig`: a new field at offset 143, `group_code` moved to offset 144, size 180 bytes, discriminator `snGroup3`. Every live group must be settled or cancelled with the previous binary before the upgrade, as above. No instruction's accounts or arguments change, so a client changes only its IDL and any hard-coded offset at or after 143 (the group code's length prefix and bytes).

The reserved padding and the join terms are a layout change of both accounts and an interface change, and land together so clients change once. `GroupConfig` gains 64 zero bytes at offset 144, `group_code` moves to offset 208, size 244 bytes, discriminator `snGroup4`. `MemberRecord` gains 32 zero bytes at offset 166, size 198 bytes, discriminator `snMembr3`. Every live group must be settled or cancelled with the previous binary before the upgrade, as above. For a client: `join_group` takes `expected_terms: GroupTerms` as its first argument, before `expected_joins`, and a client on the previous IDL fails with `InstructionDidNotDeserialize`; any hard-coded offset at or after 144 in `GroupConfig` changes, and the account sizes change, so a sponsor's rent budget rises by 487,680 lamports for a gated create (Kora's `max_allowed_lamports`); and `TermsMismatch` (6035), `SettlementImbalance` (6036) and `VaultShortfall` (6037) are new error codes. The watchdog in `ops/watchdog/core.ts` reads the code at 208.

Every upgrade that changes the IDL, with or without a layout change, also needs these monitoring steps (see [docs/monitoring.md](./docs/monitoring.md), §6):

1. Copy the new `target/idl/safenudge.json` into the Microscope deployment.
2. Run `just generate`, rebuild the image, and run `just up`. The indexer does not start against a mismatched IDL hash, so a skipped step stops the indexer.
3. Do not backfill again across a layout change. A backfill decodes old records with the new IDL.
4. Expect a Squads alert for every step of the upgrade. An upgrade with no alert means that monitoring is broken.

### Testing Strategy

**Program (Anchor tests in TypeScript):**
- `create_group`: valid params, invalid params (boundary testing), duplicate group codes
- `join_group`: join with deposit, join when full, join when cycle already started
- `start_cycle`: creator-only, minimum 2 members, status validation
- `deposit`: on-time deposit, duplicate deposit (same period), deposit after cycle ends
- `distribute`: correct penalty calculation (fixed + percentage), redistribution to compliant members, edge cases (all miss, none miss, partial)
- `emergency_cancel`: creator-only, full refund verification, status transitions
- `leave_group`: deposit and rent returned to the right wallets, the join-leave loop with a sponsor, every status, every wrong account, the freed seat, and the vault balance after each leave
- `emergency_cancel` of a group with no members: a balance in the vault is burned under SPL Token and Token-2022, and nothing is burned when the group has members
- Mint rule: each rejected class of mint, both native mints, and the accepted shapes (plain Token-2022, interest-bearing with metadata, legacy SPL with a freeze authority)
- Frozen member token account: `leave_group`, `distribute` and `emergency_cancel` fail into it and succeed with another token account of the same member
- `refund_vault_rent` and `close_member_record`: refund to the recorded rent payer only, rejection before settlement, repeat calls, the create-then-cancel drain, transaction size for a 10-member group, and lamport conservation for a rent payer across a whole group
- Accounts in the previous layout: rejected by every instruction

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
│           │   ├── emergency_cancel.rs
│           │   ├── withdraw_fees.rs
│           │   ├── init_treasury.rs
│           │   ├── refund_vault_rent.rs
│           │   └── close_member_record.rs
│           ├── state/
│           │   ├── mod.rs
│           │   ├── group_config.rs
│           │   ├── member_record.rs
│           │   └── member_validation.rs   # shared remaining-accounts check
│           └── errors.rs
├── tests/
│   ├── fixtures/                   # test-only FEE_RECIPIENT keypair (public)
│   └── safenudge.ts                # Anchor integration tests
├── idl/                            # Committed IDL, checked against the build in CI
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
| Vault drain via unauthorized transfer | Vault authority is a PDA. Only the program can sign transfers. Every vault transfer goes to a token account owned by the wallet in a validated MemberRecord PDA, or to the canonical treasury ATA. |
| Token confusion (deposit wrong token) | `transfer_checked` validates mint and decimals at CPI level. GroupConfig stores expected mint; all instructions verify against it. |
| Penalty manipulation (overpay/underpay) | Penalty math uses checked arithmetic. Penalty capped at `total_deposited`. Distribution verified: sum of payouts equals vault balance. |
| State machine bypass | Status enum enforces one-directional transitions. Every instruction validates current status as first check. |
| Fake member injection | MemberRecord PDA derived from `["member", group_config_key, member_key]`. Anchor's `init` constraint prevents duplicates. `deposit` checks `member_record.group` and the seeds; `distribute` and `emergency_cancel` run `validate_member_pair` (program owner, group, canonical PDA, no duplicates). |
| Frontrunning distribution | Distribution is permissionless, and every computed payout depends only on on-chain state. The caller does choose the order of the remaining-account pairs, and the last-listed member gets the vault balance in place of a computed payout. In `distribute` that balance exceeds the computed payout by `redistributable % compliant_count`, at most `compliant_count - 1` base units: 9 in a 10-member group (0.000009 USDC at 6 decimals). In `emergency_cancel` the computed refunds sum to the vault balance, so the excess is 0. In both, tokens that someone transfers into the vault outside the program also go to the last-listed member. |
| Durable nonce pre-signing | No time-sensitive admin actions. `start_cycle` captures `Clock::get()` at execution time, not from arguments. Period calculation uses on-chain clock. |
| Rent refund redirected | Every rent refund goes to the `rent_payer` key stored in the account at `create_group` or `join_group`, where that wallet signed. `refund_vault_rent`, `close_member_record` and `close_join_tally` take no destination argument and reject any other account with `InvalidRentPayer`. |
| Rent payer drained by the creator | `emergency_cancel` and `distribute` pay no lamports to the creator or the caller. The vault rent goes to `GroupConfig` and from there only to `group_config.rent_payer`. `close_group` returns the `GroupConfig` rent to the same wallet once every record is closed. |
| Group code reuse after close | `close_group` requires a settled status and `current_members == 0`. `current_members` goes up only with a record created by `join_group` and down only with a record closed by `leave_group` or `close_member_record`, so it is never lower than the number of open records. At zero no record exists, and a new group at the same code, which gets the same `GroupConfig` and member record addresses, inherits none. Records closed before the decrement existed can only leave the count too high, which keeps that group open. The invariant is a convention, not a type: a new instruction that creates or closes a record must update the count (tested in `close_group`, "lets a new group reuse the code with no old member record"). |
| Record closed before settlement | `close_member_record` requires Completed or Cancelled. Settlement needs every record, and both statuses are final. `leave_group` closes a record only while the group is Open and decrements `current_members` in the same instruction, so settlement still finds exactly `current_members` records. `close_member_record` decrements it after settlement, when no settlement can run again. |
| Creator abandons an Open group | `start_cycle` and `emergency_cancel` need the creator. `leave_group` needs only the member: each member takes the first deposit back while the group is Open, and the record rent returns to its payer. What stays locked is the rent of `GroupConfig` and of the vault, which only a cancel by the creator releases. |
| Frozen member token account blocks settlement in a client (accepted for v1) | `distribute` and `emergency_cancel` pay every member in one transaction. A transfer to a frozen token account fails, so that settlement transaction fails for the whole group. Any mint with a freeze authority makes this possible, and that includes USDC. A closed token account has the same effect, but anyone can create it again and a client should do that before it settles. At program level a frozen account does not block the group: `validate_member_pair` accepts any token account that the member owns for the group mint, not only the canonical ATA. Anyone can create a new token account with that member as owner and pass it in place of the frozen one, and the settlement then succeeds (tested for both instructions). A client that always passes each member's canonical ATA keeps the group blocked until the freeze authority thaws the account. Whether a client should pay a member's other account is an open product decision. The same freeze authority can also freeze the new account. A claim path, where settlement records each entitlement and a member whose transfer fails claims later, is planned with the v2 two-phase settlement (issue #56). In an Open group a frozen account blocks only its own member, and `leave_group` also accepts another token account of that member. |
| Tokens sent to the vault of a group with no members | A token account with a balance cannot close. `emergency_cancel` burns the balance when `current_members == 0`, then closes the vault. No token goes to an address that a caller chooses. The burn can touch only donated tokens: every deposit enters through `join_group` or `deposit`, both tied to a member record, and `leave_group` pays out exactly what its record holds. The cancel needs `mint` writable in that case (`MintNotWritable`). It cannot succeed while the freeze authority of the mint keeps the vault frozen. |
| A wallet joins and leaves again and again (accepted) | `emergency_cancel` must list every member, so a join or a leave that lands first makes it fail with `MemberCountMismatch`. A leave that takes the group under 2 members makes `start_cycle` fail with `InsufficientMembers`. One wallet can repeat this for the price of the transaction fees. The creator retries with the current member list. No funds are at risk, and every other member can still leave alone. |
| `start_cycle` lands after members left (accepted for v1) | `start_cycle` takes no expected member count. If two or more members remain, the cycle starts for them, even if the creator signed when the group was larger. Members who want out must leave before the start. |
| Mint that breaks the deposit accounting | `create_group` rejects the native mints and every Token-2022 mint outside the extension allowlist (`UnsupportedMint`). See the mint rule in the `create_group` spec. A transfer-fee mint would let the vault hold less than the recorded deposits. |
| Freeze authority freezes a vault (accepted) | Mints with a freeze authority are allowed. That authority can freeze a group vault, and then no instruction moves its tokens until it is thawed. This is the issuer's power over every holder of the token, not specific to this program. |
| Records closed while clients still show the result | `close_member_record` also requires 30 days since `settled_at` (300 seconds in devnet builds). `close_group` needs every record closed, so it waits for the same period. |
| Old invite link opens a new group (accepted) | After `close_group` anyone can create a group with the freed code. An invite link that names only the code then opens that group, and a user can join strangers. No funds are at risk: the new group pays deposits back under its own rules. The code frees at least 30 days after settlement. Clients should not reuse codes and should show the creator before a join. |
| History keyed on a group address (accepted) | A group created at a freed code has the same `GroupConfig`, vault and member record addresses as the closed one. An indexer or client that keys history on the group address can mix the two groups. Key on the address and the `GroupCreated` event that started it. |
| Stranger joins a gated group | `join_group` needs the `JoinGate` authority's signature whenever this program owns `["join", group_config]`. The seeds pin that address, and only `set_join_authority`, which needs the creator, the recorded rent payer, Open status and no member, can create a program-owned account there. Lamports sent to the address leave it system-owned, which means open. |
| Gate set after a join (race, accepted) | `set_join_authority` requires `current_members == 0`, so a gate always covers every member. Sent apart from `create_group`, it can fail after a stranger's join, and the group stays open. A client that gates sends create, gate and the creator's join in one transaction. |
| Gate inherited at a freed code | `close_group` closes the `JoinGate` in the same instruction as `GroupConfig`, and `set_join_authority` needs an Open group, so no gate exists once its group is closed. |
| Tally inherited at a freed code (accepted) | `close_group` leaves the join tallies open. A tally that nobody closes carries its count into a later group at the same code, so a member of the new group can show joins made in the old one. The count can only be too high, which makes a join authority refuse an approval that it could give, not give one that it should refuse. `close_join_tally` after `close_group` removes the carry-over. |
| Tally closed then count restarts (accepted) | After `close_group`, anyone can close any tally of the group. A later group at the code then starts that member from 0, and the count can reach a value that an authority stored for the old group. A join authority must not compare a count across group instances. It binds each approval to the instance off chain, for example to the `GroupCreated` event that started the group. |
| Join tally closed while the group lives | `close_join_tally` fails with `GroupNotClosed` whenever this program owns the group address, in every status, so a member cannot reset the count of a live group. The tally seeds pin `group_config`, so the caller cannot pass another address. |
| Join authority key stolen or lost (accepted) | The key can only allow joins: with it, a stranger can join a gated group, and no funds move. Without it, the group takes no new member, and members can still leave and the creator can still cancel. |
| Co-signed join widened by the client | The authority signs the whole message, so a client could add joins for other wallets. The backend that holds the authority checks that a message holds exactly one join for the approved member, that its `expected_joins` argument is `Some` of the count stored at approval, and that the instruction has exactly the accounts of the current IDL. It signs over a recent blockhash only. Without the argument check, a client picks the count that the program compares. |
| One approval co-signed twice | Two co-signed messages for one approval could both land, with a leave between them. A gated join must name `expected_joins`, and the program refuses it unless the tally holds that count (`ExpectedJoinsRequired`, `JoinCountMismatch`). The first join raises the count, so a second message signed for the same count fails. |
| Approval replayed in a later group at the same code | Nothing in a join names the group instance, so a held approval could join a later group at the same code that uses the same authority. `join_group` rejects a gated join whose transaction starts with `AdvanceNonceAccount` (`DurableNonceNotAllowed`), so an approval lives at most about 150 slots. Within that time a replay needs the creator to cancel an empty group, close it and create the same code again: the creator's own group. `expected_terms` (below) also makes the replay fail unless the new group has the same terms. |
| Join signed for one group lands in another | A creator shows an Open, empty group, then cancels it, closes it and creates the same code on other terms, such as a larger deposit or a harsher penalty, before a member's signed join lands. Since anyone can create a freed code, another wallet can also recreate it on the same money terms, so the terms name the creator too. An ungated join may also be held over a durable nonce. `join_group` takes the terms the member was shown as `expected_terms` and fails with `TermsMismatch` unless the group has them, so the member never joins on terms they did not see. |
| Rent rate increase blocks settlement | The runtime rejects a transaction that adds lamports to an account and leaves it below the rent-exempt minimum. Settlement adds the vault rent to `GroupConfig`. If the rent rate rose so far after `create_group` that `GroupConfig` rent plus vault rent is below the new minimum for 180 bytes (about 1.95 times the old rate), `distribute` and `emergency_cancel` fail with `InsufficientFundsForRent`. Any wallet can fix it: transfer the missing lamports to the `GroupConfig` address, then settle. `refund_vault_rent` later pays the surplus to the rent payer. |
| Rounding dust in distribution | Final member receives vault remainder (`vault_balance - sum_of_previous_payouts`) instead of calculated amount, ensuring zero residual. |

### Instruction Security Matrix

| Instruction | Who can call | Fund movement | Status required | Key validation |
|-------------|-------------|---------------|-----------------|----------------|
| `create_group` | Anyone (creator signs, `rent_payer` signs and pays rent) | None | N/A (creates new) | Group code format, param ranges, supported mint |
| `join_group` | Anyone (becomes member; `rent_payer` signs and pays the record rent, and the tally rent at the first join) | Member -> Vault | Open | Group not full, valid mint, member's canonical ATA, tally seeds |
| `start_cycle` | Creator only | None | Open | `creator == signer`, members >= 2 |
| `deposit` | Members only | Member -> Vault | Active | Valid MemberRecord, correct period, not already deposited |
| `distribute` | Anyone | Vault -> All Members + Treasury. Vault rent -> GroupConfig | Active (cycle ended) | All member records present, cycle time elapsed |
| `emergency_cancel` | Creator only | Vault -> All Members (each gets `total_deposited` back). Vault rent -> GroupConfig. With no members: vault balance burned | Open or Active | `creator == signer` |
| `withdraw_fees` | `FEE_RECIPIENT` only | Treasury -> Recipient | N/A (no group) | `recipient == FEE_RECIPIENT`, treasury balance > 0 |
| `init_treasury` | `FEE_RECIPIENT` only | None (signer pays ATA rent) | N/A (no group) | `fee_recipient == FEE_RECIPIENT` |
| `refund_vault_rent` | Anyone | Lamports only: GroupConfig surplus -> `group_config.rent_payer` | Completed or Cancelled | `rent_payer == group_config.rent_payer` |
| `close_member_record` | Anyone | Lamports only: MemberRecord rent -> `member_record.rent_payer` | Completed or Cancelled, and 30 days since `settled_at` | Canonical record PDA for the group, `rent_payer == member_record.rent_payer` |
| `leave_group` | The member only | Vault -> a token account the member owns (`total_deposited`). MemberRecord rent -> `member_record.rent_payer` | Open | Member signs, canonical record PDA for the group and the signer, destination owned by the signer, `rent_payer == member_record.rent_payer` |
| `close_join_tally` | Anyone | Lamports only: JoinTally rent -> `join_tally.rent_payer` | No program-owned account at the group address (after `close_group`) | Tally seeds from `group_config` and the `member` argument, `rent_payer == join_tally.rent_payer` |

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
    pub mint: InterfaceAccount<'info, Mint>,
    
    pub token_program: Interface<'info, TokenInterface>,
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

Once a deployment is considered final, the program's upgrade authority should be explicitly set to `None`. This demonstrates that no individual can modify the program after deployment — the same property that makes Bitcoin's rules credible.

```bash
solana program set-upgrade-authority <PROGRAM_ID> --final
```

For development iterations, keep upgrade authority until final deployment. Document this in the README.

**This step is irreversible, and it is deliberately deferred.** See [ADR-0001](./docs/adr/0001-defer-program-immutability-to-multisig.md): mainnet upgrade authority goes to a 2-of-3 Squads multisig first, and `--final` runs only after issue #20 closes, an external review of `distribute` and `emergency_cancel` lands, and a soak period on mainnet elapses. `--final` makes the deployed bytecode permanently unpatchable: no bug fix, no migration, no recovery. Two facts bear on its timing, recorded here rather than left implicit:

- **SafeNudge has a second consumer.** SafePool (private repository, same author) is a separate product built on this program, reused unchanged — same instruction set, same PDA seeds, same IDL. Its own mainnet cutover routes real BRL-stablecoin funds through this program, and is blocked on [issue #20](https://github.com/davigiroux/safenudge.xyz/issues/20). SafePool's `docs/adr/0002-safenudge-safepool-boundary.md` holds the boundary contract between the two repositories, including how its pinned copy of the IDL tracks this one.
- **No third-party audit has been performed or scheduled.** CI runs `cargo audit` and `npm audit` as advisory dependency scans; neither reviews this program's logic.

Locking immutability on an unaudited program that real money moves through is a tradeoff, not a formality. A multisig removes the single-key risk without removing the patch path; immutability removes both. Take them in that order.

---

*SafeNudge Architecture v1.1 (Security-First) — Davi Giroux — April 2026*
