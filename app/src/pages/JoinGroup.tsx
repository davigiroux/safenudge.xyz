import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, StatRow, Icon, TransactionStatus } from '../components'
import { useAnchorProgram } from '../hooks/useAnchorProgram'
import { useTransaction } from '../hooks/useTransaction'
import { useGroupConfig } from '../hooks/useGroupConfig'
import { useMemberRecord } from '../hooks/useMemberRecord'
import { getGroupConfigPDA, getVaultPDA, getMemberRecordPDA } from '../utils/pda'
import { formatTokenAmount } from '../utils/formatToken'

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'createGroup.weekly',
  biweekly: 'createGroup.biweekly',
  monthly: 'createGroup.monthly',
}

export default function JoinGroup() {
  const { t } = useTranslation()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { publicKey } = useWallet()
  const program = useAnchorProgram()
  const { txState, errorDetail, execute, reset } = useTransaction()

  const isValidCode = code && /^[a-zA-Z0-9-]{1,32}$/.test(code)
  const { data: group, loading: groupLoading, error: groupError } = useGroupConfig(isValidCode ? code : undefined)
  const { isMember } = useMemberRecord(isValidCode ? code : undefined)

  const usdcMint = new PublicKey(import.meta.env.VITE_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

  // Redirect if already a member
  useEffect(() => {
    if (isMember && code) {
      navigate(`/grupo/${code}`, { replace: true })
    }
  }, [isMember, code, navigate])

  async function handleJoin() {
    if (!program || !publicKey || !code || !group) return

    const [groupPda] = getGroupConfigPDA(code)
    const [memberPda] = getMemberRecordPDA(groupPda, publicKey)
    const [vaultPda] = getVaultPDA(groupPda)
    const memberAta = getAssociatedTokenAddressSync(usdcMint, publicKey)

    const sig = await execute(async () => {
      return await program.methods
        .joinGroup()
        .accountsPartial({
          member: publicKey,
          groupConfig: groupPda,
          memberRecord: memberPda,
          memberTokenAccount: memberAta,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    })

    if (sig) {
      setTimeout(() => navigate(`/grupo/${code}`), 1500)
    }
  }

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

  if (groupLoading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
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
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <Icon name="search_off" size={48} className="text-error mb-4" />
          <p className="font-body text-body-lg text-error">
            {t('joinGroup.groupNotFound')}
          </p>
        </div>
      </PageLayout>
    )
  }

  function formatPenalty(): string {
    if (!group) return '—'
    if (group.penaltyType === 1) {
      return t('joinGroup.penaltyPercent', { value: (group.penaltyValue / 100).toFixed(0) })
    }
    return t('joinGroup.penaltyFixed', { value: formatTokenAmount(group.penaltyValue) })
  }

  const spotsLeft = group.maxMembers - group.currentMembers
  const isGroupOpen = group.status === 'open'

  return (
    <PageLayout bgClass="bg-surface-container-low">
      <div className="px-4 py-6 md:px-8 lg:px-32 lg:py-16">
        {/* Desktop: 2-column asymmetric. Mobile: single stack */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-16 lg:items-start max-w-5xl mx-auto">
          {/* Left: invitation context -- 2 columns */}
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

            {/* Members -- shown here on desktop */}
            <div className="hidden lg:block">
              <span className="font-label text-label-md text-on-surface-variant mb-3 block">
                {t('groupDashboard.membersList')}
              </span>
              <div className="flex -space-x-2">
                {Array.from({ length: group.currentMembers }).map((_, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-xl ring-2 ring-surface-container-low"
                  >
                    <Icon name="person" size={20} className="text-on-surface-variant" />
                  </div>
                ))}
                {spotsLeft > 0 && (
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center ring-2 ring-surface-container-low">
                    <span className="font-label text-label-md text-on-surface-variant">
                      +{spotsLeft}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: action card -- 3 columns */}
          <div className="lg:col-span-3">

        {/* Group Details Card */}
        <Card variant="featured" className="shadow-nudge mb-6">
          <div className="flex flex-col gap-0">
            <StatRow
              label={t('joinGroup.weeklyContribution')}
              value={`${formatTokenAmount(group.depositAmount)} USDC`}
            />
            <StatRow
              label={t('createGroup.frequency')}
              value={t(FREQUENCY_LABELS[group.frequency] || group.frequency)}
            />
            <StatRow
              label={t('joinGroup.penalty')}
              value={formatPenalty()}
            />
            <StatRow
              label={t('createGroup.memberLimit')}
              value={t('joinGroup.members', { current: group.currentMembers, max: group.maxMembers })}
            />
          </div>
        </Card>

        {/* Members -- mobile only (desktop shows in left column) */}
        <div className="mb-6 lg:hidden">
          <span className="font-label text-label-md text-on-surface-variant mb-3 block">
            {t('groupDashboard.membersList')}
          </span>
          <div className="flex -space-x-2">
            {Array.from({ length: group.currentMembers }).map((_, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-lg ring-2 ring-surface-container-low"
              >
                <Icon name="person" size={18} className="text-on-surface-variant" />
              </div>
            ))}
            {spotsLeft > 0 && (
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center ring-2 ring-surface-container-low">
                <span className="font-label text-label-sm text-on-surface-variant">
                  +{spotsLeft}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Already member notice */}
        {isMember && (
          <Card variant="surface" className="mb-6">
            <div className="flex items-center gap-3">
              <Icon name="check_circle" size={20} className="text-secondary" />
              <p className="font-body text-body-md text-on-surface-variant">
                {t('joinGroup.alreadyMember')}
              </p>
            </div>
          </Card>
        )}

        {/* CTA */}
        <Button
          variant="primary"
          icon="login"
          className="w-full py-3 mb-3"
          onClick={handleJoin}
          disabled={!publicKey || isMember || !isGroupOpen}
          loading={txState === 'signing' || txState === 'confirming'}
        >
          {publicKey ? t('joinGroup.joinAndDeposit') : t('common.connectWallet')}
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

      {txState !== 'idle' && (
        <TransactionStatus
          state={txState === 'signing' ? 'signing' : txState === 'confirming' ? 'confirming' : txState === 'success' ? 'success' : 'error'}
          groupCode={code}
          errorDetail={errorDetail || undefined}
          onRetry={handleJoin}
          onClose={reset}
        />
      )}
    </PageLayout>
  )
}
