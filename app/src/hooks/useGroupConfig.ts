import { useCallback, useEffect, useState } from 'react'
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
  rentPayer: string
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
  rentPayer: PublicKey
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
    rentPayer: account.rentPayer.toString(),
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

type GroupConfigResult =
  | { kind: 'loaded'; group: GroupConfigData }
  | { kind: 'error'; error: GroupConfigError }

/** Fetch and parse a group's config account. */
export function useGroupConfig(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const [settled, setSettled] = useState<{ lookup: string; result: GroupConfigResult } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  const lookup = groupCode && program ? `${groupCode}:${reloadKey}` : null

  useEffect(() => {
    if (!lookup || !groupCode || !program) return

    let cancelled = false
    const [pda] = getGroupConfigPDA(groupCode)

    program.account.groupConfig
      .fetch(pda)
      .then(
        (account): GroupConfigResult => {
          const group = parseGroupConfig(account, pda)
          return group ? { kind: 'loaded', group } : { kind: 'error', error: 'unsupported' }
        },
        (): GroupConfigResult => ({ kind: 'error', error: 'unavailable' }),
      )
      .then((result) => {
        if (!cancelled) setSettled({ lookup, result })
      })

    return () => { cancelled = true }
  }, [lookup, groupCode, program])

  const result = lookup !== null && settled?.lookup === lookup ? settled.result : null

  return {
    data: result?.kind === 'loaded' ? result.group : null,
    loading: lookup !== null && result === null,
    error: result?.kind === 'error' ? result.error : null,
    refetch,
  }
}
