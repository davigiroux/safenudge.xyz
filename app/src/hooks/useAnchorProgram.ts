import { useMemo } from 'react'
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, type Idl, Program } from '@coral-xyz/anchor'
import idl from '../idl/safenudge.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeNudgeProgram = Program<any>

export function useAnchorProgram(): SafeNudgeProgram | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    if (!wallet) return null

    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    })

    return new Program(idl as Idl, provider)
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
