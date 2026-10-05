import {
  VersionedTransaction,
  type Connection,
  type PublicKey,
  type Transaction,
  type TransactionError,
} from '@solana/web3.js'
import { payerAddress, sessionPayer } from './payer'
import { RelayError } from './relay'
import { TxConfirmError } from './txErrors'

export type TxStages = {
  send: () => Promise<string>
  confirm: (sig: string) => Promise<void>
}

export type MethodBuilder = { transaction: () => Promise<Transaction> }

type SignerWallet = {
  publicKey: PublicKey
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>
}

export type ProgramLike = {
  provider: {
    connection: Connection
    wallet?: SignerWallet
  }
}

/** True when the simulation failed because the fee payer, the relay, could not fund it. */
function relayCannotFund(detail: string): boolean {
  return /insufficient lamports|InsufficientFundsFor|AccountNotFound/.test(detail)
}

/** Simulates a sponsored `tx` and throws the cluster's answer before the wallet is asked to sign. */
async function preflight(connection: Connection, tx: Transaction): Promise<void> {
  const { value } = await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
    sigVerify: false,
    replaceRecentBlockhash: true,
  })
  if (!value.err) return
  const detail = [JSON.stringify(value.err), ...(value.logs ?? [])].join('\n')
  if (relayCannotFund(detail)) throw new RelayError('relayUnavailable', detail)
  throw new Error(`Simulation failed: ${detail}`)
}

/**
 * Splits an Anchor methods-builder call into two awaitable phases so the UI
 * can render distinct `signing` and `confirming` states. `.rpc()` bundles
 * sign+send+confirm into one await, which collapses both setState calls into
 * the same React tick and hides the confirming phase.
 *
 * The send phase resolves once the network has accepted the signed tx; the
 * confirm phase resolves once the cluster reaches the provider's commitment.
 *
 * `build` receives the account that pays fees and rent, the wallet or the relay.
 */
export function runMethod(
  build: (payer: PublicKey) => MethodBuilder,
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
      const payer = await sessionPayer()
      const feePayer = payerAddress(payer, wallet.publicKey)
      const tx = await build(feePayer).transaction()
      tx.feePayer = feePayer

      if (payer.kind === 'wallet') {
        blockhashCtx = await provider.connection.getLatestBlockhash()
        tx.recentBlockhash = blockhashCtx.blockhash
        const signed = await wallet.signTransaction(tx)
        return await provider.connection.sendRawTransaction(signed.serialize())
      }

      // The relay's blockhash comes without an expiry height, so the cluster's own bounds the confirm wait.
      const [latest, blockhash] = await Promise.all([provider.connection.getLatestBlockhash(), payer.blockhash()])
      blockhashCtx = { ...latest, blockhash }
      tx.recentBlockhash = blockhash
      await preflight(provider.connection, tx)
      return await payer.signAndSend(await wallet.signTransaction(tx), wallet.publicKey)
    },
    confirm: async (sig: string) => {
      if (!blockhashCtx) throw new Error('runMethod.confirm called before send')
      let txError: TransactionError | null
      try {
        const result = await provider.connection.confirmTransaction(
          { signature: sig, ...blockhashCtx },
          'confirmed',
        )
        txError = result.value.err
      } catch (err) {
        // web3.js rejects with the bare TransactionError, not an Error, when the
        // signature status already carries the failure.
        if (err instanceof Error) throw err
        txError = err as TransactionError
      }
      if (txError) {
        throw new TxConfirmError(txError)
      }
    },
  }
}
