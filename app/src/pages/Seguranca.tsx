import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Icon } from '../components'
import { PageLayout } from '../components/PageLayout'

const ACCENT = '#006565'
const ACCENT_LIGHT = '#76d6d5'
const ACCENT_GRAD = 'linear-gradient(135deg,#006565,#008080)'

type Pillar = { icon: string; title: string; body: string }
type AuditRow = { tag: string; who: string; body: string }
type MoneyPoint = { num: string; title: string; body: string }
type Faq = { q: string; a: string }

function FaqItem({ q, a }: Faq) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-6 shadow-[inset_0_1px_0_0_rgba(189,201,200,0.4)]">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full bg-transparent text-left flex items-center justify-between gap-4"
        aria-expanded={open}
      >
        <span className="font-headline text-title-lg lg:text-headline-sm tracking-tight text-on-surface">
          {q}
        </span>
        <Icon
          name="add"
          size={24}
          className={`text-primary flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pt-4 font-body text-body-lg leading-relaxed text-on-surface-variant max-w-3xl">
            {a}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Seguranca() {
  const { t } = useTranslation()
  const pillars = t('seguranca.pillars', { returnObjects: true }) as Pillar[]
  const openPoints = t('seguranca.openPoints', { returnObjects: true }) as AuditRow[]
  const driftChecks = t('seguranca.drift.checks', { returnObjects: true }) as string[]
  const moneyPoints = t('seguranca.moneyPoints', { returnObjects: true }) as MoneyPoint[]
  const faq = t('seguranca.faq', { returnObjects: true }) as Faq[]

  return (
    <PageLayout>
      {/* HERO */}
      <section className="px-6 py-20 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1400px]">
          <div className="max-w-[920px]">
            <div
              className="font-mono text-label-sm uppercase tracking-widest mb-5"
              style={{ color: ACCENT, letterSpacing: '0.14em' }}
            >
              {t('seguranca.kicker')}
            </div>
            <h1
              className="font-headline tracking-tight leading-[1.05] m-0"
              style={{
                fontSize: 'clamp(44px, 5.5vw, 72px)',
                fontWeight: 800,
                textWrap: 'pretty',
              }}
            >
              {t('seguranca.h1l1')}
              <br />
              <span style={{ color: ACCENT, fontStyle: 'italic', fontWeight: 600 }}>
                {t('seguranca.h1l2')}
              </span>
            </h1>
            <p
              className="font-body leading-relaxed mt-7 max-w-[720px] text-on-surface-variant"
              style={{ fontSize: 19, textWrap: 'pretty' }}
            >
              {t('seguranca.sub')}
            </p>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="px-6 pb-24 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-[760px] mb-12">
            <h2
              className="font-headline tracking-tight m-0 leading-tight"
              style={{ fontSize: 'clamp(32px, 3.8vw, 44px)', fontWeight: 700 }}
            >
              {t('seguranca.pillarsTitle')}
            </h2>
            <p className="font-body text-body-lg leading-relaxed mt-4 text-on-surface-variant" style={{ textWrap: 'pretty' }}>
              {t('seguranca.pillarsSub')}
            </p>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="bg-surface-container-lowest rounded-3xl p-7 lg:p-8 flex flex-col gap-3.5 shadow-ghost-border hover:shadow-nudge transition-shadow"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: `${ACCENT_LIGHT}44`,
                    color: ACCENT,
                  }}
                >
                  <Icon name={p.icon} size={26} />
                </div>
                <h3 className="font-headline text-title-lg lg:text-headline-sm tracking-tight m-0 leading-tight">
                  {p.title}
                </h3>
                <p className="font-body text-body-md leading-relaxed text-on-surface-variant m-0" style={{ textWrap: 'pretty' }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DRIFT — dark callout */}
      <section
        className="full-bleed px-6 py-24 lg:px-10 lg:py-28"
        style={{ background: '#1a1c1a', color: '#f1f1ed' }}
      >
        <div className="mx-auto max-w-[1100px] grid gap-12 lg:gap-[60px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)] items-start">
          <div>
            <div
              className="font-mono text-label-sm uppercase mb-4"
              style={{ color: ACCENT_LIGHT, letterSpacing: '0.14em' }}
            >
              {t('seguranca.drift.kicker')}
            </div>
            <h2
              className="font-headline tracking-tight m-0 leading-tight"
              style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700 }}
            >
              {t('seguranca.drift.title')}
            </h2>
            <p
              className="font-body leading-relaxed mt-6"
              style={{ fontSize: 17, color: 'rgba(241,241,237,0.78)', textWrap: 'pretty' }}
            >
              {t('seguranca.drift.body')}
            </p>
          </div>
          <div
            className="rounded-3xl p-8 lg:p-9"
            style={{
              background: 'rgba(241,241,237,0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(241,241,237,0.08)',
            }}
          >
            <div className="font-headline text-title-lg mb-4 tracking-tight">
              {t('seguranca.drift.check')}
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-3.5">
              {driftChecks.map((c, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 font-body leading-relaxed"
                  style={{ fontSize: 15, color: 'rgba(241,241,237,0.88)' }}
                >
                  <span style={{ color: ACCENT_LIGHT, marginTop: 1, flexShrink: 0 }}>
                    <Icon name="check_circle" size={20} />
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* AUDIT TABLE */}
      <section className="px-6 py-24 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1100px]">
          <div className="max-w-[760px] mb-10">
            <h2
              className="font-headline tracking-tight m-0 leading-tight"
              style={{ fontSize: 'clamp(32px, 3.8vw, 44px)', fontWeight: 700 }}
            >
              {t('seguranca.openTitle')}
            </h2>
            <p className="font-body text-body-lg leading-relaxed mt-4 text-on-surface-variant" style={{ textWrap: 'pretty' }}>
              {t('seguranca.openSub')}
            </p>
          </div>
          <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-ghost-border divide-y divide-outline-variant/40">
            {openPoints.map((row) => (
              <div
                key={row.tag}
                className="grid gap-6 lg:gap-8 px-6 lg:px-8 py-7 lg:[grid-template-columns:140px_1fr] items-start"
              >
                <div
                  className="font-mono text-label-sm uppercase pt-1"
                  style={{ color: ACCENT, letterSpacing: '0.12em', fontWeight: 600 }}
                >
                  {row.tag}
                </div>
                <div>
                  <div className="font-headline text-title-lg tracking-tight">{row.who}</div>
                  <div className="font-body text-body-md text-on-surface-variant mt-1" style={{ textWrap: 'pretty' }}>
                    {row.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MONEY — what if SafeNudge disappears */}
      <section
        className="full-bleed px-6 py-24 lg:px-10 lg:py-28"
        style={{ background: '#f4f4f0' }}
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="max-w-[760px] mb-12">
            <h2
              className="font-headline tracking-tight m-0 leading-tight"
              style={{ fontSize: 'clamp(32px, 3.8vw, 44px)', fontWeight: 700 }}
            >
              {t('seguranca.moneyTitle')}
            </h2>
            <p className="font-body text-body-lg leading-relaxed mt-4 text-on-surface-variant" style={{ textWrap: 'pretty' }}>
              {t('seguranca.moneySub')}
            </p>
          </div>
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {moneyPoints.map((m) => (
              <div
                key={m.num}
                className="bg-surface-container-lowest rounded-3xl p-7 lg:p-8 shadow-ghost-border"
              >
                <div
                  className="font-headline text-label-md mb-3.5"
                  style={{ color: ACCENT, letterSpacing: '0.04em', fontWeight: 700 }}
                >
                  {m.num}
                </div>
                <div className="font-headline text-title-lg lg:text-headline-sm tracking-tight leading-tight mb-3">
                  {m.title}
                </div>
                <p className="font-body text-body-md leading-relaxed text-on-surface-variant m-0" style={{ textWrap: 'pretty' }}>
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-24 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1100px]">
          <h2
            className="font-headline tracking-tight m-0 leading-tight"
            style={{ fontSize: 'clamp(36px, 4.5vw, 56px)', fontWeight: 700 }}
          >
            {t('seguranca.faqTitle')}
          </h2>
          <div className="mt-12">
            {faq.map((f, i) => (
              <FaqItem key={i} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-32 pt-12 lg:px-10">
        <div className="mx-auto max-w-[1100px]">
          <div
            className="rounded-[32px] px-8 py-16 lg:px-14 lg:py-20 relative overflow-hidden"
            style={{ background: ACCENT_GRAD, color: '#fff' }}
          >
            <div
              className="absolute pointer-events-none rounded-full blur-3xl"
              style={{
                top: -80,
                right: -80,
                width: 300,
                height: 300,
                background: 'rgba(255,255,255,0.08)',
              }}
            />
            <div className="relative max-w-[640px]">
              <h2
                className="font-headline tracking-tight m-0 leading-tight"
                style={{ fontSize: 'clamp(36px, 4vw, 52px)', fontWeight: 700 }}
              >
                {t('seguranca.ctaTitle')}
              </h2>
              <p
                className="font-body leading-relaxed mt-4"
                style={{ fontSize: 18, color: 'rgba(255,255,255,0.88)', textWrap: 'pretty' }}
              >
                {t('seguranca.ctaSub')}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/criar"
                  className="font-label inline-flex items-center gap-2 no-underline transition-all"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    padding: '14px 26px',
                    borderRadius: 14,
                    background: '#fff',
                    color: ACCENT,
                    minHeight: 48,
                  }}
                >
                  <Icon name="group_add" size={18} />
                  {t('seguranca.ctaCreate')}
                </Link>
                <Link
                  to="/grupos"
                  className="font-label inline-flex items-center gap-2 no-underline transition-all"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    padding: '14px 26px',
                    borderRadius: 14,
                    background: 'transparent',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.5)',
                    minHeight: 48,
                  }}
                >
                  <Icon name="login" size={18} />
                  {t('seguranca.ctaJoin')}
                </Link>
                <a
                  href="https://github.com/davigiroux/safenudge.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="font-body inline-flex items-center gap-1.5 no-underline"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.8)',
                    padding: '14px 4px',
                  }}
                >
                  {t('seguranca.docCTA')}
                  <Icon name="arrow_outward" size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
