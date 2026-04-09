# CLAUDE.md — SafeNudge

## Project Identity

SafeNudge is a group accountability savings protocol on Solana. Users form savings groups, commit to regular deposits, and face penalties for missed commitments. Penalties are redistributed to consistent members. The protocol targets Brazilian users familiar with informal savings groups (caixinhas).

**Stack:** Anchor/Rust program, React/TypeScript frontend, USDC on Solana devnet.

**Repo structure:**
```
safenudge/
├── programs/safenudge/src/     # Anchor program (Rust)
│   ├── lib.rs                  # Program entry, instruction routing
│   ├── instructions/           # One file per instruction
│   ├── state/                  # Account struct definitions
│   └── errors.rs               # Custom error codes
├── tests/                      # Anchor integration tests (TypeScript)
├── app/                        # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── i18n/               # PT-BR and EN translations
│   │   ├── utils/
│   │   └── idl/                # Auto-generated from anchor build
│   └── vite.config.ts
├── CONCEPT.md                  # Product concept (read-only reference)
├── ARCHITECTURE.md             # Technical architecture (read-only reference)
├── CLAUDE.md                   # This file
└── Anchor.toml
```

Read CONCEPT.md for the product rationale and ARCHITECTURE.md for the full technical spec before making any code changes.

---

## Security Principles

This section is non-negotiable. Every agent, every PR, every code change must comply.

### Why Security is Structural

On April 1, 2026, Drift Protocol on Solana lost $285M in 12 minutes. The attack did not exploit a code bug. It used social engineering, governance hijacking via durable nonces, and a fake token to manipulate oracles. Audits by Trail of Bits and ClawSecure missed it because the vulnerability was operational, not in the smart contract code.

Lesson: security is not just about correct code. It is about correct code + correct constraints + correct operational assumptions + correct validation at every layer.

For SafeNudge, the attack surface is smaller (no oracles, no governance council, no admin keys with upgrade authority), but the principles apply:

1. **No admin backdoors.** The program has no upgrade authority instruction, no admin withdrawal, no owner override. The creator can emergency cancel (returns funds pro-rata), but cannot redirect funds.
2. **PDA authority only.** No human wallet is ever the authority on the vault token account. Only the program's PDA can move funds.
3. **All state transitions are explicit.** Status moves Open -> Active -> Completed/Cancelled. No instruction can skip a state or revert to a prior state.
4. **Penalty math is capped.** A member can never lose more than they deposited. `penalty = min(penalty, member.total_deposited)`.
5. **Distribution is permissionless.** Anyone can trigger distribution after the cycle ends. No single party can hold funds hostage.

### The Drift Checklist

Before any instruction is considered complete, verify against these questions derived from the Drift exploit:

- [ ] Can any signer move funds to an arbitrary address? (Must be NO)
- [ ] Can any instruction be called with pre-signed/durable nonce transactions to bypass timing? (Analyze each instruction for time-sensitivity)
- [ ] Is there any admin/authority key that, if compromised, could drain the vault? (Must be NO — creator can only cancel, which returns funds to members)
- [ ] Can the program accept arbitrary tokens or accounts that could be spoofed? (Must validate mint matches group config)
- [ ] Are all account ownership and PDA derivation checks enforced by Anchor constraints? (Must be YES)
- [ ] Can penalty math overflow or underflow? (Must use checked arithmetic)

---

## Agent Roles

This project uses specialized agent contexts. Each role has a defined scope, rules, and review checklist.

### Agent: Program Engineer

**Scope:** `programs/safenudge/src/` and `tests/`

**Rules:**
- Every instruction MUST follow Checks-Effects-Interactions (CEI) pattern
- Every numeric operation MUST use checked arithmetic (`checked_add`, `checked_mul`, `checked_div`, `checked_sub`). No raw `+`, `-`, `*`, `/` on any `u64` or `i64`
- Every account constraint MUST be explicit — never rely on implicit Anchor behavior. Use `has_one`, `constraint`, `seeds`, `bump` on every account that references another
- Every PDA derivation MUST use the canonical seeds defined in ARCHITECTURE.md. Never invent new seeds without updating ARCHITECTURE.md first
- Token transfers MUST use `transfer_checked` (not `transfer`) to validate mint and decimals
- Every instruction MUST validate `group_config.status` as the first check
- The `distribute` instruction MUST iterate all members deterministically. No early returns that could leave funds stuck
- Never add an instruction that transfers vault funds to an arbitrary address. All transfers go to member token accounts validated against MemberRecord PDAs
- No `UncheckedAccount` except for well-documented cases with explicit safety comments
- Every new instruction MUST have a corresponding negative test (expected failure case)

**Pre-commit checklist:**
```
[ ] anchor build succeeds with no warnings
[ ] anchor test passes all existing tests
[ ] New instruction has >= 1 happy path test
[ ] New instruction has >= 1 error case test
[ ] No raw arithmetic operators on numeric types
[ ] All accounts have explicit constraints
[ ] Status check is the first validation in the instruction
[ ] CEI pattern followed (all checks before any state mutation)
[ ] transfer_checked used (not transfer)
[ ] ARCHITECTURE.md updated if account structure or PDA seeds changed
```

**Forbidden patterns:**
```rust
// NEVER: raw arithmetic
let total = a + b;                    // Use a.checked_add(b).unwrap()

// NEVER: unchecked account without safety comment
pub unchecked: UncheckedAccount<'info> // Must document why this is safe

// NEVER: transfer without mint validation
transfer(ctx, amount)?;              // Use transfer_checked with decimals

// NEVER: hardcoded program IDs inline
let token_program = Pubkey::from_str("Token..."); // Use anchor_spl imports

// NEVER: admin-only fund movement to arbitrary destinations
// All fund movements go to validated member accounts only

// NEVER: mutable global state without status guard
group_config.some_field = x;         // Must check status first
```

### Agent: Frontend Engineer

**Scope:** `app/src/`

**Rules:**
- Never store private keys, seeds, or sensitive data in localStorage, sessionStorage, or any client-side storage
- Never construct transactions manually. Use the Anchor Program client (`program.methods.xxx()`) for all instruction calls
- Always validate that the connected wallet network matches the expected cluster (devnet) before submitting transactions
- All user-facing strings MUST go through i18next `t()` function. No hardcoded PT-BR or EN strings in components
- Every transaction submission MUST have: loading state, error handling with user-readable message, success confirmation
- Never display raw on-chain errors to users. Map program error codes to localized messages
- The Ramp Network API key MUST be in environment variables (`VITE_RAMP_API_KEY`), never committed to the repo
- All token amounts displayed to users MUST be human-readable (divided by decimals, formatted with locale-appropriate separators)
- Never trust URL parameters without validation. Group codes from URL params must be sanitized (alphanumeric + hyphens, max 32 chars)

**Pre-commit checklist:**
```
[ ] tsc --noEmit passes (no type errors)
[ ] vite build succeeds
[ ] No hardcoded strings in components (all through t())
[ ] No sensitive values in committed code
[ ] All transaction calls have loading + error + success states
[ ] Token amounts formatted for display (not raw u64)
[ ] Group code from URL params is sanitized before use
```

**Forbidden patterns:**
```typescript
// NEVER: hardcoded strings
<p>Depositar</p>                     // Use <p>{t('deposit')}</p>

// NEVER: raw BigInt display
<span>{balance}</span>              // Use formatTokenAmount(balance, decimals)

// NEVER: unhandled transaction errors
await program.methods.deposit().rpc(); // Must wrap in try/catch with UI feedback

// NEVER: API keys in code
const key = "ramp_live_xxx";         // Use import.meta.env.VITE_RAMP_API_KEY

// NEVER: trusting URL params
const code = params.code;            // Validate: /^[a-zA-Z0-9-]{1,32}$/.test(code)
```

### Agent: Test Engineer

**Scope:** `tests/`

**Rules:**
- Every instruction MUST have at least one happy path and one failure test
- Penalty calculation tests MUST cover: all members compliant, all members missed, partial compliance, single member, max members (10)
- Distribution tests MUST verify: total out equals total in (conservation of funds), no funds left in vault after distribution, penalty cap at total deposited
- Time-dependent tests MUST use `Clock` manipulation to simulate period advancement
- Tests MUST use separate keypairs for each actor (creator, member1, member2, etc.). Never reuse the provider wallet for member actions
- Test names MUST describe the scenario: `test_deposit_fails_when_cycle_not_started`, not `test_deposit_2`

**Test categories (all required before merge):**

```
UNIT TESTS (program logic):
├── create_group
│   ├── valid params -> group created with correct state
│   ├── invalid frequency -> InvalidFrequency error
│   ├── invalid group size -> InvalidGroupSize error
│   ├── invalid penalty config -> InvalidPenaltyConfig error
│   └── group code too long -> InvalidGroupCode error
├── join_group
│   ├── valid join -> member record created, deposit transferred
│   ├── join when full -> GroupFull error
│   ├── join when cycle active -> InvalidGroupStatus error
│   └── join with insufficient balance -> token transfer fails
├── start_cycle
│   ├── creator starts with 2+ members -> status Active
│   ├── non-creator starts -> UnauthorizedCreator error
│   ├── start with <2 members -> InsufficientMembers error
│   └── start when already active -> InvalidGroupStatus error
├── deposit
│   ├── valid deposit in current period -> tracked correctly
│   ├── double deposit same period -> AlreadyDeposited error
│   ├── deposit after cycle ends -> CycleEnded error
│   └── deposit when cycle not active -> InvalidGroupStatus error
├── distribute
│   ├── all compliant -> each gets exact deposit back
│   ├── one member missed 3 of 4 -> correct penalty calc (fixed)
│   ├── one member missed 3 of 4 -> correct penalty calc (percentage)
│   ├── all missed equally -> penalties cancel out, equal distribution
│   ├── penalty capped at total deposited -> no negative balances
│   ├── distribute before cycle ends -> CycleNotEnded error
│   └── vault empty after distribution -> 0 balance remaining
└── emergency_cancel
    ├── creator cancels during open -> full refund
    ├── creator cancels during active -> full refund
    ├── non-creator cancels -> UnauthorizedCreator error
    └── cancel after completed -> InvalidGroupStatus error

INTEGRATION TESTS (full lifecycle):
├── full cycle: create -> 3 members join -> start -> 4 weekly deposits -> distribute
├── partial compliance: 2 of 3 members deposit consistently, 1 misses half
├── emergency cancel mid-cycle: deposits returned correctly
└── max group (10 members): join + deposit + distribute within account limits
```

**Conservation of funds invariant (MUST be checked in every distribution test):**
```typescript
// After distribute, verify:
// sum(all member payouts) == sum(all deposits made across all periods)
// vault balance == 0
```

### Agent: Security Reviewer

**Scope:** All code, all PRs

**Activation:** Runs as a final check before any merge. Can be invoked manually with "run security review".

**Checklist (every item must pass):**

```
ACCOUNT VALIDATION:
[ ] Every account in every instruction has explicit ownership/constraint checks
[ ] All PDA seeds match ARCHITECTURE.md canonical definitions
[ ] No UncheckedAccount without documented safety justification
[ ] Token accounts validated against expected mint
[ ] Signer constraints on all privileged operations (creator-only, member-only)

ARITHMETIC:
[ ] No raw +, -, *, / on u64/i64/u128 types
[ ] Checked arithmetic used everywhere (checked_add, checked_sub, checked_mul, checked_div)
[ ] Division before multiplication avoided (or explicitly justified)
[ ] Penalty capped at member's total_deposited
[ ] Distribution sum equals vault balance (no rounding dust left behind)

STATE MACHINE:
[ ] Status transitions are one-directional (Open->Active->Completed/Cancelled)
[ ] Every instruction checks status as first validation
[ ] No instruction can revert status to a prior state
[ ] Completed/Cancelled groups cannot accept any further mutations

FUND SAFETY:
[ ] No instruction can send vault funds to an arbitrary address
[ ] All fund recipients are validated MemberRecord holders
[ ] Emergency cancel returns exact deposited amounts (no bonus, no penalty)
[ ] Distribution accounts for all members (member count matches records passed)
[ ] Vault is closed after full distribution (no residual funds)

FRONTRUNNING & TIMING:
[ ] Period calculation is deterministic given a timestamp
[ ] No instruction benefits from being called first/last in a block
[ ] Creator cannot start_cycle and immediately call distribute in same slot
[ ] Cycle end time is computed from on-chain state, not passed as argument

ACCESS CONTROL:
[ ] Only creator can: start_cycle, emergency_cancel
[ ] Only members with valid MemberRecord can: deposit
[ ] Anyone can: distribute (after cycle ends), join_group (during open period)
[ ] No instruction has unrestricted admin powers over funds
```

---

## Git Workflow

### Branch Naming
```
feat/create-group-instruction
feat/join-group-instruction
feat/frontend-group-dashboard
fix/penalty-calculation-overflow
test/distribution-edge-cases
security/account-validation-audit
```

### Commit Messages
```
feat(program): add create_group instruction with validation
feat(program): add join_group with initial deposit CPI
feat(frontend): group dashboard with streak visualization
fix(program): use checked_mul in penalty calculation
test(program): distribution with partial compliance scenarios
security(program): add mint validation to deposit instruction
docs: update ARCHITECTURE.md with revised PDA seeds
```

### PR Requirements

Every PR must include:
1. **What changed** — brief description
2. **Security impact** — "None" or specific analysis
3. **Test coverage** — list of new/modified tests
4. **Checklist** — completed agent checklist for the relevant role

No PR merges without:
- [ ] `anchor build` succeeds
- [ ] `anchor test` passes (all tests, not just new ones)
- [ ] `tsc --noEmit` passes (if frontend changes)
- [ ] Security reviewer checklist completed (if program changes)

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  program:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: coral-xyz/anchor-cli-action@v0.30
      - run: anchor build
      - run: anchor test

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build

  security-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for raw arithmetic
        run: |
          # Fail if any raw arithmetic on u64/i64 in program code
          if grep -rn '[^a-z_]\(+\|-\|\*\|/\)[^/\*>]' programs/safenudge/src/ \
             --include="*.rs" \
             | grep -v 'checked_' \
             | grep -v '//' \
             | grep -v 'test' \
             | grep -v '#\[' \
             | grep -v 'use '; then
            echo "ERROR: Raw arithmetic detected. Use checked_add/sub/mul/div."
            exit 1
          fi
      - name: Check for hardcoded strings in frontend
        run: |
          # Warn if potential hardcoded PT-BR/EN strings in components
          if grep -rn '"Depositar\|"Criar\|"Entrar\|"Create\|"Deposit\|"Join' app/src/components/ \
             app/src/pages/ 2>/dev/null \
             | grep -v 't(' \
             | grep -v 'test' \
             | grep -v '.test.'; then
            echo "WARNING: Possible hardcoded strings found. Use i18n t() function."
            exit 1
          fi
      - name: Check for sensitive values
        run: |
          # Fail if API keys or secrets in committed code
          if grep -rn 'ramp_live_\|sk_live_\|PRIVATE_KEY\|BEGIN RSA' app/src/ programs/ \
             --include="*.ts" --include="*.tsx" --include="*.rs"; then
            echo "ERROR: Sensitive value detected in source code."
            exit 1
          fi
```

---

## Code Style

### Rust (Program)

- Use `rustfmt` defaults
- Imports grouped: std, external crates, anchor, local modules
- One instruction per file in `instructions/`
- One state struct per file in `state/`
- Error variants are descriptive: `InvalidGroupStatus` not `Error1`
- Every public function and struct has a doc comment
- Constants for magic numbers: `const MAX_GROUP_SIZE: u8 = 10;` not inline `10`

### TypeScript (Frontend)

- Strict mode (`"strict": true` in tsconfig)
- Functional components only, no class components
- Hooks for all side effects and state
- Named exports, no default exports (except pages for routing)
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- CSS: Tailwind utility classes only, no custom CSS files

### TypeScript (Tests)

- Descriptive test names following the pattern: `test_[action]_[condition]_[expected_result]`
- Each test is self-contained: creates its own accounts, does not depend on prior test state
- Use `before()` for shared setup (provider, program, mints) only
- Assert specific error codes, not just "it reverted"

---

## Environment Setup

### Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm
avm install latest
avm use latest

# Node.js (for tests and frontend)
nvm install 20
nvm use 20
```

### Project Init

```bash
anchor init safenudge
cd safenudge

# Frontend
npm create vite@latest app -- --template react-ts
cd app && npm install
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
  @solana/wallet-adapter-wallets @solana/web3.js @coral-xyz/anchor \
  @ramp-network/ramp-instant-sdk i18next react-i18next
```

### Environment Variables

```bash
# .env (program — never committed)
ANCHOR_WALLET=~/.config/solana/id.json

# app/.env (frontend — never committed)
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_PROGRAM_ID=<deployed_program_id>
VITE_USDC_MINT=<devnet_usdc_mint>
VITE_RAMP_API_KEY=<ramp_network_api_key>
```

Both `.env` files MUST be in `.gitignore`.

---

## Key Design Decisions Log

Decisions that affect security or architecture. Do not change without explicit discussion.

| Decision | Rationale | Date |
|----------|-----------|------|
| No upgrade authority | Eliminates admin key compromise vector (Drift-style attack) | Apr 2026 |
| PDA-only vault authority | No human can sign vault transfers | Apr 2026 |
| Penalties settled at distribution, not mid-cycle | Simpler program logic, fewer transactions, no mid-cycle fund movement | Apr 2026 |
| Penalty capped at total_deposited | Members cannot owe more than they put in; prevents negative balances | Apr 2026 |
| Group code as PDA seed (on-chain invite) | Zero backend infrastructure; code is public but acceptable for friend groups | Apr 2026 |
| `[bool; 52]` for period tracking over bitmask | Clarity over gas optimization for MVP; max 52 periods covers weekly for a year | Apr 2026 |
| `transfer_checked` over `transfer` | Validates mint and decimals at CPI level; prevents token confusion attacks | Apr 2026 |
| Distribution via remaining accounts (single tx) | Atomic settlement; no partial distribution state. May need per-member claims if 10-member groups hit account limits | Apr 2026 |
| Simplified 30-day months | Acceptable for MVP; real calendar math adds complexity without proportional value | Apr 2026 |

---

## Reference

- **CONCEPT.md** — Product rationale, user stories, roadmap
- **ARCHITECTURE.md** — Account structures, instruction specs, PDA seeds, frontend architecture, task breakdown
- **Anchor docs** — https://www.anchor-lang.com/docs
- **Solana docs** — https://solana.com/docs
- **anchor-escrow-2025** — https://github.com/mikemaccana/anchor-escrow-2025 (reference for CPI + PDA patterns)
- **Drift post-mortem** — Search "Drift Protocol exploit April 2026" for full analysis of what went wrong and why

---

## Quick Commands

```bash
# Build program
anchor build

# Run all tests
anchor test

# Run specific test
anchor test -- --grep "create_group"

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Frontend dev server
cd app && npm run dev

# Frontend type check
cd app && npx tsc --noEmit

# Frontend production build
cd app && npm run build
```
