import type { GroupConfigData } from '../hooks/useGroupConfig'
import type { GroupMemberData } from '../hooks/useGroupMembers'

const PROTOCOL_FEE_BPS = 500n

export type MemberProjection = {
  member: string
  pda: string
  totalDeposited: bigint
  depositsMade: number
  missed: number
  isCompliant: boolean
  rawPenalty: bigint
  penalty: bigint
  basePayout: bigint
  bonus: bigint
  finalPayout: bigint
}

export type DistributionProjection = {
  totalDeposited: bigint
  totalPenalties: bigint
  protocolFee: bigint
  redistributable: bigint
  compliantCount: number
  bonusPerCompliant: bigint
  members: MemberProjection[]
}

/**
 * Pure client-side mirror of programs/safenudge/src/instructions/distribute.rs.
 * Computes the projected payouts that the on-chain program will produce when
 * distribute is called now. Used to render the pre-distribute summary so
 * members can see the outcome before signing.
 *
 * The math here MUST stay in sync with the Rust handler — it follows the same
 * order of operations (penalty cap, fee skim, bonus split) so rounding lines
 * up to the unit (lamports of USDC). When compliantCount === 0 the program
 * refunds full deposits and skips the fee; we mirror that branch.
 */
export function projectDistribution(
  group: GroupConfigData,
  members: GroupMemberData[],
): DistributionProjection {
  const totalPeriods = BigInt(group.totalPeriods)
  const depositAmount = BigInt(group.depositAmount)
  const penaltyValue = BigInt(group.penaltyValue)
  const penaltyType = group.penaltyType

  let totalDeposited = 0n
  let totalPenalties = 0n
  let compliantCount = 0

  const intermediate = members.map((m) => {
    const deposited = BigInt(m.totalDeposited)
    totalDeposited += deposited

    const depositsMade = BigInt(m.depositsMade)
    const missed = depositsMade >= totalPeriods ? 0n : totalPeriods - depositsMade

    let rawPenalty = 0n
    if (missed > 0n) {
      if (penaltyType === 0) {
        rawPenalty = missed * penaltyValue
      } else if (penaltyType === 1) {
        const perPeriod = (depositAmount * penaltyValue) / 10_000n
        rawPenalty = missed * perPeriod
      }
    }

    const penalty = rawPenalty > deposited ? deposited : rawPenalty
    const basePayout = deposited - penalty
    const isCompliant = depositsMade === totalPeriods

    if (isCompliant) compliantCount += 1
    totalPenalties += penalty

    return {
      member: m.member,
      pda: m.pda,
      totalDeposited: deposited,
      depositsMade: m.depositsMade,
      missed: Number(missed),
      isCompliant,
      rawPenalty,
      penalty,
      basePayout,
    }
  })

  const protocolFee = compliantCount === 0
    ? 0n
    : (totalPenalties * PROTOCOL_FEE_BPS) / 10_000n
  const redistributable = totalPenalties - protocolFee
  const bonusPerCompliant = compliantCount > 0
    ? redistributable / BigInt(compliantCount)
    : 0n

  const projected: MemberProjection[] = intermediate.map((m) => {
    const finalPayout = compliantCount === 0
      ? m.totalDeposited
      : m.isCompliant
        ? m.basePayout + bonusPerCompliant
        : m.basePayout
    const bonus = compliantCount > 0 && m.isCompliant ? bonusPerCompliant : 0n
    return { ...m, bonus, finalPayout }
  })

  return {
    totalDeposited,
    totalPenalties,
    protocolFee,
    redistributable,
    compliantCount,
    bonusPerCompliant,
    members: projected,
  }
}

const PERIOD_SECONDS: Record<string, number> = {
  weekly: 7 * 86400,
  biweekly: 14 * 86400,
  monthly: 30 * 86400,
}

/** Unix seconds when the active cycle ends (cycle_start + periods * duration). */
export function cycleEndUnix(group: GroupConfigData): number {
  const periodSecs = PERIOD_SECONDS[group.frequency] ?? PERIOD_SECONDS.weekly
  return group.cycleStart + group.totalPeriods * periodSecs
}
