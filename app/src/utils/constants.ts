import { PublicKey } from '@solana/web3.js'

const isProd = import.meta.env.PROD

function requireEnv(name: string, dev_fallback: string): string {
  const value = import.meta.env[name]
  if (value && typeof value === 'string') return value
  if (isProd) {
    throw new Error(
      `Missing required env var ${name}. Production builds must have all VITE_* env vars set.`,
    )
  }
  return dev_fallback
}

const SOLANA_DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
const SAFENUDGE_DEVNET_PROGRAM_ID = '88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB'
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com'

export const PROGRAM_ID = new PublicKey(
  requireEnv('VITE_PROGRAM_ID', SAFENUDGE_DEVNET_PROGRAM_ID),
)

export const USDC_MINT = new PublicKey(
  requireEnv('VITE_USDC_MINT', SOLANA_DEVNET_USDC),
)

export const SOLANA_RPC_URL = requireEnv('VITE_SOLANA_RPC_URL', SOLANA_DEVNET_RPC)

// Genesis hash of the cluster the app expects (devnet). Compared against
// connection.getGenesisHash() to detect wallets pointed at the wrong network.
export const EXPECTED_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'

// memcmp offsets into the MemberRecord account, derived from the IDL layout:
// 8-byte discriminator, then `group: Pubkey` (32), then `member: Pubkey` (32).
// Keep in sync with programs/safenudge/src/state/member_record.rs.
export const MEMBER_RECORD_GROUP_OFFSET = 8
export const MEMBER_RECORD_MEMBER_OFFSET = 40

// Display-only BRL conversion for PT-BR users; not used in any on-chain math.
// Last updated 2026-07. Replace with a daily-cached FX feed post-MVP.
export const BRL_PER_USD = 5.45
