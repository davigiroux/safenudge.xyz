import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'

/**
 * Offset (in seconds) between on-chain time and the device clock, sampled
 * once on mount. Add it to `Date.now() / 1000` wherever the UI derives
 * period math so a skewed device clock (>5 min is common on Android) can't
 * disagree with the program's `Clock::get()` view of the current period.
 * Falls back to 0 when the RPC can't answer — same behavior as before.
 */
export function useChainTimeOffset(): number {
  const { connection } = useConnection()
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function sample() {
      try {
        const slot = await connection.getSlot()
        const blockTime = await connection.getBlockTime(slot)
        if (blockTime === null || cancelled) return
        setOffset(blockTime - Math.floor(Date.now() / 1000))
      } catch {
        // RPC hiccup — keep offset 0; the UI degrades to device time.
      }
    }

    sample()
    return () => {
      cancelled = true
    }
  }, [connection])

  return offset
}
