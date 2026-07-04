// Explicit import from the `buffer` polyfill (already a dependency for the
// browser bundle): the global Buffer *type* used to arrive transitively via
// the wallet-adapter umbrella package, which is gone.
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { PROGRAM_ID } from './constants'

export function getGroupConfigPDA(groupCode: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('group'), Buffer.from(groupCode)],
    PROGRAM_ID
  )
}

export function getMemberRecordPDA(
  groupConfigKey: PublicKey,
  memberKey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('member'), groupConfigKey.toBuffer(), memberKey.toBuffer()],
    PROGRAM_ID
  )
}

export function getVaultPDA(groupConfigKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), groupConfigKey.toBuffer()],
    PROGRAM_ID
  )
}

export function getTreasuryAuthorityPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID)
}
