import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, StatRow, Icon, NudgeToast, TransactionStatus } from '../components'
import { useAnchorProgram } from '../hooks/useAnchorProgram'
import { useTransaction } from '../hooks/useTransaction'
import { useGroupConfig } from '../hooks/useGroupConfig'
import { useMemberRecord } from '../hooks/useMemberRecord'
import { getGroupConfigPDA, getVaultPDA, getMemberRecordPDA } from '../utils/pda'
import { formatTokenAmount } from '../utils/formatToken'

type MemberStatus = 'on_track' | 'behind' | 'missed'

type MockMember = {
  name: string
  avatar: string
  streak: number
  totalDeposited: number
  status: MemberStatus
  isYou?: boolean
}

// TODO: fetch member records from on-chain data instead of mock
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

const PERIOD_SECONDS: Record<string, number> = {
  weekly: 7 * 86400,
  biweekly: 14 * 86400,
  monthly: 30 * 86400,
}

const STATUS_LABELS: Record<string, string> = {
  open: 'groupDashboard.statusOpen',
  active: 'groupDashboard.statusActive',
  completed: 'groupDashboard.statusCompleted',
  cancelled: 'groupDashboard.statusCancelled',
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
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
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
  const { publicKey } = useWallet()
  const program = useAnchorProgram()
  const { txState, errorDetail, execute, reset } = useTransaction()
  const [showNudge, setShowNudge] = useState(true)

  const isValidCode = code && /^[a-zA-Z0-9-]{1,32}$/.test(code)
  const { data: group, loading: groupLoading, error: groupError } = useGroupConfig(isValidCode ? code : undefined)
  const { data: memberRecord, isMember } = useMemberRecord(isValidCode ? code : undefined)

  const usdcMint = new PublicKey(import.meta.env.VITE_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

  // Calculate current period from real data
  const periodDuration = group ? (PERIOD_SECONDS[group.frequency] || 7 * 86400) : 7 * 86400
  const now = Math.floor(Date.now() / 1000)
  const elapsed = group ? now - group.cycleStart : 0
  const currentPeriod = group && group.status === 'active'
    ? Math.min(Math.floor(elapsed / periodDuration), group.totalPeriods - 1)
    : 0
  const totalPeriods = group?.totalPeriods ?? 0

  // Deposit eligibility
  const canDeposit = group?.status === 'active'
    && isMember
    && memberRecord
    && !memberRecord.periodsDeposited[currentPeriod]

  // Start cycle eligibility (creator only, open status, >= 2 members)
  const canStartCycle = group?.status === 'open'
    && publicKey
    && publicKey.toString() === group?.creator
    && (group?.currentMembers ?? 0) >= 2

  async function handleDeposit() {
    if (!program || !publicKey || !code) return
    const [groupPda] = getGroupConfigPDA(code)
    const [memberPda] = getMemberRecordPDA(groupPda, publicKey)
    const [vaultPda] = getVaultPDA(groupPda)
    const memberAta = getAssociatedTokenAddressSync(usdcMint, publicKey)

    await execute(async () => {
      return await program.methods
        .deposit()
        .accountsPartial({
          member: publicKey,
          groupConfig: groupPda,
          memberRecord: memberPda,
          memberTokenAccount: memberAta,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()
    })
  }

  async function handleStartCycle() {
    if (!program || !publicKey || !code) return
    const [groupPda] = getGroupConfigPDA(code)

    await execute(async () => {
      return await program.methods
        .startCycle()
        .accountsPartial({
          creator: publicKey,
          groupConfig: groupPda,
        })
        .rpc()
    })
  }

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

  if (groupLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="animate-spin mb-4">
            <Icon name="progress_activity" size={48} className="text-primary" />
          </div>
          <p className="font-body text-body-lg text-on-surface-variant">
            {t('common.loading')}
          </p>
        </div>
      </PageLayout>
    )
  }

  if (groupError || !group) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <Icon name="search_off" size={48} className="text-error mb-4" />
          <p className="font-body text-body-lg text-error">
            {t('groupDashboard.groupNotFound')}
          </p>
        </div>
      </PageLayout>
    )
  }

  const statusLabel = STATUS_LABELS[group.status] || STATUS_LABELS.open
  const depositAmountFormatted = `${formatTokenAmount(group.depositAmount)} USDC`

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
                {t(statusLabel)}
              </span>
            </div>
            <div className="flex items-center gap-1 font-label text-label-md text-on-surface-variant">
              <Icon name="tag" size={16} />
              <span>{t('groupDashboard.codeLabel')}: {code}</span>
            </div>
          </div>

          {/* Conditional action buttons */}
          {canDeposit && (
            <Button
              variant="primary"
              icon="payments"
              className="w-full sm:w-auto"
              onClick={handleDeposit}
              loading={txState === 'signing' || txState === 'confirming'}
            >
              {t('groupDashboard.deposit')}
            </Button>
          )}
          {group.status === 'active' && isMember && memberRecord?.periodsDeposited[currentPeriod] && (
            <Button variant="primary" icon="check_circle" className="w-full sm:w-auto" disabled>
              {t('groupDashboard.depositAlready')}
            </Button>
          )}
          {canStartCycle && (
            <Button
              variant="primary"
              icon="play_arrow"
              className="w-full sm:w-auto"
              onClick={handleStartCycle}
              loading={txState === 'signing' || txState === 'confirming'}
            >
              {t('groupDashboard.startCycle')}
            </Button>
          )}
        </div>

        {/* Desktop: 2-column layout. Mobile: single stack */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-8">
          {/* Main content — 3 columns */}
          <div className="lg:col-span-3">
            {/* Cycle Progress Card */}
            <Card variant="featured" className="shadow-nudge mb-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-headline text-title-lg text-on-surface">
                  {t('groupDashboard.cycleProgress', { current: currentPeriod + 1, total: totalPeriods })}
                </span>
                <div className="flex items-center gap-1 font-label text-label-md text-on-surface-variant">
                  <Icon name="group" size={16} />
                  <span>{group.currentMembers} {t('groupDashboard.membersCount')}</span>
                </div>
              </div>

              <ProgressBar current={currentPeriod + 1} total={totalPeriods} label={t('groupDashboard.cycleProgress', { current: currentPeriod + 1, total: totalPeriods })} />

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="font-label text-label-sm text-on-surface-variant block">
                    {t('groupDashboard.weeklyAmount')}
                  </span>
                  <span className="font-body text-title-sm text-on-surface">
                    {depositAmountFormatted}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-label text-label-sm text-on-surface-variant block">
                    {t('groupDashboard.totalDeposited')}
                  </span>
                  <span className="font-headline text-title-lg lg:text-headline-sm text-secondary">
                    {memberRecord ? `${formatTokenAmount(memberRecord.totalDeposited)} USDC` : '—'}
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
                <StatRow label={t('groupDashboard.weeklyAmount')} value={depositAmountFormatted} />
                <StatRow label={t('createGroup.frequency')} value={t(`createGroup.${group.frequency}`)} />
                <StatRow label={t('createGroup.memberLimit')} value={`${group.currentMembers} / ${group.maxMembers}`} />
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
                <StatRow label={t('groupDashboard.weeklyAmount')} value={depositAmountFormatted} />
                <StatRow label={t('createGroup.frequency')} value={t(`createGroup.${group.frequency}`)} />
                <StatRow label={t('createGroup.memberLimit')} value={`${group.currentMembers} / ${group.maxMembers}`} />
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
                    <span className="font-headline text-headline-sm text-on-surface block">
                      {memberRecord ? `${memberRecord.depositsMade}/${totalPeriods}` : '—'}
                    </span>
                    <span className="font-label text-label-sm text-on-surface-variant">{t('groupDashboard.compliance')}</span>
                  </div>
                  <div>
                    <span className="font-headline text-headline-sm text-on-surface block">{group.currentMembers}</span>
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

      {/* Transaction Status Modal */}
      {txState !== 'idle' && (
        <TransactionStatus
          state={txState === 'signing' ? 'signing' : txState === 'confirming' ? 'confirming' : txState === 'success' ? 'success' : 'error'}
          groupCode={code}
          errorDetail={errorDetail || undefined}
          onRetry={canDeposit ? handleDeposit : handleStartCycle}
          onClose={reset}
        />
      )}
    </PageLayout>
  )
}
