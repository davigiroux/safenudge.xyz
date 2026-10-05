import { parseGroupCode, type GroupCode } from './groupCode'

const USDC_BASE_UNITS = 1_000_000
const BPS_PER_PERCENT = 100

const PROGRAM_MAX_PENALTY_BPS = 5000
export const MAX_PENALTY_PERCENT = PROGRAM_MAX_PENALTY_BPS / BPS_PER_PERCENT

export type PenaltyKind = 'percent' | 'fixed'

export type CreateGroupFields = {
  groupCode: string
  depositAmount: string
  penaltyKind: PenaltyKind
  penaltyValue: string
}

/** What `create_group` receives. Both amounts are non-negative safe integers. */
export type CreateGroupParams = {
  groupCode: GroupCode
  depositBaseUnits: number
  penalty: { kind: 'percent'; bps: number } | { kind: 'fixed'; baseUnits: number }
}

export type DepositIssue = 'depositNotPositive' | 'depositTooLarge'
export type PenaltyIssue =
  | 'penaltyRequired'
  | 'penaltyNegative'
  | 'penaltyPercentTooHigh'
  | 'penaltyFixedAboveDeposit'

export type ParsedCreateGroup =
  | { kind: 'valid'; params: CreateGroupParams }
  | { kind: 'invalid'; issues: { depositAmount?: DepositIssue; penaltyValue?: PenaltyIssue } }

type Field<Issue> =
  | { kind: 'valid'; value: number }
  | { kind: 'empty' }
  | { kind: 'invalid'; issue: Issue }

function readNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : value
}

function parseDeposit(raw: string): Field<DepositIssue> {
  const amount = readNumber(raw)
  if (amount === null) return { kind: 'empty' }
  const baseUnits = Math.round(amount * USDC_BASE_UNITS)
  if (baseUnits <= 0) return { kind: 'invalid', issue: 'depositNotPositive' }
  // Above 2^53 base units `new BN(number)` throws, and the hooks that read the
  // group back use `BN.toNumber()`.
  if (!Number.isSafeInteger(baseUnits)) return { kind: 'invalid', issue: 'depositTooLarge' }
  return { kind: 'valid', value: baseUnits }
}

function parsePenalty(
  kind: PenaltyKind,
  raw: string,
  deposit: Field<DepositIssue>,
): Field<PenaltyIssue> {
  const amount = readNumber(raw)
  if (amount === null) return { kind: 'invalid', issue: 'penaltyRequired' }
  if (amount < 0) return { kind: 'invalid', issue: 'penaltyNegative' }
  if (kind === 'percent') {
    const bps = Math.round(amount * BPS_PER_PERCENT)
    return bps > PROGRAM_MAX_PENALTY_BPS
      ? { kind: 'invalid', issue: 'penaltyPercentTooHigh' }
      : { kind: 'valid', value: bps }
  }
  const baseUnits = Math.round(amount * USDC_BASE_UNITS)
  return deposit.kind === 'valid' && baseUnits > deposit.value
    ? { kind: 'invalid', issue: 'penaltyFixedAboveDeposit' }
    : { kind: 'valid', value: baseUnits }
}

export function parseCreateGroup(fields: CreateGroupFields): ParsedCreateGroup {
  const groupCode = parseGroupCode(fields.groupCode)
  const deposit = parseDeposit(fields.depositAmount)
  const penalty = parsePenalty(fields.penaltyKind, fields.penaltyValue, deposit)

  if (groupCode !== null && deposit.kind === 'valid' && penalty.kind === 'valid') {
    return {
      kind: 'valid',
      params: {
        groupCode,
        depositBaseUnits: deposit.value,
        penalty:
          fields.penaltyKind === 'percent'
            ? { kind: 'percent', bps: penalty.value }
            : { kind: 'fixed', baseUnits: penalty.value },
      },
    }
  }
  return {
    kind: 'invalid',
    issues: {
      depositAmount: deposit.kind === 'invalid' ? deposit.issue : undefined,
      penaltyValue: penalty.kind === 'invalid' ? penalty.issue : undefined,
    },
  }
}
