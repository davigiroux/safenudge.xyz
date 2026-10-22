import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import {
  CheckResult,
  EMPTY_STATE,
  Group,
  STATE_RESET_RESULT,
  STATUS_OFFSET,
  State,
  decodeGroup,
  evaluateAuthority,
  evaluateGroups,
  parseProgramAccount,
  parseProgramDataAuthority,
  parseState,
  step,
} from "../ops/watchdog/core";
import { configAlert, parseConfig } from "../ops/watchdog/config";
import IDL from "../target/idl/safenudge.json" with { type: "json" };

const SQUAD = "So11111111111111111111111111111111111111112";
const OTHER = "11111111111111111111111111111111";
const GROUP_A = "GroupA1111111111111111111111111111111111111";
const DAY = 86_400n;
const HOUR = 3_600n;

function activeGroup(overrides: Partial<Group> = {}): Group {
  return { address: GROUP_A, cycleStart: 1_000_000n, frequency: 0, totalPeriods: 4, status: 1, code: "amigos", ...overrides };
}

describe("watchdog", () => {
  describe("upgrade authority", () => {
    it("test_authority_matches_expected_no_finding", () => {
      expect(evaluateAuthority(SQUAD, SQUAD)).to.deep.equal([]);
    });

    it("test_authority_differs_critical_finding", () => {
      expect(evaluateAuthority(SQUAD, OTHER)).to.deep.equal([
        {
          key: "upgrade-authority",
          severity: "critical",
          text: `Upgrade authority is <code>${OTHER}</code>, expected <code>${SQUAD}</code>.`,
        },
      ]);
    });

    it("test_authority_none_expected_and_immutable_no_finding", () => {
      expect(evaluateAuthority(null, null)).to.deep.equal([]);
    });

    it("test_authority_none_expected_but_upgradeable_finding", () => {
      expect(evaluateAuthority(null, SQUAD)[0].text).to.equal(
        `Upgrade authority is <code>${SQUAD}</code>, expected none (immutable).`,
      );
    });

    it("test_parse_program_data_reads_authority_or_none", () => {
      const withAuthority = Buffer.alloc(45);
      withAuthority.writeUInt32LE(3, 0);
      withAuthority.writeUInt8(1, 12);
      withAuthority.fill(7, 13, 45);
      expect([...parseProgramDataAuthority(withAuthority)!]).to.deep.equal(new Array(32).fill(7));

      const immutable = Buffer.alloc(45);
      immutable.writeUInt32LE(3, 0);
      expect(parseProgramDataAuthority(immutable)).to.equal(null);
    });

    it("test_parse_program_account_returns_program_data_address", () => {
      const program = Buffer.alloc(36);
      program.writeUInt32LE(2, 0);
      program.fill(9, 4, 36);
      expect([...parseProgramAccount(program)]).to.deep.equal(new Array(32).fill(9));
      expect(() => parseProgramAccount(Buffer.alloc(36))).to.throw("not an upgradeable Program");
    });
  });

  describe("unsettled groups", () => {
    // Encoded by the program's own IDL, so a layout change in the program fails this test.
    it("test_decode_group_reads_the_fields_the_program_writes", async () => {
      const key = new PublicKey(OTHER);
      const encoded = await new BorshAccountsCoder(IDL as Idl).encode("GroupConfig", {
        creator: key, rent_payer: key, mint: key, deposit_amount: new BN(10_000_000),
        cycle_start: new BN(1_700_000_000), settled_at: new BN(0), frequency: 3, total_periods: 12,
        max_members: 10, current_members: 2, status: 1, bump: 255, vault_bump: 254,
        reserved: new Array(73).fill(0), group_code: "amigos",
      });
      const data = Buffer.concat([encoded, Buffer.alloc(244 - encoded.length)]);
      expect(data.readUInt8(STATUS_OFFSET)).to.equal(1);
      expect(decodeGroup(GROUP_A, data)).to.deep.equal({
        address: GROUP_A,
        cycleStart: 1_700_000_000n,
        frequency: 3,
        totalPeriods: 12,
        status: 1,
        code: "amigos",
      });
    });

    // weekly, 4 periods: cycle_end = 1_000_000 + 4 * 604_800 = 3_419_200
    it("test_group_within_grace_no_finding", () => {
      expect(evaluateGroups([activeGroup()], 3_419_200n + 24n * HOUR, 24n * HOUR, "mainnet")).to.deep.equal([]);
    });

    it("test_group_past_grace_finding", () => {
      expect(evaluateGroups([activeGroup()], 3_419_200n + 24n * HOUR + 1n, 24n * HOUR, "mainnet")).to.deep.equal([
        {
          key: `unsettled:${GROUP_A}`,
          severity: "error",
          text: `Group <code>amigos</code> (${GROUP_A}) is Active 24 h after its cycle ended (1970-02-09T13:46:40.000Z). Nobody ran distribute.`,
        },
      ]);
    });

    it("test_group_not_active_ignored", () => {
      expect(evaluateGroups([activeGroup({ status: 2 })], 100n * DAY, 0n, "mainnet")).to.deep.equal([]);
    });

    it("test_devnet_five_minute_period_counts_only_on_devnet", () => {
      const fast = activeGroup({ frequency: 3, totalPeriods: 2, cycleStart: 1_000n });
      // cycle_end = 1_000 + 2 * 300 = 1_600
      expect(evaluateGroups([fast], 1_601n, 0n, "devnet").map((f) => f.key)).to.deep.equal([`unsettled:${GROUP_A}`]);
      expect(evaluateGroups([fast], 1_600n, 0n, "devnet")).to.deep.equal([]);
      expect(evaluateGroups([fast], 1_601n, 0n, "mainnet")[0].text).to.equal(
        `Group <code>amigos</code> (${GROUP_A}) has frequency 3, unknown on mainnet; cannot compute its cycle end.`,
      );
    });

    it("test_group_code_is_html_escaped", () => {
      const [f] = evaluateGroups([activeGroup({ code: "<b>&" })], 10n * DAY * 7n, 0n, "mainnet");
      expect(f.text.startsWith("Group <code>&lt;b&gt;&amp;</code>")).to.equal(true);
    });
  });

  describe("transitions", () => {
    const t0 = new Date("2026-10-12T10:00:00Z");
    const t1 = new Date("2026-10-12T10:10:00Z");
    const nextDay = new Date("2026-10-13T00:05:00Z");
    const finding = { key: "upgrade-authority", severity: "critical" as const, text: "changed" };
    const ok: CheckResult[] = [{ check: "upgrade-authority", findings: [] }];
    const bad: CheckResult[] = [{ check: "upgrade-authority", findings: [finding] }];

    it("test_first_run_all_clear_sends_only_heartbeat", () => {
      const { messages, next } = step(EMPTY_STATE, ok, t0);
      expect(messages).to.deep.equal(["💚 SafeNudge watchdog 2026-10-12: all checks passed."]);
      expect(next).to.deep.equal({ open: {}, lastHeartbeatDay: "2026-10-12", failures: {} });
    });

    it("test_new_finding_sent_once_then_silent", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12", failures: {} };
      const first = step(prev, bad, t0);
      expect(first.messages).to.deep.equal(["🚨 <b>upgrade-authority</b> · critical\nchanged"]);
      const second = step(first.next, bad, t1);
      expect(second.messages).to.deep.equal([]);
      expect(second.next.open["upgrade-authority"].since).to.equal("2026-10-12T10:00:00.000Z");
    });

    it("test_cleared_finding_sends_resolved", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12", failures: {} }, bad, t0).next;
      const { messages, next } = step(open, ok, t1);
      expect(messages).to.deep.equal(["✓ resolved: <b>upgrade-authority</b>"]);
      expect(next.open).to.deep.equal({});
    });

    it("test_heartbeat_once_per_utc_day_lists_open_findings", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12", failures: {} }, bad, t0).next;
      const { messages, next } = step(open, bad, nextDay);
      expect(messages).to.deep.equal(["🟠 SafeNudge watchdog 2026-10-13: 1 open finding(s):\n• upgrade-authority"]);
      expect(step(next, bad, new Date("2026-10-13T00:15:00Z")).messages).to.deep.equal([]);
    });

    const failedRun: CheckResult[] = [{ check: "upgrade-authority", error: "fetch failed" }];
    const rpcOpened = "🔴 <b>rpc:upgrade-authority</b> · error\nCheck upgrade-authority failed: fetch failed";

    it("test_one_failed_run_sends_nothing_and_keeps_prior_findings", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12", failures: {} }, bad, t0).next;
      const { messages, next } = step(open, failedRun, t1);
      expect(messages).to.deep.equal([]);
      expect(next.open).to.deep.equal(open.open);
      expect(next.failures).to.deep.equal({ "upgrade-authority": 1 });
    });

    it("test_second_consecutive_failure_opens_rpc_finding_then_resolves", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12", failures: {} }, bad, t0).next;
      const once = step(open, failedRun, t1).next;
      const twice = step(once, failedRun, new Date("2026-10-12T10:20:00Z"));
      expect(twice.messages).to.deep.equal([rpcOpened]);
      expect(Object.keys(twice.next.open).sort()).to.deep.equal(["rpc:upgrade-authority", "upgrade-authority"]);
      expect(twice.next.failures).to.deep.equal({ "upgrade-authority": 2 });
      const recovered = step(twice.next, bad, new Date("2026-10-12T10:30:00Z"));
      expect(recovered.messages).to.deep.equal(["✓ resolved: <b>rpc:upgrade-authority</b>"]);
      expect(recovered.next.failures).to.deep.equal({});
    });

    it("test_success_between_failures_resets_the_count", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12", failures: {} };
      const failedOnce = step(prev, failedRun, t0).next;
      const passed = step(failedOnce, ok, t1).next;
      expect(passed.failures).to.deep.equal({});
      const failedAgain = step(passed, failedRun, new Date("2026-10-12T10:20:00Z"));
      expect(failedAgain.messages).to.deep.equal([]);
      expect(failedAgain.next.failures).to.deep.equal({ "upgrade-authority": 1 });
    });

    it("test_threshold_of_one_opens_rpc_finding_on_first_failure", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12", failures: {} };
      expect(step(prev, failedRun, t0, 1).messages).to.deep.equal([rpcOpened]);
    });

    it("test_real_finding_opens_on_first_run_despite_threshold", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12", failures: {} };
      expect(step(prev, bad, t0, 5).messages).to.deep.equal(["🚨 <b>upgrade-authority</b> · critical\nchanged"]);
    });

    it("test_state_reset_finding_opens_then_resolves", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12", failures: {} };
      const resetRun = step(prev, [...ok, STATE_RESET_RESULT], t0);
      expect(resetRun.messages).to.deep.equal([
        "🔴 <b>state-reset</b> · error\nThe state file was unreadable and was reset. Open findings and failure counts from earlier runs are lost.",
      ]);
      expect(step(resetRun.next, ok, t1).messages).to.deep.equal(["✓ resolved: <b>state-reset</b>"]);
    });
  });

  describe("state file", () => {
    const openFinding = { key: "upgrade-authority", severity: "critical", text: "changed", check: "upgrade-authority", since: "2026-10-12T10:00:00.000Z" };

    it("test_state_without_failures_field_loads", () => {
      const text = JSON.stringify({ open: { "upgrade-authority": openFinding }, lastHeartbeatDay: "2026-10-12" });
      expect(parseState(text)).to.deep.equal({
        state: { open: { "upgrade-authority": openFinding }, lastHeartbeatDay: "2026-10-12", failures: {} },
        reset: false,
      });
    });

    it("test_state_with_failures_round_trips", () => {
      const state = { open: {}, lastHeartbeatDay: null, failures: { "unsettled-groups": 1 } };
      expect(parseState(JSON.stringify(state))).to.deep.equal({ state, reset: false });
    });

    it("test_corrupt_or_wrong_shape_state_resets", () => {
      const reset = { state: { open: {}, lastHeartbeatDay: null, failures: {} }, reset: true };
      expect(parseState("{\"open\": {")).to.deep.equal(reset);
      expect(parseState("[]")).to.deep.equal(reset);
      expect(parseState(JSON.stringify({ open: { k: { key: "k" } }, lastHeartbeatDay: null }))).to.deep.equal(reset);
      expect(parseState(JSON.stringify({ open: {}, lastHeartbeatDay: 5 }))).to.deep.equal(reset);
      expect(parseState(JSON.stringify({ open: {}, lastHeartbeatDay: null, failures: { a: -1 } }))).to.deep.equal(reset);
    });
  });

  describe("config", () => {
    const valid = {
      RPC_URL: "https://rpc.example/?api-key=secret",
      EXPECTED_UPGRADE_AUTHORITY: SQUAD,
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "42",
    };

    it("test_valid_config_uses_defaults", () => {
      const result = parseConfig([], valid);
      if (!("config" in result)) throw new Error(`unexpected errors: ${result.errors.join("; ")}`);
      expect(result.config.programId.toBase58()).to.equal("FJYGbzdtS56PZDghiUT42UbgHg4VXh3DLoPehXHY5qKW");
      expect(result.config.failuresBeforeAlert).to.equal(2);
      expect(result.config.graceSecs).to.equal(86_400n);
      expect(result.config.cluster).to.equal("devnet");
    });

    it("test_invalid_config_lists_every_variable_without_values", () => {
      const result = parseConfig([], {
        RPC_URL: "not a url secret",
        PROGRAM_ID: "bad-id",
        EXPECTED_UPGRADE_AUTHORITY: "bad-authority",
        CLUSTER: "testnet",
        GRACE_HOURS: "1.5",
        RPC_FAILURES_BEFORE_ALERT: "0",
      });
      expect(result).to.deep.equal({
        errors: [
          "RPC_URL is not an http(s) URL",
          "PROGRAM_ID is not a valid address",
          "EXPECTED_UPGRADE_AUTHORITY is not a valid address",
          "CLUSTER must be devnet or mainnet",
          "GRACE_HOURS must be a whole number from 0 to 168",
          "RPC_FAILURES_BEFORE_ALERT must be a whole number from 1 to 6",
          "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required unless --dry-run",
        ],
      });
    });

    it("test_thresholds_above_their_bounds_are_rejected", () => {
      const result = parseConfig(["--dry-run"], {
        RPC_URL: "https://rpc.example",
        EXPECTED_UPGRADE_AUTHORITY: "none",
        GRACE_HOURS: "169",
        RPC_FAILURES_BEFORE_ALERT: "7",
      });
      expect(result).to.deep.equal({
        errors: [
          "GRACE_HOURS must be a whole number from 0 to 168",
          "RPC_FAILURES_BEFORE_ALERT must be a whole number from 1 to 6",
        ],
      });
    });

    it("test_missing_required_variables_in_dry_run", () => {
      expect(parseConfig(["--dry-run"], {})).to.deep.equal({
        errors: ["RPC_URL is not set", "EXPECTED_UPGRADE_AUTHORITY is not set"],
      });
    });

    it("test_config_alert_sent_once_per_day_per_text", () => {
      const first = configAlert(["PROGRAM_ID is not a valid address"], null, new Date("2026-10-12T10:00:00Z"));
      expect(first).to.deep.equal({
        text: "🔴 watchdog config invalid: PROGRAM_ID is not a valid address",
        marker: "2026-10-12 🔴 watchdog config invalid: PROGRAM_ID is not a valid address",
      });
      expect(configAlert(["PROGRAM_ID is not a valid address"], first.marker, new Date("2026-10-12T23:50:00Z"))).to.equal(null);
      expect(configAlert(["PROGRAM_ID is not a valid address"], first.marker, new Date("2026-10-13T00:00:00Z"))?.marker).to.equal(
        "2026-10-13 🔴 watchdog config invalid: PROGRAM_ID is not a valid address",
      );
      expect(configAlert(["CLUSTER must be devnet or mainnet"], first.marker, new Date("2026-10-12T11:00:00Z"))?.text).to.equal(
        "🔴 watchdog config invalid: CLUSTER must be devnet or mainnet",
      );
    });
  });
});
