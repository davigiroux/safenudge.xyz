// Pure evaluation for the watchdog: account decoding, check rules, and alert transitions.

export type Severity = "critical" | "error";

export interface Finding {
  key: string;
  severity: Severity;
  text: string;
}

export type CheckResult =
  | { check: string; findings: Finding[] }
  | { check: string; error: string };

export interface OpenFinding extends Finding {
  check: string;
  since: string;
}

export interface State {
  open: Record<string, OpenFinding>;
  lastHeartbeatDay: string | null;
  /** Consecutive failed runs per check; a check with no entry passed its last run. */
  failures: Record<string, number>;
}

export const EMPTY_STATE: State = { open: {}, lastHeartbeatDay: null, failures: {} };

export const DEFAULT_FAILURES_BEFORE_ALERT = 2;

/** Result that opens `state-reset` for the run that replaced an unreadable state file. */
export const STATE_RESET_RESULT: CheckResult = {
  check: "state",
  findings: [
    {
      key: "state-reset",
      severity: "error",
      text: "The state file was unreadable and was reset. Open findings and failure counts from earlier runs are lost.",
    },
  ],
};

/** Parses the state file; an unreadable or wrongly shaped file gives an empty state and `reset`. */
export function parseState(text: string): { state: State; reset: boolean } {
  const resetResult = { state: EMPTY_STATE, reset: true };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return resetResult;
  }
  if (!isRecord(raw) || !isRecord(raw.open) || !Object.values(raw.open).every(isOpenFinding)) return resetResult;
  if (raw.lastHeartbeatDay !== null && typeof raw.lastHeartbeatDay !== "string") return resetResult;
  const failures = raw.failures ?? {};
  if (!isRecord(failures) || !Object.values(failures).every((n) => Number.isInteger(n) && (n as number) > 0)) {
    return resetResult;
  }
  return {
    state: {
      open: raw.open as Record<string, OpenFinding>,
      lastHeartbeatDay: raw.lastHeartbeatDay as string | null,
      failures: failures as Record<string, number>,
    },
    reset: false,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isOpenFinding(v: unknown): boolean {
  return (
    isRecord(v) &&
    (v.severity === "critical" || v.severity === "error") &&
    [v.key, v.text, v.check, v.since].every((s) => typeof s === "string")
  );
}

export type Cluster = "devnet" | "mainnet";

const DAY = 86_400n;

/** Period lengths by `frequency` code, mirroring `period_duration_secs` per cargo feature. */
const PERIOD_SECS: Record<Cluster, Record<number, bigint>> = {
  mainnet: { 0: 7n * DAY, 1: 14n * DAY, 2: 30n * DAY },
  devnet: { 0: 7n * DAY, 1: 14n * DAY, 2: 30n * DAY, 3: 300n },
};

export const GROUP_DISCRIMINATOR = Buffer.from("snGroup2");
export const STATUS_OFFSET = 141;
export const STATUS_ACTIVE = 1;

export interface Group {
  address: string;
  cycleStart: bigint;
  frequency: number;
  totalPeriods: number;
  status: number;
  code: string;
}

/** Decodes the fixed-offset `GroupConfig` fields the watchdog reads. */
export function decodeGroup(address: string, data: Buffer): Group {
  if (!data.subarray(0, 8).equals(GROUP_DISCRIMINATOR)) {
    throw new Error(`${address} is not a GroupConfig`);
  }
  const codeLen = data.readUInt32LE(143);
  return {
    address,
    cycleStart: data.readBigInt64LE(120),
    frequency: data.readUInt8(136),
    totalPeriods: data.readUInt8(137),
    status: data.readUInt8(STATUS_OFFSET),
    code: data.subarray(147, 147 + codeLen).toString("utf8"),
  };
}

/** `GroupConfig::cycle_end()`; null when the frequency is unknown for the cluster. */
export function cycleEnd(group: Group, cluster: Cluster): bigint | null {
  const period = PERIOD_SECS[cluster][group.frequency];
  if (period === undefined) return null;
  return group.cycleStart + BigInt(group.totalPeriods) * period;
}

/** Findings for Active groups whose cycle ended more than `graceSecs` before `nowSecs`. */
export function evaluateGroups(
  groups: Group[],
  nowSecs: bigint,
  graceSecs: bigint,
  cluster: Cluster,
): Finding[] {
  const findings: Finding[] = [];
  for (const group of groups) {
    if (group.status !== STATUS_ACTIVE) continue;
    const key = `unsettled:${group.address}`;
    const label = `Group <code>${escapeHtml(group.code)}</code> (${group.address})`;
    const end = cycleEnd(group, cluster);
    if (end === null) {
      findings.push({
        key,
        severity: "error",
        text: `${label} has frequency ${group.frequency}, unknown on ${cluster}; cannot compute its cycle end.`,
      });
      continue;
    }
    const overdue = nowSecs - end;
    if (overdue <= graceSecs) continue;
    findings.push({
      key,
      severity: "error",
      text: `${label} is Active ${overdue / 3600n} h after its cycle ended (${isoFromSecs(end)}). Nobody ran distribute.`,
    });
  }
  return findings;
}

const PROGRAM_TAG = 2;
const PROGRAM_DATA_TAG = 3;

/** ProgramData address stored in an upgradeable program account. */
export function parseProgramAccount(data: Buffer): Buffer {
  if (data.length < 36 || data.readUInt32LE(0) !== PROGRAM_TAG) {
    throw new Error("program account is not an upgradeable Program");
  }
  return data.subarray(4, 36);
}

/** Upgrade authority stored in a ProgramData account; null when the program is immutable. */
export function parseProgramDataAuthority(data: Buffer): Buffer | null {
  if (data.length < 13 || data.readUInt32LE(0) !== PROGRAM_DATA_TAG) {
    throw new Error("account is not ProgramData");
  }
  if (data.readUInt8(12) === 0) return null;
  return data.subarray(13, 45);
}

/** Finding when the actual authority differs from the expected one (null = immutable). */
export function evaluateAuthority(expected: string | null, actual: string | null): Finding[] {
  if (expected === actual) return [];
  const show = (a: string | null) => (a === null ? "none (immutable)" : `<code>${a}</code>`);
  return [
    {
      key: "upgrade-authority",
      severity: "critical",
      text: `Upgrade authority is ${show(actual)}, expected ${show(expected)}.`,
    },
  ];
}

const ICON: Record<Severity, string> = { critical: "🚨", error: "🔴" };

/**
 * Next state and the messages to send for one run. A check that errored keeps its previous
 * findings open, because its result is unknown, and opens an `rpc:<check>` finding once it
 * failed `failuresBeforeAlert` runs in a row.
 */
export function step(
  prev: State,
  results: CheckResult[],
  now: Date,
  failuresBeforeAlert = DEFAULT_FAILURES_BEFORE_ALERT,
): { messages: string[]; next: State } {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const open: Record<string, OpenFinding> = {};
  const failures: Record<string, number> = {};

  for (const result of results) {
    let findings: Finding[];
    if ("error" in result) {
      for (const [key, f] of Object.entries(prev.open)) {
        if (f.check === result.check) open[key] = f;
      }
      failures[result.check] = (prev.failures[result.check] ?? 0) + 1;
      findings =
        failures[result.check] < failuresBeforeAlert
          ? []
          : [{ key: rpcKey(result.check), severity: "error", text: `Check ${result.check} failed: ${escapeHtml(result.error)}` }];
    } else {
      findings = result.findings;
    }
    for (const f of findings) {
      open[f.key] = { ...f, check: result.check, since: prev.open[f.key]?.since ?? nowIso };
    }
  }

  const messages: string[] = [];
  for (const [key, f] of Object.entries(open)) {
    if (!(key in prev.open)) messages.push(`${ICON[f.severity]} <b>${key}</b> · ${f.severity}\n${f.text}`);
  }
  for (const key of Object.keys(prev.open)) {
    if (!(key in open)) messages.push(`✓ resolved: <b>${key}</b>`);
  }

  let lastHeartbeatDay = prev.lastHeartbeatDay;
  if (lastHeartbeatDay !== today) {
    lastHeartbeatDay = today;
    const keys = Object.keys(open);
    messages.push(
      keys.length === 0
        ? `💚 SafeNudge watchdog ${today}: all checks passed.`
        : `🟠 SafeNudge watchdog ${today}: ${keys.length} open finding(s):\n${keys.map((k) => `• ${k}`).join("\n")}`,
    );
  }

  return { messages, next: { open, lastHeartbeatDay, failures } };
}

function rpcKey(check: string): string {
  return `rpc:${check}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isoFromSecs(secs: bigint): string {
  return new Date(Number(secs) * 1000).toISOString();
}
