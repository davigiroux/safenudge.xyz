import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js'

// Clock sysvar layout: slot u64, epoch_start_timestamp i64, epoch u64,
// leader_schedule_epoch u64, unix_timestamp i64.
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32

/**
 * Offset (in seconds) between the `Clock` sysvar and the device clock, sampled
 * once on mount. Add it to `Date.now() / 1000` wherever the UI derives
 * period math so a skewed device clock (>5 min is common on Android) can't
 * disagree with the program's `Clock::get()` view of the current period.
 * Reads the sysvar itself, not `getBlockTime`: local forks (Surfpool) derive
 * block time from the slot, and it drifts from `Clock` after a time jump.
 * Falls back to 0 when the RPC can't answer — same behavior as before.
 */
export function useChainTimeOffset(): number {
  const { connection } = useConnection()
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function sample() {
      try {
        const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY)
        if (clock === null || cancelled) return
        const view = new DataView(clock.data.buffer, clock.data.byteOffset, clock.data.byteLength)
        const chainNow = Number(view.getBigInt64(CLOCK_UNIX_TIMESTAMP_OFFSET, true))
        setOffset(chainNow - Math.floor(Date.now() / 1000))
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
