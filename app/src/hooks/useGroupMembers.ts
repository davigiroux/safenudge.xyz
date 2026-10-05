import { useCallback, useEffect, useState } from 'react'
import { useAnchorProgram } from './useAnchorProgram'
import { getGroupConfigPDA } from '../utils/pda'
import { MEMBER_RECORD_GROUP_OFFSET } from '../utils/constants'

export type GroupMemberData = {
  member: string
  pda: string
  totalDeposited: number
  depositsMade: number
  periodsDeposited: boolean[]
}

type GroupMembersResult =
  | { kind: 'loaded'; members: GroupMemberData[] }
  | { kind: 'error'; message: string }

const NO_MEMBERS: GroupMemberData[] = []

/** Fetch every MemberRecord of a group. */
export function useGroupMembers(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const [settled, setSettled] = useState<{ lookup: string; result: GroupMembersResult } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  const lookup = groupCode && program ? `${groupCode}:${reloadKey}` : null

  useEffect(() => {
    if (!lookup || !groupCode || !program) return

    let cancelled = false
    const [groupPda] = getGroupConfigPDA(groupCode)

    program.account.memberRecord
      .all([{ memcmp: { offset: MEMBER_RECORD_GROUP_OFFSET, bytes: groupPda.toBase58() } }])
      .then(
        (records): GroupMembersResult => {
          const members: GroupMemberData[] = records.map(({ account, publicKey }) => ({
            member: account.member.toString(),
            pda: publicKey.toString(),
            totalDeposited: account.totalDeposited.toNumber(),
            depositsMade: account.depositsMade,
            periodsDeposited: account.periodsDeposited,
          }))
          // Stable order — sort by pubkey so the UI doesn't reshuffle on each fetch.
          members.sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0))
          return { kind: 'loaded', members }
        },
        (err): GroupMembersResult => ({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to fetch members',
        }),
      )
      .then((result) => {
        if (!cancelled) setSettled({ lookup, result })
      })

    return () => { cancelled = true }
  }, [lookup, groupCode, program])

  const result = lookup !== null && settled?.lookup === lookup ? settled.result : null

  return {
    data: result?.kind === 'loaded' ? result.members : NO_MEMBERS,
    loading: lookup !== null && result === null,
    error: result?.kind === 'error' ? result.message : null,
    refetch,
  }
}
