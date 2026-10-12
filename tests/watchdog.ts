import { expect } from "chai";
import {
  CheckResult,
  EMPTY_STATE,
  Group,
  State,
  decodeGroup,
  evaluateAuthority,
  evaluateGroups,
  parseProgramAccount,
  parseProgramDataAuthority,
  step,
} from "../ops/watchdog/core";

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
    it("test_decode_group_reads_fixed_offsets", () => {
      const data = Buffer.alloc(179);
      data.write("snGroup2", 0);
      data.writeBigInt64LE(1_700_000_000n, 120);
      data.writeUInt8(3, 136);
      data.writeUInt8(12, 137);
      data.writeUInt8(1, 141);
      data.writeUInt32LE(6, 143);
      data.write("amigos", 147);
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
      expect(next).to.deep.equal({ open: {}, lastHeartbeatDay: "2026-10-12" });
    });

    it("test_new_finding_sent_once_then_silent", () => {
      const prev: State = { open: {}, lastHeartbeatDay: "2026-10-12" };
      const first = step(prev, bad, t0);
      expect(first.messages).to.deep.equal(["🚨 <b>upgrade-authority</b> · critical\nchanged"]);
      const second = step(first.next, bad, t1);
      expect(second.messages).to.deep.equal([]);
      expect(second.next.open["upgrade-authority"].since).to.equal("2026-10-12T10:00:00.000Z");
    });

    it("test_cleared_finding_sends_resolved", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12" }, bad, t0).next;
      const { messages, next } = step(open, ok, t1);
      expect(messages).to.deep.equal(["✓ resolved: <b>upgrade-authority</b>"]);
      expect(next.open).to.deep.equal({});
    });

    it("test_heartbeat_once_per_utc_day_lists_open_findings", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12" }, bad, t0).next;
      const { messages, next } = step(open, bad, nextDay);
      expect(messages).to.deep.equal(["🟠 SafeNudge watchdog 2026-10-13: 1 open finding(s):\n• upgrade-authority"]);
      expect(step(next, bad, new Date("2026-10-13T00:15:00Z")).messages).to.deep.equal([]);
    });

    it("test_failed_check_keeps_its_findings_open_and_reports_rpc_error", () => {
      const open = step({ open: {}, lastHeartbeatDay: "2026-10-12" }, bad, t0).next;
      const { messages, next } = step(open, [{ check: "upgrade-authority", error: "fetch failed" }], t1);
      expect(messages).to.deep.equal(["🔴 <b>rpc:upgrade-authority</b> · error\nCheck upgrade-authority failed: fetch failed"]);
      expect(Object.keys(next.open).sort()).to.deep.equal(["rpc:upgrade-authority", "upgrade-authority"]);
      const recovered = step(next, bad, new Date("2026-10-12T10:20:00Z"));
      expect(recovered.messages).to.deep.equal(["✓ resolved: <b>rpc:upgrade-authority</b>"]);
    });
  });
});
