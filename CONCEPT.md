# SafeNudge — Concept Document

## The Problem

Brazilians have a deep cultural tradition of informal group savings. Caixinhas (small group funds), vaquinhas (pooled contributions), and consórcios informais (informal buying consortiums) are everywhere. Friends pool money for trips, coworkers save together for year-end celebrations, families collect monthly for a shared goal.

These systems work because of social accountability. You don't skip your deposit because your friends will notice and you'll hear about it.

But they break in predictable ways. Someone holds the money and disappears. The group grows past the point where social pressure works. People miss deposits and there's no enforcement mechanism beyond awkward WhatsApp messages. The person managing the cash has to track everything manually in a spreadsheet or notebook.

The trust problem is the bottleneck. The mechanics are simple. The enforcement is hard.

## The Solution

SafeNudge is a group accountability savings protocol on Solana. It replaces the trust layer of informal savings groups with smart contract enforcement while keeping the social dynamics that make these groups work.

A group creator sets the rules: how much to deposit, how often, for how long, and what happens when someone misses. Members join with an invite code, make their first deposit to commit, and the cycle begins. Deposits are locked until the cycle ends. Missed deposits trigger penalties that get redistributed to members who stayed consistent. At the end of the cycle, everyone gets their savings back, adjusted for penalties earned or owed.

The blockchain handles the rules. The group handles the motivation.

## Target User

The primary user is a Brazilian who has participated in or understands informal savings groups but has no crypto experience. They might be:

- A group of coworkers saving for a year-end trip
- Friends pooling money monthly for a shared goal
- A family running a recurring savings commitment

They don't know what Solana is. They don't have a wallet. They've probably used Pix to split a dinner bill, and that's about as far as their fintech experience goes.

For the hackathon demo, the judges are crypto-native, but the product story targets this non-crypto user. The MVP uses standard wallet connection (Phantom/Backpack), but the architecture is designed for embedded wallets and Pix on-ramp as the real onboarding path.

## How It Works

### Group Lifecycle

**1. Create Group**
The creator sets the parameters:
- Deposit amount (fixed per period, denominated in USDC)
- Deposit frequency (weekly, biweekly, or monthly)
- Number of periods (e.g., 12 weekly deposits = 3-month cycle)
- Max members (2-10)
- Penalty config: fixed amount or percentage of deposit, per missed period
- Group code (used for invite link and PDA derivation)

**2. Join Period**
Members join via a shareable link (e.g., `safenudge.xyz/join/gym-rats-2026`). Each member must make their first deposit to confirm commitment. The group is open for new members until the creator starts the cycle.

**3. Cycle Start**
The creator locks the group. No new members can join. All deposits from this point are locked until the cycle ends. The deposit schedule begins.

**4. Active Cycle**
Each period (week/biweek/month), members deposit the fixed amount. The program tracks who deposited on time and who missed. Deposits go into a shared PDA-owned vault.

**5. Cycle End**
When all periods are complete, anyone can trigger the distribution instruction. The program calculates:
- Each member's total deposits
- Each member's missed periods
- Penalty amounts (missed periods * penalty rate)
- Penalty redistribution (total penalties split equally among fully compliant members)

Every member receives: their deposits - their penalties + their share of collected penalties.

**6. Emergency Cancel**
The group creator can cancel the cycle at any time. All deposits are returned pro-rata with no penalties applied.

### Penalty Mechanics

Penalties are the core behavioral mechanism. They're not punitive for the sake of it. They exist because behavioral economics research (Thaler and Sunstein's Nudge framework) shows that loss aversion is a stronger motivator than potential gain. The threat of losing R$10 motivates more consistently than the promise of earning R$10.

The creator configures penalties at group creation:
- **Type:** Fixed amount (e.g., 2 USDC per miss) or percentage of the deposit (e.g., 5%)
- **Accumulation:** Per missed period. Miss 3 weeks, pay 3x the penalty.
- **Settlement:** Deducted at distribution, not mid-cycle. Members need enough deposited funds to cover their penalties.
- **Redistribution:** Collected penalties are split equally among members with zero misses.

The initial deposit requirement ensures every member has skin in the game before the cycle starts. Even if someone stops depositing entirely, they'll owe penalties against their initial deposit.

### Pix On-Ramp

For the Brazilian target user, getting USDC is the first barrier. SafeNudge integrates Ramp Network's widget, which supports Pix payments and delivers USDC on Solana directly to the user's wallet. The flow:

1. User clicks "Add funds" in the SafeNudge UI
2. Ramp widget opens (overlay or embedded)
3. User pays via Pix (scans QR or copies the code to their banking app)
4. USDC arrives in their connected wallet within minutes
5. User deposits into the savings group

This bridges the gap between "I have BRL in my bank" and "I have USDC in a savings group" without requiring the user to visit a crypto exchange.

## Token Strategy

**MVP:** USDC on Solana. Proven, widely available, deep liquidity, and supported by every on-ramp provider.

**Upgrade path:** Phantom CASH. Phantom's new dollar-pegged stablecoin, built on Bridge's Open Issuance with Stripe, is a natural fit. CASH is Solana-native, backed by Phantom's 15M+ monthly active users, and positions SafeNudge within Phantom's ecosystem. The program architecture is token-agnostic (any SPL token works), so switching to CASH requires only a frontend configuration change once CASH is publicly available.

## Language and Localization

The UI defaults to Portuguese (PT-BR) with an English toggle. All user-facing copy, error messages, and notifications are bilingual. The smart contract and technical documentation are in English.

## What SafeNudge is Not

- **Not a consórcio.** There's no rotating pot or lottery winner each round. Everyone saves their own money and gets it back at the end. The consórcio model is a potential v2 game mode.
- **Not a yield protocol.** The MVP vault holds USDC without deploying it to lending markets. Yield integration is planned for v2.
- **Not a custodial service.** The smart contract holds the funds. No individual or company has access to the vault. The program's PDA is the only authority.
- **Not a bank.** No interest, no loans, no financial products. Just group savings with commitment mechanics.

## Roadmap

### MVP (Colosseum Hackathon — May 2026)
- Anchor program: create group, join, deposit, distribute, emergency cancel
- React frontend with wallet-adapter (Phantom/Backpack)
- Ramp Network widget for Pix-to-USDC on-ramp
- PT-BR/EN bilingual UI
- Devnet deployment

### v2 — Yield Integration
- Route pooled USDC to Kamino K-Lend during active cycles
- Yield earned is redistributed as a bonus to compliant members
- Members who miss deposits lose their yield share (on top of penalties)
- This creates a positive incentive (earn more by being consistent) on top of the negative incentive (lose money by missing deposits)

### v3 — Mainstream Onboarding
- Embedded wallets (Privy, Dynamic, or Phantom Embedded) — no seed phrases, no browser extensions
- Full Pix on-ramp + off-ramp (BRL in, BRL out)
- CASH token integration
- WhatsApp notifications for deposit reminders and group updates
- The user never knows they're using Solana

### v4 — Game Modes
- Consórcio mode: rotating pot with bidding or lottery
- Challenge mode: goal-based savings with milestone rewards
- Streak bonuses: consecutive on-time deposits earn multipliers on penalty redistribution

## Why This Wins

The product that wins in crypto consumer apps isn't the one with the most sophisticated smart contract. It's the one where a user in Campo Grande can join a savings group from a link shared in a WhatsApp group and never think about blockchain.

SafeNudge's edge is that the underlying behavior already exists. Millions of Brazilians already save in groups. The protocol doesn't create new behavior. It removes the trust bottleneck from behavior that's already happening, using technology the user never needs to see.

---

*SafeNudge — Colosseum Spring 2026 Hackathon*
*Davi Giroux — April 2026*
