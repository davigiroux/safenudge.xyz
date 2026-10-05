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
const SAFENUDGE_DEVNET_PROGRAM_ID = 'GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc'
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com'

export const PROGRAM_ID = new PublicKey(
  requireEnv('VITE_PROGRAM_ID', SAFENUDGE_DEVNET_PROGRAM_ID),
)

export const USDC_MINT = new PublicKey(
  requireEnv('VITE_USDC_MINT', SOLANA_DEVNET_USDC),
)

export const SOLANA_RPC_URL = requireEnv('VITE_SOLANA_RPC_URL', SOLANA_DEVNET_RPC)

function optionalEnv(name: string): string | undefined {
  const value: unknown = import.meta.env[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

// Fee relay (Kora). With no URL the connected wallet pays fees and rent.
export const KORA_URL = optionalEnv('VITE_KORA_URL')
export const KORA_API_KEY = optionalEnv('VITE_KORA_API_KEY')

// Genesis hash of the cluster the app expects (devnet). Compared against
// connection.getGenesisHash() to detect wallets pointed at the wrong network.
export const EXPECTED_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'

// memcmp offsets into account data. The Rust unit tests
// `serializes_member_record_fields_at_the_documented_offsets` and
// `serializes_group_config_fields_at_the_documented_offsets` in
// programs/safenudge/src/state/ pin the same numbers. Change both together.
export const MEMBER_RECORD_GROUP_OFFSET = 8
export const MEMBER_RECORD_MEMBER_OFFSET = 40
export const GROUP_CONFIG_CREATOR_OFFSET = 8

// Display-only BRL conversion for PT-BR users; not used in any on-chain math.
// Last updated 2026-07. Replace with a daily-cached FX feed post-MVP.
export const BRL_PER_USD = 5.45
