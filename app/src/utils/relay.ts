import { PublicKey, type Transaction } from '@solana/web3.js'

export type RelayErrorKind = 'relayUnavailable' | 'relayRefused'

export class RelayError extends Error {
  readonly kind: RelayErrorKind

  constructor(kind: RelayErrorKind, detail: string) {
    super(`${kind}: ${detail}`)
    this.name = 'RelayError'
    this.kind = kind
  }
}

export type Relay = {
  address: PublicKey
  blockhash: () => Promise<string>
  /** Sends the wallet-signed `tx`; `user` is the wallet, which the relay's per-user limits count against. */
  signAndSend: (tx: Transaction, user: PublicKey) => Promise<string>
}

const REQUEST_TIMEOUT_MS = 15_000
const USAGE_LIMIT_EXCEEDED = -32031

/** Sorts a Kora JSON-RPC error code; -32000..-32019 mean Kora read the request and declined it. */
function kindOfCode(code: unknown): RelayErrorKind {
  if (code === USAGE_LIMIT_EXCEEDED) return 'relayRefused'
  const declined = typeof code === 'number' && code <= -32000 && code >= -32019
  return declined ? 'relayRefused' : 'relayUnavailable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function call(
  url: string,
  apiKey: string | undefined,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new RelayError('relayUnavailable', `HTTP ${response.status}`)
    body = await response.json()
  } catch (err) {
    if (err instanceof RelayError) throw err
    throw new RelayError('relayUnavailable', String(err))
  }
  if (!isRecord(body)) throw new RelayError('relayUnavailable', 'response is not an object')
  if (isRecord(body.error)) throw new RelayError(kindOfCode(body.error.code), String(body.error.message))
  if (!isRecord(body.result)) throw new RelayError('relayUnavailable', 'response has no result')
  return body.result
}

function stringField(result: Record<string, unknown>, field: string): string {
  const value = result[field]
  if (typeof value !== 'string') throw new RelayError('relayUnavailable', `response has no ${field}`)
  return value
}

/** Connects to a Kora relay and reads the address it pays from. */
export async function connectRelay(url: string, apiKey?: string): Promise<Relay> {
  const request = (method: string, params: Record<string, unknown> = {}) => call(url, apiKey, method, params)
  const signer = stringField(await request('getPayerSigner'), 'signer_address')

  return {
    address: new PublicKey(signer),
    blockhash: async () => stringField(await request('getBlockhash'), 'blockhash'),
    signAndSend: async (tx, user) => {
      const result = await request('signAndSendTransaction', {
        transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
        signer_key: signer,
        user_id: user.toBase58(),
        respond_after: 'sent',
      })
      return stringField(result, 'signature')
    },
  }
}
