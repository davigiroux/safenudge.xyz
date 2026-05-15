import type { Transaction } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

export type TxStages = {
  send: () => Promise<string>
  confirm: (sig: string) => Promise<void>
}

type MethodBuilder = { transaction: () => Promise<Transaction> }

/**
 * Splits an Anchor methods-builder call into two awaitable phases so the UI
 * can render distinct `signing` and `confirming` states. `.rpc()` bundles
 * sign+send+confirm into one await, which collapses both setState calls into
 * the same React tick and hides the confirming phase.
 *
 * The send phase resolves once the network has accepted the signed tx; the
 * confirm phase resolves once the cluster reaches the provider's commitment.
 */
export function runMethod<T extends Program>(
  builder: MethodBuilder,
  program: T,
): TxStages {
  const provider = program.provider as {
    connection: import('@solana/web3.js').Connection
    wallet: { publicKey: import('@solana/web3.js').PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
  }
  let blockhashCtx: { blockhash: string; lastValidBlockHeight: number } | null = null

  return {
    send: async () => {
      const tx = await builder.transaction()
      const bh = await provider.connection.getLatestBlockhash()
      blockhashCtx = bh
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = provider.wallet.publicKey
      const signed = await provider.wallet.signTransaction(tx)
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
