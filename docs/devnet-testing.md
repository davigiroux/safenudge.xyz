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
solana program show 88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB --url devnet
```

Output should show `Last Deployed Slot` and the program data account. The program ID matches the one hardcoded in [app/src/utils/constants.ts](../app/src/utils/constants.ts) and [Anchor.toml](../Anchor.toml).

## 3. Vercel environment variables

Production builds use `requireEnv` (see [app/src/utils/constants.ts](../app/src/utils/constants.ts)) which throws if any `VITE_*` var is missing. Set these in Vercel's project settings under `Environment Variables`, scoped to `Production`, `Preview`, and `Development`:

| Name | Value |
|------|-------|
| `VITE_PROGRAM_ID` | `88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB` |
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
