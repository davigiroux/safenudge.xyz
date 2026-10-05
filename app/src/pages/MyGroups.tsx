import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, Icon } from '../components'
import { EmptyState } from '../components/EmptyState'
import { TextInput } from '../components/Input'
import { useAnchorProgram } from '../hooks/useAnchorProgram'
import type { GroupStatus } from '../hooks/useGroupConfig'
import { GROUP_CONFIG_CREATOR_OFFSET, MEMBER_RECORD_MEMBER_OFFSET } from '../utils/constants'
import { sanitizeGroupCodeInput } from '../utils/groupCode'

type ListedStatus = GroupStatus | 'unknown'

type GroupInfo = {
  groupCode: string
  status: ListedStatus
  depositsMade: number
  totalPeriods: number
  depositAmount: number
  creatorOnly?: boolean
}

const STATUS_MAP: Record<number, GroupStatus> = {
  0: 'open',
  1: 'active',
  2: 'completed',
  3: 'cancelled',
}

const STATUS_LABELS: Record<ListedStatus, string> = {
  open: 'groupDashboard.statusOpen',
  active: 'groupDashboard.statusActive',
  completed: 'groupDashboard.statusCompleted',
  cancelled: 'groupDashboard.statusCancelled',
  unknown: 'groupDashboard.statusUnknown',
}

const STATUS_COLORS: Record<ListedStatus, string> = {
  open: 'bg-primary-fixed/20 text-primary',
  active: 'bg-secondary text-on-primary',
  completed: 'bg-surface-container-high text-on-surface-variant',
  cancelled: 'bg-error-container text-on-error-container',
  unknown: 'bg-surface-container-high text-on-surface-variant',
}

export default function MyGroups() {
  const { t } = useTranslation()
  const { publicKey } = useWallet()
  const navigate = useNavigate()
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
        const wallet = publicKey!.toBase58()
        const [memberRecords, createdGroups] = await Promise.all([
          program!.account.memberRecord.all([
            { memcmp: { offset: MEMBER_RECORD_MEMBER_OFFSET, bytes: wallet } }
          ]),
          program!.account.groupConfig.all([
            { memcmp: { offset: GROUP_CONFIG_CREATOR_OFFSET, bytes: wallet } }
          ]),
        ])
        const joinedGroups = await program!.account.groupConfig.fetchMultiple(
          memberRecords.map((record) => record.account.group)
        )

        if (cancelled) return

        const groupInfos: GroupInfo[] = []
        const seenCodes = new Set<string>()

        for (const [i, record] of memberRecords.entries()) {
          const groupAccount = joinedGroups[i]
          if (!groupAccount) continue
          groupInfos.push({
            groupCode: groupAccount.groupCode,
            status: STATUS_MAP[groupAccount.status] || 'unknown',
            depositsMade: record.account.depositsMade,
            totalPeriods: groupAccount.totalPeriods,
            depositAmount: groupAccount.depositAmount.toNumber(),
          })
          seenCodes.add(groupAccount.groupCode)
        }

        // Append creator-owned groups the wallet hasn't joined yet
        for (const g of createdGroups) {
          if (seenCodes.has(g.account.groupCode)) continue
          groupInfos.push({
            groupCode: g.account.groupCode,
            status: STATUS_MAP[g.account.status] || 'unknown',
            depositsMade: 0,
            totalPeriods: g.account.totalPeriods,
            depositAmount: g.account.depositAmount.toNumber(),
            creatorOnly: true,
          })
          seenCodes.add(g.account.groupCode)
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
    // Strip out anything outside [a-z0-9-]; the resulting string is, by
    // construction, already valid for the route param so no second
    // regex check is needed.
    const sanitized = sanitizeGroupCodeInput(joinCode)
    if (sanitized) navigate(`/entrar/${sanitized}`)
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
            {groups.map((group) => {
              const href = group.creatorOnly
                ? `/entrar/${group.groupCode}`
                : `/grupo/${group.groupCode}`
              return (
                <Link key={group.groupCode} to={href} className="block">
                  <Card variant="surface" className="hover:shadow-nudge transition-shadow">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-headline text-title-md text-on-surface truncate">
                            {group.groupCode}
                          </span>
                          <span className={`font-label text-label-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[group.status]}`}>
                            {t(STATUS_LABELS[group.status])}
                          </span>
                        </div>
                        {group.creatorOnly ? (
                          <span className="font-label text-label-md text-on-surface-variant">
                            {t('myGroups.creatorNotJoinedHint')}
                          </span>
                        ) : (
                          <span className="font-label text-label-md text-on-surface-variant">
                            {t('myGroups.progress', { current: group.depositsMade, total: group.totalPeriods })}
                          </span>
                        )}
                      </div>
                      {group.creatorOnly ? (
                        <span className="flex-shrink-0 font-label text-label-md text-primary">
                          {t('myGroups.joinNow')}
                        </span>
                      ) : (
                        <Icon name="chevron_right" size={24} className="text-on-surface-variant flex-shrink-0" />
                      )}
                    </div>
                  </Card>
                </Link>
              )
            })}
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
