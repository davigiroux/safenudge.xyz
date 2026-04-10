import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Clock } from "solana-bankrun";
import { PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

const IDL = require("../target/idl/safenudge.json");

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

      try {
        await program.methods
          .startCycle()
          .accounts({ creator: payer.publicKey, groupConfig: groupConfigPda })
          .rpc();
        assert.fail("should have failed");
      } catch (e: any) {
        // Bankrun may format errors differently — check for error code or message
        const errStr = e.message || e.toString();
        assert.ok(
          errStr.includes("InvalidGroupStatus") || errStr.includes("0x1770"),
          `Expected InvalidGroupStatus, got: ${errStr.substring(0, 200)}`
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
});
