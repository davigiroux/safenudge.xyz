---
status: accepted
date: 2026-10-10
---

# A join gate in its own account, and one account type per group type

Anyone who knows a group code can join an Open group today. The code is
short and public, and after `close_group` a code can belong to a new
group (ADR-0002), so an old invite link can lead to strangers. A stranger
in a group takes a seat, and the creator can only cancel the whole group
to get it back. SafePool wants its creators to approve every join, either
by a request in the app or by an email allowlist. Both checks need data
that lives off chain, in SafePool's backend.

A sponsor already co-signs SafePool joins as `rent_payer`, but the program
does not require that signature: a wallet with some SOL can pay its own
rent and join with the code alone. Only a check in the program closes that
path.

A yield product is also planned. One of its shapes puts the group vault
into a yield position, which needs new state and new instructions. How the program grows per group must be decided before
either feature lands, because a new field in `GroupConfig` changes its
layout, and that upgrade needs every live group settled first
("Upgrades that change an account layout").

## Decision

**Group types.** `GroupConfig` is the account of a simple group, and its
layout does not change for new features. A group with different rules,
such as a yield group, gets its own account type with its own discriminator
and its own instructions. It does not get a mode field in `GroupConfig`.
Every instruction takes `Account<GroupConfig>` or the other type, so a
simple instruction rejects a yield group by discriminator, and the reverse.
Logic that both use, such as penalty math and member checks, moves into
plain functions, as `validate_member_pair` is today.

**Optional features of a simple group live in their own account at a fixed
PDA.** The account exists or it does not, and an instruction that depends
on it always receives its address.

**Join gate.**

- `JoinGate`, PDA `["join", group_config]`, holds `authority`. It has its
  own discriminator.
- `set_join_authority` creates it. The creator signs, the group is Open
  with `current_members == 0`, and the group's `rent_payer` signs and pays
  the rent. It runs once per group. There is no instruction to change or
  remove the authority.
- `join_group` always receives the `["join", group_config]` address. When a
  `JoinGate` exists there, the join also needs the signature of
  `authority`. When nothing exists there, the group is open, as today.
  Only this program can create a program-owned account at that address,
  and only through `set_join_authority`.
- `close_group` also closes the `JoinGate`, to the group's `rent_payer`.
  A group at a freed code gets the same `["join", group_config]` address,
  so a gate left behind would gate the new group with the old authority.
- `leave_group` needs no authority. A member can always leave an Open
  group.

The program does not know about emails, requests or Privy. SafePool sets
the authority of every group to a key that its backend holds, and the
backend co-signs a join only after the creator approves it.

## Considered options

- **Emails or email hashes on chain.** The chain is public, and hashes of
  emails are easy to guess. Emails are also a SafePool choice that the
  program must not depend on.
- **Join requests in the program**, with the first deposit held until the
  creator approves. Two new instructions and a new place where funds wait,
  all under the Drift checklist, and the creator signs every approval.
- **`join_authority` as a field in `GroupConfig`.** Simplest code, but a
  layout change: every live group settles before the upgrade, and the
  yield type would repeat that cost later.
- **A secret in the invite link.** Stops guessed codes and old links, but
  anyone who gets the link can join, so it gives no approval.
- **Yield as a mode of `GroupConfig`.** Every simple instruction would need
  a branch for the mode, and the rule that vault funds go only to members
  would gain an exception inside the same code that simple groups run.

## Consequences

- No layout change. The upgrade can land while groups are live.
- `join_group` and `close_group` take one more account. Clients repin the
  IDL and pass it. An Anchor client derives it from the IDL seeds.
- An authority key can only allow joins. If someone steals it, strangers
  can join gated groups, and no funds move. If it is lost, gated groups
  take no new members, and members can still leave and the creator can
  still cancel.
- A gated group's creator also needs the authority to sign their own join.
  SafePool creates, gates and joins the creator in one transaction.
- The yield type, when its shape is chosen, adds code and accounts
  only. It needs no settled groups.
