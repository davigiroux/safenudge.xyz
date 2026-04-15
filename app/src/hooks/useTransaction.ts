import { useState, useCallback } from 'react'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

type UseTransactionReturn = {
  txState: TxState
  errorDetail: string | null
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

  const execute = useCallback(async (fn: () => Promise<string>): Promise<string | null> => {
    setTxState('signing')
    setErrorDetail(null)
    try {
      setTxState('confirming')
      const sig = await fn()
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
