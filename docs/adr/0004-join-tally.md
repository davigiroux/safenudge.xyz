---
status: accepted
date: 2026-10-13
---

# A join tally per member and group address

A join authority (ADR-0003) approves each join off chain and then
co-signs it. To approve well it must know whether a wallet already
joined the group. A `MemberRecord` shows a current member, but
`leave_group` closes it, so a wallet that joined and left looks the same
as one that never joined. The authority can then approve the same wallet
again and again, for example for a one-time grant per new member.

The authority could scan the transaction history of the group address
for `MemberJoined` events. A scan depends on an RPC that keeps the full
history, and it is slow for an old group. A wallet can also grief it:
many small transactions that touch the address make the scan page
through all of them to reach the joins. Only state that the program writes at
each join gives an answer in one account read.

## Decision

**Join tally.**

- `JoinTally`, PDA `["tally", group_config, member]`, holds `rent_payer`
  and `joins: u32`. It is 44 bytes with its own discriminator,
  `snTally1`. The address names the group and the member, so the account
  stores neither, and it stores no bump.
- `join_group` takes the tally as its last account, with
  `init_if_needed` and `payer = rent_payer`. The first join of a member
  at a group address creates it, and every join adds one to `joins`. The
  handler writes `rent_payer` only when `joins == 0`. Creation and the
  first increment happen in one instruction, so a stored tally is never
  0, and a rejoin keeps the first payer.
- `leave_group`, `close_member_record` and `close_group` do not touch
  the tally. It counts joins at a group address, not in one group
  instance.
- `close_join_tally(member)` closes one tally and pays its rent to
  `join_tally.rent_payer`. Anyone can call it. It fails with
  `GroupNotClosed` while this program owns the group address, so a tally
  closes only after `close_group`, and only until a new group takes the
  code.
- `join_group` takes `expected_joins: Option<u32>`. When it is given,
  the tally must hold that count before the join, or the join fails with
  `JoinCountMismatch`. A gated join must give it
  (`ExpectedJoinsRequired`). An open group may pass `None`.
- `MemberJoined` gains `joins`, the count after this join.

The authority reads `joins` at offset 40, and an absent tally means 0.
It stores the value when it approves a join, and co-signs only a join
whose `expected_joins` is that value. The first join that lands raises
the count, so every other message signed for the same approval fails on
chain. An off-chain compare at co-sign time could not stop this: two
co-sign requests sent before either join lands read the same count.

The authority must still bind each approval to the group instance it
was made for, and never let it outlive that `GroupConfig` account,
because a stored count means nothing in a later group at the same code.

## Considered options

- **Store the group, the member and the bump in the tally.** 109 bytes
  in place of 44, so more rent at every first join. It would let a
  client find tallies with `memcmp` and save the bump search at close.
  Every reader already knows both keys and derives the address, so the
  fields carry nothing new.
- **Create the tally with a manual `create_account` CPI.** It avoids the
  `init_if_needed` feature, but the handler then branches on the owner,
  signs with the seeds and writes the discriminator by hand. That repeats
  what Anchor does, including the case of an address that already holds
  lamports.
- **Close the tallies inside `close_group`**, passed as remaining
  accounts. A group of 10 members, and every member who left, would add
  that many accounts to a transaction that already carries the group and
  its gate. A member missed in that list stays open anyway, so the
  separate instruction is needed in every case.
- **Reset the count when a new group takes the code.** The program would
  need to tell two group instances at one address apart, and
  `GroupConfig` has no field for that. Adding one is a layout change,
  which ADR-0003 avoids, and a reset breaks the rule that the count only
  grows.

## Consequences

- No layout change of an existing account. The upgrade can land while
  groups are live.
- A sponsor pays 873,760 lamports more at a member's first join at a
  group address (devnet and mainnet rent, 2026-10-13). A rejoin pays the
  record rent only. `close_join_tally` returns the tally rent.
- A join costs 7,745 more compute units when the tally's canonical bump
  is found at the first try, and 1,500 more for each further try. Over
  256 member keys, 6 joins cost more than 15,000 extra, at most 16,745.
  A bump passed by the client would skip the search, but a non-canonical
  bump gives the member a second tally at 0, so the program searches. A
  gated create transaction with a 32-character code is 829 bytes of the
  1,232-byte limit.
- `anchor-lang` now enables `init-if-needed`, for the first time in this
  program. The usual risk is a second initialization that rewrites
  state. Here the payer is the `rent_payer` signer of the join, Anchor
  checks the owner and the discriminator of an existing tally, and the
  handler writes `rent_payer` only at `joins == 0`, which holds only at
  creation. A tally address that already holds lamports works.
- A tally that nobody closes carries its count into a later group at the
  same code. The count is then too high, which makes an authority refuse
  more, not approve more.
- Before this change a join and a leave cost the sponsor no rent, since
  the record rent returns at the leave. Now the tally rent stays locked
  until the group closes and someone sends `close_join_tally`. It is
  paid once per member and group address, not once per join. To close a
  tally, a caller needs the group and the member, which the tally does
  not store. The rent payer has both from the joins it paid for, and
  `MemberJoined` carries both with `rent_payer`.
- After `close_group` anyone can close a tally. A later group at the code
  then starts that member from 0, so the count can return to a value that
  an authority stored for the old group. An authority must not compare
  counts across group instances.
- `join_group` takes one more argument and one more account at the
  end. A client on the previous IDL sends no argument, fails with
  `InstructionDidNotDeserialize`, and must repin the IDL. An Anchor
  client derives the tally from the IDL seeds. `GroupNotClosed` (6032),
  `JoinCountMismatch` (6033) and `ExpectedJoinsRequired` (6034) are new
  error codes.
