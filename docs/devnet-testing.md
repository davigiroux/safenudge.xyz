# Devnet Testing

How to deploy SafeNudge to Solana devnet and run an end-to-end test with three Phantom wallets. This is the manual smoke test path — CI deploy automation is intentionally out of scope.

## 1. Prerequisites

You need these installed locally (versions match the CI matrix; see [.github/workflows/ci.yml](../.github/workflows/ci.yml)):

- Rust (stable)
- Solana CLI `v3.1.10+`
- Anchor CLI `1.0.2` (`avm install 1.0.2 && avm use 1.0.2`). If `anchor --version` still reports an older version, a stale `~/.cargo/bin/anchor` may be shadowing avm — rename it and symlink `~/.avm/bin/anchor` onto your PATH.
- Node 24
- A funded local wallet at `~/.config/solana/id.json` (`solana-keygen new` if you don't have one)

Three Phantom wallets in a browser — wallet A is the group creator, B and C are members.

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
anchor build -- --features devnet     # resolves FEE_RECIPIENT to FobkDn4… (devnet treasury)
anchor deploy \
  --program-name safenudge \
  --provider.cluster devnet \
  --program-keypair target/deploy/safenudge-keypair.json
```

Anchor 1.0 auto-publishes the IDL during `deploy` (stored in a metadata account owned by the IDL metadata program). The 0.x `anchor idl init` step is no longer needed.

**Verify:**

```bash
solana program show GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc --url devnet
```

Output should show `Last Deployed Slot` and the program data account. The program ID matches the one hardcoded in [app/src/utils/constants.ts](../app/src/utils/constants.ts) and [Anchor.toml](../Anchor.toml).

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
off-machine before deploying. Label the paper copy with the role, not just
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
key and points the frontend, the tests and SafePool at a program that does
not exist.

### Step 2 — put the new ID everywhere

`solana-keygen pubkey keys/safenudge-devnet.json` prints the new address.
It appears in nine places; missing one produces a
`DeclaredProgramIdMismatch` at runtime rather than a build failure, so work
the list:

| File | What to change |
|---|---|
| `programs/safenudge/src/lib.rs` | `declare_id!` in the `not(feature = "mainnet")` branch |
| `Anchor.toml` | `[programs.devnet]` **and** `[programs.localnet]` — both, they are the same ID |
| `app/src/utils/constants.ts` | `SAFENUDGE_DEVNET_PROGRAM_ID` fallback |
| `app/.env.example` | `VITE_PROGRAM_ID` |
| `.github/workflows/ci.yml` | program ID reference |
| `docs/devnet-testing.md` | the verify command in section 2 |
| `ROADMAP.md` | two references |
| `app/src/idl/safenudge.json` | regenerated, see below |
| `app/src/idl/safenudge-types.ts` | regenerated, see below |

The two IDL files are not hand-edited. Rebuild and copy:

```bash
anchor build --ignore-keys
cp target/idl/safenudge.json app/src/idl/safenudge.json
```

Check the result with `git diff app/src/idl/` — the only change should be
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

## 3. Vercel environment variables

Production builds use `requireEnv` (see [app/src/utils/constants.ts](../app/src/utils/constants.ts)) which throws if any `VITE_*` var is missing. Set these in Vercel's project settings under `Environment Variables`, scoped to `Production`, `Preview`, and `Development`:

| Name | Value |
|------|-------|
| `VITE_PROGRAM_ID` | `GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc` |
| `VITE_USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| `VITE_SOLANA_RPC_URL` | `https://api.devnet.solana.com` (or a private RPC URL) |

Redeploy after setting — Vercel doesn't auto-rebuild on env changes alone.

## 4. Fund the test wallets

Each Phantom wallet needs both SOL (for transaction fees) and USDC (for deposits).

**Reference test wallets (devnet, Phantom):**

| Role | Address |
|------|---------|
| A — group creator | `ExnGYk85VVEbsbcXa1kicwQBWWdCxzZ6JXjBNLvmWDh9` |
| B — member | `CWivgpLaACkLXp5infuBFcSt1hXqa9FnfWnrKMARWNZ5` |
| C — member | `BDuRxd1Szo4kDgYodrMGPDXnE52GBwevEhDGn723DvgW` |

**SOL:** open https://faucet.solana.com, paste each wallet address, choose Devnet, request 2 SOL. Repeat for all three wallets.

**USDC:** open https://faucet.circle.com, paste each wallet address, choose Solana Devnet, request 100 USDC. Circle's faucet has a per-wallet rate limit (~1 request per 6 hours); if you need more, see "Troubleshooting" below.

Confirm balances in Phantom before starting the smoke test.

## 5. Smoke test — 3-wallet, single cycle

The full distribute path is already covered by 9 unit tests with on-chain clock manipulation, so this devnet smoke is about proving the deployed program + frontend + Phantom wiring work — not re-validating math. We use emergency cancel as the short path; the optional multi-day distribute test follows.

### Quick path (~5 min) — cancel before cycle end

1. **Open the Vercel preview** (or `npm run dev` locally with Phantom set to devnet)
2. **Wallet A** → connect → `/criar` → create group:
   - code: `smoke-001`
   - frequency: weekly (program supports weekly / biweekly / monthly only — pick the shortest)
   - periods: 4
   - deposit: 5 USDC (Circle faucet caps at 20 USDC/wallet; 5 × 2 commitments leaves a buffer)
   - penalty: 5% / period
   - max members: 4
   - Submit → Phantom signs → status `Aberto`
3. Copy the invite link from `/grupo/smoke-001`. Open in two more browser profiles, connect Wallets B and C, each clicks **Entrar** → deposits 5 USDC. Wallet A must also click **Entrar** (creator ≠ member — `create_group` only sets up the group, you have to join separately to participate).
4. Switch back to Wallet A → **Iniciar ciclo** → status flips to `Ativo`
5. ~~Each of A, B, C deposits in period 0~~ — **skip this step.** `join_group` already marks `periods_deposited[0] = true` (see [join_group.rs:64](../programs/safenudge/src/instructions/join_group.rs)), so clicking Depositar again returns `AlreadyDeposited`. Joining is both registration and the period-0 deposit.
6. Wallet A → scroll to footer → **Encerrar grupo antecipadamente** → review sheet → type `cancelar` → confirm → Phantom signs

**Expected end state:**
- Group status: `Cancelado`
- All three wallets get exactly 5 USDC back (the single join deposit that doubles as period-0). Verify in Phantom.
- Solscan shows vault account closed; no residual funds.
- Treasury (`FobkDn4rY18j5UAhigt5kAGsMyqP8PDxXGMH94TgG2sh`) balance unchanged — cancel never charges the protocol fee.

### Full distribute path (multi-week)

Weekly frequency means a 4-period cycle takes ~4 weeks end-to-end. Run this only when you actually need to validate the distribute UI on real devnet (unit tests already cover the math).

1. Repeat steps 2–4 above with a new group code (e.g. `smoke-002`)
2. Week 0: A, B, C all deposit
3. Week 1: A and B deposit, C skips
4. Week 2: A, B deposit, C skips again
5. Week 3: A, B, C all deposit
6. End of week 4 (cycle end): dashboard shows the distribute summary — click **Fechar e distribuir** → Phantom signs

**Expected:**
- Status flips to `Concluído`
- A and B receive >10×4 = 40 USDC each (base + bonus from C's penalty pool)
- C receives <40 USDC (penalty applied, capped at total deposited)
- Treasury gets 5% of the penalty pool
- Sum of all payouts + fee = sum of all deposits (conservation invariant)

## 6. Troubleshooting

- **Circle faucet rate-limited:** wait 6 hours, or swap to a self-controlled mint (see issue tracker).
- **`anchor deploy` fails with `insufficient funds`:** redeploys lock fresh ProgramData rent (~2.5 SOL for our 350KB program). `solana balance` and top up to ~5 SOL working balance.
- **Frontend says "carteira está na rede errada":** open Phantom → Settings → Developer Settings → Change Network → Devnet.
- **Vercel build fails with `Missing required env var VITE_*`:** the production-strict `requireEnv` is doing its job. Pin the var in Vercel's dashboard.
- **`groupConfig.status` stuck:** check Solscan for the transaction; if it succeeded, hard-refresh the dashboard (state is cached in React hooks until the next refetch).

## 7. What's not covered

- Mainnet deploy (intentionally — protocol has not been audited)
- CI deploy automation (planned post-audit; see [ROADMAP.md](../ROADMAP.md))
- Stress testing with the max 10-member group (single-tx distribute may hit account-limit; per-member claim path is the fallback, currently un-implemented)
- Real Pix on-ramp (the `pixComingSoon` copy is honest — devnet doesn't need it)
