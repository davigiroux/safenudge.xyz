import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Clock } from "solana-bankrun";
import { PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  AccountLayout,
} from "@solana/spl-token";
import * as fs from "fs";
import { assert } from "chai";

const IDL = require("../target/idl/safenudge.json");

// Must match the localnet/fallback `FEE_RECIPIENT` constant in
// programs/safenudge/src/lib.rs. The withdraw_fees positive test needs the
// matching keypair (set SAFENUDGE_FEE_RECIPIENT_KEYPAIR to a JSON file path);
// the negative test only needs the pubkey.
const FEE_RECIPIENT = new PublicKey("FobkDn4rY18j5UAhigt5kAGsMyqP8PDxXGMH94TgG2sh");
const PROTOCOL_FEE_BPS = 500n;

describe("safenudge", () => {
  let context: any;
  let provider: BankrunProvider;
  let program: Program;
  let payer: Keypair;
  let usdcMint: PublicKey;
  let mintAuthority: Keypair;

  const DECIMALS = 6;

  before(async () => {
    context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    program = new Program(IDL, provider);
    payer = provider.wallet.payer;

    // Create mock USDC mint
    mintAuthority = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        DECIMALS,
        mintAuthority.publicKey,
        null,
        TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, [payer, mintKeypair]);
    usdcMint = mintKeypair.publicKey;
  });

  // ─── Helpers ──────────────────────────────────────────────

  function getGroupPda(groupCode: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("group"), Buffer.from(groupCode)],
      program.programId
    );
  }

  function getVaultPda(groupConfig: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), groupConfig.toBuffer()],
      program.programId
    );
  }

  function getMemberPda(groupConfig: PublicKey, member: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("member"), groupConfig.toBuffer(), member.toBuffer()],
      program.programId
    );
  }

  function getTreasuryAuthorityPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
  }

  function getTreasuryAta(mint: PublicKey): PublicKey {
    const [authority] = getTreasuryAuthorityPda();
    return getAssociatedTokenAddressSync(mint, authority, true);
  }

  async function getTokenBalanceOrZero(ata: PublicKey): Promise<bigint> {
    const acct = await context.banksClient.getAccount(ata);
    if (!acct) return 0n;
    return AccountLayout.decode(acct.data).amount;
  }

  function loadFeeRecipientKeypair(): Keypair | null {
    const envPath = process.env.SAFENUDGE_FEE_RECIPIENT_KEYPAIR;
    if (!envPath) return null;
    try {
      const bytes = JSON.parse(fs.readFileSync(envPath, "utf-8"));
      const kp = Keypair.fromSecretKey(Uint8Array.from(bytes));
      if (!kp.publicKey.equals(FEE_RECIPIENT)) return null;
      return kp;
    } catch {
      return null;
    }
  }

  async function createFundedMember(amount: number): Promise<{ keypair: Keypair; tokenAccount: PublicKey }> {
    const keypair = Keypair.generate();
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx, [payer]);

    const ata = getAssociatedTokenAddressSync(usdcMint, keypair.publicKey);
    const tokenTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, keypair.publicKey, usdcMint),
      createMintToInstruction(usdcMint, ata, mintAuthority.publicKey, amount)
    );
    await provider.sendAndConfirm(tokenTx, [payer, mintAuthority]);

    return { keypair, tokenAccount: ata };
  }

  // ─── create_group tests ───────────────────────────────────

  describe("create_group", () => {
    it("creates a group with valid params", async () => {
      const groupCode = "test-group-1";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(
          groupCode,
          new anchor.BN(10_000_000),
          0, 4, 5, 0,
          new anchor.BN(2_000_000)
        )
        .accounts({
          creator: payer.publicKey,
          groupConfig: groupConfigPda,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const group = await program.account.groupConfig.fetch(groupConfigPda);
      assert.equal(group.groupCode, groupCode);
      assert.equal(group.creator.toBase58(), payer.publicKey.toBase58());
      assert.equal(group.mint.toBase58(), usdcMint.toBase58());
      assert.equal(group.depositAmount.toNumber(), 10_000_000);
      assert.equal(group.frequency, 0);
      assert.equal(group.totalPeriods, 4);
      assert.equal(group.maxMembers, 5);
      assert.equal(group.currentMembers, 0);
      assert.equal(group.penaltyType, 0);
      assert.equal(group.penaltyValue.toNumber(), 2_000_000);
      assert.equal(group.status, 0);
    });

    it("fails with invalid frequency", async () => {
      const groupCode = "bad-freq";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 3, 4, 5, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidFrequency");
      }
    });

    it("fails with invalid group size", async () => {
      const groupCode = "bad-size";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 11, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupSize");
      }
    });

    it("fails with invalid penalty config (percentage > 50%)", async () => {
      const groupCode = "bad-penalty";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 5, 1, new anchor.BN(5001))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidPenaltyConfig");
      }
    });

    it("fails with invalid group code (special chars)", async () => {
      const groupCode = "bad code!@#";
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      try {
        await program.methods
          .createGroup(groupCode, new anchor.BN(10_000_000), 0, 4, 5, 0, new anchor.BN(2_000_000))
          .accounts({
            creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
            mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupCode");
      }
    });
  });

  // ─── join_group tests ─────────────────────────────────────

  describe("join_group", () => {
    it("member joins with deposit", async () => {
      const groupCode = "join-test-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      // Create group
      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Create funded member
      const member = await createFundedMember(depositAmount * 10);
      const [memberRecordPda] = getMemberPda(groupConfigPda, member.keypair.publicKey);

      await program.methods
        .joinGroup()
        .accounts({
          member: member.keypair.publicKey,
          groupConfig: groupConfigPda,
          memberRecord: memberRecordPda,
          memberTokenAccount: member.tokenAccount,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([member.keypair])
        .rpc();

      // Verify member record
      const record = await program.account.memberRecord.fetch(memberRecordPda);
      assert.equal(record.group.toBase58(), groupConfigPda.toBase58());
      assert.equal(record.member.toBase58(), member.keypair.publicKey.toBase58());
      assert.equal(record.totalDeposited.toNumber(), depositAmount);
      assert.equal(record.depositsMade, 1);
      assert.equal(record.periodsDeposited[0], true);
      assert.equal(record.periodsDeposited[1], false);
      assert.equal(record.hasClaimed, false);

      // Verify group current_members incremented
      const group = await program.account.groupConfig.fetch(groupConfigPda);
      assert.equal(group.currentMembers, 1);
    });

    it("fails when group is full", async () => {
      const groupCode = "join-full-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      // Create group with max_members=2
      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 2, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Join 2 members
      for (let i = 0; i < 2; i++) {
        const m = await createFundedMember(depositAmount * 10);
        const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
        await program.methods
          .joinGroup()
          .accounts({
            member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
            memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m.keypair])
          .rpc();
      }

      // 3rd member should fail
      const extra = await createFundedMember(depositAmount * 10);
      const [extraPda] = getMemberPda(groupConfigPda, extra.keypair.publicKey);

      try {
        await program.methods
          .joinGroup()
          .accounts({
            member: extra.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: extraPda,
            memberTokenAccount: extra.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([extra.keypair])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "GroupFull");
      }
    });

    it("fails when cycle is active", async () => {
      const groupCode = "join-active-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      // Create group
      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Join 2 members
      for (let i = 0; i < 2; i++) {
        const m = await createFundedMember(depositAmount * 10);
        const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
        await program.methods
          .joinGroup()
          .accounts({
            member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
            memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m.keypair])
          .rpc();
      }

      // Start cycle
      await program.methods
        .startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
        .rpc();

      // Try to join after cycle started
      const late = await createFundedMember(depositAmount * 10);
      const [latePda] = getMemberPda(groupConfigPda, late.keypair.publicKey);

      try {
        await program.methods
          .joinGroup()
          .accounts({
            member: late.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: latePda,
            memberTokenAccount: late.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([late.keypair])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupStatus");
      }
    });
  });

  // ─── start_cycle tests ────────────────────────────────────

  describe("start_cycle", () => {
    it("creator starts cycle with 2+ members", async () => {
      const groupCode = "start-test-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 2; i++) {
        const m = await createFundedMember(depositAmount * 10);
        const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
        await program.methods
          .joinGroup()
          .accounts({
            member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
            memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m.keypair])
          .rpc();
      }

      await program.methods
        .startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
        .rpc();

      const group = await program.account.groupConfig.fetch(groupConfigPda);
      assert.equal(group.status, 1); // STATUS_ACTIVE
      assert.isAbove(group.cycleStart.toNumber(), 0);
      assert.equal(group.currentPeriod, 0);
    });

    it("fails when non-creator tries", async () => {
      const groupCode = "start-unauth-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 2; i++) {
        const m = await createFundedMember(depositAmount * 10);
        const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
        await program.methods
          .joinGroup()
          .accounts({
            member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
            memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m.keypair])
          .rpc();
      }

      const imposter = Keypair.generate();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey, toPubkey: imposter.publicKey,
          lamports: anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(fundTx, [payer]);

      try {
        await program.methods
          .startCycle()
          .accounts({ creator: imposter.publicKey, groupConfig: groupConfigPda })
          .signers([imposter])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "UnauthorizedCreator");
      }
    });

    it("fails with fewer than 2 members", async () => {
      const groupCode = "start-few-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const m = await createFundedMember(depositAmount * 10);
      const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
      await program.methods
        .joinGroup()
        .accounts({
          member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
          memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m.keypair])
        .rpc();

      try {
        await program.methods
          .startCycle()
          .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InsufficientMembers");
      }
    });

    it("fails when already active", async () => {
      const groupCode = "start-dup-1";
      const depositAmount = 10_000_000;
      const [groupConfigPda] = getGroupPda(groupCode);
      const [vaultPda] = getVaultPda(groupConfigPda);

      await program.methods
        .createGroup(groupCode, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: groupConfigPda, vault: vaultPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 2; i++) {
        const m = await createFundedMember(depositAmount * 10);
        const [mPda] = getMemberPda(groupConfigPda, m.keypair.publicKey);
        await program.methods
          .joinGroup()
          .accounts({
            member: m.keypair.publicKey, groupConfig: groupConfigPda, memberRecord: mPda,
            memberTokenAccount: m.tokenAccount, vault: vaultPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .signers([m.keypair])
          .rpc();
      }

      await program.methods
        .startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
        .rpc();

      // Warp slot so bankrun doesn't reject as duplicate transaction
      const clock = await context.banksClient.getClock();
      context.setClock(
        new Clock(
          clock.slot + BigInt(1),
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + BigInt(1)
        )
      );

      try {
        await program.methods
          .startCycle()
          .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        // Second startCycle must fail — either with InvalidGroupStatus (status != Open)
        // or bankrun's "already processed" dedup (same tx hash in same slot)
        const errStr = e.message || e.toString();
        assert.ok(
          errStr.includes("InvalidGroupStatus") ||
          errStr.includes("0x1770") ||
          errStr.includes("already been processed"),
          `Expected error on double start, got: ${errStr.substring(0, 200)}`
        );
      }
    });
  });

  // ─── deposit tests ───────────────────────────────────────

  describe("deposit", () => {
    it("member deposits for current period (period 1 after time advance)", async () => {
      const code = "deposit-ok";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group (weekly, 4 periods)
      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Two members join
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance clock by 8 days (into period 1 for weekly)
      const currentClock = await context.banksClient.getClock();
      context.setClock(
        new Clock(
          currentClock.slot,
          currentClock.epochStartTimestamp,
          currentClock.epoch,
          currentClock.leaderScheduleEpoch,
          currentClock.unixTimestamp + BigInt(8 * 86400)
        )
      );

      // Member 1 deposits for period 1
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      const record = await program.account.memberRecord.fetch(m1Pda);
      assert.equal(record.depositsMade, 2); // join + period 1
      assert.equal(record.totalDeposited.toNumber(), 10_000_000); // 5M + 5M
      assert.equal(record.periodsDeposited[0], true);
      assert.equal(record.periodsDeposited[1], true);
      assert.equal(record.periodsDeposited[2], false);
    });

    it("fails with duplicate deposit for same period", async () => {
      const code = "dup-deposit";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
      const [mPda] = getMemberPda(gPda, m.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
          memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Period 0 already deposited via join — try again (clock still in period 0)
      try {
        await program.methods.deposit()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m]).rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "AlreadyDeposited");
      }
    });

    it("fails when cycle not active", async () => {
      const code = "not-active-dep";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m, tokenAccount: mAta } = await createFundedMember(100_000_000);
      const [mPda] = getMemberPda(gPda, m.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
          memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m]).rpc();

      // Don't start cycle — try to deposit
      try {
        await program.methods.deposit()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m]).rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidGroupStatus");
      }
    });
  });

  // ─── distribute tests ─────────────────────────────────────

  describe("distribute", () => {
    it("distributes correctly when all members are compliant", async () => {
      const code = "dist-all-ok";
      const depositAmount = 5_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 2 periods, fixed 1 USDC penalty, deposit 5 USDC
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join (period 0 deposit included)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance 8 days (into period 1)
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Both deposit period 1
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      await program.methods.deposit()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m2]).rpc();

      // Advance past cycle end (2 weeks = 14 days total, we're at 8, add 8 more)
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Verify status == Completed
      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("distributes with penalties: one member misses deposits", async () => {
      const code = "dist-penalty";
      const depositAmount = 10_000_000; // 10 USDC
      const penaltyValue = 2_000_000;   // 2 USDC fixed penalty per missed period
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 2 periods, fixed 2 USDC penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 0, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join (both deposit period 0 via join = 10M each)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(200_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(200_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance 8 days (into period 1)
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Only m1 deposits period 1 (m2 skips)
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      // Advance past cycle end
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Record balances before distribute
      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };

      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);
      const treasuryBefore = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);

      // m1: deposited 20M total, 0 missed, compliant
      // total_penalties = 2M, protocol fee = 100K (5%), redistributable = 1.9M
      // m1 = base 20M + bonus 1.9M = 21.9M
      const m1Received = Number(m1BalAfter - m1BalBefore);
      assert.equal(m1Received, 21_900_000);

      // m2: deposited 10M total, missed 1 → penalty 2M → base 8M, not compliant → 8M
      // m2 is last so gets vault remainder = 30M - 100K fee - 21.9M = 8M
      const m2Received = Number(m2BalAfter - m2BalBefore);
      assert.equal(m2Received, 8_000_000);

      // Conservation: members + fee == total deposits (30M)
      const treasuryAfter = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));
      const feeCharged = Number(treasuryAfter - treasuryBefore);
      assert.equal(feeCharged, 100_000);
      assert.equal(m1Received + m2Received + feeCharged, 30_000_000);

      // Verify status == Completed
      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("distributes with percentage penalty", async () => {
      const code = "dist-pct-pen";
      const depositAmount = 10_000_000; // 10 USDC
      const penaltyValue = 500;         // 5% (basis points)
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 2 periods, percentage 5% penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 1, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join (both deposit period 0 via join = 10M each)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(200_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(200_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Advance 8 days (into period 1)
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Only m1 deposits period 1 (m2 skips)
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      // Advance past cycle end (2 weeks total)
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Record balances before distribute
      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };

      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);
      const treasuryBefore = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);

      // m2 missed 1 period: penalty = 1 * (10_000_000 * 500 / 10000) = 500_000
      // total_penalties = 500K, protocol fee = 25K (5%), redistributable = 475K
      // m1 compliant → base 20M + bonus 475K = 20_475_000
      const m1Received = Number(m1BalAfter - m1BalBefore);
      assert.equal(m1Received, 20_475_000);

      // m2 (last) gets vault remainder = 30M - 25K fee - 20.475M = 9.5M
      const m2Received = Number(m2BalAfter - m2BalBefore);
      assert.equal(m2Received, 9_500_000);

      // Conservation: members + fee == total deposits (30M)
      const treasuryAfter = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));
      const feeCharged = Number(treasuryAfter - treasuryBefore);
      assert.equal(feeCharged, 25_000);
      assert.equal(m1Received + m2Received + feeCharged, 30_000_000);

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("distributes when all members miss equally (no compliant members)", async () => {
      const code = "dist-all-miss";
      const depositAmount = 5_000_000; // 5 USDC
      const penaltyValue = 1_000_000;  // 1 USDC fixed
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 2 periods, fixed 1 USDC penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 0, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join (both deposit period 0 via join = 5M each)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(200_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(200_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Neither deposits for period 1 — advance past cycle end (2 weeks)
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(15 * 86400))
      );

      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };

      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);
      const treasuryBefore = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);

      // No compliant members → there is no one to redistribute penalties to.
      // The protocol refunds each member their full deposited amount, exactly
      // like emergency_cancel. This avoids the prior order-dependent windfall
      // where whoever was passed last received the entire penalty pool.
      const m1Received = Number(m1BalAfter - m1BalBefore);
      const m2Received = Number(m2BalAfter - m2BalBefore);
      assert.equal(m1Received, depositAmount);
      assert.equal(m2Received, depositAmount);

      // No fee charged when no one is compliant (pro-rata refund branch).
      const treasuryAfter = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));
      assert.equal(treasuryAfter - treasuryBefore, 0n);

      // Conservation: total == vault (10M)
      assert.equal(m1Received + m2Received, 10_000_000);

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("caps penalty at total_deposited (no negative balances)", async () => {
      // Warp clock to avoid bankrun tx dedup with prior tests
      const ck = await context.banksClient.getClock();
      context.setClock(new Clock(ck.slot + BigInt(10_000), ck.epochStartTimestamp, ck.epoch, ck.leaderScheduleEpoch, ck.unixTimestamp + BigInt(10_000)));

      const code = "dist-cap-pen";
      const depositAmount = 5_000_000;  // 5 USDC
      const penaltyValue = 10_000_000;  // 10 USDC fixed (way more than deposit)
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 4 periods, fixed 10 USDC penalty
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join (both deposit period 0 via join = 5M each)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(200_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(200_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // m1 deposits all remaining periods (1, 2, 3), m2 deposits nothing more.
      // Bump slot each iteration so recent_blockhash differs and bankrun does
      // not dedup the otherwise-identical deposit tx.
      for (let period = 1; period <= 3; period++) {
        let clk = await context.banksClient.getClock();
        context.setClock(
          new Clock(clk.slot + BigInt(period * 1000), clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
            clk.unixTimestamp + BigInt(7 * 86400 + 100))
        );

        await program.methods.deposit()
          .accounts({
            member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
            memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m1]).rpc();
      }

      // Advance past cycle end (4 weeks total)
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(7 * 86400 + 100))
      );

      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };

      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);
      const treasuryBefore = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);

      // m1 deposited 20M (4 periods), 0 missed → compliant
      // m2 deposited 5M (1 period), missed 3 → raw penalty = 3 * 10M = 30M, capped at 5M
      // m2 base = 5M - 5M = 0
      // total_penalties = 5M, protocol fee = 250K (5%), redistributable = 4.75M
      // m1 = 20M + 4.75M = 24_750_000
      const m1Received = Number(m1BalAfter - m1BalBefore);
      assert.equal(m1Received, 24_750_000);

      // m2 (last) gets vault remainder = 25M - 250K fee - 24.75M = 0
      const m2Received = Number(m2BalAfter - m2BalBefore);
      assert.equal(m2Received, 0);

      // Conservation: members + fee == total deposits (25M)
      const treasuryAfter = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));
      const feeCharged = Number(treasuryAfter - treasuryBefore);
      assert.equal(feeCharged, 250_000);
      assert.equal(m1Received + m2Received + feeCharged, 25_000_000);

      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);
    });

    it("fails when cycle has not ended", async () => {
      const code = "dist-early";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 4 periods
      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 4, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Try to distribute immediately (cycle is 4 weeks, not ended)
      try {
        await program.methods.distribute()
          .accounts({
            payer: payer.publicKey,
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
            { pubkey: m2Pda, isWritable: false, isSigner: false },
            { pubkey: m2Ata, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "CycleNotEnded");
      }
    });

    it("fails when destination ATA does not belong to the member (vault drain attempt)", async () => {
      const code = "dist-bad-ata";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 1, 5, 0, new anchor.BN(0))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Attacker controls a wallet with their own USDC ATA.
      const { tokenAccount: attackerAta } = await createFundedMember(0);

      // Advance past cycle end (1 week + slack)
      const clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Substitute the attacker's ATA for m1's payout destination.
      try {
        await program.methods.distribute()
          .accounts({
            payer: payer.publicKey,
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: attackerAta, isWritable: true, isSigner: false },
            { pubkey: m2Pda, isWritable: false, isSigner: false },
            { pubkey: m2Ata, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidTokenAccountOwner");
      }
    });

    it("fails when the same member_record is passed more than once (lockout attempt)", async () => {
      const code = "dist-dup-rec";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 1, 5, 0, new anchor.BN(0))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      const clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Pass m1's record twice; m2 is omitted entirely.
      try {
        await program.methods.distribute()
          .accounts({
            payer: payer.publicKey,
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "DuplicateMemberRecord");
      }
    });

    it("fails when a member_record account is not program-owned (forged record)", async () => {
      const code = "dist-bad-own";
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(5_000_000), 0, 1, 5, 0, new anchor.BN(0))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      const clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Substitute a system-owned wallet (the payer) for m2's record. The
      // account is owned by the system program, not by safenudge.
      try {
        await program.methods.distribute()
          .accounts({
            payer: payer.publicKey,
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
            { pubkey: payer.publicKey, isWritable: false, isSigner: false },
            { pubkey: m2Ata, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidAccountOwner");
      }
    });

    it("charges 5% protocol fee to treasury when penalties exist", async () => {
      const code = "dist-fee-take";
      const depositAmount = 10_000_000; // 10 USDC
      const penaltyValue = 4_000_000;   // 4 USDC fixed
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 0, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(200_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(200_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // m1 deposits, m2 skips period 1
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      const treasuryAta = getTreasuryAta(usdcMint);
      const treasuryBefore = await getTokenBalanceOrZero(treasuryAta);

      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      // total_penalties = 4M, fee = 4M * 500 / 10000 = 200K
      const treasuryAfter = await getTokenBalanceOrZero(treasuryAta);
      const feeCharged = treasuryAfter - treasuryBefore;
      assert.equal(Number(feeCharged), 200_000);
    });

    it("charges zero fee when all members are compliant", async () => {
      const code = "dist-fee-zero-ok";
      const depositAmount = 5_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 2, 5, 0, new anchor.BN(1_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      // Both deposit period 1
      for (const [m, mPda, mAta] of [[m1, m1Pda, m1Ata], [m2, m2Pda, m2Ata]] as const) {
        await program.methods.deposit()
          .accounts({
            member: m.publicKey, groupConfig: gPda, memberRecord: mPda,
            memberTokenAccount: mAta, vault: vPda, mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([m]).rpc();
      }

      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(8 * 86400))
      );

      const treasuryAta = getTreasuryAta(usdcMint);
      const treasuryBefore = await getTokenBalanceOrZero(treasuryAta);

      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const treasuryAfter = await getTokenBalanceOrZero(treasuryAta);
      assert.equal(treasuryAfter, treasuryBefore);
    });
  });

  // ─── withdraw_fees tests ──────────────────────────────────

  describe("withdraw_fees", () => {
    it("rejects callers that are not the configured FEE_RECIPIENT", async () => {
      const treasuryAta = getTreasuryAta(usdcMint);
      const { keypair: attacker } = await createFundedMember(0);

      // Build an arbitrary recipient ATA owned by the attacker. The constraint
      // on recipient_token_account.owner == FEE_RECIPIENT should reject it.
      const attackerAta = getAssociatedTokenAddressSync(usdcMint, attacker.publicKey);

      try {
        await program.methods.withdrawFees()
          .accounts({
            recipient: attacker.publicKey,
            treasuryTokenAccount: treasuryAta,
            recipientTokenAccount: attackerAta,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        // Either UnauthorizedRecipient (signer constraint) or
        // InvalidTokenAccountOwner (recipient ATA constraint) — both prove
        // that an arbitrary caller cannot drain the treasury.
        assert.match(e.message, /UnauthorizedRecipient|InvalidTokenAccountOwner|ConstraintRaw/);
      }
    });

    it("transfers full treasury balance to the FEE_RECIPIENT (env-gated)", async () => {
      const recipientKp = loadFeeRecipientKeypair();
      if (!recipientKp) {
        // No keypair available — the negative test above covers the safety
        // property. To run this end-to-end, set
        // SAFENUDGE_FEE_RECIPIENT_KEYPAIR=/path/to/keypair.json.
        return;
      }

      // Fund recipient and create their ATA.
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipientKp.publicKey,
          lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(fundTx, [payer]);

      const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipientKp.publicKey);
      const ataAcct = await context.banksClient.getAccount(recipientAta);
      if (!ataAcct) {
        const ataTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey, recipientAta, recipientKp.publicKey, usdcMint
          )
        );
        await provider.sendAndConfirm(ataTx, [payer]);
      }

      const treasuryAta = getTreasuryAta(usdcMint);
      const treasuryBefore = await getTokenBalanceOrZero(treasuryAta);

      await program.methods.withdrawFees()
        .accounts({
          recipient: recipientKp.publicKey,
          treasuryTokenAccount: treasuryAta,
          recipientTokenAccount: recipientAta,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([recipientKp])
        .rpc();

      const treasuryAfter = await getTokenBalanceOrZero(treasuryAta);
      const recipientBalance = await getTokenBalanceOrZero(recipientAta);
      assert.equal(treasuryAfter, 0n);
      assert.equal(recipientBalance, treasuryBefore);
    });
  });

  // ─── emergency_cancel tests ──────────────────────────────

  describe("emergency_cancel", () => {
    it("creator cancels during open — full refund", async () => {
      const code = "cancel-open";
      const depositAmount = 10_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      // Record balance before cancel
      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };
      const m1BalBefore = await getTokenBalance(m1Ata);

      // Emergency cancel
      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Verify status == Cancelled (3)
      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 3);

      // Verify full refund
      const m1BalAfter = await getTokenBalance(m1Ata);
      const m1Received = Number(m1BalAfter - m1BalBefore);
      assert.equal(m1Received, depositAmount);
    });

    it("creator cancels during active — full refund", async () => {
      const code = "cancel-active";
      const depositAmount = 10_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2 members join
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(100_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Record balances
      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };
      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);

      // Emergency cancel
      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Verify status == Cancelled (3)
      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 3);

      // Verify full refunds
      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);
      assert.equal(Number(m1BalAfter - m1BalBefore), depositAmount);
      assert.equal(Number(m2BalAfter - m2BalBefore), depositAmount);
    });

    it("fails when non-creator tries to cancel", async () => {
      const code = "cancel-unauth";
      const depositAmount = 10_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      // Imposter tries to cancel
      const imposter = Keypair.generate();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey, toPubkey: imposter.publicKey,
          lamports: anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(fundTx, [payer]);

      try {
        await program.methods.emergencyCancel()
          .accounts({
            creator: imposter.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
          ])
          .signers([imposter])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        const errStr = e.message || e.toString();
        assert.ok(
          errStr.includes("UnauthorizedCreator") || errStr.includes("has_one"),
          `Expected UnauthorizedCreator, got: ${errStr.substring(0, 200)}`
        );
      }
    });

    it("fails when group already cancelled", async () => {
      const code = "cancel-twice";
      const depositAmount = 10_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(2_000_000))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      // First cancel
      await program.methods.emergencyCancel()
        .accounts({
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      // Second cancel should fail (status is Cancelled, vault is closed)
      try {
        await program.methods.emergencyCancel()
          .accounts({
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: m1Ata, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        const errStr = e.message || e.toString();
        assert.ok(
          errStr.includes("InvalidGroupStatus") ||
          errStr.includes("AccountNotInitialized") ||
          errStr.includes("already been processed") ||
          errStr.includes("0xbbd"),
          `Expected error on double cancel, got: ${errStr.substring(0, 200)}`
        );
      }
    });

    it("fails when destination ATA does not belong to the member (creator drain attempt)", async () => {
      const code = "cancel-bad-ata";
      const depositAmount = 10_000_000;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, 4, 5, 0, new anchor.BN(0))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(100_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      // Creator's own ATA — would receive m1's refund if the program failed
      // to validate destination ownership.
      const creatorAta = getAssociatedTokenAddressSync(usdcMint, payer.publicKey);
      const creatorAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey, creatorAta, payer.publicKey, usdcMint
        )
      );
      await provider.sendAndConfirm(creatorAtaTx, [payer]);

      try {
        await program.methods.emergencyCancel()
          .accounts({
            creator: payer.publicKey,
            groupConfig: gPda,
            vault: vPda,
            mint: usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: m1Pda, isWritable: false, isSigner: false },
            { pubkey: creatorAta, isWritable: true, isSigner: false },
          ])
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        assert.include(e.message, "InvalidTokenAccountOwner");
      }
    });
  });

  // ─── integration tests ────────────────────────────────────

  describe("integration", () => {
    it("full lifecycle: 3 members, 4 weekly deposits, partial compliance", async () => {
      const code = "integ-full";
      const depositAmount = 10_000_000; // 10 USDC
      const penaltyValue = 2_000_000;   // 2 USDC fixed
      const totalPeriods = 4;
      const [gPda] = getGroupPda(code);
      const [vPda] = getVaultPda(gPda);

      // Create group: weekly, 4 periods, fixed 2 USDC penalty, max 5 members
      await program.methods
        .createGroup(code, new anchor.BN(depositAmount), 0, totalPeriods, 5, 0, new anchor.BN(penaltyValue))
        .accounts({
          creator: payer.publicKey, groupConfig: gPda, vault: vPda,
          mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 3 members join (each deposits period 0 via join = 10M each)
      const { keypair: m1, tokenAccount: m1Ata } = await createFundedMember(500_000_000);
      const [m1Pda] = getMemberPda(gPda, m1.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m1]).rpc();

      const { keypair: m2, tokenAccount: m2Ata } = await createFundedMember(500_000_000);
      const [m2Pda] = getMemberPda(gPda, m2.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m2]).rpc();

      const { keypair: m3, tokenAccount: m3Ata } = await createFundedMember(500_000_000);
      const [m3Pda] = getMemberPda(gPda, m3.publicKey);
      await program.methods.joinGroup()
        .accounts({
          member: m3.publicKey, groupConfig: gPda, memberRecord: m3Pda,
          memberTokenAccount: m3Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([m3]).rpc();

      // Verify 3 members joined
      const groupAfterJoin = await program.account.groupConfig.fetch(gPda);
      assert.equal(groupAfterJoin.currentMembers, 3);

      // Start cycle
      await program.methods.startCycle()
        .accounts({ creator: payer.publicKey, groupConfig: gPda })
        .rpc();

      // Deposit schedule:
      // Period 0: all 3 deposited (via join)
      // Period 1: m1 + m2 deposit, m3 skips
      // Period 2: m1 + m2 deposit, m3 skips
      // Period 3: m1 deposits, m2 + m3 skip

      // Period 1
      let clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(7 * 86400 + 100))
      );

      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      await program.methods.deposit()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m2]).rpc();

      // Period 2
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(7 * 86400 + 100))
      );

      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      await program.methods.deposit()
        .accounts({
          member: m2.publicKey, groupConfig: gPda, memberRecord: m2Pda,
          memberTokenAccount: m2Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m2]).rpc();

      // Period 3
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(7 * 86400 + 100))
      );

      // Only m1 deposits period 3
      await program.methods.deposit()
        .accounts({
          member: m1.publicKey, groupConfig: gPda, memberRecord: m1Pda,
          memberTokenAccount: m1Ata, vault: vPda, mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([m1]).rpc();

      // Verify deposit records
      const m1Record = await program.account.memberRecord.fetch(m1Pda);
      assert.equal(m1Record.depositsMade, 4); // all periods
      assert.equal(m1Record.totalDeposited.toNumber(), 40_000_000);

      const m2Record = await program.account.memberRecord.fetch(m2Pda);
      assert.equal(m2Record.depositsMade, 3); // periods 0,1,2
      assert.equal(m2Record.totalDeposited.toNumber(), 30_000_000);

      const m3Record = await program.account.memberRecord.fetch(m3Pda);
      assert.equal(m3Record.depositsMade, 1); // period 0 only
      assert.equal(m3Record.totalDeposited.toNumber(), 10_000_000);

      // Advance past cycle end (4 weeks total)
      clk = await context.banksClient.getClock();
      context.setClock(
        new Clock(clk.slot, clk.epochStartTimestamp, clk.epoch, clk.leaderScheduleEpoch,
          clk.unixTimestamp + BigInt(7 * 86400 + 100))
      );

      // Record balances before distribute
      const getTokenBalance = async (ata: PublicKey): Promise<bigint> => {
        const acct = await context.banksClient.getAccount(ata);
        const data = AccountLayout.decode(acct!.data);
        return data.amount;
      };

      const m1BalBefore = await getTokenBalance(m1Ata);
      const m2BalBefore = await getTokenBalance(m2Ata);
      const m3BalBefore = await getTokenBalance(m3Ata);
      const treasuryBefore = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));

      // Total vault = 40M + 30M + 10M = 80M
      const vaultAcct = await context.banksClient.getAccount(vPda);
      const vaultData = AccountLayout.decode(vaultAcct!.data);
      assert.equal(Number(vaultData.amount), 80_000_000);

      // Distribute
      await program.methods.distribute()
        .accounts({
          payer: payer.publicKey,
          creator: payer.publicKey,
          groupConfig: gPda,
          vault: vPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: m1Pda, isWritable: false, isSigner: false },
          { pubkey: m1Ata, isWritable: true, isSigner: false },
          { pubkey: m2Pda, isWritable: false, isSigner: false },
          { pubkey: m2Ata, isWritable: true, isSigner: false },
          { pubkey: m3Pda, isWritable: false, isSigner: false },
          { pubkey: m3Ata, isWritable: true, isSigner: false },
        ])
        .rpc();

      const m1BalAfter = await getTokenBalance(m1Ata);
      const m2BalAfter = await getTokenBalance(m2Ata);
      const m3BalAfter = await getTokenBalance(m3Ata);

      const m1Received = Number(m1BalAfter - m1BalBefore);
      const m2Received = Number(m2BalAfter - m2BalBefore);
      const m3Received = Number(m3BalAfter - m3BalBefore);

      // Penalty math:
      // m1: deposited 4/4, missed 0 → penalty 0, base 40M, compliant ✓
      // m2: deposited 3/4, missed 1 → penalty 1*2M = 2M, base 30M-2M = 28M, not compliant
      // m3: deposited 1/4, missed 3 → penalty 3*2M = 6M, base 10M-6M = 4M, not compliant
      // total_penalties = 2M + 6M = 8M
      // compliant_count = 1 (m1 only)
      // protocol fee = 8M * 500 / 10000 = 400K
      // redistributable = 8M - 400K = 7.6M
      // bonus_per_compliant = 7.6M / 1 = 7.6M
      // m1 final = 40M + 7.6M = 47.6M
      // m2 final = 28M
      // m3 final (last) = vault remainder = 80M - 400K fee - 47.6M - 28M = 4M

      assert.equal(m1Received, 47_600_000);
      assert.equal(m2Received, 28_000_000);
      assert.equal(m3Received, 4_000_000);

      // Conservation of funds: sum(payouts) + fee == sum(deposits) == 80M
      const treasuryAfter = await getTokenBalanceOrZero(getTreasuryAta(usdcMint));
      const feeCharged = Number(treasuryAfter - treasuryBefore);
      assert.equal(feeCharged, 400_000);
      assert.equal(m1Received + m2Received + m3Received + feeCharged, 80_000_000);

      // Verify status == Completed
      const group = await program.account.groupConfig.fetch(gPda);
      assert.equal(group.status, 2);

      // Verify vault is closed (account no longer exists)
      const vaultAfter = await context.banksClient.getAccount(vPda);
      assert.isNull(vaultAfter);
    });
  });
});
