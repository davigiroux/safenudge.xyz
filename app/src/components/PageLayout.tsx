import { type ReactNode } from 'react'
import { TopNav } from './Nav'
import { BottomNav } from './Nav'

type PageLayoutProps = {
  children: ReactNode
  showNav?: boolean
  bgClass?: string
}

export function PageLayout({
  children,
  showNav = true,
  bgClass = 'bg-surface',
}: PageLayoutProps) {
  return (
    <div className={`min-h-screen ${bgClass}`}>
      <div className="max-w-[1440px] mx-auto">
        {showNav && <TopNav />}
        <main className="pb-20 md:pb-0">
          {children}
        </main>
      </div>
      {showNav && <BottomNav />}
    </div>
  )
}

type SectionProps = {
  children: ReactNode
  className?: string
}

export function Section({ children, className = '' }: SectionProps) {
  return (
    <section className={`bg-surface-container-low ${className}`}>
      <div className="px-4 py-6 md:px-8 lg:px-32">
        {children}
      </div>
    </section>
  )
}
