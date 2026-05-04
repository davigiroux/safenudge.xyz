import { useState, useCallback } from 'react'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

type UseTransactionReturn = {
  txState: TxState
  errorDetail: string | null
  /**
   * Run a transaction. Returns the signature on success, or `null` on
   * failure (in which case `txState` is `'error'` and `errorDetail`
   * contains the message). Callers that need to act on success — e.g.
   * to refetch on-chain state — should gate on a non-null return.
   */
  execute: (fn: () => Promise<string>) => Promise<string | null>
  reset: () => void
}

export function useTransaction(): UseTransactionReturn {
  const [txState, setTxState] = useState<TxState>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const reset = useCallback(() => {
    setTxState('idle')
    setErrorDetail(null)
  }, [])

  // The wallet popup is shown during the rpc await — we want the UI to
  // show "signing" while the user is being prompted, and only flip to
  // "confirming" once the signature comes back and we're waiting on
  // network confirmation. The previous version flipped both states in
  // the same tick, so the signing UI never rendered.
  const execute = useCallback(async (fn: () => Promise<string>): Promise<string | null> => {
    setTxState('signing')
    setErrorDetail(null)
    try {
      const sig = await fn()
      setTxState('confirming')
      // fn() already awaited the rpc and returned the signature; if we
      // ever switch to a flow that confirms separately, the await
      // would go here. For now there's nothing further to wait on.
      setTxState('success')
      return sig
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setErrorDetail(message)
      setTxState('error')
      return null
    }
  }, [])

  return { txState, errorDetail, execute, reset }
}
