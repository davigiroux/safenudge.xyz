import {
  PublicKey,
  Transaction,
  type AccountMeta,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { runMethod, type ProgramLike, type TxStages } from './runMethod'

const MAX_TRANSACTION_BYTES = 1232
const SIGNATURE_BYTES = 64
const SIGNATURE_COUNT_BYTES = 1

type SettlementMember = { member: string; pda: string }

type InstructionBuilder = { instruction: () => Promise<TransactionInstruction> }

function memberAccounts(members: SettlementMember[], mint: PublicKey) {
  return members.map((m) => {
    const owner = new PublicKey(m.member)
    return {
      owner,
      record: new PublicKey(m.pda),
      tokenAccount: getAssociatedTokenAddressSync(mint, owner),
    }
  })
}

export function settlementRemainingAccounts(members: SettlementMember[], mint: PublicKey): AccountMeta[] {
  return memberAccounts(members, mint).flatMap((a) => [
    { pubkey: a.record, isWritable: false, isSigner: false },
    { pubkey: a.tokenAccount, isWritable: true, isSigner: false },
  ])
}

async function missingTokenAccountCreates(
  connection: Connection,
  payer: PublicKey,
  members: SettlementMember[],
  mint: PublicKey,
): Promise<TransactionInstruction[]> {
  const accounts = memberAccounts(members, mint)
  const infos = await connection.getMultipleAccountsInfo(accounts.map((a) => a.tokenAccount))
  return accounts
    .filter((_, i) => !infos[i]?.owner.equals(TOKEN_PROGRAM_ID))
    .map((a) => createAssociatedTokenAccountIdempotentInstruction(payer, a.tokenAccount, a.owner, mint))
}

function fitsInOneTransaction(instructions: TransactionInstruction[], feePayer: PublicKey): boolean {
  const tx = new Transaction().add(...instructions)
  tx.feePayer = feePayer
  tx.recentBlockhash = PublicKey.default.toBase58()
  const message = tx.compileMessage()
  const signatureBytes = SIGNATURE_COUNT_BYTES + SIGNATURE_BYTES * message.header.numRequiredSignatures
  return message.serialize().length + signatureBytes <= MAX_TRANSACTION_BYTES
}

async function sendInOwnTransaction(instructions: TransactionInstruction[], program: ProgramLike): Promise<void> {
  const stages = runMethod(() => ({ transaction: async () => new Transaction().add(...instructions) }), program)
  await stages.confirm(await stages.send())
}

/** Marks `account` writable in the instruction that `builder` produces. */
export function withWritableAccount(builder: InstructionBuilder, account: PublicKey): InstructionBuilder {
  return {
    instruction: async () => {
      const ix = await builder.instruction()
      for (const key of ix.keys) {
        if (key.pubkey.equals(account)) key.isWritable = true
      }
      return ix
    },
  }
}

/** Settles the group and sends the vault rent to its payer in one transaction. */
export function settlementStages(
  settle: InstructionBuilder,
  vaultRentRefund: InstructionBuilder,
  program: ProgramLike,
  members: SettlementMember[],
  mint: PublicKey,
): TxStages {
  const { connection } = program.provider

  const settlementTransaction = async (payer: PublicKey) => {
    const [creates, settleIx, refundIx] = await Promise.all([
      missingTokenAccountCreates(connection, payer, members, mint),
      settle.instruction(),
      vaultRentRefund.instruction(),
    ])
    const settleAndRefund = [settleIx, refundIx]

    if (creates.length === 0 || fitsInOneTransaction([...creates, ...settleAndRefund], payer)) {
      return new Transaction().add(...creates, ...settleAndRefund)
    }
    await sendInOwnTransaction(creates, program)
    return new Transaction().add(...settleAndRefund)
  }

  return runMethod((payer) => ({ transaction: () => settlementTransaction(payer) }), program)
}
