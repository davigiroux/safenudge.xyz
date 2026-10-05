# Kora relay for SafeNudge (devnet)

[Kora](https://github.com/solana-foundation/kora) is the Solana Foundation's fee-payer relay. Here it pays transaction fees and, as the program's `rent_payer`, account rent. A wallet that holds tokens and no SOL can then create a group, join, deposit and settle. Background and test results are in issue #73.

This directory holds the relay config only. The app does not call the relay yet.

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
| No API key, when `KORA_API_KEY` is set | HTTP 401 |

Relay cost per action at the current rent rate: `join_group` 1,493,520 lamports (returned by `close_member_record` 30 days after settlement, or at once by `leave_group`), `create_group` 3,048,000 (the vault half returns through `refund_vault_rent`, the GroupConfig half never does), everything else is the transaction fee.

## Not for mainnet

Kora prints this warning for the config, and it is accurate:

> Fee payer policy allows System CreateAccount instructions. Risk: Users can make the fee payer pay for arbitrary account creations.

`require_one_of_programs` checks that a SafeNudge instruction is present. It does not limit what else the relay pays for in the same transaction, and with free pricing the per-user limits use an identifier the client chooses. An API key shipped to a browser is public. On devnet that costs test SOL. On mainnet the relay must not be reachable from the browser: a server-side step builds each sponsored transaction and holds the key (issue #73, decision of 2026-10-05).

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

Use a wallet created for this purpose. It needs devnet SOL and nothing else: it holds no tokens and has no authority over any SafeNudge account.

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
})
// res.result.signature, or res.error.message with the reason for a rejection
```

Never pass the relay as `creator` or `member`. It is the fee payer and the rent payer only.

## When the rent rate or the layouts change

`max_allowed_lamports` is the rent of one `create_group`. Recompute it from `solana rent 179` plus `solana rent 165`.
