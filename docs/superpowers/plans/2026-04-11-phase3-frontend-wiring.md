# Phase 3: Frontend Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire existing React frontend to on-chain Anchor program — replace mock data with real fetches, implement all transaction flows (create, join, deposit, start cycle), add font preloading and error boundary.

**Architecture:** Pages already exist with mock data. Hooks (`useGroupConfig`, `useMemberRecord`, `useAnchorProgram`) already exist. TransactionStatus modal already exists. The work is connecting these pieces: pages call hooks for data, buttons trigger program instructions via Anchor client, TransactionStatus shows tx lifecycle.

**Tech Stack:** React 18, Vite, @coral-xyz/anchor, @solana/wallet-adapter-react, i18next, Tailwind CSS

---

## File Structure

All files already exist. This plan modifies them.

```
app/src/
├── hooks/
│   ├── useAnchorProgram.ts     # existing — no changes
│   ├── useGroupConfig.ts       # existing — no changes
│   ├── useMemberRecord.ts      # existing — no changes
│   └── useTransaction.ts       # NEW — shared tx state machine hook
├── pages/
│   ├── CreateGroup.tsx          # MODIFY — wire form submit to create_group ix
│   ├── JoinGroup.tsx            # MODIFY — wire join button to join_group ix
│   ├── GroupDashboard.tsx       # MODIFY — replace mocks with hooks, wire deposit/start
│   └── MyGroups.tsx             # MODIFY — fetch user's groups from on-chain
├── components/
│   └── ErrorBoundary.tsx        # NEW — React error boundary wrapper
├── App.tsx                      # MODIFY — wrap with ErrorBoundary
└── index.html                   # MODIFY — add font preload links (in app/)
```

---

### Task 1: useTransaction Hook + Font Preloading + Error Boundary

**Files:**
- Create: `app/src/hooks/useTransaction.ts`, `app/src/components/ErrorBoundary.tsx`
- Modify: `app/index.html`, `app/src/App.tsx`, `app/src/hooks/index.ts`, `app/src/components/index.ts`

- [ ] **Step 1: Create useTransaction.ts**

Shared hook that manages the transaction lifecycle (idle → signing → confirming → success/error). All pages will use this instead of duplicating tx state logic.

```typescript
// app/src/hooks/useTransaction.ts
import { useState, useCallback } from 'react'

export type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

type UseTransactionReturn = {
  txState: TxState
  errorDetail: string | null
  execute: (fn: () => Promise<string>) => Promise<string | null>
  reset: () => void
}

export function useTransaction(): UseTransactionReturn {
  const [txState, setTxState] = useState<TxState>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const reset = useCallback(() => {
    setTxState('idle')
    setErrorDetail(null)
  }, [])

  const execute = useCallback(async (fn: () => Promise<string>): Promise<string | null> => {
    setTxState('signing')
    setErrorDetail(null)
    try {
      setTxState('confirming')
      const sig = await fn()
      setTxState('success')
      return sig
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setErrorDetail(message)
      setTxState('error')
      return null
    }
  }, [])

  return { txState, errorDetail, execute, reset }
}
```

- [ ] **Step 2: Create ErrorBoundary.tsx**

```typescript
// app/src/components/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="font-headline text-headline-sm text-on-surface mb-2">
              Algo deu errado
            </h1>
            <p className="font-body text-body-md text-on-surface-variant mb-6">
              {this.state.error?.message || 'Erro inesperado'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl btn-primary-gradient text-on-primary font-label text-label-lg"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 3: Add font preload links to index.html**

In `app/index.html`, add inside `<head>` before the existing `<link>` tags:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

- [ ] **Step 4: Update App.tsx with ErrorBoundary**

Wrap the entire app:

```typescript
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <BrowserRouter>
          <Routes>...</Routes>
        </BrowserRouter>
      </WalletProvider>
    </ErrorBoundary>
  )
}
```

- [ ] **Step 5: Export new modules**

Add to `app/src/hooks/index.ts`:
```typescript
export { useTransaction } from './useTransaction'
export type { TxState } from './useTransaction'
```

Add to `app/src/components/index.ts`:
```typescript
export { ErrorBoundary } from './ErrorBoundary'
```

- [ ] **Step 6: Verify build**

```bash
cd app && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add app/src/hooks/useTransaction.ts app/src/components/ErrorBoundary.tsx app/src/App.tsx app/index.html app/src/hooks/index.ts app/src/components/index.ts
git commit -m "feat(frontend): add useTransaction hook, ErrorBoundary, font preloads"
```

---

### Task 2: Wire CreateGroup Page

**Files:**
- Modify: `app/src/pages/CreateGroup.tsx`

The CreateGroup page already has the form UI with state variables. Wire the submit button to call the `create_group` instruction.

- [ ] **Step 1: Add imports and hooks**

At the top of CreateGroup.tsx, add:

```typescript
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN } from '@coral-xyz/anchor'
import { useAnchorProgram } from '../hooks/useAnchorProgram'
import { useTransaction } from '../hooks/useTransaction'
import { TransactionStatus } from '../components'
import { getGroupConfigPDA, getVaultPDA } from '../utils/pda'
```

- [ ] **Step 2: Add transaction logic inside the component**

After the existing state variables, add:

```typescript
const navigate = useNavigate()
const { publicKey } = useWallet()
const program = useAnchorProgram()
const { txState, errorDetail, execute, reset } = useTransaction()

// USDC mint from env
const usdcMint = new PublicKey(import.meta.env.VITE_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

async function handleSubmit() {
  if (!program || !publicKey || !groupCode || amount <= 0) return

  const depositAmountBN = new BN(Math.round(amount * 1_000_000)) // USDC has 6 decimals
  const penaltyBN = penaltyType === '1'
    ? new BN(Math.round(parseFloat(penaltyValue) * 100)) // basis points
    : new BN(Math.round(parseFloat(penaltyValue) * 1_000_000)) // fixed USDC

  const [groupConfigPda] = getGroupConfigPDA(groupCode)
  const [vaultPda] = getVaultPDA(groupConfigPda)

  const sig = await execute(async () => {
    return await program.methods
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
      .rpc()
  })

  if (sig) {
    // Navigate to the new group after brief delay
    setTimeout(() => navigate(`/grupo/${groupCode}`), 1500)
  }
}
```

- [ ] **Step 3: Wire submit button**

Replace the existing submit Button with:

```typescript
<Button
  variant="primary"
  icon="group_add"
  className="w-full py-3"
  onClick={handleSubmit}
  disabled={!publicKey || !groupCode || amount <= 0}
>
  {!publicKey ? t('common.connectWallet') : t('createGroup.submit')}
</Button>
```

- [ ] **Step 4: Add TransactionStatus modal**

At the end of the component, before the closing `</PageLayout>`:

```typescript
{txState !== 'idle' && (
  <TransactionStatus
    state={txState === 'signing' ? 'signing' : txState === 'confirming' ? 'confirming' : txState === 'success' ? 'success' : 'error'}
    groupCode={groupCode}
    errorDetail={errorDetail || undefined}
    onRetry={handleSubmit}
    onClose={reset}
  />
)}
```

- [ ] **Step 5: Build and verify**

```bash
cd app && npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add app/src/pages/CreateGroup.tsx
git commit -m "feat(frontend): wire CreateGroup form to create_group instruction"
```

---

### Task 3: Wire JoinGroup Page

**Files:**
- Modify: `app/src/pages/JoinGroup.tsx`

- [ ] **Step 1: Replace mock data with real hook data**

Read `JoinGroup.tsx` first. Replace mock group data with `useGroupConfig(code)` hook. Show loading/error states. Wire the join button to call `join_group` instruction.

The join flow:
1. Fetch group config via `useGroupConfig(code)`
2. Show group details (deposit amount, frequency, members, penalty)
3. On "Join & Deposit" click → call `program.methods.joinGroup()` with member's token account
4. Need to find or create the member's USDC ATA before joining

Key accounts for join_group:
- `member`: wallet publicKey (signer)
- `groupConfig`: PDA from group code
- `memberRecord`: PDA from [group_config_key, member_key]
- `memberTokenAccount`: member's USDC ATA
- `vault`: PDA from group_config_key
- `mint`: USDC mint

For the member's ATA, use `getAssociatedTokenAddressSync(usdcMint, publicKey)` from `@solana/spl-token`.

- [ ] **Step 2: Add TransactionStatus modal**

Same pattern as CreateGroup — show tx lifecycle, navigate to group dashboard on success.

- [ ] **Step 3: Build and verify**

```bash
cd app && npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/JoinGroup.tsx
git commit -m "feat(frontend): wire JoinGroup page to join_group instruction"
```

---

### Task 4: Wire GroupDashboard Page

**Files:**
- Modify: `app/src/pages/GroupDashboard.tsx`

This is the most complex page — it needs to:
1. Fetch group config (status, cycle progress, members)
2. Fetch current user's member record
3. Show deposit button (only when cycle active and current period not deposited)
4. Show start cycle button (only for creator when status is Open and members >= 2)
5. Wire deposit button to `deposit` instruction
6. Wire start cycle button to `start_cycle` instruction

- [ ] **Step 1: Replace mocks with hooks**

Replace `MOCK_MEMBERS` and hardcoded values with:
```typescript
const { data: group, loading: groupLoading, error: groupError } = useGroupConfig(code)
const { data: memberRecord, isMember } = useMemberRecord(code)
```

For the member list, the page currently shows mock members. Since fetching ALL member records requires iterating PDAs (which is expensive), keep the mock member list for now and add a TODO comment. The important wiring is the current user's data.

Show loading skeleton while `groupLoading` is true. Show error state if `groupError`.

When `group` data is available:
- Display real deposit amount, frequency, period progress from `group`
- Calculate current period from `group.cycleStart` and `group.frequency`
- Show deposit button only when: status is active, member has not deposited for current period
- Show start cycle button only when: status is open, wallet is creator, members >= 2

- [ ] **Step 2: Wire deposit button**

```typescript
async function handleDeposit() {
  if (!program || !publicKey || !group) return
  const [groupPda] = getGroupConfigPDA(code!)
  const [memberPda] = getMemberRecordPDA(groupPda, publicKey)
  const [vaultPda] = getVaultPDA(groupPda)
  const memberAta = getAssociatedTokenAddressSync(usdcMint, publicKey)

  await execute(async () => {
    return await program.methods
      .deposit()
      .accounts({
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
```

- [ ] **Step 3: Wire start cycle button**

```typescript
async function handleStartCycle() {
  if (!program || !publicKey || !group) return
  const [groupPda] = getGroupConfigPDA(code!)

  await execute(async () => {
    return await program.methods
      .startCycle()
      .accounts({
        creator: publicKey,
        groupConfig: groupPda,
      })
      .rpc()
  })
}
```

- [ ] **Step 4: Add conditional UI**

Show start cycle button when `group.status === 'open'` and `group.creator === publicKey.toString()` and `group.currentMembers >= 2`.

Show deposit button when `group.status === 'active'` and user hasn't deposited for current period.

- [ ] **Step 5: Add TransactionStatus modal**

Same pattern.

- [ ] **Step 6: Build and verify**

```bash
cd app && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add app/src/pages/GroupDashboard.tsx
git commit -m "feat(frontend): wire GroupDashboard with real data + deposit/start actions"
```

---

### Task 5: Wire MyGroups Page

**Files:**
- Modify: `app/src/pages/MyGroups.tsx`

- [ ] **Step 1: Fetch user's member records**

Read `MyGroups.tsx` first. The page needs to find all groups the connected wallet is a member of.

Since Anchor doesn't have a built-in "fetch all accounts where member == X" query, use `program.account.memberRecord.all()` with a filter:

```typescript
const memberRecords = await program.account.memberRecord.all([
  { memcmp: { offset: 40, bytes: publicKey.toBase58() } }
])
```

The `offset: 40` is: 8 (discriminator) + 32 (group pubkey) = 40, which is where the `member` pubkey field starts.

For each member record found, fetch the corresponding GroupConfig to get group details.

- [ ] **Step 2: Display groups**

Map each group to a card with:
- Group code, status badge
- Deposit progress (deposits_made / total_periods)
- Link to `/grupo/:code`

If no groups found, show the existing EmptyState with join input.

- [ ] **Step 3: Build and verify**

```bash
cd app && npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/MyGroups.tsx
git commit -m "feat(frontend): wire MyGroups with on-chain member record lookup"
```

---

## Implementation Notes

### USDC Mint Address

All pages reference `VITE_USDC_MINT` env var. For devnet testing, create a test USDC mint and set it in `app/.env`:
```
VITE_USDC_MINT=<devnet_test_mint>
VITE_PROGRAM_ID=88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Token Amount Conversion

USDC has 6 decimals. User types `10.00` → program receives `10_000_000`. Use `Math.round(amount * 1_000_000)` for encoding and the existing `formatToken` util for display.

### ATA Creation

If the member's ATA doesn't exist when joining a group, the transaction will fail. The Ramp integration (future) handles funding. For now, members need an existing USDC token account. Consider adding `createAssociatedTokenAccountIdempotent` as a pre-instruction.

### Period Calculation (Frontend)

To determine if the current user has deposited for the current period:
```typescript
const periodDuration = { weekly: 7*86400, biweekly: 14*86400, monthly: 30*86400 }
const elapsed = Math.floor(Date.now()/1000) - group.cycleStart
const currentPeriod = Math.min(Math.floor(elapsed / periodDuration[group.frequency]), group.totalPeriods - 1)
const hasDeposited = memberRecord.periodsDeposited[currentPeriod]
```

### Existing Components Available

- `TransactionStatus` — modal for tx lifecycle (signing → confirming → success/error)
- `NudgeToast` — glassmorphic toast for nudge messages
- `EmptyState` — centered empty state with icon and CTA
- `Card`, `StatRow`, `Button`, `Icon` — all themed with Bossa design system
