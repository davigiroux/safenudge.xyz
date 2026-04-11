import { type ReactNode } from 'react'
import { Icon } from './Icon'

type EmptyStateProps = {
  icon: string
  title: string
  description: string
  children?: ReactNode
}

export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
        <Icon name={icon} size={32} className="text-on-surface-variant" />
      </div>
      <h2 className="font-headline text-headline-sm text-on-surface mb-2">
        {title}
      </h2>
      <p className="font-body text-body-md text-on-surface-variant max-w-sm mb-8">
        {description}
      </p>
      {children && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {children}
        </div>
      )}
    </div>
  )
}
