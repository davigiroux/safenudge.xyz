---
status: accepted
date: 2026-10-21
---

# Simple groups return every deposit, with no penalty and no protocol fee

The program used to charge a member a penalty for each missed deposit,
take 5% of the penalty pool as a protocol fee, and split the rest among
the members who never missed. SafePool, now the program's only client,
decided in its own ADR-0005 that no one should leave a Pool having lost
money for failing the group, and it created every Pool with a penalty of
0. That made the rule depend on one client sending a 0. Any other caller
could still create a group that took principal on mainnet.

Decision:

- **`distribute` pays every member exactly their `total_deposited`.**
  A missed deposit costs no principal. The program still records each
  deposit in `periods_deposited` and `deposits_made`, which clients read
  to show who kept the commitment and to pay SafePool's bonus from its
  own wallet.
- **Penalties are removed from the program.** `GroupConfig` loses
  `penalty_type` and `penalty_value`, `create_group` loses both
  arguments, and `GroupTerms` loses both fields.
- **The protocol fee is removed.** `init_treasury`, `withdraw_fees`,
  `FEE_RECIPIENT` and `PROTOCOL_FEE_BPS` are gone. The fee could only
  come out of penalties. SafePool's revenue comes from outside the
  program, as the BRS float share and the Dux spread, and the Squad
  vault can receive either directly, like any other account.
- **Other rules get their own group type.** A group that forfeits part of
  its yield for missed deposits, as SafePool proposes for Dux Pools, gets
  its own account type and instructions (ADR-0003). It may forfeit yield,
  never principal.

## Considered options

- **Keep penalties and require a penalty of 0 in `create_group`.** Fails
  closed, but keeps dead fields and the whole penalty path in the
  instruction that pays out every vault. Removing the fields costs
  nothing more while the layout is already changing, and nothing at all
  before any mainnet group exists.
- **Keep the program general and enforce the 0 in SafePool's server.**
  Leaves the promise to one client and the penalty and fee code in the
  audit surface for no use. SafePool should still reject a nonzero
  penalty while it talks to an older program; after this upgrade the
  field no longer exists.
- **Keep the fee instructions for a future group type.** A Dux Pool would
  add its own fee path if it ever needed one, with its own destination.
  ADR-0005 on the SafePool side charges no fee there.

## Consequences

- `distribute` and `emergency_cancel` now move the same amounts. They
  differ only in who may call them and when.
- The penalty math, its u128 overflow guard, the compliant split, the
  rounding dust, the fee-evasion guard and the treasury account all leave
  the audit surface (issue #44 H-1, H-3 and H-4 no longer apply).
- On mainnet the Squad vault ran `init_treasury` for BRS before this
  change. That treasury token account stays open under the old treasury
  PDA, with about 0.002 SOL of rent locked. No instruction can reach it.
- It is a layout and interface change: every live group on a cluster must
  be settled or cancelled before that cluster takes this build, and every
  client repins the IDL (ARCHITECTURE.md, "Upgrades that change an
  account layout").
- The hackathon web app, which offered penalties, was retired in the same
  release.
