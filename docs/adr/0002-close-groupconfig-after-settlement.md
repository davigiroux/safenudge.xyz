---
status: accepted
date: 2026-10-10
---

# Close GroupConfig once a settled group has no member records

`GroupConfig` used to stay open forever. Its PDA, `["group", code]`,
kept the group code taken, and that was the protection against code
reuse: member records derive from `["member", group_config, member]`, so
a new group at the same code has the same `GroupConfig` address and would
accept any record the old group left behind. The cost was the rent of
179 bytes, 2,136,720 lamports, locked for every group. SafePool, the
second consumer of this program, starts a new group every cycle, so it
pays that rent again each cycle.

> Correction, 2026-10-11: 2,136,720 used 6,960 lamports per byte. The
> live rate is 5,080 per byte, so 179 bytes cost 1,559,560 lamports
> (`getMinimumBalanceForRentExemption(179)` on devnet and mainnet). The
> program reads rent from the `Rent` sysvar, and the decision does not
> depend on the figure.

## Decision

- `current_members` counts the open member records of a group for its
  whole life. `join_group` adds one, `leave_group` subtracts one, and
  `close_member_record` now subtracts one too. Before settlement a seat
  and a record are the same thing, so the field keeps its meaning there.
- A new permissionless instruction, `close_group`, closes `GroupConfig`
  to `group_config.rent_payer`. It requires status Completed or Cancelled
  and `current_members == 0` (`GroupHasOpenRecords`). The caller chooses
  nothing: the destination is the recorded rent payer, and the amount is
  every lamport in the account, which includes vault rent that
  `refund_vault_rent` did not yet pay.
- With no record left, a group created later at the same code has
  nothing to inherit.

## Considered options

- **Keep GroupConfig open.** Safe and simple, but the rent is lost for
  good on every group.
- **A new count field.** Equivalent safety, but it changes the layout and
  the discriminator of `GroupConfig`. That upgrade needs every live group
  settled first ("Upgrades that change an account layout") and leaves
  every older group unreadable.
- **Reuse one GroupConfig across cycles.** Pays the rent once and keeps
  the invite code, but member records hold per-cycle state. A larger
  change; revisit if renewals dominate.

## Consequences

- No layout change, so the upgrade can land while groups are live.
- A record closed before this upgrade did not decrement
  `current_members`. Such a group can only count too many records, never
  too few, so `close_group` keeps failing for it and it stays open as
  before. Fails closed.
- The member count of a settled group drops as records close after the
  30-day retention. A client that shows the result of a settled group
  must read it before then, as it already must for member records.
- A closed code can be created again by anyone. An invite link that
  named the code then opens a different group. Funds stay safe, because
  every deposit is paid back under the group's own rules, but a user can
  join a group of strangers. The code frees at least 30 days after
  settlement. Clients should not hand out a code twice, and should show
  who created a group before a join.
- A group at a freed code has the same `GroupConfig`, vault and member
  record addresses as the closed one. Indexers and clients that key
  history on the group address must also key on the `GroupCreated` event
  that started it.
- The count is a convention across instructions, not a type. Any new
  instruction that creates or closes a member record must change
  `current_members` in the same instruction.
- `close_member_record` now writes `GroupConfig`, so a client must mark
  it writable. Clients repin the IDL to call `close_group`.
