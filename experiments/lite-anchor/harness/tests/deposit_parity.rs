//! Runs `deposit` against three builds from identical starting state and requires identical
//! outcomes: the same success or the same error code, the same bytes in every account afterwards,
//! and the same event bytes in the log. Compute units are the only thing allowed to differ.
//!
//! - `Anchor`: `programs/safenudge`, the deployed program.
//! - `AnchorDepositOnly`: `baselines/anchor-deposit`, the same program cut down to `deposit`.
//! - `Lite`: `examples/safenudge-lite`, the lite-anchor port.
//!
//! Both programs load at the real SafeNudge program ID in their own LiteSVM instance, which runs
//! with the mainnet feature set. Starting state is written directly from the account layouts
//! documented in `programs/safenudge/src/state/`, so the suite also checks those layouts.
//!
//! Build both programs first; see the README.

use std::path::PathBuf;
use std::str::FromStr;

use base64::Engine;
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_instruction_error::InstructionError;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

const PROGRAM_ID: &str = "GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc";
const TOKEN: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const WEEK: i64 = 604_800;
const CYCLE_START: i64 = 1_760_000_000;
const DEPOSIT: u64 = 50_000_000;
const DECIMALS: u8 = 6;
const RENT: u64 = 10_000_000;

fn addr(s: &str) -> Address {
    Address::from_str(s).unwrap()
}

fn program_id() -> Address {
    addr(PROGRAM_ID)
}

fn sha8(preimage: &str) -> [u8; 8] {
    let hash = Sha256::digest(preimage.as_bytes());
    hash[..8].try_into().unwrap()
}

// ── Programs ────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Build {
    Anchor,
    AnchorDepositOnly,
    Lite,
}

fn so_path(build: Build) -> PathBuf {
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    match build {
        // harness → lite-anchor → experiments → repo root
        Build::Anchor => here.join("../../../target/deploy/safenudge.so"),
        Build::AnchorDepositOnly => {
            here.join("../baselines/anchor-deposit/target/deploy/anchor_deposit.so")
        }
        Build::Lite => here.join("../target/deploy/safenudge_lite.so"),
    }
}

fn program_bytes(build: Build) -> Vec<u8> {
    let path = so_path(build);
    std::fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "{build:?} build missing at {} ({e}). Build it first: see experiments/lite-anchor/README.md",
            path.display()
        )
    })
}

// ── Account bytes ───────────────────────────────────────────────────────────

/// SPL mint, 82 bytes: no mint authority, supply, decimals, initialized, no freeze authority.
fn mint_data(decimals: u8) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    d[36..44].copy_from_slice(&u64::MAX.to_le_bytes());
    d[44] = decimals;
    d[45] = 1;
    d
}

/// SPL token account, 165 bytes. `state`: 0 uninitialized, 1 initialized, 2 frozen.
fn token_account_data(mint: &Address, owner: &Address, amount: u64, state: u8) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = state;
    d
}

#[derive(Clone)]
struct GroupState {
    creator: Address,
    mint: Address,
    deposit_amount: u64,
    cycle_start: i64,
    frequency: u8,
    total_periods: u8,
    status: u8,
    bump: u8,
    code: &'static str,
}

/// `GroupConfig`, 179 bytes, at the offsets in `programs/safenudge/src/state/group_config.rs`.
fn group_data(g: &GroupState) -> Vec<u8> {
    let mut d = vec![0u8; 179];
    d[0..8].copy_from_slice(b"snGroup2");
    d[8..40].copy_from_slice(g.creator.as_ref());
    d[40..72].copy_from_slice(g.creator.as_ref()); // rent_payer
    d[72..104].copy_from_slice(g.mint.as_ref());
    d[104..112].copy_from_slice(&g.deposit_amount.to_le_bytes());
    d[112..120].copy_from_slice(&500u64.to_le_bytes()); // penalty_value
    d[120..128].copy_from_slice(&g.cycle_start.to_le_bytes());
    d[136] = g.frequency;
    d[137] = g.total_periods;
    d[138] = 5; // max_members
    d[139] = 2; // current_members
    d[140] = 1; // penalty_type: percentage
    d[141] = g.status;
    d[142] = g.bump;
    d[143..147].copy_from_slice(&u32::try_from(g.code.len()).unwrap().to_le_bytes());
    d[147..147 + g.code.len()].copy_from_slice(g.code.as_bytes());
    d
}

/// `MemberRecord`, 166 bytes, at the offsets in `programs/safenudge/src/state/member_record.rs`.
fn record_data(
    group: &Address,
    member: &Address,
    deposited: &[usize],
    amount: u64,
    bump: u8,
) -> Vec<u8> {
    let mut d = vec![0u8; 166];
    d[0..8].copy_from_slice(b"snMembr2");
    d[8..40].copy_from_slice(group.as_ref());
    d[40..72].copy_from_slice(member.as_ref());
    d[72..104].copy_from_slice(member.as_ref()); // rent_payer
    let total = amount * u64::try_from(deposited.len()).unwrap();
    d[104..112].copy_from_slice(&total.to_le_bytes());
    d[112] = u8::try_from(deposited.len()).unwrap();
    for &p in deposited {
        d[113 + p] = 1;
    }
    d[165] = bump;
    d
}

fn owned_by(owner: &Address, data: Vec<u8>) -> Account {
    Account {
        lamports: RENT,
        data,
        owner: *owner,
        executable: false,
        rent_epoch: 0,
    }
}

// ── Scenario ────────────────────────────────────────────────────────────────

/// Everything that describes one `deposit` call. `Scenario::default()` is a valid deposit in
/// period 1 of a weekly, 4-period cycle where the member deposited in period 0 at join.
#[derive(Clone)]
struct Scenario {
    token_program: Address,
    status: u8,
    total_periods: u8,
    now: i64,
    already_deposited: Vec<usize>,
    member_balance: u64,
    member_token_state: u8,
    group_owner: Option<Address>,
    /// Per-account rewrites of the instruction after it is built.
    tweak: fn(&mut Instruction, &World),
    /// Whether `member` signs. When it does not, a separate fee payer signs.
    member_signs: bool,
}

impl Default for Scenario {
    fn default() -> Self {
        Self {
            token_program: addr(TOKEN),
            status: 1,
            total_periods: 4,
            now: CYCLE_START + WEEK + 3_600,
            already_deposited: vec![0],
            member_balance: 10 * DEPOSIT,
            member_token_state: 1,
            group_owner: None,
            tweak: |_, _| {},
            member_signs: true,
        }
    }
}

/// Addresses of everything `deposit` touches, plus decoys some scenarios swap in.
struct World {
    member: Keypair,
    other_member: Keypair,
    fee_payer: Keypair,
    group: Address,
    record: Address,
    other_record: Address,
    member_token: Address,
    other_wallet_token: Address,
    wrong_mint_token: Address,
    vault: Address,
    mint: Address,
    wrong_mint: Address,
    token_program: Address,
}

/// What a run left behind. Two runs agree when everything but `compute_units` is equal.
#[derive(Debug, PartialEq)]
struct Outcome {
    result: Result<(), TransactionError>,
    events: Vec<Vec<u8>>,
    accounts: Vec<(&'static str, Option<Vec<u8>>)>,
}

struct Run {
    outcome: Outcome,
    compute_units: u64,
    logs: Vec<String>,
}

/// Keypairs are fixed per scenario so both builds see the same addresses.
fn keypair(seed: u8) -> Keypair {
    Keypair::new_from_array([seed; 32])
}

fn build_world(s: &Scenario) -> World {
    let pid = program_id();
    let member = keypair(1);
    let other_member = keypair(2);
    let fee_payer = keypair(3);
    let mint = keypair(10).pubkey();
    let wrong_mint = keypair(11).pubkey();
    let code = "caixinha-01";
    let (group, _) = Address::find_program_address(&[b"group", code.as_bytes()], &pid);
    let (record, _) =
        Address::find_program_address(&[b"member", group.as_ref(), member.pubkey().as_ref()], &pid);
    let (other_record, _) = Address::find_program_address(
        &[b"member", group.as_ref(), other_member.pubkey().as_ref()],
        &pid,
    );
    let (vault, _) = Address::find_program_address(&[b"vault", group.as_ref()], &pid);
    World {
        member,
        other_member,
        fee_payer,
        group,
        record,
        other_record,
        member_token: keypair(20).pubkey(),
        other_wallet_token: keypair(21).pubkey(),
        wrong_mint_token: keypair(22).pubkey(),
        vault,
        mint,
        wrong_mint,
        token_program: s.token_program,
    }
}

fn deposit_ix(w: &World) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(w.member.pubkey(), true),
            AccountMeta::new(w.group, false),
            AccountMeta::new(w.record, false),
            AccountMeta::new(w.member_token, false),
            AccountMeta::new(w.vault, false),
            AccountMeta::new_readonly(w.mint, false),
            AccountMeta::new_readonly(w.token_program, false),
        ],
        data: sha8("global:deposit").to_vec(),
    }
}

fn run(build: Build, s: &Scenario) -> Run {
    let pid = program_id();
    let w = build_world(s);
    let mut svm = LiteSVM::new();
    svm.add_program(pid, &program_bytes(build)).unwrap();

    for kp in [&w.member, &w.other_member, &w.fee_payer] {
        svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    }

    let tp = s.token_program;
    let group = GroupState {
        creator: w.other_member.pubkey(),
        mint: w.mint,
        deposit_amount: DEPOSIT,
        cycle_start: CYCLE_START,
        frequency: 0,
        total_periods: s.total_periods,
        status: s.status,
        bump: Address::find_program_address(&[b"group", b"caixinha-01"], &pid).1,
        code: "caixinha-01",
    };
    let record_bump = |m: &Address| {
        Address::find_program_address(&[b"member", w.group.as_ref(), m.as_ref()], &pid).1
    };
    let deposited_so_far = DEPOSIT * 2 * u64::try_from(s.already_deposited.len()).unwrap();

    let accounts = [
        (w.mint, owned_by(&tp, mint_data(DECIMALS))),
        (w.wrong_mint, owned_by(&tp, mint_data(DECIMALS))),
        (
            w.group,
            owned_by(&s.group_owner.unwrap_or(pid), group_data(&group)),
        ),
        (
            w.record,
            owned_by(
                &pid,
                record_data(
                    &w.group,
                    &w.member.pubkey(),
                    &s.already_deposited,
                    DEPOSIT,
                    record_bump(&w.member.pubkey()),
                ),
            ),
        ),
        (
            w.other_record,
            owned_by(
                &pid,
                record_data(
                    &w.group,
                    &w.other_member.pubkey(),
                    &s.already_deposited,
                    DEPOSIT,
                    record_bump(&w.other_member.pubkey()),
                ),
            ),
        ),
        (
            w.member_token,
            owned_by(
                &tp,
                token_account_data(
                    &w.mint,
                    &w.member.pubkey(),
                    s.member_balance,
                    s.member_token_state,
                ),
            ),
        ),
        (
            w.other_wallet_token,
            owned_by(
                &tp,
                token_account_data(&w.mint, &w.other_member.pubkey(), 10 * DEPOSIT, 1),
            ),
        ),
        (
            w.wrong_mint_token,
            owned_by(
                &tp,
                token_account_data(&w.wrong_mint, &w.member.pubkey(), 10 * DEPOSIT, 1),
            ),
        ),
        (
            w.vault,
            owned_by(
                &tp,
                token_account_data(&w.mint, &w.vault, deposited_so_far, 1),
            ),
        ),
    ];
    for (address, account) in accounts {
        svm.set_account(address, account).unwrap();
    }

    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = s.now;
    svm.set_sysvar(&clock);

    let mut ix = deposit_ix(&w);
    (s.tweak)(&mut ix, &w);
    let (payer, signers): (Address, Vec<&Keypair>) = if s.member_signs {
        (w.member.pubkey(), vec![&w.member])
    } else {
        (w.fee_payer.pubkey(), vec![&w.fee_payer])
    };
    let tx = Transaction::new(
        &signers,
        Message::new(&[ix], Some(&payer)),
        svm.latest_blockhash(),
    );

    let (result, meta) = match svm.send_transaction(tx) {
        Ok(meta) => (Ok(()), meta),
        Err(failed) => (Err(failed.err), failed.meta),
    };
    let events = meta
        .logs
        .iter()
        .filter_map(|l| l.strip_prefix("Program data: "))
        .map(|b64| {
            base64::engine::general_purpose::STANDARD
                .decode(b64)
                .unwrap()
        })
        .collect();
    let snapshot = |name: &'static str, a: &Address| (name, svm.get_account(a).map(|acc| acc.data));
    Run {
        outcome: Outcome {
            result,
            events,
            accounts: vec![
                snapshot("group_config", &w.group),
                snapshot("member_record", &w.record),
                snapshot("member_token_account", &w.member_token),
                snapshot("vault", &w.vault),
            ],
        },
        compute_units: meta.compute_units_consumed,
        logs: meta.logs,
    }
}

/// Compute units of one run: the whole instruction, and the part spent inside the token program.
#[derive(Clone, Copy)]
struct Units {
    total: u64,
    token_cpi: u64,
}

impl Units {
    fn of(run: &Run, token_program: &Address) -> Self {
        let prefix = format!("Program {token_program} consumed ");
        let token_cpi = run
            .logs
            .iter()
            .filter_map(|l| l.strip_prefix(prefix.as_str()))
            .filter_map(|rest| rest.split(' ').next()?.parse::<u64>().ok())
            .sum();
        Self {
            total: run.compute_units,
            token_cpi,
        }
    }

    /// Spent in the program itself.
    fn own(self) -> u64 {
        self.total - self.token_cpi
    }
}

/// Units per build, in `Build` order.
struct BuildUnits {
    anchor: Units,
    anchor_deposit_only: Units,
    lite: Units,
}

/// Runs every build and requires the same outcome. Returns it with each build's compute units.
fn parity(s: &Scenario) -> (Outcome, BuildUnits) {
    let anchor = run(Build::Anchor, s);
    let deposit_only = run(Build::AnchorDepositOnly, s);
    let lite = run(Build::Lite, s);
    for (build, other) in [
        (Build::AnchorDepositOnly, &deposit_only),
        (Build::Lite, &lite),
    ] {
        assert_eq!(
            anchor.outcome, other.outcome,
            "Anchor and {build:?} disagree\nAnchor logs: {:#?}\n{build:?} logs: {:#?}",
            anchor.logs, other.logs
        );
    }
    let units = BuildUnits {
        anchor: Units::of(&anchor, &s.token_program),
        anchor_deposit_only: Units::of(&deposit_only, &s.token_program),
        lite: Units::of(&lite, &s.token_program),
    };
    (anchor.outcome, units)
}

fn custom(code: u32) -> Result<(), TransactionError> {
    Err(TransactionError::InstructionError(
        0,
        InstructionError::Custom(code),
    ))
}

fn program_error(e: InstructionError) -> Result<(), TransactionError> {
    Err(TransactionError::InstructionError(0, e))
}

fn token_amount(data: &[u8]) -> u64 {
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

// ── Happy paths ─────────────────────────────────────────────────────────────

fn check_successful_deposit(s: &Scenario) -> BuildUnits {
    let (outcome, units) = parity(s);
    assert_eq!(outcome.result, Ok(()));

    let w = build_world(s);
    let record = outcome.accounts[1].1.as_ref().unwrap();
    assert_eq!(record[113 + 1], 1, "period 1 marked");
    assert_eq!(record[112], 2, "deposits_made");
    assert_eq!(
        u64::from_le_bytes(record[104..112].try_into().unwrap()),
        2 * DEPOSIT
    );
    assert_eq!(
        token_amount(outcome.accounts[2].1.as_ref().unwrap()),
        9 * DEPOSIT
    );
    assert_eq!(
        token_amount(outcome.accounts[3].1.as_ref().unwrap()),
        3 * DEPOSIT
    );

    // DepositMade { group, member, period: 1, amount, deposits_made: 2 }, as Anchor's emit! encodes it.
    let mut event = sha8("event:DepositMade").to_vec();
    event.extend_from_slice(w.group.as_ref());
    event.extend_from_slice(w.member.pubkey().as_ref());
    event.push(1);
    event.extend_from_slice(&DEPOSIT.to_le_bytes());
    event.push(2);
    assert_eq!(outcome.events, vec![event]);
    units
}

#[test]
fn test_deposit_succeeds_with_spl_token() {
    check_successful_deposit(&Scenario::default());
}

#[test]
fn test_deposit_succeeds_with_token_2022() {
    check_successful_deposit(&Scenario {
        token_program: addr(TOKEN_2022),
        ..Scenario::default()
    });
}

/// `elapsed / period` truncates toward zero, so a clock a little before `cycle_start` still lands
/// in period 0. This is the signed division the lite build computes with `checked_div_i64`.
#[test]
fn test_deposit_before_cycle_start_lands_in_period_zero_in_both_builds() {
    let (outcome, _) = parity(&Scenario {
        now: CYCLE_START - 10,
        already_deposited: vec![],
        ..Scenario::default()
    });
    assert_eq!(outcome.result, Ok(()));
    assert_eq!(outcome.accounts[1].1.as_ref().unwrap()[113], 1);
}

#[test]
fn test_deposit_fails_a_full_period_before_cycle_start_in_both_builds() {
    let (outcome, _) = parity(&Scenario {
        now: CYCLE_START - WEEK - 1,
        ..Scenario::default()
    });
    assert_eq!(outcome.result, custom(6013)); // ArithmeticOverflow: period -1 is not a u8
}

#[test]
fn test_deposit_in_last_period_succeeds_in_both_builds() {
    let (outcome, _) = parity(&Scenario {
        now: CYCLE_START + 4 * WEEK - 1,
        ..Scenario::default()
    });
    assert_eq!(outcome.result, Ok(()));
    assert_eq!(outcome.accounts[1].1.as_ref().unwrap()[113 + 3], 1);
}

// ── Program errors ──────────────────────────────────────────────────────────

#[test]
fn test_deposit_fails_when_already_deposited_this_period() {
    let (o, _) = parity(&Scenario {
        already_deposited: vec![0, 1],
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(6005)); // AlreadyDeposited
}

#[test]
fn test_deposit_fails_after_cycle_ends() {
    let (o, _) = parity(&Scenario {
        now: CYCLE_START + 4 * WEEK,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(6006)); // CycleEnded
}

#[test]
fn test_deposit_fails_when_group_not_active() {
    for status in [0, 2, 3] {
        let (o, _) = parity(&Scenario {
            status,
            ..Scenario::default()
        });
        assert_eq!(o.result, custom(6000), "status {status}"); // InvalidGroupStatus
    }
}

#[test]
fn test_deposit_fails_with_token_account_of_another_mint() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[3].pubkey = w.wrong_mint_token,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(6014)); // InvalidMint
}

#[test]
fn test_deposit_fails_with_another_mint_account() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[5].pubkey = w.wrong_mint,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(6014)); // InvalidMint
}

// ── Framework errors ────────────────────────────────────────────────────────

#[test]
fn test_deposit_fails_from_token_account_of_another_wallet() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[3].pubkey = w.other_wallet_token,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(2003)); // ConstraintRaw
}

#[test]
fn test_deposit_fails_with_another_members_record() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[2].pubkey = w.other_record,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(2006)); // ConstraintSeeds
}

#[test]
fn test_deposit_fails_with_a_vault_that_is_not_the_group_pda() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[4].pubkey = w.other_wallet_token,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(2006)); // ConstraintSeeds
}

#[test]
fn test_deposit_fails_when_member_does_not_sign() {
    let (o, _) = parity(&Scenario {
        member_signs: false,
        tweak: |ix, _| ix.accounts[0].is_signer = false,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(3010)); // AccountNotSigner
}

#[test]
fn test_deposit_fails_when_group_owned_by_another_program() {
    let (o, _) = parity(&Scenario {
        group_owner: Some(addr(TOKEN)),
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(3007)); // AccountOwnedByWrongProgram
}

#[test]
fn test_deposit_fails_with_other_record_as_group() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[1].pubkey = w.other_record,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(3002)); // AccountDiscriminatorMismatch
}

#[test]
fn test_deposit_fails_with_a_token_program_that_is_not_one() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, _| ix.accounts[6].pubkey = program_id(),
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(3008)); // InvalidProgramId
}

#[test]
fn test_deposit_fails_when_group_not_writable() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, _| ix.accounts[1].is_writable = false,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(2000)); // ConstraintMut
}

#[test]
fn test_deposit_fails_when_vault_passed_as_member_token_account() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, w| ix.accounts[3].pubkey = w.vault,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(2040)); // ConstraintDuplicateMutableAccount
}

#[test]
fn test_deposit_fails_with_too_few_accounts() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, _| {
            ix.accounts.pop();
        },
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(3005)); // AccountNotEnoughKeys
}

#[test]
fn test_deposit_fails_with_unknown_or_short_instruction_data() {
    let (o, _) = parity(&Scenario {
        tweak: |ix, _| ix.data = sha8("global:depositt").to_vec(),
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(101)); // InstructionFallbackNotFound
    let (o, _) = parity(&Scenario {
        tweak: |ix, _| ix.data.truncate(4),
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(101));
}

// ── Token program errors pass through unchanged ─────────────────────────────

#[test]
fn test_deposit_fails_with_uninitialized_member_token_account() {
    let (o, _) = parity(&Scenario {
        member_token_state: 0,
        ..Scenario::default()
    });
    assert_eq!(
        o.result,
        program_error(InstructionError::UninitializedAccount)
    );
}

#[test]
fn test_deposit_fails_with_insufficient_balance() {
    let (o, _) = parity(&Scenario {
        member_balance: DEPOSIT - 1,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(1)); // token program: InsufficientFunds
}

#[test]
fn test_deposit_fails_from_frozen_token_account() {
    let (o, _) = parity(&Scenario {
        member_token_state: 2,
        ..Scenario::default()
    });
    assert_eq!(o.result, custom(17)); // token program: AccountFrozen
}

// ── Report ──────────────────────────────────────────────────────────────────

/// Prints compute units and program sizes. `cargo test -- --nocapture compute_unit_report`.
#[test]
fn compute_unit_report() {
    let rows = [
        ("deposit, SPL Token", Scenario::default()),
        (
            "deposit, Token-2022",
            Scenario {
                token_program: addr(TOKEN_2022),
                ..Scenario::default()
            },
        ),
    ];
    let pct = |part: u64, whole: u64| 100.0 * part as f64 / whole as f64;
    println!("\nWhole instruction, token CPI included:\n");
    println!("| case | Anchor | Anchor, deposit only | lite-anchor | lite vs Anchor |");
    println!("|---|---:|---:|---:|---:|");
    let results: Vec<_> = rows
        .iter()
        .map(|(name, s)| (name, check_successful_deposit(s)))
        .collect();
    for (name, u) in &results {
        let saved = u.anchor.total - u.lite.total;
        println!(
            "| {name} | {} | {} | {} | -{saved} (-{:.0}%) |",
            u.anchor.total,
            u.anchor_deposit_only.total,
            u.lite.total,
            pct(saved, u.anchor.total)
        );
    }
    println!("\nProgram only, token CPI subtracted:\n");
    println!("| case | token CPI | Anchor | lite-anchor | lite vs Anchor |");
    println!("|---|---:|---:|---:|---:|");
    for (name, u) in &results {
        let saved = u.anchor.own() - u.lite.own();
        println!(
            "| {name} | {} | {} | {} | -{saved} (-{:.0}%) |",
            u.lite.token_cpi,
            u.anchor.own(),
            u.lite.own(),
            pct(saved, u.anchor.own())
        );
    }
    println!();
    for build in [Build::Anchor, Build::AnchorDepositOnly, Build::Lite] {
        println!("{build:?} .so: {} bytes", program_bytes(build).len());
    }
}
