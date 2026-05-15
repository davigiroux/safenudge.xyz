import { useState, useCallback } from 'react'
import { classifyTxError, type ClassifiedTxError, type TxErrorKind } from '../utils/txErrors'
import type { TxStages } from '../utils/runMethod'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

type ExecuteInput = TxStages | (() => Promise<string>)

type UseTransactionReturn = {
  txState: TxState
  /** Raw underlying message — kept for backwards compat / secondary display. */
  errorDetail: string | null
  /** Classified error kind — drives the localized error title. */
  errorKind: TxErrorKind | null
  /** Anchor program error name when errorKind === 'programError'. */
  errorProgramCode: string | null
  /**
   * Run a transaction. Returns the signature on success, or `null` on
   * failure (in which case `txState` is `'error'` and `errorDetail` /
   * `errorKind` describe the failure). Callers that need to act on
   * success — e.g. to refetch on-chain state — should gate on a
   * non-null return.
   */
  execute: (
    input: ExecuteInput,
    opts?: { onError?: (err: ClassifiedTxError) => void },
  ) => Promise<string | null>
  reset: () => void
}

export function useTransaction(): UseTransactionReturn {
  const [txState, setTxState] = useState<TxState>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<TxErrorKind | null>(null)
  const [errorProgramCode, setErrorProgramCode] = useState<string | null>(null)

  const reset = useCallback(() => {
    setTxState('idle')
    setErrorDetail(null)
    setErrorKind(null)
    setErrorProgramCode(null)
  }, [])

  // Two-stage flow: the wallet popup happens inside `send` (UI shows
  // "signing"), and `confirm` awaits cluster confirmation (UI shows
  // "confirming"). Each await is a real React tick, so both states
  // render. Callers using a bare `() => Promise<string>` opt out of the
  // confirming phase — the UI goes signing → success directly.
  const execute = useCallback(async (
    input: ExecuteInput,
    opts?: { onError?: (err: ClassifiedTxError) => void },
  ): Promise<string | null> => {
    const stages: TxStages | { send: () => Promise<string>; confirm?: undefined } =
      typeof input === 'function' ? { send: input } : input

    setTxState('signing')
    setErrorDetail(null)
    setErrorKind(null)
    setErrorProgramCode(null)
    try {
      const sig = await stages.send()
      if (stages.confirm) {
        setTxState('confirming')
        await stages.confirm(sig)
      }
      setTxState('success')
      return sig
    } catch (err: unknown) {
      const classified = classifyTxError(err)
      setErrorDetail(classified.raw ?? 'Transaction failed')
      setErrorKind(classified.kind)
      setErrorProgramCode(classified.programCode ?? null)
      setTxState('error')
      opts?.onError?.(classified)
      return null
    }
  }, [])

  return { txState, errorDetail, errorKind, errorProgramCode, execute, reset }
}
