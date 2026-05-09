import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { Button } from './Button'
import type { DistributionProjection, MemberProjection } from '../utils/distribution'
import { formatTokenAmount } from '../utils/formatToken'

type Mode = 'pre' | 'post'

type DistributeSummaryProps = {
  mode: Mode
  projection: DistributionProjection
  yourPubkey: string | null
  loading?: boolean
  onDistribute?: () => void
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`
}

function MemberRow({
  m,
  isYou,
  totalPeriods,
}: {
  m: MemberProjection
  isYou: boolean
  totalPeriods: number
}) {
  const { t } = useTranslation()
  const compliant = m.isCompliant
  const initial = m.member.slice(0, 1).toUpperCase()
  const completed = totalPeriods - m.missed

  return (
    <div className="flex items-center gap-3 py-3.5 px-4">
      <div className="w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center font-headline text-title-sm text-on-surface flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-headline text-title-sm text-on-surface truncate">
            {shortPubkey(m.member)}
          </span>
          {isYou && (
            <span className="font-label text-label-sm text-primary bg-primary-fixed/30 px-1.5 py-0.5 rounded">
              {t('groupDashboard.you')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 font-body text-body-sm text-outline">
          {compliant ? (
            <>
              <span className="inline-flex items-center gap-1 text-secondary">
                <Icon name="check_circle" size={14} />
                {t('distribute.depositsCount', { done: completed, total: totalPeriods })}
              </span>
              {m.bonus > 0n && (
                <span>· {t('distribute.bonusInline', { amount: formatTokenAmount(m.bonus) })}</span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-tertiary">
              <Icon name="error" size={14} />
              {t('distribute.depositsCount', { done: completed, total: totalPeriods })}
              {m.penalty > 0n && (
                <span>· {t('distribute.penaltyInline', { amount: formatTokenAmount(m.penalty) })}</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={[
          'font-headline text-title-sm',
          compliant ? 'text-secondary' : 'text-on-surface',
        ].join(' ')}>
          {formatTokenAmount(m.finalPayout)} USDC
        </div>
        <div className="font-body text-label-sm text-outline mt-0.5">
          {t('distribute.depositedShort', { amount: formatTokenAmount(m.totalDeposited) })}
        </div>
      </div>
    </div>
  )
}

export function DistributeSummary({
  mode,
  projection,
  yourPubkey,
  loading = false,
  onDistribute,
}: DistributeSummaryProps) {
  const { t } = useTranslation()
  const [showVaultDetail, setShowVaultDetail] = useState(false)
  const totalPeriodsHint = projection.members.reduce(
    (max, m) => Math.max(max, m.depositsMade + m.missed),
    0,
  )

  const you = yourPubkey
    ? projection.members.find((m) => m.member === yourPubkey)
    : null
  const profit = you ? you.finalPayout - you.totalDeposited : 0n
  const everyoneCompliant = projection.compliantCount === projection.members.length

  const heroBg = mode === 'post'
    ? 'bg-gradient-to-br from-secondary to-primary'
    : 'bg-gradient-to-br from-primary to-primary-container'

  return (
    <div className="flex flex-col gap-4">
      {/* Hero — your payout */}
      <div className={`relative overflow-hidden rounded-2xl px-6 py-7 text-on-primary ${heroBg}`}>
        <div className="absolute -top-16 -right-12 w-52 h-52 rounded-full bg-primary-fixed/30 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3 font-label text-label-sm uppercase tracking-wider text-primary-fixed/90">
            <Icon name={mode === 'post' ? 'check_circle' : 'hourglass_top'} size={14} />
            <span>
              {mode === 'post'
                ? t('distribute.statusCompleted')
                : t('distribute.statusReady')}
            </span>
          </div>

          <h2 className="font-headline text-headline-md leading-tight tracking-tight mb-6">
            {everyoneCompliant ? (
              <>
                {t('distribute.heroAllCompliantA')}
                <br />
                <span className="italic font-semibold text-secondary-fixed">
                  {t('distribute.heroAllCompliantB')}
                </span>
              </>
            ) : (
              <>
                {t('distribute.heroMixedA')}
                <br />
                <span className="italic font-semibold text-secondary-fixed">
                  {t('distribute.heroMixedB')}
                </span>
              </>
            )}
          </h2>

          {you && (
            <div className="rounded-2xl bg-on-primary/10 backdrop-blur-sm px-5 py-5 shadow-ghost-border">
              <div className="font-label text-label-sm uppercase tracking-wider text-primary-fixed/80 mb-1.5">
                {mode === 'post' ? t('distribute.youReceived') : t('distribute.youWillReceive')}
              </div>
              <div className="font-headline text-display-sm tracking-tight">
                {formatTokenAmount(you.finalPayout)} <span className="text-title-lg align-middle">USDC</span>
              </div>
              <div className="flex gap-5 mt-4 pt-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]">
                <div>
                  <div className="font-label text-label-sm text-primary-fixed/70 mb-0.5">
                    {t('distribute.youDeposited')}
                  </div>
                  <div className="font-headline text-title-md">
                    {formatTokenAmount(you.totalDeposited)} USDC
                  </div>
                </div>
                <div>
                  <div className="font-label text-label-sm text-primary-fixed/70 mb-0.5">
                    {profit > 0n
                      ? t('distribute.consistencyBonus')
                      : profit < 0n
                        ? t('distribute.penaltyApplied')
                        : t('distribute.cleanReturn')}
                  </div>
                  <div className={[
                    'font-headline text-title-md',
                    profit > 0n ? 'text-secondary-fixed' : profit < 0n ? 'text-tertiary-fixed' : 'text-on-primary',
                  ].join(' ')}>
                    {profit > 0n ? '+' : ''}{formatTokenAmount(profit)} USDC
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA — only in pre mode */}
      {mode === 'pre' && onDistribute && (
        <Button
          variant="primary"
          icon="lock_open"
          className="w-full"
          onClick={onDistribute}
          loading={loading}
        >
          {t('distribute.cta')}
        </Button>
      )}

      {/* Per-member breakdown */}
      <div>
        <div className="font-headline text-label-md text-on-surface-variant uppercase tracking-wider mb-3 px-1">
          {mode === 'post' ? t('distribute.howItWent') : t('distribute.projectedPayouts')}
        </div>
        <div className="bg-surface-container-lowest rounded-2xl shadow-ghost-border divide-y divide-outline-variant/40">
          {projection.members.map((m) => (
            <MemberRow
              key={m.member}
              m={m}
              isYou={!!yourPubkey && m.member === yourPubkey}
              totalPeriods={totalPeriodsHint}
            />
          ))}
        </div>
      </div>

      {/* Vault accounting */}
      <div>
        <button
          onClick={() => setShowVaultDetail((s) => !s)}
          className="w-full bg-surface-container-lowest rounded-2xl shadow-ghost-border px-4 py-3.5 flex items-center justify-between text-on-surface hover:shadow-nudge transition-shadow"
        >
          <span className="flex items-center gap-2.5">
            <Icon name="receipt_long" size={18} className="text-primary" />
            <span className="font-headline text-title-sm">
              {t('distribute.vaultAccounting')}
            </span>
          </span>
          <Icon
            name="expand_more"
            size={18}
            className={`text-on-surface-variant transition-transform ${showVaultDetail ? 'rotate-180' : ''}`}
          />
        </button>
        {showVaultDetail && (
          <div className="bg-surface-container-lowest rounded-2xl shadow-ghost-border mt-2 px-4 py-4 flex flex-col gap-2.5 font-body text-body-sm text-on-surface-variant">
            <div className="flex justify-between">
              <span>{t('distribute.totalDeposited')}</span>
              <span className="font-headline text-title-sm text-on-surface">
                {formatTokenAmount(projection.totalDeposited)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('distribute.penaltiesCollected')}</span>
              <span className="font-headline text-title-sm text-on-surface">
                {formatTokenAmount(projection.totalPenalties)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('distribute.protocolFee')}</span>
              <span className="font-headline text-title-sm text-on-surface">
                {formatTokenAmount(projection.protocolFee)} USDC
              </span>
            </div>
            {projection.compliantCount > 0 && (
              <div className="flex justify-between pt-2.5 mt-1 shadow-[inset_0_1px_0_0_rgba(189,201,200,0.4)]">
                <span className="text-on-surface font-headline text-title-sm">
                  {t('distribute.bonusPerCompliant', { count: projection.compliantCount })}
                </span>
                <span className="font-headline text-title-sm text-secondary">
                  {formatTokenAmount(projection.bonusPerCompliant)} USDC
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
