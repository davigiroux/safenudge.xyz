// SafeNudge watchdog: state checks Microscope cannot alert on (docs/monitoring.md §7).
// Run by a systemd timer. Usage: npm run watchdog [-- --dry-run]

import { promises as fs } from "fs";
import * as path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";
import {
  CheckResult,
  EMPTY_STATE,
  Finding,
  GROUP_DISCRIMINATOR,
  STATE_RESET_RESULT,
  STATUS_ACTIVE,
  STATUS_OFFSET,
  State,
  decodeGroup,
  evaluateAuthority,
  evaluateGroups,
  parseProgramAccount,
  parseProgramDataAuthority,
  parseState,
  step,
} from "./core";
import { Config, DEFAULT_STATE_PATH, configAlert, parseConfig } from "./config";

const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const TELEGRAM_MAX_CHARS = 4000;

interface Ctx {
  connection: Connection;
  config: Config;
  nowSecs: bigint;
}

type Check = (ctx: Ctx) => Promise<Finding[]>;

const CHECKS: Record<string, Check> = {
  "upgrade-authority": async ({ connection, config }) => {
    const program = await connection.getAccountInfo(config.programId, "confirmed");
    if (program === null) throw new Error("program account not found");
    if (program.owner.toBase58() !== UPGRADEABLE_LOADER) {
      throw new Error(`program is owned by ${program.owner.toBase58()}, not the upgradeable loader`);
    }
    const programData = new PublicKey(parseProgramAccount(program.data));
    const dataAccount = await connection.getAccountInfo(programData, "confirmed");
    if (dataAccount === null) throw new Error("ProgramData account not found");
    const authority = parseProgramDataAuthority(dataAccount.data);
    const actual = authority === null ? null : new PublicKey(authority).toBase58();
    console.log(`upgrade-authority: ${actual === config.expectedAuthority ? "matches" : "DIFFERS from"} expected`);
    return evaluateAuthority(config.expectedAuthority, actual);
  },

  "unsettled-groups": async ({ connection, config, nowSecs }) => {
    const accounts = await connection.getProgramAccounts(config.programId, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(GROUP_DISCRIMINATOR) } },
        { memcmp: { offset: STATUS_OFFSET, bytes: utils.bytes.bs58.encode(Buffer.from([STATUS_ACTIVE])) } },
      ],
    });
    const groups = accounts.map(({ pubkey, account }) => decodeGroup(pubkey.toBase58(), account.data));
    console.log(`unsettled-groups: ${groups.length} Active group(s) checked`);
    return evaluateGroups(groups, nowSecs, config.graceSecs, config.cluster);
  },
};

async function readState(file: string): Promise<{ state: State; reset: boolean }> {
  try {
    return parseState(await fs.readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { state: EMPTY_STATE, reset: false };
    throw e;
  }
}

async function writeStateAtomically(file: string, state: State): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** Joins messages into Telegram-sized chunks. */
function chunk(messages: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const m of messages) {
    if (current && current.length + 2 + m.length > TELEGRAM_MAX_CHARS) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${m}` : m;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendTelegram(telegram: { token: string; chatId: string }, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: telegram.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage returned HTTP ${res.status}`);
}

/** Removes URLs and the configured secrets from text that leaves the process. */
function redact(text: string, secrets: string[]): string {
  let out = text.replace(/https?:\/\/\S+/g, "<url>");
  for (const s of secrets) if (s) out = out.split(s).join("<secret>");
  return out;
}

/** Prints the config errors and sends them to Telegram at most once per UTC day; returns exit code 2. */
async function reportInvalidConfig(errors: string[], argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  for (const error of errors) console.error(`config: ${error}`);
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || argv.includes("--dry-run")) return 2;

  const markerPath = `${env.STATE_PATH ?? DEFAULT_STATE_PATH}.config-alert`;
  const lastMarker = await fs.readFile(markerPath, "utf8").catch(() => null);
  const alert = configAlert(errors, lastMarker, new Date());
  if (alert === null) return 2;
  await sendTelegram({ token, chatId }, alert.text);
  await fs.writeFile(markerPath, alert.marker, { mode: 0o600 }).catch(() => console.error("config: could not write the alert marker"));
  return 2;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const parsed = parseConfig(argv, process.env);
  if ("errors" in parsed) return reportInvalidConfig(parsed.errors, argv, process.env);
  const { config } = parsed;
  const secrets = [config.rpcUrl, config.telegram?.token ?? ""];
  const ctx: Ctx = {
    connection: new Connection(config.rpcUrl, "confirmed"),
    config,
    nowSecs: BigInt(Math.floor(Date.now() / 1000)),
  };

  const results: CheckResult[] = [];
  for (const [check, run] of Object.entries(CHECKS)) {
    try {
      results.push({ check, findings: await run(ctx) });
    } catch (e) {
      const error = redact(e instanceof Error ? e.message : String(e), secrets);
      console.error(`${check}: ${error}`);
      results.push({ check, error });
    }
  }
  const failed = results.some((r) => "error" in r);

  const { state: prev, reset } = await readState(config.statePath);
  if (reset) {
    console.error("state: file was unreadable; continuing with an empty state");
    results.push(STATE_RESET_RESULT);
  }
  const { messages, next } = step(prev, results, new Date(Number(ctx.nowSecs) * 1000), config.failuresBeforeAlert);

  if (config.dryRun) {
    for (const text of chunk(messages)) console.log(`--- message ---\n${text}`);
    if (messages.length === 0) console.log("no messages");
    return failed ? 1 : 0;
  }

  for (const text of chunk(messages)) await sendTelegram(config.telegram!, text);
  await writeStateAtomically(config.statePath, next);
  console.log(`sent ${messages.length} message(s); ${Object.keys(next.open).length} open finding(s)`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    const secrets = [process.env.RPC_URL ?? "", process.env.TELEGRAM_BOT_TOKEN ?? ""];
    console.error(redact(e instanceof Error ? e.message : String(e), secrets));
    process.exit(2);
  },
);
