import { useCallback, useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import type { BN } from '@coral-xyz/anchor'
import { useAnchorProgram } from './useAnchorProgram'
import { getGroupConfigPDA } from '../utils/pda'

export type GroupMemberData = {
  member: string
  pda: string
  totalDeposited: number
  depositsMade: number
  periodsDeposited: boolean[]
}

type RawMemberRecord = {
  group: PublicKey
  member: PublicKey
  totalDeposited: BN
  depositsMade: number
  periodsDeposited: boolean[]
  bump: number
}

/**
 * Fetch every MemberRecord whose `group` field matches the given group_code.
 *
 * Uses a `memcmp` filter at offset 8 (right after the 8-byte account
 * discriminator), which is where `MemberRecord.group: Pubkey` sits.
 */
export function useGroupMembers(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { connection } = useConnection()
  const [data, setData] = useState<GroupMemberData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!groupCode || !program) {
      setData([])
      return
    }

    let cancelled = false

    async function run() {
      if (!program) return
      setLoading(true)
      setError(null)
      try {
        const [groupPda] = getGroupConfigPDA(groupCode!)
        const records = await program.account.memberRecord.all([
          { memcmp: { offset: 8, bytes: groupPda.toBase58() } },
        ])

        if (cancelled) return

        const mapped: GroupMemberData[] = records.map((r) => {
          const acc = r.account as unknown as RawMemberRecord
          return {
            member: acc.member.toString(),
            pda: r.publicKey.toString(),
            totalDeposited: acc.totalDeposited.toNumber(),
            depositsMade: acc.depositsMade,
            periodsDeposited: acc.periodsDeposited,
          }
        })

        // Stable order — sort by pubkey so the UI doesn't reshuffle on each fetch.
        mapped.sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0))

        setData(mapped)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch members')
          setData([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [groupCode, program, connection, reloadKey])

  return { data, loading, error, refetch }
}
