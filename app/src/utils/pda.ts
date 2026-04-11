import { PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID || '88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB'
)

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

export { PROGRAM_ID }
