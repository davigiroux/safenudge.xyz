import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
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
});
