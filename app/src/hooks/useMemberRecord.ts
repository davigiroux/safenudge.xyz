import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAnchorProgram } from './useAnchorProgram'
import { getMemberRecordPDA, getGroupConfigPDA } from '../utils/pda'
import type { PublicKey } from '@solana/web3.js'
import type { BN } from '@coral-xyz/anchor'

export type MemberRecordData = {
  group: string
  member: string
  totalDeposited: number
  depositsMade: number
  periodsDeposited: boolean[]
  hasClaimed: boolean
  pda: string
}

/** Shape returned by program.account.memberRecord.fetch() */
type MemberRecordAccount = {
  group: PublicKey
  member: PublicKey
  totalDeposited: BN
  depositsMade: number
  periodsDeposited: boolean[]
  hasClaimed: boolean
  bump: number
}

export function useMemberRecord(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [data, setData] = useState<MemberRecordData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!groupCode || !program || !publicKey) {
      setData(null)
      return
    }

    let cancelled = false

    async function fetchMember() {
      if (!program || !publicKey) return
      setLoading(true)
      setError(null)
      try {
        const [groupPda] = getGroupConfigPDA(groupCode!)
        const [memberPda] = getMemberRecordPDA(groupPda, publicKey)
        const account = await program.account.memberRecord.fetch(memberPda) as unknown as MemberRecordAccount

        if (!cancelled) {
          setData({
            group: account.group.toString(),
            member: account.member.toString(),
            totalDeposited: account.totalDeposited.toNumber(),
            depositsMade: account.depositsMade,
            periodsDeposited: account.periodsDeposited,
            hasClaimed: account.hasClaimed,
            pda: memberPda.toString(),
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch member record')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMember()
    return () => { cancelled = true }
  }, [groupCode, program, publicKey, connection, reloadKey])

  return { data, loading, error, isMember: !!data, refetch }
}
