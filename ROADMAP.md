# SafeNudge — Roadmap

This file tracks what's done, what's in flight, and what's next. The product vision, market sizing, and revenue model live in [CONCEPT.md](./CONCEPT.md). The technical specification (account layouts, instruction interfaces, PDA seeds) lives in [ARCHITECTURE.md](./ARCHITECTURE.md). This file is the operational view.

Status is updated at the start of each weekly review (see issue tracker, label `review`).

---

## Release roadmap

### MVP — Colosseum Hackathon (May 2026) · in flight

The minimum viable product targets the hackathon submission window.

- [x] Anchor program: `create_group`, `join_group`, `start_cycle`, `deposit`, `distribute`, `emergency_cancel` (Phase 1 + Phase 2 of the task breakdown below)
- [x] React frontend with wallet-adapter (Phantom / Backpack)
- [x] PT-BR and EN bilingual UI via i18next
- [x] Landing page, Como Funciona explainer, Create Group, Join Group, Group Dashboard, My Groups
- [x] Distribute / emergency_cancel hardened against fund-drain attacks (PR #12)
- [ ] Ramp Network widget for Pix → USDC on-ramp (currently a placeholder; tracked under issue #11 M4)
- [ ] GroupDashboard reads real member records from chain (currently mocked; issue #11 M2)
- [ ] CI pipeline: anchor build/test, tsc, security-lint, audits (issue #11 M9)
- [ ] Devnet deployment + post-deploy verification (program upgrade authority finalized via `set-upgrade-authority --final`)
- [ ] README with setup instructions and devnet demo link

### v1.1 — Protocol fee · planned

Adds the v1 revenue stream so the protocol can sustain itself without yield infrastructure.

- 5% protocol fee on the penalty pool, charged at `distribute` time
- PDA-controlled treasury USDC token account
- `withdraw_fees` instruction restricted to a hardcoded founder pubkey
- Fee disclosure in landing copy and Como Funciona, replacing the current "zero fees" framing
- Clear migration path to a Squads / SPL multisig recipient when revenue justifies the operational overhead

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

The original Colosseum estimate was 18–25 hours total. Numbers below are the original sizing; status reflects the current state of the codebase as of this file's last update.

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
12. ⚠️ Edge case tests — 2-member groups present; 10-member groups still missing (issue #11 L8)

### Phase 3 — Frontend · ⚠️ partial

13. ✅ Scaffold frontend — Vite + React + TypeScript, wallet-adapter, Anchor client
14. ✅ Create Group page — form, validation, instruction call
15. ✅ Join Group page — group preview, join + deposit flow
16. ⚠️ Group Dashboard — actions wired, but member list still shows MOCK_MEMBERS (issue #11 M2)
17. ⚠️ Ramp integration — placeholder `alert()` only (issue #11 M4)
18. ✅ i18n setup — PT-BR + EN translations
19. ⚠️ Misleading 12% yield projection in CreateGroup (issue #11 M11)

### Phase 4 — Polish & Deploy · ⚠️ partial

20. ⚠️ CI workflow — pending (issue #11 M9)
21. ⚠️ Devnet deployment — pending
22. ⚠️ End-to-end testing on devnet — pending
23. ⚠️ README — pending

### Phase 5 — Revenue (v1.1) · planned

24. Protocol fee constants and treasury PDA (`PROTOCOL_FEE_BPS`, `[b"treasury"]`, `FEE_RECIPIENT`)
25. `withdraw_fees` instruction with hardcoded recipient validation
26. `distribute` honours fee, with regression tests asserting fee = 0 in the all-compliant and all-non-compliant branches
27. Frontend disclosure copy in CONCEPT.md, Como Funciona, CreateGroup, GroupDashboard

---

## Open issues feeding this roadmap

Cross-references for everything currently in flight:

| Area | Issue | Tracking |
|------|-------|----------|
| Weekly review (master list) | issue #11 | All findings labelled C1–H5, M1–M12, L1–L9 |
| Vault-drain fixes | merged | PR #12 |
| Program dead-state cleanup | in flight | PR A (this batch) |
| CI | in flight | PR B (this batch) |
| Frontend deps drift | in flight | PR C (this batch) |
| Architecture doc + this roadmap | in flight | PR D (this batch) |
| Frontend env / yield disclosure | in flight | PR E (this batch) |
| Real on-chain dashboard data | in flight | PR F (this batch) |
| Frontend UX polish | in flight | PR G (this batch) |
| Protocol fee | in flight | PR H (this batch) |

When a PR merges, the corresponding row should be moved to a "shipped" section of this file — keeping it short and high-signal beats letting it grow into a changelog.

---

*Last updated: see `git log -- ROADMAP.md`.*
