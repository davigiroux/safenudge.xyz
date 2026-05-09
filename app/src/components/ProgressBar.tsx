type ProgressBarTone = 'primary' | 'success' | 'tertiary'

type ProgressBarProps = {
  value: number
  max?: number
  tone?: ProgressBarTone
  ariaLabel: string
  className?: string
  thickness?: 'sm' | 'md' | 'lg'
}

const toneStyles: Record<ProgressBarTone, string> = {
  primary: 'btn-primary-gradient',
  success: 'bg-secondary',
  tertiary: 'bg-tertiary',
}

const thicknessStyles: Record<NonNullable<ProgressBarProps['thickness']>, string> = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  ariaLabel,
  className = '',
  thickness = 'md',
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100))
  return (
    <div
      className={[
        'w-full rounded-full bg-surface-container-high overflow-hidden',
        thicknessStyles[thickness],
        className,
      ].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${toneStyles[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
