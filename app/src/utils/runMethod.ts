import type { Connection, PublicKey, Transaction } from '@solana/web3.js'

export type TxStages = {
  send: () => Promise<string>
  confirm: (sig: string) => Promise<void>
}

type MethodBuilder = { transaction: () => Promise<Transaction> }

type SignerWallet = {
  publicKey: PublicKey
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>
}

type ProgramLike = {
  provider: {
    connection: Connection
    wallet?: SignerWallet
  }
}

/**
 * Splits an Anchor methods-builder call into two awaitable phases so the UI
 * can render distinct `signing` and `confirming` states. `.rpc()` bundles
 * sign+send+confirm into one await, which collapses both setState calls into
 * the same React tick and hides the confirming phase.
 *
 * The send phase resolves once the network has accepted the signed tx; the
 * confirm phase resolves once the cluster reaches the provider's commitment.
 */
export function runMethod(
  builder: MethodBuilder,
  program: ProgramLike,
): TxStages {
  const provider = program.provider
  if (!provider.wallet) {
    throw new Error('runMethod requires a provider with a connected wallet')
  }
  const wallet = provider.wallet
  let blockhashCtx: { blockhash: string; lastValidBlockHeight: number } | null = null

  return {
    send: async () => {
      const tx = await builder.transaction()
      const bh = await provider.connection.getLatestBlockhash()
      blockhashCtx = bh
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = wallet.publicKey
      const signed = await wallet.signTransaction(tx)
      return await provider.connection.sendRawTransaction(signed.serialize())
    },
    confirm: async (sig: string) => {
      if (!blockhashCtx) throw new Error('runMethod.confirm called before send')
      const result = await provider.connection.confirmTransaction(
        { signature: sig, ...blockhashCtx },
        'confirmed',
      )
      if (result.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
      }
    },
  }
}
