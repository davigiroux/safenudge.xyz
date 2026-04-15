import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN } from '@coral-xyz/anchor'
import { PageLayout } from '../components/PageLayout'
import { Button, Card, StatRow, Icon, TextInput, RadioGroup, TransactionStatus } from '../components'
import { useAnchorProgram } from '../hooks/useAnchorProgram'
import { useTransaction } from '../hooks/useTransaction'
import { getGroupConfigPDA, getVaultPDA } from '../utils/pda'

type Frequency = '0' | '1' | '2'

const FREQUENCY_DAYS: Record<Frequency, number> = { '0': 7, '1': 14, '2': 30 }
const FREQUENCY_LABELS: Record<Frequency, string> = { '0': 'weekly', '1': 'biweekly', '2': 'monthly' }

function estimateEndDate(frequency: Frequency, periods: number): string {
  const now = new Date()
  const days = FREQUENCY_DAYS[frequency] * periods
  const end = new Date(now.getTime() + days * 86400000)
  return end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function estimateMonths(frequency: Frequency, periods: number): number {
  const days = FREQUENCY_DAYS[frequency] * periods
  return Math.round(days / 30)
}

export default function CreateGroup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { publicKey } = useWallet()
  const program = useAnchorProgram()
  const { txState, errorDetail, execute, reset } = useTransaction()

  const usdcMint = new PublicKey(import.meta.env.VITE_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

  const [groupCode, setGroupCode] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('0')
  const [totalPeriods, setTotalPeriods] = useState(12)
  const [maxMembers, setMaxMembers] = useState(5)
  const [penaltyType, setPenaltyType] = useState<'0' | '1'>('1')
  const [penaltyValue, setPenaltyValue] = useState('10')

  const amount = parseFloat(depositAmount) || 0
  const individualGoal = amount * totalPeriods
  const groupTotal = individualGoal * maxMembers

  async function handleSubmit() {
    if (!program || !publicKey || !groupCode || amount <= 0) return

    const depositAmountBN = new BN(Math.round(amount * 1_000_000))
    const penaltyBN = penaltyType === '1'
      ? new BN(Math.round(parseFloat(penaltyValue) * 100))
      : new BN(Math.round(parseFloat(penaltyValue) * 1_000_000))

    const [groupConfigPda] = getGroupConfigPDA(groupCode)
    const [vaultPda] = getVaultPDA(groupConfigPda)

    const sig = await execute(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const methods = program.methods as any
      return await methods
        .createGroup(
          groupCode,
          depositAmountBN,
          parseInt(frequency),
          totalPeriods,
          maxMembers,
          parseInt(penaltyType),
          penaltyBN,
        )
        .accounts({
          creator: publicKey,
          groupConfig: groupConfigPda,
          vault: vaultPda,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc() as string
    })

    if (sig) {
      setTimeout(() => navigate(`/grupo/${groupCode}`), 1500)
    }
  }

  return (
    <PageLayout bgClass="bg-surface-container-low">
      <div className="px-4 py-6 md:px-8 lg:px-32">
        <h1 className="font-headline text-headline-md text-on-surface mb-2">
          {t('createGroup.title')}
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mb-8">
          {t('createGroup.subtitle')}
        </p>

        <div className="lg:grid lg:grid-cols-5 lg:gap-10 flex flex-col gap-8">
          {/* Form — 3 columns */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* Group Code */}
            <TextInput
              label={t('createGroup.groupCode')}
              icon="tag"
              placeholder="viagem-japao-2025"
              hint={t('createGroup.groupCodeHint')}
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32))}
              maxLength={32}
            />

            {/* Deposit Amount */}
            <TextInput
              label={t('createGroup.depositAmount')}
              icon="payments"
              type="number"
              placeholder="0.00"
              suffix={t('createGroup.depositAmountUnit')}
              hint={amount > 0 ? t('createGroup.estimatedBrl', { value: (amount * 5.2).toFixed(2) }) : undefined}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />

            {/* Frequency */}
            <RadioGroup
              label={t('createGroup.frequency')}
              options={[
                { value: '0', label: t('createGroup.weekly'), icon: 'event_repeat' },
                { value: '1', label: t('createGroup.biweekly') },
                { value: '2', label: t('createGroup.monthly') },
              ]}
              value={frequency}
              onChange={(v) => setFrequency(v as Frequency)}
            />

            {/* Duration */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label text-label-md text-on-surface-variant">
                {t('createGroup.duration')}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={52}
                  value={totalPeriods}
                  onChange={(e) => setTotalPeriods(parseInt(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="font-body text-title-sm text-on-surface min-w-[80px] text-right">
                  {t('createGroup.periods', { count: totalPeriods })}
                </span>
              </div>
              <p className="font-body text-body-sm text-on-surface-variant">
                {t('createGroup.endsOn', { date: estimateEndDate(frequency, totalPeriods) })}
              </p>
            </div>

            {/* Member Limit */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label text-label-md text-on-surface-variant">
                {t('createGroup.memberLimit')}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(parseInt(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="font-body text-title-sm text-on-surface min-w-[80px] text-right">
                  {t('createGroup.people', { count: maxMembers })}
                </span>
              </div>
            </div>

            {/* Penalty */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon name="gavel" size={20} className="text-tertiary" />
                <span className="font-label text-label-md text-on-surface-variant">
                  {t('createGroup.penaltyRule')}
                </span>
              </div>

              <RadioGroup
                options={[
                  { value: '1', label: t('createGroup.penaltyPercent'), icon: 'percent' },
                  { value: '0', label: t('createGroup.penaltyFixed'), icon: 'payments' },
                ]}
                value={penaltyType}
                onChange={(v) => setPenaltyType(v as '0' | '1')}
              />

              <TextInput
                type="number"
                placeholder={penaltyType === '1' ? '10' : '2.00'}
                suffix={penaltyType === '1' ? '%' : 'USDC'}
                value={penaltyValue}
                onChange={(e) => setPenaltyValue(e.target.value)}
              />

              <Card variant="surface" className="flex items-start gap-3">
                <Icon name="lightbulb" size={20} className="text-tertiary flex-shrink-0 mt-0.5" />
                <p className="font-body text-body-sm text-on-surface-variant">
                  {t('createGroup.penaltyHint')}
                </p>
              </Card>
            </div>

            {/* Submit */}
            <Button
              variant="primary"
              icon="group_add"
              className="w-full py-3"
              onClick={handleSubmit}
              disabled={!publicKey || !groupCode || amount <= 0}
              loading={txState === 'signing' || txState === 'confirming'}
            >
              {publicKey ? t('createGroup.submit') : t('common.connectWallet')}
            </Button>
            <p className="font-body text-body-sm text-on-surface-variant text-center">
              {t('createGroup.disclaimer')}
            </p>
          </div>

          {/* Preview Panel — 2 columns, sticky on desktop */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="lg:sticky lg:top-24 flex flex-col gap-4">
            <h3 className="font-headline text-title-lg text-on-surface">
              {t('createGroup.preview')}
            </h3>

            {/* Group Preview Card */}
            <Card variant="featured" className="shadow-nudge">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl btn-primary-gradient flex items-center justify-center">
                  <Icon name="shield" size={20} className="text-on-primary" />
                </div>
                <span className="font-headline text-title-lg text-on-surface">
                  {groupCode || '...'}
                </span>
              </div>

              <div className="flex flex-col gap-0">
                <StatRow
                  label={t('createGroup.individualGoal')}
                  value={amount > 0 ? `${individualGoal.toFixed(2)} USDC` : '—'}
                />
                <StatRow
                  label={t('createGroup.groupTotal')}
                  value={amount > 0 ? `${groupTotal.toFixed(2)} USDC` : '—'}
                />
                <StatRow
                  label={t('createGroup.durationLabel')}
                  value={t('createGroup.months', { count: estimateMonths(frequency, totalPeriods) })}
                />
                <StatRow
                  label={t('createGroup.frequency')}
                  value={t(`createGroup.${FREQUENCY_LABELS[frequency]}`)}
                />
              </div>
            </Card>

            {/* Impact Card */}
            {amount > 0 && (
              <Card variant="surface" hover>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="eco" size={20} className="text-secondary" />
                  <span className="font-headline text-title-md text-on-surface">
                    {t('createGroup.impact')}
                  </span>
                </div>
                <p className="font-body text-body-md text-on-surface-variant mb-2">
                  {t('createGroup.estimatedBrl', { value: (individualGoal * 5.2).toFixed(2) })}
                </p>
                <p className="font-body text-body-sm text-secondary">
                  {t('createGroup.estimatedYield', { value: (individualGoal * 5.2 * 0.12 * (estimateMonths(frequency, totalPeriods) / 12)).toFixed(2) })}
                </p>
              </Card>
            )}

            {/* Security Card */}
            <Card variant="surface">
              <div className="flex items-center gap-2">
                <Icon name="lock" size={20} className="text-primary" />
                <span className="font-body text-body-sm text-on-surface-variant">
                  {t('groupDashboard.security')}
                </span>
              </div>
            </Card>
            </div>
          </div>
        </div>
      </div>

      {txState !== 'idle' && (
        <TransactionStatus
          state={txState === 'signing' ? 'signing' : txState === 'confirming' ? 'confirming' : txState === 'success' ? 'success' : 'error'}
          groupCode={groupCode}
          errorDetail={errorDetail || undefined}
          onRetry={handleSubmit}
          onClose={reset}
        />
      )}
    </PageLayout>
  )
}
