import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { LiteSVMProvider } from "anchor-litesvm";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, MINT_SIZE, createAssociatedTokenAccountInstruction, createInitializeMintInstruction,
  createMintToInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

type Build = { so: string; idl: string };
type Args = { builds: Build[]; runs: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { builds: [], runs: 5 };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (argv[i] === "--build") {
      const [so, idl] = value.split(":");
      args.builds.push({ so, idl });
    } else if (argv[i] === "--runs") args.runs = Number(value);
    else throw new Error(`unknown argument ${argv[i]}. Usage: measure-join.ts [--build <so>:<idl>]... [--runs <n>]`);
  }
  if (args.builds.length === 0) args.builds.push({ so: "target/deploy/safenudge.so", idl: "target/idl/safenudge.json" });
  return args;
}

function seeded(label: string): Keypair {
  return Keypair.fromSeed(createHash("sha256").update(`measure-join:${label}`).digest());
}

const DEPOSIT = 10_000_000;
const DECIMALS = 6;
const SIGNATURE_FEE = 5_000n;

type Env = {
  client: LiteSVM;
  program: Program;
  payer: Keypair;
  mint: PublicKey;
  mintAuthority: Keypair;
  hasTally: boolean;
  hasExpectedJoins: boolean;
};

function freshEnv(build: Build, run: string): Env {
  const idl = JSON.parse(fs.readFileSync(path.resolve(build.idl), "utf-8"));
  const client = new LiteSVM();
  client.addProgramFromFile(new PublicKey(idl.address), path.resolve(build.so));
  const provider = new LiteSVMProvider(client);
  const program = new Program(idl, provider);
  const payer = provider.wallet.payer;
  client.airdrop(payer.publicKey, BigInt(50 * LAMPORTS_PER_SOL));

  const mintKeypair = seeded(`${run}:mint`);
  const mintAuthority = Keypair.generate();
  send(client, payer, [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: mintKeypair.publicKey, space: MINT_SIZE,
      lamports: Number(client.minimumBalanceForRentExemption(BigInt(MINT_SIZE))), programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKeypair.publicKey, DECIMALS, mintAuthority.publicKey, null),
  ], [mintKeypair]);

  const join = idl.instructions.find((ix: { name: string }) => ix.name === "join_group");
  const hasTally = join.accounts.some((account: { name: string }) => account.name === "join_tally");
  const hasExpectedJoins = join.args.some((arg: { name: string }) => arg.name === "expected_joins");
  return { client, program, payer, mint: mintKeypair.publicKey, mintAuthority, hasTally, hasExpectedJoins };
}

function send(client: LiteSVM, feePayer: Keypair, ixs: TransactionInstruction[], signers: Keypair[] = []) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = client.latestBlockhash();
  tx.sign(...new Set([feePayer, ...signers]));
  const result = client.sendTransaction(tx);
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(`${result.err().toString()}\n${result.meta().logs().join("\n")}`);
  }
  return { bytes: tx.serialize().length, computeUnits: result.computeUnitsConsumed() };
}

function pda(program: Program, seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

type Member = { keypair: Keypair; tokenAccount: PublicKey };

function fundedMember(env: Env, keypair: Keypair, lamports: number): Member {
  const tokenAccount = getAssociatedTokenAddressSync(env.mint, keypair.publicKey);
  const ixs = [
    createAssociatedTokenAccountInstruction(env.payer.publicKey, tokenAccount, keypair.publicKey, env.mint),
    createMintToInstruction(env.mint, tokenAccount, env.mintAuthority.publicKey, DEPOSIT),
  ];
  if (lamports > 0) {
    ixs.unshift(SystemProgram.transfer({ fromPubkey: env.payer.publicKey, toPubkey: keypair.publicKey, lamports }));
  }
  send(env.client, env.payer, ixs, [env.mintAuthority]);
  return { keypair, tokenAccount };
}

async function createGroupIx(env: Env, code: string, creator: PublicKey, rentPayer: PublicKey) {
  const groupConfig = pda(env.program, [Buffer.from("group"), Buffer.from(code)]);
  return env.program.methods
    .createGroup(code, new BN(DEPOSIT), 0, 4, 5, 0, new BN(0))
    .accounts({
      creator, rentPayer, groupConfig, vault: pda(env.program, [Buffer.from("vault"), groupConfig.toBuffer()]),
      mint: env.mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
}

async function joinIx(env: Env, groupConfig: PublicKey, member: Member, rentPayer: PublicKey, joinAuthority: PublicKey | null) {
  const accounts: Record<string, PublicKey | null> = {
    member: member.keypair.publicKey, rentPayer, groupConfig,
    memberRecord: pda(env.program, [Buffer.from("member"), groupConfig.toBuffer(), member.keypair.publicKey.toBuffer()]),
    memberTokenAccount: member.tokenAccount, vault: pda(env.program, [Buffer.from("vault"), groupConfig.toBuffer()]),
    mint: env.mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    joinGate: pda(env.program, [Buffer.from("join"), groupConfig.toBuffer()]), joinAuthority,
  };
  if (env.hasTally) {
    accounts.joinTally = pda(env.program, [Buffer.from("tally"), groupConfig.toBuffer(), member.keypair.publicKey.toBuffer()]);
  }
  const method = env.hasExpectedJoins
    ? env.program.methods.joinGroup(joinAuthority ? 0 : null)
    : env.program.methods.joinGroup();
  return method.accounts(accounts).instruction();
}

async function gateIx(env: Env, groupConfig: PublicKey, authority: PublicKey, creator: PublicKey, rentPayer: PublicKey) {
  return env.program.methods.setJoinAuthority(authority)
    .accounts({
      creator, rentPayer, groupConfig, joinGate: pda(env.program, [Buffer.from("join"), groupConfig.toBuffer()]),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

async function measureJoin(build: Build, run: number): Promise<{ computeUnits: bigint; sponsorPaid: bigint }> {
  const env = freshEnv(build, `join-${run}`);
  const sponsor = fundedMember(env, seeded(`join-${run}:sponsor`), 2 * LAMPORTS_PER_SOL).keypair;
  const groupConfig = pda(env.program, [Buffer.from("group"), Buffer.from("measure")]);
  send(env.client, env.payer, [await createGroupIx(env, "measure", env.payer.publicKey, env.payer.publicKey)]);
  const member = fundedMember(env, seeded(`join-${run}:member`), 0);
  const before = env.client.getBalance(sponsor.publicKey) ?? 0n;
  const { computeUnits } = send(
    env.client, sponsor, [await joinIx(env, groupConfig, member, sponsor.publicKey, null)], [member.keypair],
  );
  const after = env.client.getBalance(sponsor.publicKey) ?? 0n;
  return { computeUnits, sponsorPaid: before - after - 2n * SIGNATURE_FEE };
}

async function measureGatedCreate(build: Build): Promise<{ bytes: number; computeUnits: bigint }> {
  const env = freshEnv(build, "gated");
  const sponsor = fundedMember(env, seeded("gated:sponsor"), 2 * LAMPORTS_PER_SOL).keypair;
  const authority = seeded("gated:authority");
  const creator = fundedMember(env, seeded("gated:creator"), 0);
  const groupConfig = pda(env.program, [Buffer.from("group"), Buffer.from("gated-measure")]);
  return send(env.client, sponsor, [
    await createGroupIx(env, "gated-measure", creator.keypair.publicKey, sponsor.publicKey),
    await gateIx(env, groupConfig, authority.publicKey, creator.keypair.publicKey, sponsor.publicKey),
    await joinIx(env, groupConfig, creator, sponsor.publicKey, authority.publicKey),
  ], [creator.keypair, authority]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const joins = args.builds.map(() => [] as { computeUnits: bigint; sponsorPaid: bigint }[]);
  for (let run = 0; run < args.runs; run++) {
    for (const [b, build] of args.builds.entries()) joins[b].push(await measureJoin(build, run));
  }
  for (const [b, build] of args.builds.entries()) {
    const gated = await measureGatedCreate(build);
    console.log(JSON.stringify({
      so: build.so,
      hasJoinTally: freshEnv(build, "probe").hasTally,
      joinComputeUnits: joins[b].map((j) => Number(j.computeUnits)),
      joinRentLamports: Number(joins[b][0].sponsorPaid),
      gatedCreateBytes: gated.bytes,
      gatedCreateComputeUnits: Number(gated.computeUnits),
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
