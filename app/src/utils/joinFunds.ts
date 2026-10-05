import { getAccount, TokenAccountNotFoundError } from '@solana/spl-token'
import type { Connection, PublicKey } from '@solana/web3.js'

export type JoinFunds =
  | { kind: 'ready' }
  | { kind: 'noTokenAccount' }
  | { kind: 'insufficientBalance'; missing: bigint }
  | { kind: 'unverified' }

/**
 * `join_group` moves the first deposit out of the member's associated token
 * account and fails, after the wallet prompt, when that account does not exist
 * or holds less than the deposit. `unverified` means the RPC could not answer.
 */
export async function readJoinFunds(
  connection: Connection,
  memberTokenAccount: PublicKey,
  depositBaseUnits: number,
): Promise<JoinFunds> {
  try {
    const { amount } = await getAccount(connection, memberTokenAccount)
    const missing = BigInt(depositBaseUnits) - amount
    return missing > 0n ? { kind: 'insufficientBalance', missing } : { kind: 'ready' }
  } catch (err) {
    return err instanceof TokenAccountNotFoundError ? { kind: 'noTokenAccount' } : { kind: 'unverified' }
  }
}
