/**
 * Classify a thrown transaction error into a stable kind so the UI can
 * pick the right i18n string and avoid showing a misleading title
 * (e.g. "Saldo insuficiente" for a BlockhashNotFound RPC blip).
 */

import type { TransactionError } from '@solana/web3.js'
import idl from '../idl/safenudge.json'
import { RelayError, type RelayErrorKind } from './relay'

const ANCHOR_ACCOUNT_NOT_INITIALIZED = 3012

const PROGRAM_ERROR_NAMES = new Map<number, string>([
  ...idl.errors.map((e): [number, string] => [e.code, e.name]),
  [ANCHOR_ACCOUNT_NOT_INITIALIZED, 'AccountNotInitialized'],
])

export class TxConfirmError extends Error {
  readonly txError: TransactionError

  constructor(txError: TransactionError) {
    super('Transaction failed on-chain')
    this.name = 'TxConfirmError'
    this.txError = txError
  }
}

/** Reads the code out of `{ InstructionError: [index, { Custom: code }] }`. */
function customErrorCode(txError: TransactionError): number | undefined {
  if (typeof txError !== 'object' || !('InstructionError' in txError)) return undefined
  const detail = (txError.InstructionError as unknown[])[1]
  if (typeof detail !== 'object' || detail === null || !('Custom' in detail)) return undefined
  return typeof detail.Custom === 'number' ? detail.Custom : undefined
}

export type TxErrorKind =
  | 'blockhashExpired'
  | 'insufficientBalance'
  | 'userRejected'
  | 'simulationFailed'
  | 'programError'
  | RelayErrorKind
  | 'unknown'

export type ClassifiedTxError = {
  kind: TxErrorKind
  /** Anchor program error name, when kind === 'programError'. */
  programCode?: string
  /** Raw underlying message, for secondary display / debug. */
  raw?: string
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function classifyTxError(err: unknown): ClassifiedTxError {
  if (err instanceof TxConfirmError) {
    const code = customErrorCode(err.txError)
    const programCode = code === undefined ? undefined : PROGRAM_ERROR_NAMES.get(code)
    return programCode ? { kind: 'programError', programCode } : { kind: 'unknown' }
  }

  if (err instanceof RelayError) return { kind: err.kind }

  const raw = extractMessage(err)

  if (/BlockhashNotFound|blockhash not found/i.test(raw)) {
    return { kind: 'blockhashExpired', raw }
  }
  if (/insufficient (lamports|funds)/i.test(raw)) {
    return { kind: 'insufficientBalance', raw }
  }
  if (/user rejected|user denied/i.test(raw)) {
    return { kind: 'userRejected', raw }
  }

  // Anchor program errors look like:  "Error Code: GroupFull. Error Number: 6001..."
  const anchorMatch = raw.match(/Error Code:\s*([A-Za-z][A-Za-z0-9_]*)/)
  if (anchorMatch) {
    return { kind: 'programError', programCode: anchorMatch[1], raw }
  }

  if (/simulation failed/i.test(raw)) {
    return { kind: 'simulationFailed', raw }
  }

  return { kind: 'unknown', raw }
}
