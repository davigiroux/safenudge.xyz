import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, StatRow, Icon } from '../components'

const MOCK_GROUP = {
  code: 'viagem-japao-2025',
  depositAmount: 150,
  frequency: 'Semanal',
  penaltyPercent: 10,
  currentMembers: 4,
  maxMembers: 10,
  members: [
    { name: 'Ricardo S.', avatar: '🧑‍💼' },
    { name: 'Mariana L.', avatar: '👩‍🎨' },
    { name: 'Bruno C.', avatar: '👨‍💻' },
    { name: 'Ana P.', avatar: '👩‍🔬' },
  ],
}

export default function JoinGroup() {
  const { t } = useTranslation()
  const { code } = useParams<{ code: string }>()

  const isValidCode = code && /^[a-zA-Z0-9-]{1,32}$/.test(code)

  if (!isValidCode) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <Icon name="error" size={48} className="text-error mb-4" />
          <p className="font-body text-body-lg text-error">
            {t('errors.invalidGroupCode')}
          </p>
        </div>
      </PageLayout>
    )
  }

  const group = MOCK_GROUP

  return (
    <PageLayout bgClass="bg-surface-container-low">
      <div className="px-4 py-6 md:px-8 lg:px-32 lg:py-16">
        {/* Desktop: 2-column asymmetric. Mobile: single stack */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-start max-w-5xl mx-auto">
          {/* Left: invitation context — 2 columns */}
          <div className="text-center lg:text-left lg:col-span-2 mb-8 lg:mb-0 lg:sticky lg:top-24">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-fixed/20 mb-4">
              <Icon name="mail" size={16} className="text-primary" />
              <span className="font-label text-label-md text-primary">
                {t('joinGroup.title')}
              </span>
            </div>
            <h1 className="font-headline text-headline-md lg:text-headline-lg text-on-surface mb-2">
              {code}
            </h1>
            <p className="font-body text-body-lg text-on-surface-variant mb-6">
              {t('joinGroup.subtitle')}
            </p>

            {/* Members — shown here on desktop */}
            <div className="hidden lg:block">
              <span className="font-label text-label-md text-on-surface-variant mb-3 block">
                {t('groupDashboard.membersList')}
              </span>
              <div className="flex -space-x-2">
                {group.members.map((member, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-xl ring-2 ring-surface-container-low"
                    title={member.name}
                  >
                    {member.avatar}
                  </div>
                ))}
                {group.maxMembers - group.currentMembers > 0 && (
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center ring-2 ring-surface-container-low">
                    <span className="font-label text-label-md text-on-surface-variant">
                      +{group.maxMembers - group.currentMembers}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: action card — 3 columns */}
          <div className="lg:col-span-3">

        {/* Group Details Card */}
        <Card variant="featured" className="shadow-nudge mb-6">
          <div className="flex flex-col gap-0">
            <StatRow
              label={t('joinGroup.weeklyContribution')}
              value={`${group.depositAmount} USDC`}
            />
            <StatRow
              label={t('createGroup.frequency')}
              value={group.frequency}
            />
            <StatRow
              label={t('joinGroup.penalty')}
              value={`${group.penaltyPercent}%`}
            />
            <StatRow
              label={t('createGroup.memberLimit')}
              value={t('joinGroup.members', { current: group.currentMembers, max: group.maxMembers })}
            />
          </div>
        </Card>

        {/* Members — mobile only (desktop shows in left column) */}
        <div className="mb-6 lg:hidden">
          <span className="font-label text-label-md text-on-surface-variant mb-3 block">
            {t('groupDashboard.membersList')}
          </span>
          <div className="flex -space-x-2">
            {group.members.map((member, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-lg ring-2 ring-surface-container-low"
                title={member.name}
              >
                {member.avatar}
              </div>
            ))}
            {group.maxMembers - group.currentMembers > 0 && (
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center ring-2 ring-surface-container-low">
                <span className="font-label text-label-sm text-on-surface-variant">
                  +{group.maxMembers - group.currentMembers}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <Button variant="primary" icon="login" className="w-full py-3 mb-3">
          {t('joinGroup.joinAndDeposit')}
        </Button>

        <button
          className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] font-label text-label-lg text-tertiary hover:text-tertiary-container transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => alert('Ramp Network integration coming soon')}
        >
          <Icon name="bolt" size={18} />
          {t('joinGroup.pixOption')}
        </button>

        {/* Nudge Stat */}
        <Card variant="surface" className="mt-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-tertiary-fixed flex items-center justify-center">
              <Icon name="trending_up" size={18} className="text-on-tertiary-fixed-variant" />
            </div>
            <p className="font-body text-body-sm text-on-surface-variant">
              {t('joinGroup.nudgeStat')}
            </p>
          </div>
        </Card>

          </div>
        </div>
      </div>
    </PageLayout>
  )
}
