// Watchdog configuration from the environment. Error texts name the variable, never its value.

import { PublicKey } from "@solana/web3.js";
import { Cluster, DEFAULT_FAILURES_BEFORE_ALERT, escapeHtml } from "./core";

export const DEVNET_PROGRAM_ID = "GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc";
export const DEFAULT_STATE_PATH = "/var/lib/safenudge-watchdog/state.json";

export interface Config {
  rpcUrl: string;
  programId: PublicKey;
  expectedAuthority: string | null;
  cluster: Cluster;
  graceSecs: bigint;
  failuresBeforeAlert: number;
  statePath: string;
  telegram: { token: string; chatId: string } | null;
  dryRun: boolean;
}

export type ConfigResult = { config: Config } | { errors: string[] };

/** Reads the config, collecting every invalid variable. */
export function parseConfig(argv: string[], env: NodeJS.ProcessEnv): ConfigResult {
  const errors: string[] = [];
  const dryRun = argv.includes("--dry-run");

  const rpcUrl = env.RPC_URL ?? "";
  if (!rpcUrl) errors.push("RPC_URL is not set");
  else if (!isHttpUrl(rpcUrl)) errors.push("RPC_URL is not an http(s) URL");

  const programId = parseAddress(env.PROGRAM_ID ?? DEVNET_PROGRAM_ID, "PROGRAM_ID", errors);

  let expectedAuthority: string | null = null;
  const expected = env.EXPECTED_UPGRADE_AUTHORITY;
  if (!expected) errors.push("EXPECTED_UPGRADE_AUTHORITY is not set");
  else if (expected !== "none") expectedAuthority = parseAddress(expected, "EXPECTED_UPGRADE_AUTHORITY", errors)?.toBase58() ?? null;

  const cluster = env.CLUSTER ?? "devnet";
  if (cluster !== "devnet" && cluster !== "mainnet") errors.push("CLUSTER must be devnet or mainnet");

  const graceHours = Number(env.GRACE_HOURS ?? "24");
  if (!Number.isInteger(graceHours) || graceHours < 0) errors.push("GRACE_HOURS must be a whole number");

  const failuresBeforeAlert = Number(env.RPC_FAILURES_BEFORE_ALERT ?? String(DEFAULT_FAILURES_BEFORE_ALERT));
  if (!Number.isInteger(failuresBeforeAlert) || failuresBeforeAlert < 1) {
    errors.push("RPC_FAILURES_BEFORE_ALERT must be a whole number of at least 1");
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!dryRun && (!token || !chatId)) errors.push("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required unless --dry-run");

  if (errors.length > 0) return { errors };
  return {
    config: {
      rpcUrl,
      programId,
      expectedAuthority,
      cluster: cluster as Cluster,
      graceSecs: BigInt(graceHours) * 3600n,
      failuresBeforeAlert,
      statePath: env.STATE_PATH ?? DEFAULT_STATE_PATH,
      telegram: token && chatId ? { token, chatId } : null,
      dryRun,
    },
  };
}

/**
 * Telegram text for an invalid config and the marker to store after sending it, or null when
 * `lastMarker` shows the same text already went out on this UTC day.
 */
export function configAlert(errors: string[], lastMarker: string | null, now: Date): { text: string; marker: string } | null {
  const text = `🔴 watchdog config invalid: ${escapeHtml(errors.join("; "))}`;
  const marker = `${now.toISOString().slice(0, 10)} ${text}`;
  return marker === lastMarker ? null : { text, marker };
}

function parseAddress(value: string, name: string, errors: string[]): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    errors.push(`${name} is not a valid address`);
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
