import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { Icon } from './Icon'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

type BaseProps = {
  variant?: ButtonVariant
  icon?: string
  iconPosition?: 'left' | 'right'
  loading?: boolean
  children: ReactNode
  className?: string
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: never }
type LinkButtonProps = BaseProps & { to: To; disabled?: never; loading?: never }

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'btn-primary-gradient text-on-primary',
    'hover:shadow-active-glow active:opacity-90',
    'font-label text-label-lg',
  ].join(' '),
  secondary: [
    'bg-secondary-fixed text-on-secondary-container',
    'hover:bg-secondary-fixed-dim active:opacity-90',
    'font-label text-label-lg',
  ].join(' '),
  tertiary: [
    'bg-transparent text-tertiary',
    'hover:bg-tertiary-fixed/10 active:opacity-80',
    'font-label text-label-lg',
  ].join(' '),
}

const sharedClasses = [
  'inline-flex items-center justify-center gap-2',
  'rounded-xl px-4 py-2 min-h-[44px]',
  'transition-all duration-200 ease-out',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
].join(' ')

function ButtonContent({ icon, iconPosition = 'left', loading, children }: Pick<BaseProps, 'icon' | 'iconPosition' | 'loading' | 'children'>) {
  if (loading) {
    return (
      <span className="animate-spin">
        <Icon name="progress_activity" size={20} />
      </span>
    )
  }
  return (
    <>
      {icon && iconPosition === 'left' && <Icon name={icon} size={20} />}
      {children}
      {icon && iconPosition === 'right' && <Icon name={icon} size={20} />}
    </>
  )
}

export function Button(props: ButtonProps | LinkButtonProps) {
  const {
    variant = 'primary',
    icon,
    iconPosition = 'left',
    loading = false,
    children,
    className = '',
  } = props

  const classes = [sharedClasses, variantStyles[variant], className].join(' ')

  if ('to' in props && props.to != null) {
    return (
      <Link to={props.to} className={`${classes} no-underline`}>
        <ButtonContent icon={icon} iconPosition={iconPosition} loading={false}>
          {children}
        </ButtonContent>
      </Link>
    )
  }

  const { disabled, variant: _v, icon: _i, iconPosition: _ip, loading: _l, className: _c, children: _ch, ...buttonProps } = props as ButtonProps
  return (
    <button
      className={`${classes} disabled:opacity-50 disabled:pointer-events-none`}
      disabled={disabled || loading}
      {...buttonProps}
    >
      <ButtonContent icon={icon} iconPosition={iconPosition} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  )
}
