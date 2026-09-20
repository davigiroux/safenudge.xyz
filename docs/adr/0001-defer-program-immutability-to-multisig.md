---
status: accepted
date: 2026-09-17
---

# Multisig upgrade authority now, immutability later

SafeNudge's stated posture is that no individual can modify the program
after deployment — `solana program set-upgrade-authority <PROGRAM_ID>
--final`, which sets the authority to `None` permanently. That is still
the destination. This ADR records that we do not run it at the mainnet
deploy, and hold the authority on a Squads multisig until a set of
conditions is met.

Three facts changed the timing. SafePool (`davigiroux/safepool`,
private, same author) is now a second product on this program, reused
unchanged, and its cutover routes real BRS — a BRL stablecoin with no
sandbox on Hodle's side, so first use is production use. No third-party
audit has been performed or scheduled; CI's `cargo audit` and `npm
audit` are advisory dependency scans and do not review this program's
logic. And the mainnet build still carries a placeholder `FEE_RECIPIENT`
(`Pubkey::default()`), with `declare_id!` not yet cluster-gated, both
tracked in issue #20.

`--final` is a one-way door, and it is wider than it looks. The program
ID is the seed prefix for every PDA — `["group", code]`, `["member",
group, member]`, `["vault", group]`, `["treasury"]`. A fix that cannot
be shipped as an upgrade must be deployed at a new program ID, at which
point every derived address moves and every live group, vault, and
treasury balance stays behind under the old, broken code.
`FEE_RECIPIENT` and `PROTOCOL_FEE_BPS` are compile-time constants, so
`--final` also freezes the fee recipient and the 5% rate forever;
finalizing a build that still carries the placeholder would lock the
protocol out of its own revenue. There is no protocol-wide pause — the
only escape hatch is `emergency_cancel`, which is per-group and
creator-only.

The alternative we rejected is holding the authority on a single key,
the posture the program is in today on devnet. While that key exists it
outranks every constraint in this repo: whoever holds it ships a
`distribute` that pays the vault to themselves, and the `has_one`,
`seeds`, and `transfer_checked` guards in the current source are
irrelevant to the code that replaces them. That is the Drift vector, and
it is the one thing our security model has no answer for. A 2-of-3
multisig removes it while keeping a patch path; immutability removes it
by removing the patch path too.

Decision: mainnet upgrade authority goes to a Squads (v4) multisig,
2-of-3. Three keys rather than two because 2-of-3 tolerates one lost key
— 2-of-2, or 2-of-3 with every key on one machine, brick the program the
same way `--final` does, only by accident. Authority is transferred with
Squads' Safe Authority Transfer, which requires both the current holder
and the Squad vault to sign, so a mistyped destination cannot strand the
program. The flow is rehearsed on devnet against the existing devnet
deployment before any mainnet key is involved. Devnet's own authority
moves to a devnet Squad as part of that rehearsal.

The three keys sit under separate custody: one NFC hardware card, one
CLI keypair on the maintainer's workstation, and one offline-generated
backup held on paper offsite, which signs only during recovery. The
property that matters is physical separation, not the devices themselves
— the design fails the moment two keys can be taken in one theft, and a
2-of-3 whose second and third keys both live on the workstation is a
single-key setup wearing a disguise. Hardware custody on the workstation
key is a later upgrade, not a precondition; it is the key on a networked
machine, so it is the one worth improving first. Which key is where, and
where the backup is held, stays out of this repository.

Two assumptions decide whether this design holds at all. First, a
hardware card sold as a multi-card set is one wallet replicated across
the cards, not several signers, so a set contributes exactly one key —
confirmed for the card in use. Second, a key that cannot approve a
Squads proposal cannot hold any of the three slots, backup included,
since a backup key must still be able to sign during recovery.
WalletConnect pairing between the card and the Squads app was verified
on 2026-09-17; signing a proposal is verified as described below.

No disposable Squad is created to test this. The mainnet Squad is
created with all three members, funded with dust, and used to approve a
trivial transfer from each key in turn — all before upgrade authority
moves. Until that transfer, the program's authority still sits on its
original key and nothing is committed. A member that turns out not to
work is then swapped out by the remaining two, which meet the threshold
on their own; that is the reason for verifying inside the real Squad
rather than beside it. The sequence is only safe in this order: prove
every key can approve, then move the authority. Reversing it turns a
non-functioning member into a key that cannot be replaced.

Two gates, not one. This ADR was written about `--final`, and left the
first mainnet deploy implicitly ungated — which reads as permission to
deploy as soon as the constants are filled in. It is not.

The first mainnet deploy waits on sustained application-level testing
against devnet: the full lifecycle driven through the frontend the way a
member would, repeatedly, not a one-off smoke test. The program's own
suite passes 46 tests and has never caught an integration fault, because
it cannot — LiteSVM runs the program in isolation, with no wallet, no
RPC, no frontend and no real token accounts. Every failure mode that has
actually cost time on this project lived in that gap: a lost upgrade
authority, a placeholder fee recipient that breaks nothing visibly, an
RPC dropping a deploy midway. None of those are things a unit test fails
on.

This gate is cheap and the failure it prevents is not. Devnet costs
airdropped SOL and an afternoon; the same bug found on mainnet costs
real BRS belonging to people in a savings group, in a program whose
patch path is a multisig proposal. Deploying earlier buys nothing —
nothing downstream is waiting on a mainnet program except SafePool's own
cutover, which has its own gates.

`--final` runs later, and only when all of: issue #20 closed with a real
`FEE_RECIPIENT` and cluster-gated `declare_id!`; a third-party audit, or
at minimum a paid external review of `distribute` and
`emergency_cancel`, completed and its findings shipped; and a written
soak period on mainnet with real funds elapsed without an upgrade being
needed. Ninety days is the starting proposal for that period. An audit
finding has no remedy after `--final`, so the audit is worth more before
it, not less.

Consequence: README's Security Model overstated the posture and has been
rewritten. Item 1 now scopes itself to what the program actually forbids
(no owner, no admin role, no instruction that moves vault funds to an
arbitrary address, `withdraw_fees` limited to the treasury), and a new
"Upgrade authority — the honest caveat" subsection states plainly that
the six guarantees describe bytecode that is currently replaceable, and
that readers should take them as "no single party can move your money"
rather than "the rules can never change" until `--final` runs.
CLAUDE.md's April 2026 "No upgrade authority" decision row still
describes the destination correctly, but its timing is superseded by
this ADR. SafePool inherits the change: it is no longer building against
a program that will be immutable at its cutover, and should say so on
its side. Execution — creating the Squad, the devnet rehearsal, and the
authority transfer — is tracked in issue #20.
