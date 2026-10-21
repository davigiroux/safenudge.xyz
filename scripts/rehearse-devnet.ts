// Drives a devnet build (`anchor build -- --features devnet`) through the two paths an upgrade
// that changes join terms and settlement must keep working, on any cluster with real time:
//   1. a join signed for an empty group fails with TermsMismatch after the creator cancels,
//      closes and recreates the code on other terms;
//   2. three members join, two deposit every 5-minute period, one misses, and distribute pays
//      each member back exactly what they deposited and closes the vault.
// It takes about 11 minutes, most of it waiting for the two periods to pass.
//
// Usage:
//   npx ts-node -P tsconfig.json scripts/rehearse-devnet.ts \
//     --url <rpc> --payer <keypair.json> [--idl target/idl/safenudge.json]
// The payer needs about 0.2 SOL.

import fs from "node:fs";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";

const USDC = 1_000_000;
const PERIOD_SECS = 300;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

function check(ok: boolean, message: string) {
  if (!ok) throw new Error(`FAILED: ${message}`);
  console.log(`ok   ${message}`);
}

const connection = new Connection(arg("url"), "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(arg("payer"), "utf-8"))));
const idl = JSON.parse(fs.readFileSync(arg("idl", "target/idl/safenudge.json"), "utf-8"));
const program = new Program(idl, new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" }));
const programId = program.programId;
// The IDL is read at run time, so the type checker does not know its account names.
const accounts: any = program.account;

const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const groupPda = (code: string) => pda(Buffer.from("group"), Buffer.from(code));
const vaultPda = (group: PublicKey) => pda(Buffer.from("vault"), group.toBuffer());
const memberPda = (group: PublicKey, member: PublicKey) => pda(Buffer.from("member"), group.toBuffer(), member.toBuffer());

async function chainTime(): Promise<number> {
  return (await connection.getBlockTime(await connection.getSlot())) ?? Math.floor(Date.now() / 1000);
}

async function waitUntil(unix: number) {
  for (let now = await chainTime(); now < unix; now = await chainTime()) {
    console.log(`     waiting ${unix - now}s for the chain clock`);
    await new Promise((r) => setTimeout(r, Math.min(30, unix - now + 2) * 1000));
  }
}

async function errorOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "";
  } catch (e) {
    return String((e as Error).message ?? e) + String((e as { logs?: string[] }).logs ?? "");
  }
}

type Member = { keypair: Keypair; ata: PublicKey };

async function newMember(mint: PublicKey, tokens: number): Promise<Member> {
  const keypair = Keypair.generate();
  await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({
    fromPubkey: payer.publicKey, toPubkey: keypair.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL,
  })), [payer]);
  const ata = (await getOrCreateAssociatedTokenAccount(connection, payer, mint, keypair.publicKey)).address;
  await mintTo(connection, payer, mint, ata, payer, tokens);
  return { keypair, ata };
}

function createGroup(code: string, mint: PublicKey, deposit: number) {
  return program.methods
    .createGroup(code, new BN(deposit), 3, 2, 5)
    .accountsPartial({ creator: payer.publicKey, rentPayer: payer.publicKey, mint, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
}

async function termsOf(group: PublicKey) {
  const g = await accounts.groupConfig.fetch(group);
  return { creator: g.creator, depositAmount: g.depositAmount, frequency: g.frequency, totalPeriods: g.totalPeriods };
}

function join(member: Member, group: PublicKey, mint: PublicKey, terms: unknown) {
  return program.methods.joinGroup(terms, null)
    .accountsPartial({
      member: member.keypair.publicKey, rentPayer: member.keypair.publicKey, groupConfig: group,
      memberTokenAccount: member.ata, mint, tokenProgram: TOKEN_PROGRAM_ID, joinAuthority: null,
    })
    .signers([member.keypair])
    .rpc();
}

async function baitAndSwitch(mint: PublicKey, suffix: string) {
  const code = `bait-${suffix}`;
  const group = groupPda(code);
  await createGroup(code, mint, 10 * USDC);
  const victim = await newMember(mint, 100 * USDC);
  const signedTerms = await termsOf(group);

  await program.methods.emergencyCancel()
    .accountsPartial({ creator: payer.publicKey, groupConfig: group, mint, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  await program.methods.closeGroup().accountsPartial({ groupConfig: group, rentPayer: payer.publicKey }).rpc();
  await createGroup(code, mint, 90 * USDC);

  const error = await errorOf(join(victim, group, mint, signedTerms));
  check(error.includes("TermsMismatch"), "a join signed before the switch fails with TermsMismatch");
  check((await getAccount(connection, victim.ata)).amount === BigInt(100 * USDC), "the victim keeps all 100 USDC");
}

async function lifecycle(mint: PublicKey, suffix: string) {
  const code = `life-${suffix}`;
  const group = groupPda(code);
  const vault = vaultPda(group);
  await createGroup(code, mint, 10 * USDC);

  const groupInfo = await connection.getAccountInfo(group);
  check(groupInfo?.data.length === 244 && groupInfo.data.subarray(0, 8).toString() === "snGroup5", "GroupConfig is 244 bytes, snGroup5");

  const members = [await newMember(mint, 100 * USDC), await newMember(mint, 100 * USDC), await newMember(mint, 100 * USDC)];
  const terms = await termsOf(group);
  for (const m of members) await join(m, group, mint, terms);
  const recordInfo = await connection.getAccountInfo(memberPda(group, members[0].keypair.publicKey));
  check(recordInfo?.data.length === 198 && recordInfo.data.subarray(0, 8).toString() === "snMembr3", "MemberRecord is 198 bytes, snMembr3");

  await program.methods.startCycle().accountsPartial({ creator: payer.publicKey, groupConfig: group }).rpc();
  const cycleStart = (await accounts.groupConfig.fetch(group)).cycleStart.toNumber();

  await waitUntil(cycleStart + PERIOD_SECS);
  for (const m of members.slice(0, 2)) {
    await program.methods.deposit()
      .accountsPartial({
        member: m.keypair.publicKey, groupConfig: group, memberTokenAccount: m.ata, mint, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([m.keypair])
      .rpc();
  }

  await waitUntil(cycleStart + 2 * PERIOD_SECS);
  const before = await Promise.all(members.map(async (m) => (await getAccount(connection, m.ata)).amount));
  const signature = await program.methods.distribute()
    .accountsPartial({ payer: payer.publicKey, groupConfig: group, mint, tokenProgram: TOKEN_PROGRAM_ID })
    .remainingAccounts(members.flatMap((m) => [
      { pubkey: memberPda(group, m.keypair.publicKey), isWritable: false, isSigner: false },
      { pubkey: m.ata, isWritable: true, isSigner: false },
    ]))
    .rpc();

  const paid = await Promise.all(members.map(async (m, i) => (await getAccount(connection, m.ata)).amount - before[i]));
  // Member 3 missed one period and gets back the 10 USDC they deposited; a miss costs no principal.
  check(paid[0] === 20_000_000n && paid[1] === 20_000_000n && paid[2] === 10_000_000n, `payouts ${paid.join(", ")}`);
  check(paid.reduce((a, b) => a + b, 0n) === BigInt(50 * USDC), "payouts equal the 50 USDC deposited");
  check((await connection.getAccountInfo(vault)) === null, "the vault is closed");
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  console.log(`     distribute used ${tx?.meta?.computeUnitsConsumed} compute units`);
}

async function main() {
  console.log(`program ${programId.toBase58()} on ${arg("url")}`);
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const suffix = Math.random().toString(36).slice(2, 8);
  await baitAndSwitch(mint, suffix);
  await lifecycle(mint, suffix);
  console.log("rehearsal passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
