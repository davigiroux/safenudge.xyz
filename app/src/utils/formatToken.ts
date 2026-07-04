import { BN } from '@coral-xyz/anchor'
import { BRL_PER_USD } from './constants'

const USDC_DECIMALS = 6

// Convert a raw token amount to a JS number of whole tokens without going
// through BN.toNumber(), which throws above Number.MAX_SAFE_INTEGER (~9.0M
// USDC at 6 decimals). Splitting whole/fractional parts as BigInts first
// keeps every realistic balance exact; only the fractional remainder is
// floating-point.
function toHuman(amount: BN | number | bigint, decimals: number): number {
  if (typeof amount === 'number') return amount / Math.pow(10, decimals)
  const raw = typeof amount === 'bigint' ? amount : BigInt(amount.toString())
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const frac = raw % base
  return Number(whole) + Number(frac) / Number(base)
}

export function formatTokenAmount(
  amount: BN | number | bigint,
  decimals: number = USDC_DECIMALS,
  locale: string = 'pt-BR'
): string {
  return toHuman(amount, decimals).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatBrl(
  usdcAmount: BN | number | bigint,
  exchangeRate: number = BRL_PER_USD,
  locale: string = 'pt-BR'
): string {
  const brl = toHuman(usdcAmount, USDC_DECIMALS) * exchangeRate
  return brl.toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

export function parseTokenAmount(
  humanAmount: string,
  decimals: number = USDC_DECIMALS
): BN {
  const parsed = parseFloat(humanAmount)
  if (isNaN(parsed) || parsed < 0) return new BN(0)
  return new BN(Math.round(parsed * Math.pow(10, decimals)))
}
