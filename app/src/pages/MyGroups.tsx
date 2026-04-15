import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, Icon } from '../components'
import { EmptyState } from '../components/EmptyState'
import { TextInput } from '../components/Input'
import { useAnchorProgram } from '../hooks/useAnchorProgram'

type GroupInfo = {
  groupCode: string
  status: string
  depositsMade: number
  totalPeriods: number
  depositAmount: number
}

const STATUS_MAP: Record<number, string> = {
  0: 'open',
  1: 'active',
  2: 'completed',
  3: 'cancelled',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'groupDashboard.statusOpen',
  active: 'groupDashboard.statusActive',
  completed: 'groupDashboard.statusCompleted',
  cancelled: 'groupDashboard.statusCancelled',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-primary-fixed/20 text-primary',
  active: 'bg-secondary text-on-primary',
  completed: 'bg-surface-container-high text-on-surface-variant',
  cancelled: 'bg-error-container text-on-error-container',
}

export default function MyGroups() {
  const { t } = useTranslation()
  const { publicKey } = useWallet()
  const program = useAnchorProgram()
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!program || !publicKey) {
      setGroups([])
      return
    }

    let cancelled = false

    async function fetchGroups() {
      setLoading(true)
      try {
        // Fetch all member records where member == connected wallet
        // MemberRecord layout: discriminator(8) + group(32) + member(32)
        // member field starts at offset 40
        const memberRecords = await program!.account.memberRecord.all([
          { memcmp: { offset: 40, bytes: publicKey!.toBase58() } }
        ])

        if (cancelled) return

        const groupInfos: GroupInfo[] = []
        for (const record of memberRecords) {
          try {
            const groupAccount = await program!.account.groupConfig.fetch(record.account.group)
            groupInfos.push({
              groupCode: groupAccount.groupCode,
              status: STATUS_MAP[groupAccount.status] || 'unknown',
              depositsMade: record.account.depositsMade,
              totalPeriods: groupAccount.totalPeriods,
              depositAmount: groupAccount.depositAmount.toNumber(),
            })
          } catch {
            // Skip groups that can't be fetched
          }
        }

        if (!cancelled) setGroups(groupInfos)
      } catch {
        if (!cancelled) setGroups([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchGroups()
    return () => { cancelled = true }
  }, [program, publicKey])

  const handleJoin = () => {
    const sanitized = joinCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (sanitized && /^[a-zA-Z0-9-]{1,32}$/.test(sanitized)) {
      window.location.href = `/entrar/${sanitized}`
    }
  }

  const showEmpty = !loading && groups.length === 0

  return (
    <PageLayout bgClass="bg-surface-container-low">
      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="animate-spin mb-4">
            <Icon name="progress_activity" size={48} className="text-primary" />
          </div>
          <p className="font-body text-body-lg text-on-surface-variant">
            {t('common.loading')}
          </p>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <EmptyState
          icon="group_off"
          title={t('emptyState.noGroups')}
          description={t('emptyState.noGroupsHint')}
        >
          <Button variant="primary" icon="add" to="/criar">
            {t('emptyState.createGroup')}
          </Button>
          <Button
            variant="tertiary"
            icon="link"
            onClick={() => setShowJoinInput(!showJoinInput)}
          >
            {t('emptyState.requestCode')}
          </Button>
        </EmptyState>
      )}

      {/* Group cards */}
      {!loading && groups.length > 0 && (
        <div className="px-4 py-6 md:px-8 lg:px-32 lg:py-8 max-w-3xl mx-auto">
          <h1 className="font-headline text-headline-sm lg:text-headline-md text-on-surface mb-6">
            {t('myGroups.title')}
          </h1>
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <Link key={group.groupCode} to={`/grupo/${group.groupCode}`} className="block">
                <Card variant="surface" className="hover:shadow-nudge transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-headline text-title-md text-on-surface truncate">
                          {group.groupCode}
                        </span>
                        <span className={`font-label text-label-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[group.status] || STATUS_COLORS.open}`}>
                          {t(STATUS_LABELS[group.status] || STATUS_LABELS.open)}
                        </span>
                      </div>
                      <span className="font-label text-label-md text-on-surface-variant">
                        {t('myGroups.progress', { current: group.depositsMade, total: group.totalPeriods })}
                      </span>
                    </div>
                    <Icon name="chevron_right" size={24} className="text-on-surface-variant flex-shrink-0" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Actions below group list */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Button variant="primary" icon="add" to="/criar" className="flex-1">
              {t('emptyState.createGroup')}
            </Button>
            <Button
              variant="tertiary"
              icon="link"
              onClick={() => setShowJoinInput(!showJoinInput)}
              className="flex-1"
            >
              {t('emptyState.requestCode')}
            </Button>
          </div>
        </div>
      )}

      {showJoinInput && (
        <div className="max-w-sm mx-auto px-4 -mt-8 mb-8">
          <div className="flex gap-2">
            <TextInput
              placeholder="viagem-japao-2025"
              icon="tag"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="flex-shrink-0 min-h-[44px] px-4 rounded-xl btn-primary-gradient text-on-primary disabled:opacity-50 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon name="arrow_forward" size={20} />
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
