import { useTranslation } from 'react-i18next'
import { Icon, Button, Card } from '../components'
import { PageLayout } from '../components/PageLayout'

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 lg:flex-col lg:items-center lg:text-center px-4 py-4 lg:py-6">
      <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-primary-fixed/30 flex items-center justify-center flex-shrink-0">
        <Icon name={icon} size={24} className="text-primary" />
      </div>
      <div>
        <span className="font-headline text-title-lg lg:text-headline-sm text-on-surface block">{value}</span>
        <span className="font-label text-label-md text-on-surface-variant">{label}</span>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description, accent }: { icon: string; title: string; description: string; accent: string }) {
  return (
    <Card variant="surface" hover className="shadow-nudge group">
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-2xl ${accent} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
          <Icon name={icon} size={22} className="text-on-primary" />
        </div>
        <div>
          <h3 className="font-headline text-title-lg text-on-surface mb-1.5">{title}</h3>
          <p className="font-body text-body-md text-on-surface-variant leading-relaxed">{description}</p>
        </div>
      </div>
    </Card>
  )
}

export default function Landing() {
  const { t } = useTranslation()

  return (
    <PageLayout bgClass="bg-surface">
      {/* Hero — gradient background, editorial asymmetry */}
      <section className="relative overflow-hidden">
        {/* Background: warm gradient with teal accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface-container-low to-primary-fixed/20" />
        {/* Decorative circles — desktop only */}
        <div className="absolute -right-32 -top-32 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl hidden lg:block" />
        <div className="absolute right-20 bottom-0 w-[300px] h-[300px] rounded-full bg-secondary-fixed/10 blur-2xl hidden lg:block" />

        <div className="relative px-4 pt-12 pb-10 md:px-8 lg:px-32 lg:pt-28 lg:pb-24">
          <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-center">
            {/* Left: text content */}
            <div className="text-center lg:text-left lg:col-span-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container-lowest shadow-ghost-border mb-6">
                <Icon name="verified" size={16} className="text-primary" />
                <span className="font-label text-label-md text-primary">
                  {t('landing.stat2Value')}
                </span>
              </div>

              <h1 className="font-headline text-display-sm md:text-display-md lg:text-display-lg text-on-surface mb-6 leading-tight tracking-tight">
                {t('landing.hero')}
              </h1>

              <p className="font-body text-body-lg text-on-surface-variant mb-10 max-w-xl lg:max-w-lg leading-relaxed">
                {t('landing.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-center lg:items-start gap-4">
                <Button variant="primary" icon="group_add" to="/criar" className="px-6 py-3 text-label-lg shadow-nudge">
                  {t('landing.cta')}
                </Button>
                <Button variant="tertiary" icon="login" to="/grupos">
                  {t('landing.joinCta')}
                </Button>
              </div>
            </div>

            {/* Right: floating dashboard preview */}
            <div className="hidden lg:flex lg:col-span-2 lg:justify-end">
              <div className="relative w-full max-w-[340px]">
                {/* Main preview card */}
                <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-nudge">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl btn-primary-gradient flex items-center justify-center">
                      <Icon name="shield" size={20} className="text-on-primary" />
                    </div>
                    <div>
                      <span className="font-headline text-title-md text-on-surface block">{t('landing.previewGroup')}</span>
                      <span className="font-label text-label-sm text-on-surface-variant">{t('landing.previewMembers')}</span>
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between mb-1.5">
                      <span className="font-label text-label-sm text-on-surface-variant">Semana 3/12</span>
                      <span className="font-label text-label-sm text-primary">25%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-full w-1/4 rounded-full btn-primary-gradient" />
                    </div>
                  </div>
                  {/* Mini stat rows */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-label text-label-md text-on-surface-variant">Meta Individual</span>
                      <span className="font-headline text-title-sm text-on-surface">6.000 USDC</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-label text-label-md text-on-surface-variant">Recebimento</span>
                      <span className="font-headline text-title-sm text-secondary">R$ 4.250</span>
                    </div>
                  </div>
                </div>

                {/* Floating accent card — offset top-right */}
                <div className="absolute -top-4 -right-6 bg-surface-container-lowest rounded-xl px-4 py-3 shadow-nudge flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary-fixed flex items-center justify-center">
                    <Icon name="trending_up" size={18} className="text-on-secondary-container" />
                  </div>
                  <div>
                    <span className="font-headline text-title-sm text-on-surface block">{t('landing.stat1Value')}</span>
                    <span className="font-label text-label-sm text-on-surface-variant">{t('landing.stat1Label')}</span>
                  </div>
                </div>

                {/* Floating nudge card — offset bottom-left */}
                <div className="absolute -bottom-5 -left-8 bg-surface-container-lowest rounded-xl px-4 py-3 shadow-nudge flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-tertiary-fixed flex items-center justify-center">
                    <Icon name="notifications_active" size={18} className="text-on-tertiary-fixed-variant" />
                  </div>
                  <div>
                    <span className="font-headline text-title-sm text-on-surface block">{t('landing.previewOnTrack')}</span>
                    <span className="font-label text-label-sm text-on-surface-variant">{t('landing.previewBehind')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats — overlap into hero on desktop */}
      <section className="bg-surface-container-low">
        <div className="px-4 py-6 md:px-8 lg:px-32 lg:py-0">
          <div className="lg:-mt-10 lg:relative lg:z-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5">
              {[
                { icon: 'trending_up', label: t('landing.stat1Label'), value: t('landing.stat1Value') },
                { icon: 'shield', label: t('landing.stat2Label'), value: t('landing.stat2Value') },
                { icon: 'group', label: t('landing.stat3Label'), value: t('landing.stat3Value') },
              ].map((stat) => (
                <Card key={stat.icon} variant="surface" className="lg:shadow-nudge">
                  <StatCard {...stat} />
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — editorial 2-column */}
      <section className="px-4 py-10 md:px-8 lg:px-32 lg:py-24">
        <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-start">
          <div className="lg:col-span-2 mb-8 lg:mb-0 lg:sticky lg:top-24 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed/15 mb-4">
              <Icon name="auto_awesome" size={14} className="text-primary" />
              <span className="font-label text-label-sm text-primary">3 passos</span>
            </div>
            <h2 className="font-headline text-headline-sm lg:text-headline-md text-on-surface mb-3">
              {t('landing.howItWorks')}
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant max-w-sm mx-auto lg:mx-0 leading-relaxed">
              {t('landing.howItWorksSubtitle')}
            </p>
          </div>

          <div className="lg:col-span-3 flex flex-col gap-4">
            {[
              { n: 1, title: t('landing.step1Title'), desc: t('landing.step1Desc'), icon: 'edit_note', bg: 'btn-primary-gradient' },
              { n: 2, title: t('landing.step2Title'), desc: t('landing.step2Desc'), icon: 'group_add', bg: 'bg-secondary' },
              { n: 3, title: t('landing.step3Title'), desc: t('landing.step3Desc'), icon: 'savings', bg: 'bg-tertiary' },
            ].map((step) => (
              <Card key={step.n} variant="surface" hover className="shadow-ghost-border">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${step.bg} flex items-center justify-center`}>
                    <span className="font-headline text-label-lg text-on-primary">{step.n}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline text-title-lg text-on-surface mb-1">{step.title}</h4>
                    <p className="font-body text-body-md text-on-surface-variant leading-relaxed">{step.desc}</p>
                  </div>
                  <Icon name={step.icon} size={22} className="text-outline/40 hidden lg:block flex-shrink-0 mt-1" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features — staggered with colored accents */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-surface-container-low" />
        <div className="absolute -left-40 top-1/2 w-[400px] h-[400px] rounded-full bg-primary-fixed/8 blur-3xl hidden lg:block" />

        <div className="relative px-4 py-10 md:px-8 lg:px-32 lg:py-24">
          <div className="text-center lg:text-left mb-8 lg:mb-14">
            <h2 className="font-headline text-headline-sm lg:text-headline-md text-on-surface mb-2">
              {t('landing.whySafeNudge')}
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant max-w-lg mx-auto lg:mx-0">
              {t('landing.whySafeNudgeSubtitle')}
            </p>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-6">
            <div className="flex flex-col gap-4 lg:gap-6">
              <FeatureCard
                icon="lock"
                title={t('landing.feature1Title')}
                description={t('landing.feature1Desc')}
                accent="btn-primary-gradient"
              />
              <FeatureCard
                icon="bolt"
                title={t('landing.feature3Title')}
                description={t('landing.feature3Desc')}
                accent="bg-tertiary"
              />
            </div>
            <div className="flex flex-col gap-4 lg:gap-6 lg:mt-10">
              <FeatureCard
                icon="gavel"
                title={t('landing.feature2Title')}
                description={t('landing.feature2Desc')}
                accent="bg-secondary"
              />
              <FeatureCard
                icon="visibility"
                title={t('landing.feature4Title')}
                description={t('landing.feature4Desc')}
                accent="bg-primary"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA — rich background */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-surface to-secondary-fixed/10" />
        <div className="absolute right-0 bottom-0 w-[300px] h-[300px] rounded-full bg-primary-fixed/10 blur-3xl hidden lg:block" />

        <div className="relative px-4 py-14 md:px-8 lg:px-32 lg:py-28">
          <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-center">
            <div className="hidden lg:flex lg:col-span-2 lg:justify-center">
              <div className="relative">
                <div className="w-40 h-40 rounded-[2.5rem] bg-primary/10 -rotate-6 flex items-center justify-center">
                  <div className="w-28 h-28 rounded-[2rem] bg-primary/20 rotate-3 flex items-center justify-center">
                    <Icon name="savings" size={48} className="text-primary -rotate-3" />
                  </div>
                </div>
                {/* Floating pill */}
                <div className="absolute -bottom-3 -right-4 bg-surface-container-lowest rounded-full px-4 py-2 shadow-nudge flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                  <span className="font-label text-label-sm text-on-surface">2 min</span>
                </div>
              </div>
            </div>
            <div className="text-center lg:text-left lg:col-span-3">
              <div className="w-14 h-14 rounded-2xl btn-primary-gradient flex items-center justify-center mx-auto lg:mx-0 mb-5 lg:hidden">
                <Icon name="savings" size={28} className="text-on-primary" />
              </div>
              <h2 className="font-headline text-headline-md lg:text-headline-lg text-on-surface mb-3">
                {t('landing.readyToStart')}
              </h2>
              <p className="font-body text-body-lg text-on-surface-variant mb-8 max-w-md mx-auto lg:mx-0 leading-relaxed">
                {t('landing.readyToStartDesc')}
              </p>
              <div className="flex justify-center lg:justify-start">
                <Button variant="primary" icon="arrow_forward" iconPosition="right" to="/criar" className="px-6 py-3 shadow-nudge">
                  {t('landing.cta')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-container-low px-4 py-6 md:px-8 lg:px-32">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-headline text-title-md text-primary font-bold">
            SafeNudge
          </span>
          <p className="font-body text-body-sm text-on-surface-variant">
            {t('landing.footer')}
          </p>
        </div>
      </footer>
    </PageLayout>
  )
}
