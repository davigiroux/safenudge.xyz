import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Icon } from './Icon'
import { Logo } from './Logo'

export function TopNav() {
  const { t, i18n } = useTranslation()
  const { connected, publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR')
  }

  const shortAddress = publicKey
    ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`
    : ''

  return (
    <nav className="full-bleed bg-surface/75 sticky top-0 z-40 backdrop-blur-md">
      <div className="mx-auto max-w-[1440px] px-4 py-3 md:px-8 lg:px-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <Logo size={28} />
          <span className="font-headline text-headline-sm text-on-surface font-extrabold tracking-tight">
            {t('common.appName')}
          </span>
        </Link>

        <div className="flex items-center gap-6 lg:gap-8">
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link
              to="/grupos"
              className="font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors no-underline"
            >
              {t('nav.groups')}
            </Link>
            <Link
              to="/como-funciona"
              className="font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors no-underline"
            >
              {t('nav.howItWorks')}
            </Link>
            <Link
              to="/seguranca"
              className="font-label text-label-lg text-on-surface-variant hover:text-on-surface transition-colors no-underline"
            >
              {t('nav.security')}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              aria-label={i18n.language === 'pt-BR' ? 'Switch to English' : 'Mudar para Português'}
              className="flex items-center gap-1 px-3 py-2.5 min-h-[44px] rounded-xl bg-surface-container-low text-on-surface-variant font-label text-label-md hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon name="language" size={18} />
              {i18n.language === 'pt-BR' ? 'EN' : 'PT'}
            </button>

            {connected ? (
              <button
                onClick={() => disconnect()}
                aria-label={`${shortAddress} — disconnect wallet`}
                className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl bg-primary-fixed/20 text-primary font-label text-label-md hover:bg-primary-fixed/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Icon name="account_balance_wallet" size={18} />
                {shortAddress}
              </button>
            ) : (
              <button
                onClick={() => setVisible(true)}
                aria-label={t('common.connectWallet')}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl btn-primary-gradient text-on-primary font-label text-label-lg hover:shadow-active-glow transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed whitespace-nowrap"
              >
                <Icon name="account_balance_wallet" size={18} />
                <span className="hidden sm:inline">{t('common.connectWalletShort')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

type NavItem = {
  icon: string
  labelKey: string
  to: string
}

const navItems: NavItem[] = [
  { icon: 'home', labelKey: 'nav.home', to: '/' },
  { icon: 'group', labelKey: 'nav.myGroups', to: '/grupos' },
  { icon: 'person', labelKey: 'nav.profile', to: '/' },
]

export function BottomNav() {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-container-low px-4 py-2 md:hidden z-50">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to && item.icon === 'home'
          return (
            <Link
              key={item.icon}
              to={item.to}
              className={[
                'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl no-underline',
                'transition-colors duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              <Icon name={item.icon} size={24} />
              <span className="font-label text-label-sm">
                {t(item.labelKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
