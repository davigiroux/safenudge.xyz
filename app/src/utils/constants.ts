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
