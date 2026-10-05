import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { Button } from './Button'

type LeaveGroupSheetProps = {
  open: boolean
  groupName: string
  refundAmount: string
  wrongNetwork?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

const WHAT_HAPPENS = [
  { icon: 'savings', titleKey: 'leaveGroup.refundTitle', bodyKey: 'leaveGroup.refundBody' },
  { icon: 'event_seat', titleKey: 'leaveGroup.seatTitle', bodyKey: 'leaveGroup.seatBody' },
  { icon: 'undo', titleKey: 'leaveGroup.returnTitle', bodyKey: 'leaveGroup.returnBody' },
] as const

export function LeaveGroupSheet({
  open,
  groupName,
  refundAmount,
  wrongNetwork = false,
  loading = false,
  onConfirm,
  onClose,
}: LeaveGroupSheetProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('leaveGroup.sheetLabel')}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-[2px] cursor-default animate-[fadeIn_200ms_ease-out]"
      />

      <div className="relative w-full md:max-w-[440px] bg-surface rounded-t-3xl md:rounded-3xl md:mb-8 max-h-[88vh] overflow-y-auto animate-[slideUp_280ms_cubic-bezier(0.32,0.72,0,1)]">
        <div className="sticky top-0 px-6 pt-3 pb-2 bg-surface flex items-center justify-between">
          <div className="mx-auto w-10 h-1 rounded-full bg-outline-variant md:hidden" />
        </div>

        <div className="px-6 pb-6">
          <div className="font-mono text-label-sm text-tertiary uppercase tracking-widest mb-2.5">
            {t('leaveGroup.kicker')}
          </div>
          <h2 className="font-headline text-headline-sm tracking-tight leading-tight m-0 text-on-surface">
            {t('leaveGroup.titleA')}
            <br />
            <span className="italic font-semibold text-tertiary">{t('leaveGroup.titleB')}</span>
          </h2>
          <p className="font-body text-body-md leading-relaxed text-on-surface-variant mt-3.5">
            {t('leaveGroup.intro', { groupName })}
          </p>

          <div className="mt-6 bg-surface-container-lowest rounded-2xl shadow-ghost-border divide-y divide-outline-variant/40">
            {WHAT_HAPPENS.map((it) => (
              <div key={it.icon} className="flex gap-3.5 px-5 py-4">
                <div className="w-9 h-9 rounded-xl bg-tertiary-fixed/40 text-tertiary flex items-center justify-center flex-shrink-0">
                  <Icon name={it.icon} size={18} />
                </div>
                <div>
                  <div className="font-headline text-title-sm tracking-tight">
                    {t(it.titleKey, { amount: refundAmount })}
                  </div>
                  <div className="font-body text-body-sm leading-relaxed text-on-surface-variant mt-0.5">
                    {t(it.bodyKey)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {wrongNetwork && (
            <div className="mt-6 rounded-xl bg-tertiary-fixed/20 p-4 flex items-center gap-3" role="alert">
              <Icon name="warning" size={20} className="text-tertiary" />
              <span className="font-body text-body-md text-on-surface">{t('errors.wrongNetwork')}</span>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2">
            <Button
              variant="primary"
              icon="logout"
              className="w-full"
              onClick={onConfirm}
              loading={loading}
              disabled={wrongNetwork}
            >
              {t('leaveGroup.confirmCta')}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3.5 rounded-xl font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {t('leaveGroup.stay')}
            </button>
          </div>

          <div className="mt-6 px-4 py-3 bg-surface-container-low rounded-xl flex gap-2.5 font-body text-body-sm text-on-surface-variant">
            <Icon name="shield" size={16} className="text-primary flex-shrink-0 mt-0.5" />
            <span>{t('leaveGroup.signNote')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
