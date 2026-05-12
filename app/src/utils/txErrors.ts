/**
 * Classify a thrown transaction error into a stable kind so the UI can
 * pick the right i18n string and avoid showing a misleading title
 * (e.g. "Saldo insuficiente" for a BlockhashNotFound RPC blip).
 */

export type TxErrorKind =
  | 'blockhashExpired'
  | 'insufficientBalance'
  | 'userRejected'
  | 'simulationFailed'
  | 'programError'
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
