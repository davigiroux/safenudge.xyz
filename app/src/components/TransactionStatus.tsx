import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { Button } from './Button'
import type { TxErrorKind } from '../utils/txErrors'

type TxState = 'signing' | 'confirming' | 'success' | 'error'

type TransactionStatusProps = {
  state: TxState
  groupCode?: string
  errorDetail?: string
  errorKind?: TxErrorKind | null
  errorProgramCode?: string | null
  onRetry?: () => void
  onClose?: () => void
}

const stateConfig: Record<TxState, { icon: string; color: string; spin?: boolean }> = {
  signing: { icon: 'draw', color: 'text-primary', spin: false },
  confirming: { icon: 'progress_activity', color: 'text-primary', spin: true },
  success: { icon: 'check_circle', color: 'text-secondary' },
  error: { icon: 'error', color: 'text-error' },
}

const NON_ERROR_TITLE_KEYS: Record<Exclude<TxState, 'error'>, string> = {
  signing: 'transaction.awaitingSignature',
  confirming: 'transaction.confirming',
  success: 'transaction.success',
}

// Maps a classified TxErrorKind to its i18n key under `errors.*`.
// Program errors look up `errors.programError.<Name>` with a fallback.
function errorTitleKey(kind: TxErrorKind | null | undefined, programCode: string | null | undefined): string {
  if (!kind) return 'transaction.errorTitle'
  if (kind === 'programError' && programCode) {
    return `errors.programError.${programCode}`
  }
  return `errors.${kind}`
}

export function TransactionStatus({
  state,
  groupCode,
  errorDetail,
  errorKind,
  errorProgramCode,
  onRetry,
  onClose,
}: TransactionStatusProps) {
  const { t } = useTranslation()
  const config = stateConfig[state]
  const errorTitle = (() => {
    if (state !== 'error') return ''
    const key = errorTitleKey(errorKind, errorProgramCode)
    const fallback = t('transaction.errorTitle')
    const resolved = t(key, { defaultValue: fallback })
    return resolved
  })()
  const title = state === 'error' ? errorTitle : t(NON_ERROR_TITLE_KEYS[state])
  // Only show raw detail when it adds info beyond the localized title.
  const showRawDetail =
    state === 'error' && !!errorDetail && errorDetail.trim() !== '' && errorDetail !== title
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/30"
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-status-title"
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-2xl p-8 max-w-sm mx-4 text-center shadow-nudge outline-none"
      >
        <div className={`mb-4 ${config.spin ? 'animate-spin' : ''}`}>
          <Icon name={config.icon} size={48} className={config.color} label={title} />
        </div>

        <h2 id="tx-status-title" className="font-headline text-headline-sm text-on-surface mb-2">
          {title}
        </h2>

        <p className="font-body text-body-md text-on-surface-variant mb-6">
          {state === 'success' && t('transaction.successDetail')}
          {state === 'error' && (showRawDetail ? errorDetail : t('errors.generic'))}
          {state === 'signing' && t('transaction.securityNote')}
        </p>

        <div className="flex flex-col gap-3">
          {state === 'success' && groupCode && (
            <Button
              variant="primary"
              icon="arrow_forward"
              iconPosition="right"
              onClick={onClose}
            >
              {t('transaction.returnHome')}
            </Button>
          )}

          {state === 'error' && (
            <>
              <Button variant="primary" icon="refresh" onClick={onRetry}>
                {t('transaction.tryAgain')}
              </Button>
              <Button variant="tertiary" onClick={onClose}>
                {t('common.close')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
