const MAX_GROUP_CODE_LENGTH = 32

declare const groupCodeBrand: unique symbol

/** A group code in the form CreateGroup writes on-chain: 1-32 chars of a-z, 0-9 and hyphen. */
export type GroupCode = string & { readonly [groupCodeBrand]: true }

/** Drops everything a group code cannot contain. For text fields, as the user types. */
export function sanitizeGroupCodeInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, MAX_GROUP_CODE_LENGTH)
}

/**
 * Parses a group code that comes from outside the app (URL param, pasted
 * invite). Case is folded because the code is a PDA seed: `Viagem-2025` and
 * `viagem-2025` derive different addresses, and CreateGroup only writes
 * lowercase.
 */
export function parseGroupCode(raw: string | undefined): GroupCode | null {
  if (!raw) return null
  const code = raw.toLowerCase()
  return /^[a-z0-9-]+$/.test(code) && code.length <= MAX_GROUP_CODE_LENGTH ? (code as GroupCode) : null
}
