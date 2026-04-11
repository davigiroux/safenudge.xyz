type IconProps = {
  name: string
  className?: string
  size?: number
  label?: string
}

export function Icon({ name, className = '', size = 24, label }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{ fontSize: size }}
      aria-hidden={!label}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  )
}
