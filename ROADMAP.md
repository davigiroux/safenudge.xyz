# SafeNudge — Roadmap

This file tracks what's done, what's in flight, and what's next. The product vision, market sizing, and revenue model live in [CONCEPT.md](./CONCEPT.md). The technical specification (account layouts, instruction interfaces, PDA seeds) lives in [ARCHITECTURE.md](./ARCHITECTURE.md). This file is the operational view.

Status is updated at the start of each weekly review (see issue tracker, label `review`).

---

## Release roadmap

### MVP (May 2026) · in flight

The minimum viable product: a complete savings-group lifecycle on devnet with bilingual UI.

- [x] Anchor program: `create_group`, `join_group`, `start_cycle`, `deposit`, `distribute`, `emergency_cancel` (Phase 1 + Phase 2 of the task breakdown below)
- [x] React frontend with wallet-adapter (Phantom / Solflare)
- [x] PT-BR and EN bilingual UI via i18next
- [x] Landing page, Como Funciona explainer, Create Group, Join Group, Group Dashboard, My Groups
- [x] Distribute / emergency_cancel hardened against fund-drain attacks (PR #12)
- [x] GroupDashboard reads real member records from chain via `useGroupMembers`
- [x] CI pipeline: anchor build/test, tsc, security-lint, i18n drift + audits (`.github/workflows/ci.yml`)
- [x] README with setup instructions and devnet demo link
- [ ] Ramp Network widget for Pix → USDC on-ramp (still a placeholder button in `JoinGroup.tsx`)
- [ ] Devnet deployment finalized — program live at `88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB`; upgrade authority not yet locked via `set-upgrade-authority --final`

### v1.1 — Protocol fee · shipped (devnet)

Adds the v1 revenue stream so the protocol can sustain itself without yield infrastructure.

- [x] 5% protocol fee on the penalty pool, charged at `distribute` time (skipped, not trapped, while `FEE_RECIPIENT` is the placeholder — issue #44 H-4)
- [x] PDA-controlled treasury USDC token account at seeds `[b"treasury"]`, created via one-shot `init_treasury` (issue #44 H-3)
- [x] `withdraw_fees` instruction restricted to a compile-time `FEE_RECIPIENT`, gated per cluster via cargo features
- [x] Fee disclosure in landing copy and Como Funciona, replacing the prior "zero fees" framing
- [ ] Mainnet `FEE_RECIPIENT` real pubkey + multisig migration + cluster-gated `declare_id!` — tracked in issue #20

### v2 — Yield Integration

Routes pooled USDC to a lending protocol while cycles are active. Yield is layered on top of the redistribution mechanic, not in place of it.

- Kamino K-Lend (or comparable) integration during active cycles
- Yield earned during a cycle is redistributed as a bonus to compliant members
- Members who miss deposits forfeit their share of yield (in addition to the existing penalty)
- 10–15% performance fee on yield as the primary revenue stream
- Premium group subscription tier ($2–5 / month per creator): yield integration access, WhatsApp notifications, larger groups, custom penalty structures
- ARCHITECTURE.md already accounts for this — the vault PDA's self-as-authority pattern can sign CPIs to the yield program without any change to fund-flow primitives

### v3 — Mainstream Onboarding

Targets non-crypto Brazilians who use Pix daily but have never seen a wallet.

- Embedded wallets (Privy, Dynamic, or Phantom Embedded) — no seed phrases, no browser extensions
- Full Pix on-ramp + off-ramp (BRL in, BRL out)
- WhatsApp notifications for deposit reminders and group updates
- The user never knows they're using Solana

### v4 — Game Modes

Variations on the savings-group primitive that target adjacent use cases.

- **Consórcio mode** — rotating pot with bidding or lottery, mirroring the regulated Brazilian consórcio system
- **Challenge mode** — goal-based savings with milestone rewards
- **Streak bonuses** — consecutive on-time deposits earn multipliers on penalty redistribution
- B2B / white-label SDK so Brazilian fintechs can integrate group savings as a feature

---

## Task breakdown (engineering-level)

The original sizing was 18–25 hours total. Numbers below are the original sizing; status reflects the current state of the codebase as of this file's last update.

### Phase 1 — Program Core · ✅ done

1. ✅ Scaffold project — `anchor init`, `Anchor.toml` configured for devnet
2. ✅ Define state — `GroupConfig` and `MemberRecord` with `InitSpace`
3. ✅ `create_group` — PDA creation, validation, vault init
4. ✅ `join_group` — member PDA creation, initial deposit CPI
5. ✅ `start_cycle` — status transition, timestamp capture
6. ✅ `deposit` — period calculation, deposit tracking, CPI transfer
7. ✅ Tests for Phase 1 — happy path + error cases per instruction

### Phase 2 — Distribution & Cancel · ✅ done

8. ✅ `distribute` — penalty calculation, redistribution logic, vault drain, PDA signer
9. ✅ `emergency_cancel` — pro-rata refund, vault drain
10. ✅ Distribution tests — fixed / percentage penalties, partial compliance, all compliant, all missed (refund), cap at total deposited
11. ✅ Hardened against C1/C2/C3/H1 from issue #11 — canonical-PDA + ATA-owner + uniqueness validation, pro-rata refund when nobody is compliant
12. ✅ Edge case tests — 2-member and full 10-member (max size) distribution both covered

### Phase 3 — Frontend · ⚠️ partial

13. ✅ Scaffold frontend — Vite + React + TypeScript, wallet-adapter, Anchor client
14. ✅ Create Group page — form, validation, instruction call
15. ✅ Join Group page — group preview, join + deposit flow
16. ✅ Group Dashboard — actions wired, member list shows live on-chain members via useGroupMembers
17. ⚠️ Ramp integration — placeholder `alert()` only (issue #11 M4)
18. ✅ i18n setup — PT-BR + EN translations
19. ⚠️ Misleading 12% yield projection in CreateGroup (issue #11 M11)

### Phase 4 — Polish & Deploy · ⚠️ partial

20. ✅ CI workflow — `.github/workflows/ci.yml` (program build/test, frontend tsc/build, security-lint, i18n drift check)
21. ⚠️ Devnet deployment — program live at `88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB`; `set-upgrade-authority --final` still pending
22. ⚠️ End-to-end testing on devnet — pending
23. ✅ README — present with setup + demo instructions

### Phase 5 — Revenue (v1.1) · ✅ shipped

24. ✅ Protocol fee constants and treasury PDA (`PROTOCOL_FEE_BPS`, `[b"treasury"]`, `FEE_RECIPIENT`)
25. ✅ `withdraw_fees` instruction with hardcoded recipient validation
26. ✅ `distribute` honours fee, with regression tests asserting fee = 0 in the all-compliant and all-non-compliant branches
27. ✅ Frontend disclosure copy in CONCEPT.md, Como Funciona, CreateGroup, GroupDashboard

---

## Open issues feeding this roadmap

Cross-references for everything currently in flight:

| Area | Status | Tracking |
|------|--------|----------|
| Vault-drain hardening | shipped | PR #12 |
| Weekly-review HIGHs (H-1 overflow brick, H-2 error variant, H-3 treasury rent-grief, H-4 fee black hole) | shipped | issue #44 → PR #45 |
| Protocol fee, treasury, `init_treasury`, `withdraw_fees` (v1.1) | shipped | PR #45 |
| Frontend deps drift, i18n error map + drift gate, cluster guard, chain-time period | shipped | PR #45 |
| CI pipeline (program / frontend / security-lint / i18n) | shipped | `.github/workflows/ci.yml` |
| Mainnet `FEE_RECIPIENT` + multisig + cluster-gated `declare_id!` | open | issue #20 |
| Weekly review automation (rolling findings) | ongoing | issues labelled `review` (latest #46) |

When a PR merges, the corresponding row should reflect `shipped` — keeping this table short and high-signal beats letting it grow into a changelog.

---

*Last updated: see `git log -- ROADMAP.md`.*
