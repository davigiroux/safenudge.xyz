import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAnchorProgram } from './useAnchorProgram'
import { getMemberRecordPDA, getGroupConfigPDA } from '../utils/pda'

export type MemberRecordData = {
  group: string
  member: string
  totalDeposited: number
  depositsMade: number
  periodsDeposited: boolean[]
  hasClaimed: boolean
  pda: string
}

export function useMemberRecord(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [data, setData] = useState<MemberRecordData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!groupCode || !program || !publicKey) {
      setData(null)
      return
    }

    let cancelled = false

    async function fetch() {
      if (!program || !publicKey) return
      setLoading(true)
      setError(null)
      try {
        const [groupPda] = getGroupConfigPDA(groupCode!)
        const [memberPda] = getMemberRecordPDA(groupPda, publicKey)
        const account = await (program.account as Record<string, { fetch: (key: unknown) => Promise<Record<string, unknown>> }>)['memberRecord'].fetch(memberPda)

        if (!cancelled) {
          setData({
            group: (account.group as { toString: () => string }).toString(),
            member: (account.member as { toString: () => string }).toString(),
            totalDeposited: (account.totalDeposited as { toNumber: () => number }).toNumber(),
            depositsMade: account.depositsMade as number,
            periodsDeposited: account.periodsDeposited as boolean[],
            hasClaimed: account.hasClaimed as boolean,
            pda: memberPda.toString(),
          })
        }
      } catch (err) {
        if (!cancelled) {
          // Member record not found is expected for non-members
          setError(err instanceof Error ? err.message : 'Failed to fetch member record')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [groupCode, program, publicKey, connection])

  return { data, loading, error, isMember: !!data }
}
