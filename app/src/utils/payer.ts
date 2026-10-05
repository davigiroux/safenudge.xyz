import type { PublicKey } from '@solana/web3.js'
import { KORA_API_KEY, KORA_URL } from './constants'
import { connectRelay, type Relay } from './relay'

/** Who pays the fees and the rent of every transaction in this session. */
export type Payer = { kind: 'wallet' } | ({ kind: 'relay' } & Relay)

let session: Promise<Payer> | null = null

async function resolvePayer(): Promise<Payer> {
  if (!KORA_URL) return { kind: 'wallet' }
  return { kind: 'relay', ...(await connectRelay(KORA_URL, KORA_API_KEY)) }
}

/** Resolves the payer once per session; a failed relay lookup runs again on the next call. */
export function sessionPayer(): Promise<Payer> {
  session ??= resolvePayer().catch((err: unknown) => {
    session = null
    throw err
  })
  return session
}

/** Returns the account that pays for a transaction that `wallet` signs. */
export function payerAddress(payer: Payer, wallet: PublicKey): PublicKey {
  return payer.kind === 'relay' ? payer.address : wallet
}
