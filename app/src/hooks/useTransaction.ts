import { useState, useCallback } from 'react'
import { classifyTxError, type ClassifiedTxError, type TxErrorKind } from '../utils/txErrors'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

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
    fn: () => Promise<string>,
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

  // The wallet popup is shown during the rpc await — we want the UI to
  // show "signing" while the user is being prompted, and only flip to
  // "confirming" once the signature comes back and we're waiting on
  // network confirmation. The previous version flipped both states in
  // the same tick, so the signing UI never rendered.
  const execute = useCallback(async (
    fn: () => Promise<string>,
    opts?: { onError?: (err: ClassifiedTxError) => void },
  ): Promise<string | null> => {
    setTxState('signing')
    setErrorDetail(null)
    setErrorKind(null)
    setErrorProgramCode(null)
    try {
      const sig = await fn()
      setTxState('confirming')
      // fn() already awaited the rpc and returned the signature; if we
      // ever switch to a flow that confirms separately, the await
      // would go here. For now there's nothing further to wait on.
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
