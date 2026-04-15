import { useMemo } from 'react'
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import type { Safenudge } from '../idl/safenudge-types'
import idl from '../idl/safenudge.json'

export type SafeNudgeProgram = Program<Safenudge>

export function useAnchorProgram(): SafeNudgeProgram | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    if (!wallet) return null

    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    })

    return new Program(idl as Safenudge, provider) as SafeNudgeProgram
  }, [connection, wallet])
}

export function useAnchorProvider(): AnchorProvider | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    if (!wallet) return null
    return new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  }, [connection, wallet])
}
