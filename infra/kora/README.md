# Kora relay for SafeNudge (devnet)

[Kora](https://github.com/solana-foundation/kora) is the Solana Foundation's fee-payer relay. Here it pays transaction fees and, as the program's `rent_payer`, account rent. A wallet that holds tokens and no SOL can then create a group, join, deposit and settle. Background and test results are in issue #73.

This directory holds the relay config only. The web app calls the relay when `VITE_KORA_URL` is set.

## What the config allows

`kora.devnet.toml` was tested on a local validator against Kora commit `afe5e6b` (2.2.0-beta.8) with the program that has the `rent_payer` signer.

| Request | Result |
|---|---|
| Any SafeNudge instruction, relay as fee payer | signed |
| `create_group` / `join_group` with the relay as `rent_payer` | signed, rent paid by the relay |
| No SafeNudge instruction in the transaction | rejected |
| A program outside the list | rejected |
| A transfer out of the relay signer | rejected |
| A durable-nonce transaction | rejected |
| Rent above `max_allowed_lamports` in one request | rejected |
| No `user_id` in a sign request | rejected (read from source, not run) |
| More than 50 transactions for one `user_id` in an hour | rejected (read from source, not run) |
| No API key, when `KORA_API_KEY` is set | HTTP 401 |

Relay cost per action at the current rent rate: `join_group` 1,493,520 lamports (returned by `close_member_record` 30 days after settlement, or at once by `leave_group`), `create_group` 3,048,000 (the vault half returns through `refund_vault_rent`, the GroupConfig half never does), everything else is the transaction fee.

## Not for mainnet

Kora prints this warning for the config, and it is accurate:

> Fee payer policy allows System CreateAccount instructions. Risk: Users can make the fee payer pay for arbitrary account creations.

`require_one_of_programs` checks that a SafeNudge instruction is present. It does not limit what else the relay pays for in the same transaction, and with free pricing the per-user limits use an identifier the client chooses. An API key shipped to a browser is public. A key holder can take up to `max_allowed_lamports` (about 0.006 SOL) per request. The usage limit caps one `user_id` at 50 transactions an hour (about 0.3 SOL), but the client picks the `user_id`, so a new one per request removes that cap. `rate_limit` (100 requests a second) applies to each connection, not to all clients together; the only shared cap is Kora's limit of 100 open connections, past which it answers 429. The counts live in memory and reset when Kora restarts. On devnet that costs test SOL. On mainnet the relay must not be reachable from the browser: a server-side step builds each sponsored transaction and holds the key (issue #73, decision of 2026-10-05).

Also: stable Kora releases do not have `require_one_of_programs` yet, and the audited commit predates it. Pin the commit below.

## Run it

```bash
# Build the pinned commit
cargo install --git https://github.com/solana-foundation/kora --rev afe5e6b kora-cli

# Check the config
kora --config infra/kora/kora.devnet.toml config validate

# Start. The signer key and the API key come from the environment.
export KORA_SIGNER_KEY=...   # base58 or JSON-array secret key of a devnet-funded wallet
export KORA_API_KEY=...      # any random string; clients send it as x-api-key
kora --config infra/kora/kora.devnet.toml --rpc-url https://api.devnet.solana.com \
  rpc start --signers-config infra/kora/signers.devnet.toml --port 8080
```

Kora listens on `0.0.0.0` and has no host flag. Keep the port off the network: in Docker, publish it as `-p 127.0.0.1:8080:8080`.

Use a wallet created for this purpose. It needs devnet SOL and nothing else: it holds no tokens and has no authority over any SafeNudge account.

## Hosted devnet relay

Phones running a devnet build cannot reach a relay on a developer's machine, so a devnet relay also runs on Railway (project `safenudge-kora-devnet`, service `kora`). `Dockerfile` in this directory builds Kora at the pinned commit with `kora.devnet.toml` and `signers.devnet.toml` baked in, and listens on Railway's `PORT`.

Secrets are Railway variables, never files in this repo:

| Variable | Value |
|---|---|
| `KORA_SIGNER_KEY` | the relay wallet's secret key (a wallet used for nothing else, devnet SOL only) |
| `KORA_API_KEY` | a random string, different from any local relay's key |
| `RPC_URL` | optional; defaults to `https://api.devnet.solana.com` |

Deploy a change to the config or the pinned commit from this directory:

```bash
railway up --service kora --environment production
```

The API key ships inside app builds, so it is public in practice. The section above on mainnet applies: this shape is for devnet only.

## Client sequence

```ts
const call = (method: string, params: unknown) =>
  fetch(KORA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KORA_API_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json())

const relay = new PublicKey((await call('getPayerSigner', {})).result.signer_address)
const { blockhash } = (await call('getBlockhash', {})).result

const ix = await program.methods.joinGroup()
  .accountsPartial({ member, rentPayer: relay, /* ... */ })
  .instruction()
const tx = new Transaction({ feePayer: relay, recentBlockhash: blockhash }).add(ix)
const signed = await wallet.signTransaction(tx)   // the member signs, holding no SOL

const res = await call('signAndSendTransaction', {
  transaction: signed.serialize({ requireAllSignatures: false }).toString('base64'),
  user_id: member.toBase58(),   // required: the usage limit counts per user_id
})
// res.result.signature, or res.error.message with the reason for a rejection
```

Never pass the relay as `creator` or `member`. It is the fee payer and the rent payer only.

## When the rent rate or the layouts change

`max_allowed_lamports` is the rent of one `create_group` with the creator's `join_group` and one token account: `solana rent` of 179, 165, 166 and 165 bytes, added together. The comment above it in `kora.devnet.toml` shows the sum.
