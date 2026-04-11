import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageLayout } from '../components/PageLayout'
import { Button, Icon } from '../components'
import { EmptyState } from '../components/EmptyState'
import { TextInput } from '../components/Input'

export default function MyGroups() {
  const { t } = useTranslation()
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  // TODO: fetch groups from on-chain data
  const groups: unknown[] = []

  const handleJoin = () => {
    const sanitized = joinCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (sanitized && /^[a-zA-Z0-9-]{1,32}$/.test(sanitized)) {
      window.location.href = `/entrar/${sanitized}`
    }
  }

  return (
    <PageLayout bgClass="bg-surface-container-low">
      {groups.length === 0 ? (
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
      ) : null}

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
