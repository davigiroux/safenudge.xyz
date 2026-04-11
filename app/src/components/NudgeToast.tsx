import { useState, useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

type NudgeToastProps = {
  icon?: string
  children: ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  duration?: number
  onClose?: () => void
}

export function NudgeToast({
  icon = 'lightbulb',
  children,
  action,
  duration = 6000,
  onClose,
}: NudgeToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))

    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(() => onClose?.(), 300)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  return (
    <div
      className={[
        'fixed bottom-16 left-4 right-4 md:left-auto md:bottom-8 md:right-8 z-50',
        'max-w-sm md:ml-auto glass-nudge rounded-2xl p-4',
        'shadow-nudge',
        'flex items-start gap-3',
        'transition-all duration-300 ease-out',
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4',
      ].join(' ')}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-tertiary-fixed flex items-center justify-center">
        <Icon name={icon} size={18} className="text-on-tertiary-fixed-variant" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-body text-body-md text-on-surface">
          {children}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 font-label text-label-lg text-tertiary hover:text-tertiary-container transition-colors flex items-center gap-1"
          >
            {action.label}
            <Icon name="arrow_forward" size={16} />
          </button>
        )}
      </div>

      <button
        onClick={() => {
          setVisible(false)
          setTimeout(() => onClose?.(), 300)
        }}
        aria-label="Close"
        className="flex-shrink-0 text-on-surface-variant hover:text-on-surface transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
