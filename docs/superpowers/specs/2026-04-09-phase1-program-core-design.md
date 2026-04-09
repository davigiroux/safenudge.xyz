# Phase 1: Program Core — Design Spec

## Scope

Scaffold Anchor project, define state accounts, implement 4 instructions, write integration tests. This is the foundation — no distribution, no cancellation, no frontend.

## References

- ARCHITECTURE.md: full account structures, instruction specs, PDA seeds
- CLAUDE.md: security rules, agent checklists, forbidden patterns
- CONCEPT.md: product rationale

## Deviations from ARCHITECTURE.md

Three additions identified during design review:

1. **`group_code` field on GroupConfig** — ARCHITECTURE.md omits this from the struct but references it in constraint templates. Add `#[max_len(32)] pub group_code: String` to GroupConfig. Adds 36 bytes (4 len prefix + 32 chars) to account space.

2. **`ArithmeticOverflow` error** — Referenced in checked arithmetic convention but missing from error enum. Add it.

3. **`InvalidDepositAmount` error** — Needed for `deposit_amount == 0` validation in `create_group`.

## Period Semantics

- `join_group` counts as period 0 deposit. Sets `periods_deposited[0] = true`, `deposits_made = 1`, `total_deposited = deposit_amount`.
- `start_cycle` captures `cycle_start = Clock::get().unix_timestamp`, sets `current_period = 0`.
- `deposit` handles periods 1 through `total_periods - 1`. Current period derived from elapsed time since `cycle_start`.

## Account Structures

### GroupConfig

```
Seeds: [b"group", group_code.as_bytes()]
Space: 8 (discriminator) + 4 + 32 (group_code) + 32 + 32 + 8 + 1 + 1 + 1 + 1 + 1 + 8 + 1 + 8 + 1 + 1 = 140
```

Fields per ARCHITECTURE.md + `group_code: String`.

### MemberRecord

```
Seeds: [b"member", group_config.key().as_ref(), member.key().as_ref()]
Space: 8 + 32 + 32 + 8 + 1 + 52 + 1 + 1 = 135
```

Fields per ARCHITECTURE.md, no changes.

### Vault

Standard SPL Token Account owned by vault authority PDA.

```
Seeds (authority): [b"vault", group_config.key().as_ref()]
```

## Instructions (Phase 1)

### create_group

- Signer: creator (pays rent)
- Creates GroupConfig PDA + vault token account
- Validates: deposit_amount > 0, frequency in [0,1,2], total_periods in [1,52], max_members in [2,10], penalty_type in [0,1], penalty_value <= 5000 if percentage, group_code format (1-32 chars, alphanumeric + hyphens)
- Sets status = 0 (Open)

### join_group

- Signer: member
- Creates MemberRecord PDA
- Transfers deposit_amount from member to vault via `transfer_checked`
- Increments group_config.current_members
- Validates: status == Open, current_members < max_members
- Sets periods_deposited[0] = true, deposits_made = 1

### start_cycle

- Signer: creator (must match group_config.creator)
- Validates: status == Open, current_members >= 2
- Sets status = 1 (Active), cycle_start = Clock timestamp, current_period = 0

### deposit

- Signer: member (must match member_record.member)
- Calculates current period from elapsed time + frequency
- Validates: status == Active, cycle not ended, period not already deposited
- Transfers deposit_amount from member to vault via `transfer_checked`
- Updates member_record tracking fields

## Security Constraints

All per CLAUDE.md Program Engineer rules:
- CEI pattern on every instruction
- Checked arithmetic only (no raw +, -, *, /)
- Explicit account constraints (has_one, seeds, bump, constraint)
- transfer_checked (not transfer)
- Status check as first validation
- PDA-only vault authority

## Tests

Per CLAUDE.md test matrix, Phase 1 subset:

### create_group
- valid params -> group created with correct state
- invalid frequency -> InvalidFrequency
- invalid group size -> InvalidGroupSize
- invalid penalty config -> InvalidPenaltyConfig
- group code too long -> InvalidGroupCode

### join_group
- valid join -> member record created, deposit transferred
- join when full -> GroupFull
- join when cycle active -> InvalidGroupStatus

### start_cycle
- creator starts with 2+ members -> status Active
- non-creator starts -> UnauthorizedCreator
- start with <2 members -> InsufficientMembers
- start when already active -> InvalidGroupStatus

### deposit
- valid deposit in current period -> tracked correctly
- double deposit same period -> AlreadyDeposited
- deposit when cycle not active -> InvalidGroupStatus

## Out of Scope

- `distribute` instruction (Phase 2)
- `emergency_cancel` instruction (Phase 2)
- Frontend (Phase 3)
- Yield integration (v2)
