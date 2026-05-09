import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { Button } from './Button'
import type { GroupMemberData } from '../hooks/useGroupMembers'
import { formatTokenAmount } from '../utils/formatToken'

type Step = 'review' | 'confirm'

type CancelGroupSheetProps = {
  open: boolean
  members: GroupMemberData[]
  groupName: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`
}

export function CancelGroupSheet({
  open,
  members,
  groupName,
  loading = false,
  onConfirm,
  onClose,
}: CancelGroupSheetProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('review')
  const [confirmText, setConfirmText] = useState('')
  const totalDeposited = members.reduce(
    (sum, m) => sum + BigInt(m.totalDeposited),
    0n,
  )
  const expectedConfirm = t('cancelGroup.confirmWord').toLowerCase()
  const canConfirm = confirmText.trim().toLowerCase() === expectedConfirm

  // The sheet unmounts when closed (return null below), so internal state
  // is naturally reset on the next open — no useEffect needed.
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('cancelGroup.sheetLabel')}
    >
      {/* Scrim */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-[2px] cursor-default animate-[fadeIn_200ms_ease-out]"
      />

      {/* Sheet */}
      <div
        className="relative w-full md:max-w-[440px] bg-surface rounded-t-3xl md:rounded-3xl md:mb-8 max-h-[88vh] overflow-y-auto animate-[slideUp_280ms_cubic-bezier(0.32,0.72,0,1)]"
      >
        <div className="sticky top-0 px-6 pt-3 pb-2 bg-surface flex items-center justify-between">
          <div className="mx-auto w-10 h-1 rounded-full bg-outline-variant md:hidden" />
        </div>

        {step === 'review' && (
          <div className="px-6 pb-6">
            <div className="font-mono text-label-sm text-tertiary uppercase tracking-widest mb-2.5">
              {t('cancelGroup.kicker')}
            </div>
            <h2 className="font-headline text-headline-sm tracking-tight leading-tight m-0 text-on-surface">
              {t('cancelGroup.titleA')}
              <br />
              <span className="italic font-semibold text-tertiary">
                {t('cancelGroup.titleB')}
              </span>
            </h2>
            <p className="font-body text-body-md leading-relaxed text-on-surface-variant mt-3.5">
              {t('cancelGroup.intro')}
            </p>

            {/* What happens */}
            <div className="mt-6 bg-surface-container-lowest rounded-2xl shadow-ghost-border divide-y divide-outline-variant/40">
              {([
                { icon: 'savings', titleKey: 'cancelGroup.refundTitle', bodyKey: 'cancelGroup.refundBody' },
                { icon: 'block', titleKey: 'cancelGroup.noPenaltyTitle', bodyKey: 'cancelGroup.noPenaltyBody' },
                { icon: 'lock_open', titleKey: 'cancelGroup.autoTitle', bodyKey: 'cancelGroup.autoBody' },
              ] as const).map((it) => (
                <div key={it.icon} className="flex gap-3.5 px-5 py-4">
                  <div className="w-9 h-9 rounded-xl bg-tertiary-fixed/40 text-tertiary flex items-center justify-center flex-shrink-0">
                    <Icon name={it.icon} size={18} />
                  </div>
                  <div>
                    <div className="font-headline text-title-sm tracking-tight">
                      {t(it.titleKey)}
                    </div>
                    <div className="font-body text-body-sm leading-relaxed text-on-surface-variant mt-0.5">
                      {t(it.bodyKey)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Refund preview */}
            <div className="mt-6">
              <div className="font-headline text-label-md text-on-surface-variant uppercase tracking-wider mb-2.5">
                {t('cancelGroup.refundPreview')}
              </div>
              <div className="bg-surface-container-lowest rounded-2xl shadow-ghost-border">
                <div className="divide-y divide-outline-variant/40">
                  {members.map((m) => (
                    <div key={m.member} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center font-headline text-title-sm">
                        {m.member.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 font-headline text-title-sm">
                        {shortPubkey(m.member)}
                      </div>
                      <div className="font-headline text-title-sm text-secondary">
                        +{formatTokenAmount(m.totalDeposited)} USDC
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-3.5 bg-surface rounded-b-2xl shadow-[inset_0_2px_0_0_rgba(189,201,200,0.4)]">
                  <span className="font-headline text-label-md text-on-surface-variant">
                    {t('cancelGroup.totalToReturn')}
                  </span>
                  <span className="font-headline text-title-md text-on-surface">
                    {formatTokenAmount(totalDeposited)} USDC
                  </span>
                </div>
              </div>
            </div>

            {/* Why-not nudge */}
            <div className="mt-6 rounded-2xl bg-tertiary-fixed/35 px-4 py-4 flex gap-3">
              <Icon name="lightbulb" size={20} className="text-tertiary flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-headline text-title-sm">
                  {t('cancelGroup.thinkAgainTitle')}
                </div>
                <div className="font-body text-body-sm leading-relaxed text-on-surface-variant mt-1">
                  {t('cancelGroup.thinkAgainBody')}
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-2">
              <Button
                variant="tertiary"
                icon="cancel"
                className="w-full bg-surface-container-lowest shadow-[0_0_0_1px_rgba(186,26,26,0.3)] !text-error"
                onClick={() => setStep('confirm')}
              >
                {t('cancelGroup.continue')}
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3.5 rounded-xl font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('cancelGroup.backToGroup')}
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="px-6 pb-6">
            <div className="w-14 h-14 rounded-2xl bg-error-container/60 text-on-error-container flex items-center justify-center mb-4">
              <Icon name="warning" size={28} />
            </div>
            <h2 className="font-headline text-headline-sm tracking-tight leading-tight m-0">
              {t('cancelGroup.lastConfirm')}
            </h2>
            <p className="font-body text-body-md leading-relaxed text-on-surface-variant mt-3">
              {t('cancelGroup.confirmBody', {
                groupName,
                amount: `${formatTokenAmount(totalDeposited)} USDC`,
                count: members.length,
              })}
            </p>
            <p className="font-body text-body-sm text-on-surface-variant mt-4 mb-2">
              {t('cancelGroup.typeToConfirm', { word: expectedConfirm })}
            </p>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirm}
              className="w-full px-4 py-3.5 rounded-xl bg-surface-container-lowest font-body text-body-md text-on-surface shadow-ghost-border outline-none focus:shadow-[0_0_0_2px_var(--tw-shadow-color)] focus:shadow-primary"
            />
            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="primary"
                icon="lock_open"
                className="w-full !bg-error !bg-none"
                onClick={onConfirm}
                disabled={!canConfirm}
                loading={loading}
              >
                {t('cancelGroup.confirmCta')}
              </Button>
              <button
                type="button"
                onClick={() => setStep('review')}
                className="w-full py-3.5 rounded-xl font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('common.back')}
              </button>
            </div>

            <div className="mt-6 px-4 py-3 bg-surface-container-low rounded-xl flex gap-2.5 font-body text-body-sm text-on-surface-variant">
              <Icon name="shield" size={16} className="text-primary flex-shrink-0 mt-0.5" />
              <span>{t('cancelGroup.signNote')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
