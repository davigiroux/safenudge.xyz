/**
 * PostHog wrapper for SafeNudge. Goals:
 *   - Stay well inside the free tier: autocapture off, session recording off,
 *     pageleave/pageview kept. We only emit a curated event taxonomy.
 *   - LGPD-friendly: EU region by default; wallet addresses are hashed (never
 *     sent in the clear), and token amounts are bucketed rather than raw.
 *   - No-op when the key is missing (local dev without telemetry).
 *
 * Adding a new event: extend `EventMap` below — `track()` is typed against it
 * so the compiler enforces the property shape at every call site.
 */
import posthog, { type PostHog } from 'posthog-js'
import type { TxErrorKind } from './txErrors'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)
  ?? 'https://eu.i.posthog.com'

let client: PostHog | null = null
let initialized = false

export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (!POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Keep volume predictable — we only want our typed events.
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    persistence: 'localStorage+cookie',
    // Never send raw IPs; PostHog still derives country from request edge.
    ip: false,
  })
  client = posthog
}

/**
 * Event taxonomy. Property names are stable identifiers — renaming one is a
 * breaking change for any downstream funnel/dashboard.
 */
type GroupProps = {
  group_code_hash: string
  frequency?: 'weekly' | 'biweekly' | 'monthly'
  total_periods?: number
  max_members?: number
  deposit_bucket?: string
  penalty_type?: 'fixed' | 'percent'
}

type TxErrorProps = {
  error_kind: TxErrorKind
  program_code?: string | null
}

export type EventMap = {
  wallet_connected: { wallet_hash: string; wallet_name?: string }
  wallet_disconnected: Record<string, never>

  group_create_submitted: GroupProps
  group_created: GroupProps & { signature: string }
  group_create_failed: GroupProps & TxErrorProps

  group_join_attempted: { group_code_hash: string; deposit_bucket?: string }
  group_joined: { group_code_hash: string; signature: string }
  group_join_failed: { group_code_hash: string } & TxErrorProps

  cycle_start_submitted: { group_code_hash: string; member_count: number }
  cycle_started: { group_code_hash: string; signature: string }
  cycle_start_failed: { group_code_hash: string } & TxErrorProps

  deposit_submitted: { group_code_hash: string; period_index: number }
  deposit_confirmed: { group_code_hash: string; period_index: number; signature: string }
  deposit_failed: { group_code_hash: string; period_index: number } & TxErrorProps

  distribution_submitted: { group_code_hash: string; member_count: number }
  distribution_completed: { group_code_hash: string; member_count: number; signature: string }
  distribution_failed: { group_code_hash: string } & TxErrorProps

  emergency_cancel_submitted: { group_code_hash: string }
  emergency_cancel_completed: { group_code_hash: string; signature: string }
  emergency_cancel_failed: { group_code_hash: string } & TxErrorProps
}

export function track<K extends keyof EventMap>(event: K, props: EventMap[K]): void {
  if (!client) return
  client.capture(event as string, props as Record<string, unknown>)
}

/** Identify the active wallet. We only ever pass the hashed pubkey. */
export function identifyWallet(walletHash: string): void {
  if (!client) return
  client.identify(walletHash)
}

export function resetAnalytics(): void {
  if (!client) return
  client.reset()
}

/* ------------------------------------------------------------------ */
/* Helpers — never let raw PII / addresses / amounts reach PostHog.    */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 of an arbitrary string, truncated to 16 hex chars. Used for wallet
 * pubkeys and group codes — enough entropy to uniquely identify a user/group
 * across sessions, but not reversible to the original value.
 *
 * Synchronous fallback (FNV-1a) covers the rare case where SubtleCrypto is
 * unavailable (e.g. non-secure context); collision risk is acceptable for
 * analytics keying.
 */
export async function hashId(value: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(value)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return fnv1a(value)
}

function fnv1a(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Bucket a USDC amount into a coarse range. Avoids leaking exact deposits. */
export function bucketAmount(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) return '0'
  if (usdc < 10) return '0-10'
  if (usdc < 50) return '10-50'
  if (usdc < 100) return '50-100'
  if (usdc < 500) return '100-500'
  if (usdc < 1000) return '500-1000'
  if (usdc < 5000) return '1000-5000'
  return '5000+'
}

export const FREQUENCY_NAMES = ['weekly', 'biweekly', 'monthly'] as const
export type FrequencyName = (typeof FREQUENCY_NAMES)[number]
