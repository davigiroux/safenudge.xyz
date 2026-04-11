import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { Icon } from './Icon'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
  icon?: string
  suffix?: ReactNode
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, hint, error, icon, suffix, className = '', ...props }, ref) => {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && (
          <label className="font-label text-label-md text-on-surface-variant">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <Icon
              name={icon}
              size={20}
              className="absolute left-3 text-on-surface-variant"
            />
          )}
          <input
            ref={ref}
            className={[
              'w-full bg-surface-container-lowest rounded-xl',
              'px-4 py-3 font-body text-body-lg text-on-surface',
              'placeholder:text-outline',
              'outline-none transition-shadow duration-200',
              'focus:shadow-ghost-border focus:shadow-active-glow',
              error && 'shadow-[0_0_0_1px_rgba(186,26,26,0.3)]',
              icon && 'pl-10',
              suffix && 'pr-16',
            ].filter(Boolean).join(' ')}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 font-label text-label-lg text-on-surface-variant">
              {suffix}
            </span>
          )}
        </div>
        {hint && !error && (
          <p className="font-body text-body-sm text-on-surface-variant">
            {hint}
          </p>
        )}
        {error && (
          <p className="font-body text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
    )
  }
)

TextInput.displayName = 'TextInput'

type RadioOption = {
  value: string
  label: string
  icon?: string
}

type RadioGroupProps = {
  label?: string
  options: RadioOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  className = '',
}: RadioGroupProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span className="font-label text-label-md text-on-surface-variant">
          {label}
        </span>
      )}
      <div className="flex gap-2">
        {options.map((option) => {
          const isSelected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={[
                'flex-1 flex items-center justify-center gap-2',
                'rounded-xl px-4 py-3',
                'font-label text-label-lg',
                'transition-all duration-200',
                isSelected
                  ? 'bg-primary text-on-primary shadow-nudge'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high',
              ].join(' ')}
            >
              {option.icon && <Icon name={option.icon} size={18} />}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
