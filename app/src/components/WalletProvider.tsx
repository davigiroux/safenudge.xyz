import { useMemo, type ReactNode } from 'react'
import { clusterApiUrl } from '@solana/web3.js'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
// Individual adapter packages instead of the @solana/wallet-adapter-wallets
// umbrella: the umbrella pulls the entire Trezor/Ledger/Coinbase dependency
// chain (60+ npm audit findings) for two adapters we actually use (issue #44
// M-9).
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'

import '@solana/wallet-adapter-react-ui/styles.css'

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet')

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  )

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
