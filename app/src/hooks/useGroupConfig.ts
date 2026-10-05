import { useCallback, useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useAnchorProgram } from './useAnchorProgram'
import { getGroupConfigPDA } from '../utils/pda'
import { frequencyFromCode, type FrequencyName } from '../utils/frequency'
import type { PublicKey } from '@solana/web3.js'
import type { BN } from '@coral-xyz/anchor'

export type GroupStatus = 'open' | 'active' | 'completed' | 'cancelled'

export type GroupConfigError = 'unsupported' | 'unavailable'

const STATUS_BY_CODE: Record<number, GroupStatus> = {
  0: 'open',
  1: 'active',
  2: 'completed',
  3: 'cancelled',
}

export type GroupConfigData = {
  groupCode: string
  creator: string
  mint: string
  depositAmount: number
  frequency: FrequencyName
  periodSeconds: number
  totalPeriods: number
  maxMembers: number
  currentMembers: number
  penaltyType: number
  penaltyValue: number
  status: GroupStatus
  cycleStart: number
  pda: string
}

/** Shape returned by program.account.groupConfig.fetch() */
type GroupConfigAccount = {
  groupCode: string
  creator: PublicKey
  mint: PublicKey
  depositAmount: BN
  frequency: number
  totalPeriods: number
  maxMembers: number
  currentMembers: number
  penaltyType: number
  penaltyValue: BN
  status: number
  cycleStart: BN
  bump: number
}

function parseGroupConfig(account: GroupConfigAccount, pda: PublicKey): GroupConfigData | null {
  const status = STATUS_BY_CODE[account.status]
  const frequency = frequencyFromCode(account.frequency)
  if (!status || !frequency) return null
  return {
    groupCode: account.groupCode,
    creator: account.creator.toString(),
    mint: account.mint.toString(),
    depositAmount: account.depositAmount.toNumber(),
    frequency: frequency.name,
    periodSeconds: frequency.periodSeconds,
    totalPeriods: account.totalPeriods,
    maxMembers: account.maxMembers,
    currentMembers: account.currentMembers,
    penaltyType: account.penaltyType,
    penaltyValue: account.penaltyValue.toNumber(),
    status,
    cycleStart: account.cycleStart.toNumber(),
    pda: pda.toString(),
  }
}

export function useGroupConfig(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { connection } = useConnection()
  const [data, setData] = useState<GroupConfigData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<GroupConfigError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!groupCode || !program) {
      setData(null)
      return
    }

    let cancelled = false

    async function fetchGroup() {
      if (!program) return
      setLoading(true)
      setError(null)
      try {
        const [pda] = getGroupConfigPDA(groupCode!)
        const account = await program.account.groupConfig.fetch(pda) as unknown as GroupConfigAccount

        if (!cancelled) {
          const parsed = parseGroupConfig(account, pda)
          setData(parsed)
          if (!parsed) setError('unsupported')
        }
      } catch {
        if (!cancelled) {
          setError('unavailable')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGroup()
    return () => { cancelled = true }
  }, [groupCode, program, connection, reloadKey])

  return { data, loading, error, refetch }
}
