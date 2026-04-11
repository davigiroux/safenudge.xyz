import { BN } from '@coral-xyz/anchor'

const USDC_DECIMALS = 6

export function formatTokenAmount(
  amount: BN | number | bigint,
  decimals: number = USDC_DECIMALS,
  locale: string = 'pt-BR'
): string {
  const raw = typeof amount === 'number'
    ? amount
    : typeof amount === 'bigint'
      ? Number(amount)
      : amount.toNumber()

  const human = raw / Math.pow(10, decimals)
  return human.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatBrl(
  usdcAmount: BN | number,
  exchangeRate: number = 5.2,
  locale: string = 'pt-BR'
): string {
  const raw = typeof usdcAmount === 'number'
    ? usdcAmount
    : usdcAmount.toNumber()

  const human = raw / Math.pow(10, USDC_DECIMALS)
  const brl = human * exchangeRate
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
