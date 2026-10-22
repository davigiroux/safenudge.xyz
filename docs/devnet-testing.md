# Devnet Testing

How to deploy SafeNudge to Solana devnet and run an end-to-end rehearsal against it. CI deploy automation is intentionally out of scope.

## 1. Prerequisites

You need these installed locally (versions match the CI matrix; see [.github/workflows/ci.yml](../.github/workflows/ci.yml)):

- Rust (stable)
- Solana CLI `v3.1.10+`
- Anchor CLI `1.0.2` (`avm install 1.0.2 && avm use 1.0.2`). If `anchor --version` still reports an older version, a stale `~/.cargo/bin/anchor` may be shadowing avm — rename it and symlink `~/.avm/bin/anchor` onto your PATH.
- Node 24
- A funded local wallet at `~/.config/solana/id.json` (`solana-keygen new` if you don't have one)

## 2. Deploy the program to devnet

One-time operation. The deploy locks ~2.5 SOL of rent in the ProgramData account (recoverable via `solana program close`, but you'd lose the program). Plan for ~5 SOL working balance to cover the deploy plus transaction fee buffer.

```bash
solana config set --url devnet

# CLI faucet caps single requests at 2 SOL and is heavily rate-limited.
# `solana airdrop 5` will almost always be denied. Use web faucet instead:
#   https://faucet.solana.com  (GitHub auth raises the limit)
# Or chunk via CLI:
solana airdrop 2 && sleep 5 && solana airdrop 2 && sleep 5 && solana airdrop 2
solana balance                  # confirm you have >= 5 SOL

# Anchor 1.0 routes cargo flags through `--`; both deploy + IDL publish happen in one step:
anchor build -- --features devnet     # five-minute periods and record retention
anchor deploy \
  --program-name safenudge \
  --provider.cluster devnet \
  --program-keypair target/deploy/safenudge-keypair.json
```

Anchor 1.0 auto-publishes the IDL during `deploy` (stored in a metadata account owned by the IDL metadata program). The 0.x `anchor idl init` step is no longer needed.

**Verify:**

```bash
solana program show FJYGbzdtS56PZDghiUT42UbgHg4VXh3DLoPehXHY5qKW --url devnet
```

Output should show `Last Deployed Slot` and the program data account. The program ID matches the one in [Anchor.toml](../Anchor.toml).

**Before you upgrade a deployed program to a build that changes an account layout:** close every group, member record and join tally the old binary created, not only settle them, or deploy under a new program ID. On 2026-10-21 the devnet program `GxruFdaF…` held 65 old-layout groups, so the refund-only build went to the new ID `FJYGbzdt…` instead (see "The old deployment" below). The rule and the reason are in [ARCHITECTURE.md, "Upgrades that change an account layout"](../ARCHITECTURE.md#upgrades-that-change-an-account-layout). It applies to every cluster.

## 2b. Redeploying devnet under a new program ID

Needed when the program keypair or the upgrade authority for the current
devnet deployment is lost. Both were lost for `88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB`,
so that program can never be upgraded again — a redeploy under a new ID is
the only way back to an upgradeable devnet.

This is also the rehearsal [ADR-0001](./adr/0001-defer-program-immutability-to-multisig.md)
asks for before any mainnet key is involved: it exercises the full deploy,
authority-transfer and buffer-upgrade flow on a program that does not matter.

### Why two keys go missing together

`anchor deploy` signs with `provider.wallet` from `Anchor.toml`
(`~/.config/solana/id.json`), and that signer becomes the upgrade authority
unless `--upgrade-authority` says otherwise. The program keypair lives at
`target/deploy/safenudge-keypair.json`, which is gitignored **and** wiped by
`cargo clean`. A machine rebuild takes both. Only the second one matters:
the program keypair is used once, at first deploy, while the upgrade
authority is needed for every upgrade after.

### Step 1 — generate a program keypair that survives

```bash
mkdir -p keys
solana-keygen new -o keys/safenudge-devnet.json
```

`keys/` is gitignored. Copy the file and its seed phrase somewhere
off-machine before deploying. Label the backup with the role, not just
the project — a program keypair holds no funds, so restoring it later and
seeing a zero balance looks like the wrong phrase unless the label says
`PROGRAM ID`.

Then put it where `anchor build` looks. The build validates
`target/deploy/safenudge-keypair.json` against `declare_id!` no matter what
`--program-keypair` the deploy is given, so without this copy the build
stops with a program ID mismatch:

```bash
cp keys/safenudge-devnet.json target/deploy/safenudge-keypair.json
``` Anchor will otherwise generate a throwaway
keypair in `target/deploy/` on every build, which is what produces the
`Program ID mismatch` error — resolve that with `anchor build --ignore-keys`,
never with `anchor keys sync`, which rewrites `declare_id!` to the throwaway
key and points the tests and SafePool at a program that does
not exist.

### Step 2 — put the new ID everywhere

`solana-keygen pubkey keys/safenudge-devnet.json` prints the new address.
It appears in seven places; missing one produces a
`DeclaredProgramIdMismatch` at runtime rather than a build failure, so work
the list:

| File | What to change |
|---|---|
| `programs/safenudge/src/lib.rs` | `declare_id!` in the `not(feature = "mainnet")` branch |
| `Anchor.toml` | `[programs.devnet]` **and** `[programs.localnet]` — both, they are the same ID |
| `.github/workflows/ci.yml` | program ID reference |
| `docs/devnet-testing.md` | the verify command in section 2 |
| `ROADMAP.md` | two references |
| `idl/safenudge.json` | regenerated, see below |
| `idl/safenudge-types.ts` | regenerated, see below |

The two IDL files are not hand-edited. Rebuild and copy:

```bash
anchor build --ignore-keys
cp target/idl/safenudge.json idl/safenudge.json
cp target/types/safenudge.ts idl/safenudge-types.ts
```

Check the result with `git diff idl/` — the only change should be
the `address` field. Anything else means the program interface moved, which
is a separate review.

### Step 3 — deploy with the authority set explicitly

```bash
solana config set --url devnet
solana balance                        # need ~3 SOL; ~2.44 goes to ProgramData rent

anchor build -- --features devnet
anchor deploy \
  --program-name safenudge \
  --provider.cluster devnet \
  --program-keypair keys/safenudge-devnet.json
```

If the RPC drops the connection partway — common on
`api.devnet.solana.com` — the SOL is not lost. The partial write sits in a
buffer account you still control. Find it and resume into it rather than
starting over:

```bash
solana program show --buffers          # note the buffer address and balance
solana program deploy target/deploy/safenudge.so \
  --buffer <BUFFER_ADDRESS> \
  --program-id keys/safenudge-devnet.json \
  --url devnet
```

Resuming keeps the chunks already written and costs no extra rent. If you
would rather start clean, `solana program close --buffers` refunds the
buffer balance first.

Verify before doing anything else:

```bash
solana program show <NEW_PROGRAM_ID> --url devnet
```

`Authority` must be a key you hold. If `solana program show` refuses with
"No default signer found", the account is still readable over plain RPC —
`getAccountInfo` on the ProgramData address returns the authority at byte
offset 13, after a 4-byte enum, an 8-byte slot and a 1-byte option tag.

### Step 4 — tell SafePool, in the same window

SafePool (`davigiroux/safepool`, private) pins a copy of this repo's IDL and
targets the devnet program ID. The IDL carries the address in its `address`
field, so a redeploy breaks SafePool's devnet build until it repins. Both
sides should land together rather than weeks apart:

- `app/src/chain/idl/safenudge.json` — repin to the new commit
- its devnet `programId` config — new address

See `docs/adr/0002-safenudge-safepool-boundary.md` on the SafePool side.

### Step 5 — the rehearsal

With an upgrade authority you control, run the Squads flow end to end on
devnet before any mainnet key exists:

1. Create a Squad at https://devnet.squads.so, 2-of-3, dummy SOL.
2. Programs → Add Program, paste the new devnet program ID.
3. Move the authority with **Safe Authority Transfer** — it requires both
   the current holder and the Squad vault to sign, so a mistyped destination
   cannot strand the program.
4. Rehearse one upgrade: `solana program write-buffer`, propose in Squads,
   set the buffer authority to the Squad, approve to threshold, execute.

Step 4 is the part worth doing twice. It is the flow you will run on mainnet
with real funds behind it.

### The old deployment

`88vmqe9y…` keeps ~2.44 SOL of devnet rent locked forever — `solana program
close` needs the upgrade authority. Devnet SOL, so ignore it. The program
stays live and callable; it simply can never be upgraded.

`GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc` runs the build before the
refund-only upgrade (penalties, `snGroup2` layouts). It still owns 65 groups and
152 member records, which the new layouts cannot read, so it was left on its
binary rather than upgraded. Its upgrade authority `2jwEs8aP…` still holds it:
once no one needs those groups, settle and close them with the old binary and
run `solana program close` to recover its ~2.5 SOL of rent.

## 3. Scripted rehearsal of an upgrade

`scripts/rehearse-devnet.ts` drives a devnet build through two paths in about 11 minutes, with
no wallet app. First, a join signed for an empty group fails with `TermsMismatch` after the
creator cancels, closes and creates the code again on other terms. Second, three members join,
two deposit in each 5-minute period and one misses, and `distribute` returns to each member
exactly what they deposited. It creates its own mint. The payer needs about 0.2 SOL.

```bash
anchor build -- --features devnet
npx ts-node -P tsconfig.json scripts/rehearse-devnet.ts \
  --url https://api.devnet.solana.com --payer ~/.config/solana/id.json
```

Each check prints `ok`, and the last line is `rehearsal passed`. With `--url
http://127.0.0.1:8899` it runs against `solana-test-validator`, after a
`solana program deploy` of the same build.

## 4. Troubleshooting

- **Faucet rate-limited:** the CLI faucet caps requests at 2 SOL and refuses busy IPs. Use https://faucet.solana.com with GitHub sign-in.
- **`anchor deploy` fails with `insufficient funds`:** redeploys lock fresh ProgramData rent (~2.5 SOL for our 350KB program). `solana balance` and top up to ~5 SOL working balance.
- **`groupConfig.status` looks stuck:** check the transaction on an explorer. A client reading at `processed` commitment can show a state that never confirmed.

## 5. What's not covered

- Mainnet deploys: see ARCHITECTURE.md, "Mainnet deploy"
- CI deploy automation (planned post-audit; see [ROADMAP.md](../ROADMAP.md))
- Stress testing with the max 10-member group (single-tx distribute may hit account-limit; per-member claim path is the fallback, currently un-implemented)
