import { useState, useEffect } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useAnchorProgram } from './useAnchorProgram'
import { getGroupConfigPDA } from '../utils/pda'

export type GroupStatus = 'open' | 'active' | 'completed' | 'cancelled'

const STATUS_MAP: Record<number, GroupStatus> = {
  0: 'open',
  1: 'active',
  2: 'completed',
  3: 'cancelled',
}

const FREQUENCY_MAP: Record<number, string> = {
  0: 'weekly',
  1: 'biweekly',
  2: 'monthly',
}

export type GroupConfigData = {
  groupCode: string
  creator: string
  mint: string
  depositAmount: number
  frequency: string
  totalPeriods: number
  maxMembers: number
  currentMembers: number
  penaltyType: number
  penaltyValue: number
  status: GroupStatus
  cycleStart: number
  currentPeriod: number
  pda: string
}

export function useGroupConfig(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { connection } = useConnection()
  const [data, setData] = useState<GroupConfigData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!groupCode || !program) {
      setData(null)
      return
    }

    let cancelled = false

    async function fetch() {
      if (!program) return
      setLoading(true)
      setError(null)
      try {
        const [pda] = getGroupConfigPDA(groupCode!)
        const account = await (program.account as Record<string, { fetch: (key: unknown) => Promise<Record<string, unknown>> }>)['groupConfig'].fetch(pda)

        if (!cancelled) {
          setData({
            groupCode: account.groupCode as string,
            creator: (account.creator as { toString: () => string }).toString(),
            mint: (account.mint as { toString: () => string }).toString(),
            depositAmount: (account.depositAmount as { toNumber: () => number }).toNumber(),
            frequency: FREQUENCY_MAP[(account.frequency as number)] || 'unknown',
            totalPeriods: account.totalPeriods as number,
            maxMembers: account.maxMembers as number,
            currentMembers: account.currentMembers as number,
            penaltyType: account.penaltyType as number,
            penaltyValue: (account.penaltyValue as { toNumber: () => number }).toNumber(),
            status: STATUS_MAP[(account.status as number)] || 'open',
            cycleStart: (account.cycleStart as { toNumber: () => number }).toNumber(),
            currentPeriod: account.currentPeriod as number,
            pda: pda.toString(),
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch group')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [groupCode, program, connection])

  return { data, loading, error }
}
