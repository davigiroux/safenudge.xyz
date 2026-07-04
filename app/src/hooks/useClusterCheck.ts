import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { EXPECTED_GENESIS_HASH } from '../utils/constants'

/**
 * Verifies that the RPC endpoint the wallet adapter is connected to belongs
 * to the expected cluster (devnet) by comparing genesis hashes. Pages should
 * block writes and surface `errors.wrongNetwork` while `wrongCluster` is
 * true. `null` means the check hasn't resolved yet (treated as OK so an RPC
 * hiccup never locks the UI).
 */
export function useClusterCheck(): { wrongCluster: boolean; checked: boolean } {
  const { connection } = useConnection()
  const [wrongCluster, setWrongCluster] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const genesisHash = await connection.getGenesisHash()
        if (cancelled) return
        setWrongCluster(genesisHash !== EXPECTED_GENESIS_HASH)
        setChecked(true)
      } catch {
        // Can't reach the RPC — don't lock the UI on a network blip.
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [connection])

  return { wrongCluster, checked }
}
