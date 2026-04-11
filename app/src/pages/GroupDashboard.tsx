import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, StatRow, Icon, NudgeToast } from '../components'

type MemberStatus = 'on_track' | 'behind' | 'missed'

type MockMember = {
  name: string
  avatar: string
  streak: number
  totalDeposited: number
  status: MemberStatus
  isYou?: boolean
}

const MOCK_MEMBERS: MockMember[] = [
  { name: 'Ricardo S.', avatar: '🧑‍💼', streak: 3, totalDeposited: 1500, status: 'on_track', isYou: true },
  { name: 'Mariana L.', avatar: '👩‍🎨', streak: 3, totalDeposited: 1500, status: 'on_track' },
  { name: 'Bruno C.', avatar: '👨‍💻', streak: 1, totalDeposited: 500, status: 'behind' },
  { name: 'Ana P.', avatar: '👩‍🔬', streak: 3, totalDeposited: 1500, status: 'on_track' },
]

const statusConfig: Record<MemberStatus, { icon: string; color: string }> = {
  on_track: { icon: 'check_circle', color: 'text-secondary' },
  behind: { icon: 'warning', color: 'text-tertiary' },
  missed: { icon: 'cancel', color: 'text-error' },
}

function MemberCard({ member }: { member: MockMember }) {
  const { t } = useTranslation()
  const config = statusConfig[member.status]

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-lg flex-shrink-0">
        {member.avatar}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-body text-title-sm text-on-surface truncate">
            {member.name}
          </span>
          {member.isYou && (
            <span className="font-label text-label-sm text-primary bg-primary-fixed/20 px-2 py-0.5 rounded-full">
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-label text-label-sm text-on-surface-variant">
            {member.streak} {t('groupDashboard.streak')} 🔥
          </span>
          <span className="font-label text-label-sm text-on-surface-variant">
            {member.totalDeposited} USDC
          </span>
        </div>
      </div>

      <Icon name={config.icon} size={20} className={config.color} />
    </div>
  )
}

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="font-label text-label-md text-on-surface-variant">
          {pct}%
        </span>
      </div>
      <div
        className="h-2 lg:h-3 rounded-full bg-surface-container-high overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className="h-full rounded-full btn-primary-gradient transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function GroupDashboard() {
  const { t } = useTranslation()
  const { code } = useParams<{ code: string }>()
  const [showNudge, setShowNudge] = useState(true)

  const isValidCode = code && /^[a-zA-Z0-9-]{1,32}$/.test(code)

  if (!isValidCode) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <Icon name="error" size={48} className="text-error mb-4" />
          <p className="font-body text-body-lg text-error">
            {t('errors.invalidGroupCode')}
          </p>
        </div>
      </PageLayout>
    )
  }

  const currentPeriod = 3
  const totalPeriods = 12

  return (
    <PageLayout bgClass="bg-surface-container-low">
      <div className="px-4 pt-4 pb-4 md:px-8 lg:px-32 lg:py-8">
        {/* Group Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-headline text-headline-sm lg:text-headline-md text-on-surface">
                {code}
              </h1>
              <span className="font-label text-label-sm text-on-primary bg-secondary px-2 py-0.5 rounded-full">
                {t('groupDashboard.statusActive')}
              </span>
            </div>
            <div className="flex items-center gap-1 font-label text-label-md text-on-surface-variant">
              <Icon name="tag" size={16} />
              <span>{t('groupDashboard.codeLabel')}: {code}</span>
            </div>
          </div>
          <Button variant="primary" icon="payments" className="w-full sm:w-auto">
            {t('groupDashboard.deposit')}
          </Button>
        </div>

        {/* Desktop: 2-column layout. Mobile: single stack */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-8">
          {/* Main content — 3 columns */}
          <div className="lg:col-span-3">
            {/* Cycle Progress Card */}
            <Card variant="featured" className="shadow-nudge mb-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-headline text-title-lg text-on-surface">
                  {t('groupDashboard.cycleProgress', { current: currentPeriod, total: totalPeriods })}
                </span>
                <div className="flex items-center gap-1 font-label text-label-md text-on-surface-variant">
                  <Icon name="schedule" size={16} />
                  <span>2d 14h</span>
                </div>
              </div>

              <ProgressBar current={currentPeriod} total={totalPeriods} label={t('groupDashboard.cycleProgress', { current: currentPeriod, total: totalPeriods })} />

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="font-label text-label-sm text-on-surface-variant block">
                    {t('groupDashboard.nextDeposit')}
                  </span>
                  <span className="font-body text-title-sm text-on-surface">
                    2d 14h
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-label text-label-sm text-on-surface-variant block">
                    {t('groupDashboard.estimatedReceive')}
                  </span>
                  <span className="font-headline text-title-lg lg:text-headline-sm text-secondary">
                    R$ 4.250,00
                  </span>
                </div>
              </div>
            </Card>

            {/* Members */}
            <div className="mb-4">
              <h2 className="font-headline text-title-lg text-on-surface mb-3">
                {t('groupDashboard.membersList')}
              </h2>
              <div className="flex flex-col gap-3">
                {MOCK_MEMBERS.map((member) => (
                  <MemberCard key={member.name} member={member} />
                ))}
              </div>
            </div>

            {/* Send Nudge */}
            {MOCK_MEMBERS.some((m) => m.status === 'behind') && (
              <Card variant="surface" className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-tertiary-fixed flex items-center justify-center">
                      <Icon name="notifications_active" size={18} className="text-on-tertiary-fixed-variant" />
                    </div>
                    <div>
                      <span className="font-body text-body-md text-on-surface">
                        Bruno C.
                      </span>
                      <span className="font-body text-body-sm text-on-surface-variant block">
                        2 {t('groupDashboard.streak')}
                      </span>
                    </div>
                  </div>
                  <Button variant="tertiary" icon="arrow_forward" iconPosition="right">
                    {t('groupDashboard.sendNudge')}
                  </Button>
                </div>
              </Card>
            )}

            {/* Plan Details — shown inline on mobile, moves to sidebar on desktop */}
            <div className="lg:hidden">
              <Card variant="surface" className="mb-4">
                <h3 className="font-headline text-title-md text-on-surface mb-3">
                  {t('groupDashboard.planDetails')}
                </h3>
                <StatRow label={t('groupDashboard.weeklyAmount')} value="500 USDC" />
                <StatRow label={t('groupDashboard.paymentDay')} value={t('groupDashboard.everyDay', { day: 'Domingo' })} />
                <StatRow label={t('groupDashboard.endDate')} value="12 Out 2026" />
              </Card>

              <Card variant="surface">
                <div className="flex items-center gap-3">
                  <Icon name="verified_user" size={24} className="text-primary" />
                  <span className="font-body text-body-md text-on-surface-variant">
                    {t('groupDashboard.security')}
                  </span>
                </div>
              </Card>
            </div>
          </div>

          {/* Sidebar — 2 columns, desktop only */}
          <div className="hidden lg:flex lg:col-span-2 lg:flex-col lg:gap-4">
            {/* Sticky sidebar */}
            <div className="sticky top-24 flex flex-col gap-4">
              <Card variant="featured" className="shadow-nudge">
                <h3 className="font-headline text-title-lg text-on-surface mb-4">
                  {t('groupDashboard.planDetails')}
                </h3>
                <StatRow label={t('groupDashboard.weeklyAmount')} value="500 USDC" />
                <StatRow label={t('groupDashboard.paymentDay')} value={t('groupDashboard.everyDay', { day: 'Domingo' })} />
                <StatRow label={t('groupDashboard.endDate')} value="12 Out 2026" />
              </Card>

              <Card variant="surface">
                <div className="flex items-center gap-3 mb-3">
                  <Icon name="verified_user" size={24} className="text-primary" />
                  <span className="font-headline text-title-md text-on-surface">
                    {t('groupDashboard.security')}
                  </span>
                </div>
                <p className="font-body text-body-sm text-on-surface-variant">
                  {t('groupDashboard.securityDetail')}
                </p>
              </Card>

              {/* Quick stats */}
              <div className="bg-surface-container-lowest rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary-fixed/20 flex items-center justify-center">
                    <Icon name="insights" size={20} className="text-secondary" />
                  </div>
                  <span className="font-headline text-title-md text-on-surface">
                    {t('groupDashboard.quickStats')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-headline text-headline-sm text-on-surface block">75%</span>
                    <span className="font-label text-label-sm text-on-surface-variant">{t('groupDashboard.compliance')}</span>
                  </div>
                  <div>
                    <span className="font-headline text-headline-sm text-on-surface block">4</span>
                    <span className="font-label text-label-sm text-on-surface-variant">{t('groupDashboard.membersCount')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nudge Toast */}
      {showNudge && (
        <NudgeToast
          icon="priority_high"
          action={{
            label: t('groupDashboard.sendNudge'),
            onClick: () => setShowNudge(false),
          }}
          onClose={() => setShowNudge(false)}
          duration={8000}
        >
          {t('createGroup.penaltyHint')}
        </NudgeToast>
      )}
    </PageLayout>
  )
}
