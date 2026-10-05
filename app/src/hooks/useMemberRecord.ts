import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAnchorProgram } from './useAnchorProgram'
import { getMemberRecordPDA, getGroupConfigPDA } from '../utils/pda'

export type MemberRecordData = {
  group: string
  member: string
  totalDeposited: number
  depositsMade: number
  periodsDeposited: boolean[]
  pda: string
}

/**
 * Whether the connected wallet belongs to a group.
 *   - `idle`: no wallet or no group code, so there is nothing to look up.
 *   - `loading`: the first lookup for this wallet and group has not answered.
 *   - `notMember`: the lookup answered and no record exists.
 *   - `error`: the RPC failed, so membership is unknown.
 */
export type MemberState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'notMember' }
  | { kind: 'member'; record: MemberRecordData }
  | { kind: 'error'; message: string }

type Settled = Exclude<MemberState, { kind: 'idle' | 'loading' }>

const IDLE: MemberState = { kind: 'idle' }
const LOADING: MemberState = { kind: 'loading' }

export function useMemberRecord(groupCode: string | undefined) {
  const program = useAnchorProgram()
  const { publicKey } = useWallet()
  const [settled, setSettled] = useState<{ lookup: string; state: Settled } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  const lookup = groupCode && program && publicKey ? `${groupCode}:${publicKey.toBase58()}` : null

  useEffect(() => {
    if (!lookup || !groupCode || !program || !publicKey) return

    let cancelled = false
    const [groupPda] = getGroupConfigPDA(groupCode)
    const [memberPda] = getMemberRecordPDA(groupPda, publicKey)

    program.account.memberRecord
      .fetchNullable(memberPda)
      .then(
        (account): Settled =>
          account === null
            ? { kind: 'notMember' }
            : {
                kind: 'member',
                record: {
                  group: account.group.toString(),
                  member: account.member.toString(),
                  totalDeposited: account.totalDeposited.toNumber(),
                  depositsMade: account.depositsMade,
                  periodsDeposited: account.periodsDeposited,
                  pda: memberPda.toString(),
                },
              },
        (err): Settled => ({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      .then((state) => {
        if (!cancelled) setSettled({ lookup, state })
      })

    return () => { cancelled = true }
  }, [lookup, groupCode, program, publicKey, reloadKey])

  const state: MemberState =
    lookup === null ? IDLE : settled?.lookup === lookup ? settled.state : LOADING

  return {
    state,
    data: state.kind === 'member' ? state.record : null,
    isMember: state.kind === 'member',
    refetch,
  }
}
