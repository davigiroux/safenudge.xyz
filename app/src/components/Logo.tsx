type LogoProps = {
  size?: number
  mono?: boolean
  className?: string
}

export function Logo({ size = 28, mono = false, className }: LogoProps) {
  if (mono) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label="SafeNudge"
        className={className}
      >
        <rect x="6" y="10" width="24" height="24" rx="6" fill="currentColor" />
        <rect x="18" y="18" width="24" height="24" rx="6" fill="currentColor" opacity="0.55" />
        <rect x="18" y="18" width="12" height="16" fill="currentColor" opacity="0.8" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="SafeNudge"
      className={className}
    >
      <rect x="6" y="10" width="24" height="24" rx="6" fill="#006565" />
      <rect x="18" y="18" width="24" height="24" rx="6" fill="#4ae183" />
      <rect x="18" y="18" width="12" height="16" fill="#008080" />
    </svg>
  )
}
