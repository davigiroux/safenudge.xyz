import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Icon } from '../components'
import { PageLayout } from '../components/PageLayout'

const ACCENT = '#006565'
const ACCENT_LIGHT = '#76d6d5'
const ACCENT_GRAD = 'linear-gradient(135deg,#006565,#008080)'

type Point = { title: string; body: string }
type Pillar = {
  num: string
  name: string
  verb: string
  kicker: string
  lede: string
  points: Point[]
}
type Default = { when: string; what: string; body: string }
type Faq = { q: string; a: string }

const PILLAR_ICONS: string[][] = [
  ['groups', 'payments', 'gavel', 'description'],
  ['notifications_active', 'pan_tool_alt', 'scale', 'visibility'],
  ['groups_2', 'bolt', 'handshake', 'refresh'],
]

const PILLAR_TINTS = [
  { bg: '#f4f4f0', inverted: false },
  { bg: '#1a1c1a', inverted: true },
  { bg: '#e3fffe', inverted: false },
]

function PillarSection({ pillar, index }: { pillar: Pillar; index: number }) {
  const tint = PILLAR_TINTS[index]
  const inverted = tint.inverted
  const fg = inverted ? '#f1f1ed' : '#1a1c1a'
  const fgMuted = inverted ? 'rgba(241,241,237,0.72)' : '#3e4949'
  const numColor = inverted ? ACCENT_LIGHT : ACCENT
  const cardBg = inverted ? 'rgba(241,241,237,0.04)' : '#fff'
  const cardBorder = inverted
    ? '1px solid rgba(241,241,237,0.08)'
    : '1px solid rgba(189,201,200,0.3)'
  const iconChipBg = inverted ? 'rgba(118,214,213,0.15)' : 'rgba(118,214,213,0.27)'
  const iconChipFg = inverted ? ACCENT_LIGHT : ACCENT
  const icons = PILLAR_ICONS[index]

  return (
    <section
      id={`pillar-${index}`}
      className="full-bleed"
      style={{ background: tint.bg, color: fg, padding: '100px 40px' }}
    >
      <div className="mx-auto" style={{ maxWidth: 1200 }}>
        <div className="grid gap-10 lg:gap-[60px] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.4fr)] items-start">
          <div className="lg:sticky lg:top-[100px]">
            <div
              className="font-headline"
              style={{
                fontSize: 'clamp(96px, 11vw, 140px)',
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: '-0.04em',
                color: numColor,
                opacity: inverted ? 1 : 0.85,
              }}
            >
              {pillar.num}
            </div>
            <div
              className="font-headline"
              style={{
                fontSize: 'clamp(40px, 5vw, 56px)',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                marginTop: 8,
                lineHeight: 1,
                color: fg,
              }}
            >
              {pillar.name}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                color: numColor,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginTop: 18,
              }}
            >
              — {pillar.verb}
            </div>
            <div
              className="font-headline"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: fg,
                letterSpacing: '-0.01em',
                marginTop: 28,
                maxWidth: 360,
                lineHeight: 1.25,
              }}
            >
              {pillar.kicker}
            </div>
            <p
              className="font-body"
              style={{
                fontSize: 17,
                lineHeight: 1.55,
                color: fgMuted,
                marginTop: 18,
                maxWidth: 420,
                textWrap: 'pretty',
              }}
            >
              {pillar.lede}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pillar.points.map((pt, j) => (
              <div
                key={j}
                style={{
                  background: cardBg,
                  border: cardBorder,
                  borderRadius: 20,
                  padding: '28px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minHeight: 200,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: iconChipBg,
                    color: iconChipFg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={icons[j]} size={22} />
                </div>
                <div
                  className="font-headline"
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: fg,
                    lineHeight: 1.2,
                  }}
                >
                  {pt.title}
                </div>
                <div
                  className="font-body"
                  style={{ fontSize: 14.5, lineHeight: 1.55, color: fgMuted, textWrap: 'pretty' }}
                >
                  {pt.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FAQItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  const panelId = `faq-panel-${q.replace(/\s+/g, '-').slice(0, 30)}`
  return (
    <div style={{ borderBottom: '1px solid rgba(189,201,200,0.3)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-6 text-left bg-transparent"
        style={{ padding: '24px 0', cursor: 'pointer', border: 0, color: '#1a1c1a' }}
      >
        <span
          className="font-headline"
          style={{ fontSize: 'clamp(18px, 2.2vw, 22px)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 }}
        >
          {q}
        </span>
        <span
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: isOpen ? ACCENT : 'rgba(189,201,200,0.18)',
            color: isOpen ? '#fff' : ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 200ms ease-out',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <Icon name="expand_more" size={20} />
        </span>
      </button>
      {isOpen && (
        <div
          id={panelId}
          className="font-body"
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: '#3e4949',
            paddingBottom: 24,
            paddingRight: 52,
            textWrap: 'pretty',
          }}
        >
          {a}
        </div>
      )}
    </div>
  )
}

export default function ComoFunciona() {
  const { t } = useTranslation()
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const pillars = t('comoFunciona.pillars', { returnObjects: true }) as Pillar[]
  const defaults = t('comoFunciona.defaults', { returnObjects: true }) as Default[]
  const faq = t('comoFunciona.faq', { returnObjects: true }) as Faq[]

  return (
    <PageLayout bgClass="bg-surface">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="full-bleed bg-surface">
        <div className="mx-auto" style={{ maxWidth: 1400, padding: '80px 40px 60px' }}>
          <div style={{ maxWidth: 880 }}>
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                color: ACCENT,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 20,
              }}
            >
              {t('comoFunciona.kicker')}
            </div>
            <h1
              className="font-headline"
              style={{
                fontSize: 'clamp(48px, 6vw, 76px)',
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                margin: 0,
                textWrap: 'pretty',
                color: '#1a1c1a',
              }}
            >
              {t('comoFunciona.h1line1')}
              <br />
              <span style={{ color: ACCENT, fontStyle: 'italic', fontWeight: 600 }}>
                {t('comoFunciona.h1line2')}
              </span>
            </h1>
            <p
              className="font-body"
              style={{
                fontSize: 19,
                lineHeight: 1.55,
                color: '#3e4949',
                marginTop: 28,
                maxWidth: 640,
                textWrap: 'pretty',
              }}
            >
              {t('comoFunciona.sub')}
            </p>

            <div className="mt-11 flex flex-wrap gap-8">
              {pillars.map((p, i) => (
                <a
                  key={i}
                  href={`#pillar-${i}`}
                  className="flex items-center gap-3 no-underline"
                  style={{ color: '#1a1c1a' }}
                >
                  <span
                    className="font-mono"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: ACCENT_GRAD,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {p.num}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className="font-headline"
                      style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}
                    >
                      {p.name}
                    </span>
                    <span className="font-body" style={{ fontSize: 12, color: '#3e4949' }}>
                      {p.verb}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pillars ──────────────────────────────────────────────────── */}
      {pillars.map((p, i) => (
        <PillarSection key={i} pillar={p} index={i} />
      ))}

      {/* ─── Defaults / Safety net ────────────────────────────────────── */}
      <section className="full-bleed bg-surface" style={{ padding: '100px 40px' }}>
        <div className="mx-auto" style={{ maxWidth: 1100 }}>
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              color: ACCENT,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: 16,
            }}
          >
            {t('comoFunciona.defaultsEyebrow')}
          </div>
          <h2
            className="font-headline"
            style={{
              fontSize: 'clamp(36px, 4.5vw, 56px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              maxWidth: 800,
              lineHeight: 1.1,
              color: '#1a1c1a',
            }}
          >
            {t('comoFunciona.defaultsTitle')}
          </h2>
          <p
            className="font-body"
            style={{
              fontSize: 18,
              lineHeight: 1.55,
              color: '#3e4949',
              marginTop: 20,
              maxWidth: 640,
              textWrap: 'pretty',
            }}
          >
            {t('comoFunciona.defaultsSub')}
          </p>

          <div className="mt-14 relative">
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {defaults.map((d, i) => (
                <div
                  key={i}
                  className="relative"
                  style={{
                    background: '#fff',
                    border: '1px solid rgba(189,201,200,0.3)',
                    borderRadius: 20,
                    padding: '28px 24px',
                  }}
                >
                  <div
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      color: ACCENT,
                      letterSpacing: '0.14em',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {d.when}
                  </div>
                  <div
                    className="font-headline"
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      color: '#1a1c1a',
                      marginTop: 10,
                      lineHeight: 1.2,
                    }}
                  >
                    {d.what}
                  </div>
                  <div
                    className="font-body"
                    style={{
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: '#3e4949',
                      marginTop: 12,
                      textWrap: 'pretty',
                    }}
                  >
                    {d.body}
                  </div>
                  {i < defaults.length - 1 && (
                    <div
                      className="hidden lg:flex"
                      style={{
                        position: 'absolute',
                        top: 44,
                        right: -18,
                        zIndex: 2,
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#faf9f5',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 0 1px rgba(189,201,200,0.3)',
                      }}
                    >
                      <span style={{ color: ACCENT, display: 'inline-flex' }}>
                        <Icon name="arrow_forward" size={18} />
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-8"
            style={{
              padding: '20px 24px',
              background: '#fff',
              border: '1px solid rgba(107,254,156,0.4)',
              borderLeft: '3px solid #006d37',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              maxWidth: 820,
            }}
          >
            <span style={{ color: '#006d37', marginTop: 2, display: 'inline-flex' }}>
              <Icon name="verified" size={20} />
            </span>
            <div className="font-body" style={{ fontSize: 15, lineHeight: 1.55, color: '#1a1c1a' }}>
              {t('comoFunciona.defaultsFoot')}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────── */}
      <section className="full-bleed bg-surface">
        <div className="mx-auto" style={{ maxWidth: 1100, padding: '100px 40px' }}>
          <h2
            className="font-headline"
            style={{
              fontSize: 'clamp(36px, 4.5vw, 56px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1.1,
              color: '#1a1c1a',
            }}
          >
            {t('comoFunciona.faqTitle')}
          </h2>
          <div className="mt-12">
            {faq.map((f, i) => (
              <FAQItem
                key={i}
                q={f.q}
                a={f.a}
                isOpen={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA banner ───────────────────────────────────────────────── */}
      <section className="full-bleed bg-surface" style={{ padding: '60px 40px 120px' }}>
        <div
          className="mx-auto relative overflow-hidden"
          style={{
            maxWidth: 1100,
            background: ACCENT_GRAD,
            color: '#fff',
            borderRadius: 32,
            padding: 'clamp(48px, 6vw, 72px) clamp(28px, 4.5vw, 56px)',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -80,
              right: -80,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              filter: 'blur(40px)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', maxWidth: 640 }}>
            <h2
              className="font-headline"
              style={{
                fontSize: 'clamp(36px, 4vw, 52px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {t('comoFunciona.ctaTitle')}
            </h2>
            <p
              className="font-body"
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.88)',
                marginTop: 16,
                textWrap: 'pretty',
              }}
            >
              {t('comoFunciona.ctaSub')}
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
                {t('comoFunciona.ctaCreate')}
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
                {t('comoFunciona.ctaJoin')}
              </Link>
              <Link
                to="/seguranca"
                className="font-body inline-flex items-center gap-1.5 no-underline"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.8)',
                  padding: '14px 4px',
                }}
              >
                {t('comoFunciona.footCTA')}
                <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
