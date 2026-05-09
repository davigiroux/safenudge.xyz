import { type ReactNode } from 'react'

export type BadgeVariant =
  | 'neutral'
  | 'active'
  | 'nudge'
  | 'streak'
  | 'cycle'
  | 'error'
  | 'success'

type BadgeProps = {
  variant?: BadgeVariant
  pulse?: boolean
  className?: string
  children: ReactNode
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  active: 'bg-secondary-container/30 text-on-secondary-container',
  nudge: 'bg-tertiary-fixed/60 text-on-tertiary-fixed-variant',
  streak: 'bg-tertiary-fixed-dim/25 text-on-tertiary-fixed-variant',
  cycle: 'bg-primary-fixed/40 text-on-primary-fixed-variant',
  error: 'bg-error-container/80 text-on-error-container',
  success: 'bg-secondary-container/30 text-on-secondary-container',
}

export function Badge({
  variant = 'neutral',
  pulse = false,
  className = '',
  children,
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full',
        'font-label text-label-sm',
        variantStyles[variant],
        className,
      ].filter(Boolean).join(' ')}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  )
}
