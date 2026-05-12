import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { hashId, identifyWallet, resetAnalytics, track } from '../utils/analytics'

/**
 * Mounts once near the app root. Watches the wallet adapter and emits
 * `wallet_connected` / `wallet_disconnected` exactly once per state change,
 * identifying PostHog by hashed pubkey so we can build per-user funnels
 * without ever sending the raw address.
 */
export function useAnalyticsIdentify(): void {
  const { publicKey, wallet } = useWallet()
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const pk = publicKey?.toBase58() ?? null

    if (pk === lastKeyRef.current) return
    lastKeyRef.current = pk

    if (!pk) {
      track('wallet_disconnected', {})
      resetAnalytics()
      return
    }

    let cancelled = false
    hashId(pk).then((walletHash) => {
      if (cancelled) return
      identifyWallet(walletHash)
      track('wallet_connected', {
        wallet_hash: walletHash,
        wallet_name: wallet?.adapter.name,
      })
    })
    return () => {
      cancelled = true
    }
  }, [publicKey, wallet])
}
