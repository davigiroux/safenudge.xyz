import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, Button } from '../components'
import { PageLayout } from '../components/PageLayout'

const AVATAR_BG = ['#ffddb9', '#6bfe9c', '#93f2f2', '#ffb961']
const AVATAR_FG = ['#663e00', '#00290f', '#002020', '#2b1700']

function Avatar({ name, idx, size = 26 }: { name: string; idx: number; size?: number }) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const i = idx % AVATAR_BG.length
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-body font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[i],
        color: AVATAR_FG[i],
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}

function Moment({
  step,
  title,
  body,
  icon,
  accentClass,
}: {
  step: string
  title: string
  body: string
  icon: string
  accentClass: string
}) {
  return (
    <div className="relative bg-surface-container-lowest rounded-2xl p-7 shadow-ghost-border overflow-hidden">
      <div className="font-mono text-label-sm text-on-surface-variant tracking-widest mb-5">
        {step}
      </div>
      <div className={`w-13 h-13 rounded-2xl flex items-center justify-center mb-5 ${accentClass}`}
           style={{ width: 52, height: 52 }}>
        <Icon name={icon} size={28} />
      </div>
      <h3 className="font-headline text-title-lg text-on-surface mb-2.5 tracking-tight">{title}</h3>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">{body}</p>
    </div>
  )
}

function Stat({
  big,
  label,
  cite,
  bigColorClass,
  divider,
  borderTop,
}: {
  big: string
  label: string
  cite: string
  bigColorClass: string
  divider?: boolean
  borderTop?: boolean
}) {
  return (
    <div
      className="px-6 py-9 lg:px-8 lg:pt-10 lg:pb-8 relative"
      style={{
        borderLeft: divider ? '1px solid rgba(189,201,200,0.18)' : 'none',
        borderTop: borderTop ? '1px solid rgba(189,201,200,0.18)' : 'none',
      }}
    >
      <div
        className={`font-headline font-extrabold tracking-tight tabular-nums mb-5 ${bigColorClass}`}
        style={{ fontSize: 'clamp(48px, 5.5vw, 84px)', lineHeight: 0.95, letterSpacing: '-0.04em' }}
      >
        {big}
      </div>
      <div className="font-body text-body-md leading-relaxed mb-5 max-w-[280px]" style={{ color: '#e8ebe8' }}>
        {label}
      </div>
      <div
        className="font-mono text-label-sm tracking-widest uppercase pt-4"
        style={{ color: '#7a8585', borderTop: '1px solid rgba(189,201,200,0.12)' }}
      >
        {cite}
      </div>
    </div>
  )
}

export default function Landing() {
  const { t } = useTranslation()

  const [pct, setPct] = useState(62)
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setBurst(true)
      setPct((p) => (p >= 88 ? 62 : p + 3))
      const t = setTimeout(() => setBurst(false), 1600)
      return () => clearTimeout(t)
    }, 3200)
    return () => clearInterval(id)
  }, [])

  const balance = 15500 + (pct - 62) * 200

  return (
    <PageLayout bgClass="bg-surface">
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 -right-32 w-[620px] h-[620px] rounded-full pointer-events-none hidden lg:block"
             style={{ background: 'rgba(107,254,156,0.16)', filter: 'blur(120px)' }} />
        <div className="absolute -bottom-32 -left-32 w-[560px] h-[560px] rounded-full pointer-events-none hidden lg:block"
             style={{ background: 'rgba(147,242,242,0.22)', filter: 'blur(110px)' }} />

        <div className="relative px-4 pt-10 pb-16 md:px-8 lg:px-16 lg:pt-16 lg:pb-32">
          <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-center">
            {/* Copy column */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 font-mono text-label-sm uppercase tracking-widest text-primary mb-6">
                <span
                  className="w-2 h-2 rounded-full bg-secondary-fixed-dim"
                  style={{ animation: 'pulse 2s infinite' }}
                  aria-hidden="true"
                />
                {t('landing.heroEyebrow')} · {t('landing.live')}
              </div>

              <h1
                className="font-headline font-extrabold text-on-surface mb-7"
                style={{
                  fontSize: 'clamp(56px, 9vw, 120px)',
                  letterSpacing: '-0.04em',
                  lineHeight: 0.92,
                }}
              >
                {t('landing.heroL1')}
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(135deg, #006565, #4ae183)' }}
                >
                  {t('landing.heroL2')}
                </span>
              </h1>

              <p className="font-body text-body-lg text-on-surface-variant max-w-md mx-auto lg:mx-0 leading-relaxed mb-8"
                 style={{ fontSize: '1.1875rem' }}>
                {t('landing.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3">
                <Button variant="primary" icon="group_add" to="/criar" className="px-7 py-4 text-label-lg shadow-nudge">
                  {t('landing.cta')}
                </Button>
                <Button variant="tertiary" icon="login" to="/grupos" className="px-7 py-4 text-label-lg shadow-ghost-border !text-on-surface">
                  {t('landing.joinCta')}
                </Button>
              </div>
            </div>

            {/* Floating stack */}
            <div className="hidden lg:block relative" style={{ height: 620 }}>
              {/* Group card — main */}
              <div
                className="absolute bg-surface-container-lowest rounded-2xl p-6 animate-float1"
                style={{
                  top: 80,
                  right: 20,
                  width: 340,
                  boxShadow: '0 20px 60px -10px rgba(0,101,101,0.2)',
                }}
              >
                <div className="flex items-center gap-2.5 mb-3.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                       style={{ background: 'rgba(0,101,101,0.13)', color: '#006565' }}>
                    <Icon name="savings" size={18} />
                  </div>
                  <div>
                    <div className="font-headline text-title-sm font-bold text-on-surface">{t('landing.previewGroup')}</div>
                    <div className="font-body text-label-sm text-on-surface-variant">{t('landing.previewMembers')}</div>
                  </div>
                </div>
                <div className="font-headline font-extrabold text-on-surface tabular-nums"
                     style={{ fontSize: 40, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  R$ {balance.toLocaleString('pt-BR')}
                </div>
                <div className="font-body text-body-sm text-on-surface-variant mb-3.5">
                  {pct}% {t('landing.previewOfTarget')} · R$ 25.000
                </div>
                <div className="h-1.5 rounded-full bg-surface-variant overflow-hidden">
                  <div
                    className="h-full rounded-full btn-primary-gradient"
                    style={{ width: `${pct}%`, transition: 'width 500ms ease-out' }}
                  />
                </div>
                <div className="flex justify-between mt-2.5 font-body text-label-sm text-on-surface-variant">
                  <span>{pct}%</span>
                  <span className="text-secondary font-semibold inline-flex items-center gap-1">
                    <Icon name="trending_up" size={14} />
                    26 🔥
                  </span>
                </div>
              </div>

              {/* Deposit burst */}
              <div
                className="absolute bg-surface-container-lowest rounded-[20px] p-4 animate-float2"
                style={{
                  top: 10,
                  left: 10,
                  width: 260,
                  boxShadow: '0 16px 48px -8px rgba(0,109,55,0.2)',
                  opacity: burst ? 1 : 0.65,
                  transition: 'opacity 500ms ease-out',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="rounded-xl flex items-center justify-center"
                    style={{ width: 40, height: 40, background: '#6bfe9c', color: '#00290f' }}
                  >
                    <Icon name="payments" size={22} />
                  </div>
                  <div>
                    <div className="font-headline text-title-sm font-bold text-on-surface">
                      {t('landing.previewDeposit')}
                    </div>
                    <div className="font-body text-label-sm text-on-surface-variant">Mariana · R$ 520,00</div>
                  </div>
                  <Icon name="check_circle" size={20} className="text-secondary ml-auto" />
                </div>
              </div>

              {/* Nudge card (glass) */}
              <div
                className="absolute glass-nudge rounded-2xl p-4 flex gap-3 items-start animate-float3"
                style={{
                  bottom: 60,
                  left: -10,
                  width: 300,
                  boxShadow: '0 12px 40px -8px rgba(128,79,0,0.18), 0 0 0 1px rgba(189,201,200,0.25)',
                }}
              >
                <div
                  className="rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ width: 40, height: 40, background: '#ffddb9', color: '#663e00' }}
                >
                  <Icon name="lightbulb" size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-headline text-title-sm font-bold text-on-surface">
                    {t('landing.previewNudgeTitle')}
                  </div>
                  <div className="font-body text-on-surface-variant leading-snug mt-0.5" style={{ fontSize: '0.71875rem' }}>
                    {t('landing.previewNudgeBody')}
                  </div>
                </div>
              </div>

              {/* Streak chip */}
              <div
                className="absolute inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-headline font-semibold text-body-sm animate-float2"
                style={{
                  bottom: 200,
                  right: -20,
                  background: '#1a1c1a',
                  color: '#faf9f5',
                  boxShadow: '0 12px 32px -6px rgba(0,0,0,0.25)',
                }}
              >
                🔥 38 {t('landing.previewStreak')} · Ana
              </div>

              {/* Avatar cluster */}
              <div
                className="absolute inline-flex items-center gap-2.5 bg-surface-container-lowest rounded-full pl-2 pr-4 py-2 animate-float1"
                style={{
                  top: 360,
                  right: 60,
                  boxShadow: '0 12px 32px -6px rgba(0,101,101,0.1)',
                }}
              >
                <div className="flex">
                  {['Mariana', 'Pedro', 'Beatriz'].map((name, i) => (
                    <div
                      key={name}
                      style={{ marginLeft: i ? -8 : 0, boxShadow: '0 0 0 2px #fff', borderRadius: '50%' }}
                    >
                      <Avatar name={name} idx={i + 1} size={26} />
                    </div>
                  ))}
                </div>
                <span className="font-body text-body-sm font-semibold text-on-surface">
                  4/4 {t('landing.previewOnTime')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── §01 — Three moments ──────────────────────────────────────── */}
      <section className="full-bleed bg-surface-container-low px-4 py-14 md:px-8 lg:px-16 lg:py-24">
        <div className="max-w-2xl mb-12">
          <div className="font-mono text-label-sm uppercase tracking-widest text-primary mb-3.5">
            {t('landing.momentsEyebrow')}
          </div>
          <h2 className="font-headline font-bold text-on-surface tracking-tight"
              style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1 }}>
            {t('landing.momentsTitle')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Moment
            step={t('landing.moment1Step')}
            title={t('landing.moment1Title')}
            body={t('landing.moment1Body')}
            icon="payments"
            accentClass="bg-secondary/10 text-secondary"
          />
          <Moment
            step={t('landing.moment2Step')}
            title={t('landing.moment2Title')}
            body={t('landing.moment2Body')}
            icon="notifications_active"
            accentClass="bg-tertiary/10 text-tertiary"
          />
          <Moment
            step={t('landing.moment3Step')}
            title={t('landing.moment3Title')}
            body={t('landing.moment3Body')}
            icon="celebration"
            accentClass="bg-primary/10 text-primary"
          />
        </div>
      </section>

      {/* ─── §02 — Why this works (dark slab) ─────────────────────────── */}
      <section className="full-bleed relative overflow-hidden px-4 py-20 md:px-8 lg:px-16 lg:py-28"
               style={{ background: '#1a1c1a', color: '#faf9f5' }}>
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full pointer-events-none"
             style={{ background: 'rgba(107,254,156,0.08)', filter: 'blur(140px)' }} />

        <div className="relative">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-start mb-16 lg:mb-20">
            <div>
              <div className="font-mono text-label-sm uppercase tracking-widest mb-4" style={{ color: '#6bfe9c' }}>
                {t('landing.whyEyebrow')}
              </div>
              <h2 className="font-headline font-extrabold tracking-tight"
                  style={{ fontSize: 'clamp(36px, 5.2vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.03em', color: '#faf9f5' }}>
                {t('landing.whyTitleLead')}{' '}
                <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#bdc9c8' }}>
                  {t('landing.whyTitleEm')}
                </span>
                <br />
                {t('landing.whyTitleTail')}
              </h2>
            </div>
            <p className="font-body leading-relaxed pt-2"
               style={{ fontSize: 17, color: '#bdc9c8' }}>
              {t('landing.whyIntro')}
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-3"
               style={{ borderTop: '1px solid rgba(189,201,200,0.18)' }}>
            <Stat
              big={t('landing.stat1Big')}
              label={t('landing.stat1Label')}
              cite={t('landing.stat1Cite')}
              bigColorClass="text-[#6bfe9c]"
            />
            <Stat
              big={t('landing.stat2Big')}
              label={t('landing.stat2Label')}
              cite={t('landing.stat2Cite')}
              bigColorClass="text-[#93f2f2]"
              divider
            />
            <Stat
              big={t('landing.stat3Big')}
              label={t('landing.stat3Label')}
              cite={t('landing.stat3Cite')}
              bigColorClass="text-[#ffddb9]"
              divider
            />
            <Stat
              big={t('landing.stat4Big')}
              label={t('landing.stat4Label')}
              cite={t('landing.stat4Cite')}
              bigColorClass="text-[#6bfe9c]"
              borderTop
            />
            <Stat
              big={t('landing.stat5Big')}
              label={t('landing.stat5Label')}
              cite={t('landing.stat5Cite')}
              bigColorClass="text-[#93f2f2]"
              borderTop
              divider
            />
            <Stat
              big={t('landing.stat6Big')}
              label={t('landing.stat6Label')}
              cite={t('landing.stat6Cite')}
              bigColorClass="text-[#ffddb9]"
              borderTop
              divider
            />
          </div>

          {/* Quote band */}
          <div className="mt-20 pt-14 grid grid-cols-[auto_1fr] gap-8 lg:gap-12 items-start"
               style={{ borderTop: '1px solid rgba(189,201,200,0.18)' }}>
            <div className="font-headline font-extrabold select-none"
                 style={{ fontSize: 'clamp(96px, 14vw, 180px)', color: '#6bfe9c', lineHeight: 0.7, letterSpacing: '-0.08em' }}
                 aria-hidden="true">
              &ldquo;
            </div>
            <div>
              <blockquote className="font-headline font-medium m-0"
                          style={{ fontSize: 'clamp(24px, 3vw, 44px)', lineHeight: 1.15, letterSpacing: '-0.02em', color: '#faf9f5' }}>
                {t('landing.quoteText')}{' '}
                <em style={{ color: '#6bfe9c', fontStyle: 'normal' }}>{t('landing.quoteEm')}</em>{' '}
                {t('landing.quoteTail')}
              </blockquote>
              <div className="font-mono text-label-sm uppercase tracking-widest mt-5"
                   style={{ color: '#bdc9c8' }}>
                {t('landing.quoteCite')}
              </div>
              <p className="font-body leading-relaxed mt-7 max-w-[620px]"
                 style={{ fontSize: 15.5, color: '#bdc9c8' }}>
                {t('landing.quoteExplainer')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────── */}
      <section className="px-4 py-20 md:px-8 lg:px-16 lg:py-28 bg-surface">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-headline font-extrabold text-on-surface tracking-tight mb-7"
              style={{ fontSize: 'clamp(36px, 6vw, 80px)', lineHeight: 1.02, letterSpacing: '-0.03em' }}>
            {t('landing.ctaHeadlineA')}
            <br />
            <span className="text-primary">{t('landing.ctaHeadlineB')}</span>
          </h2>
          <div className="inline-flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" icon="group_add" to="/criar" className="px-7 py-4 text-label-lg shadow-nudge">
              {t('landing.cta')}
            </Button>
            <Button variant="tertiary" icon="login" to="/grupos" className="px-7 py-4 text-label-lg shadow-ghost-border !text-on-surface">
              {t('landing.joinCta')}
            </Button>
          </div>
          <div className="mt-7 inline-flex items-center gap-2 font-body text-body-sm text-on-surface-variant">
            <Icon name="shield" size={16} className="text-primary" />
            {t('landing.trustLine')}
          </div>
        </div>
      </section>

    </PageLayout>
  )
}
