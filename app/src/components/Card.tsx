import { type ReactNode } from 'react'

type CardVariant = 'surface' | 'featured' | 'glass'

type CardProps = {
  variant?: CardVariant
  hover?: boolean
  className?: string
  children: ReactNode
}

const variantStyles: Record<CardVariant, string> = {
  surface: [
    'bg-surface-container-lowest',
    'rounded-xl p-4 md:p-6',
  ].join(' '),
  featured: [
    'bg-surface-container-lowest',
    'rounded-2xl p-4 md:p-6',
  ].join(' '),
  glass: [
    'bg-glass',
    'rounded-xl p-4 md:p-6',
  ].join(' '),
}

export function Card({
  variant = 'surface',
  hover = false,
  className = '',
  children,
}: CardProps) {
  return (
    <div
      className={[
        variantStyles[variant],
        hover && 'transition-shadow duration-200 hover:shadow-nudge',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}

type StatRowProps = {
  label: string
  value: string
  className?: string
}

export function StatRow({ label, value, className = '' }: StatRowProps) {
  return (
    <div className={`flex items-center justify-between py-2 ${className}`}>
      <span className="font-label text-label-md text-on-surface-variant">
        {label}
      </span>
      <span className="font-body text-title-sm text-on-surface">
        {value}
      </span>
    </div>
  )
}
