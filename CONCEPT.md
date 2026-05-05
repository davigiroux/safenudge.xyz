# SafeNudge — Concept Document

## The Problem

Brazil has a savings crisis disguised as a culture of resourcefulness.

In a country where inflation has historically eaten savings, where the government literally confiscated bank accounts in 1990 (Plano Collor), and where 32 million people still use poupança (savings accounts that often lose to inflation) as the only investment, Brazilians have learned to save through social commitment rather than financial products.

This shows up in three cultural patterns:

**MOAI (poupança coletiva):** Borrowed from Japanese culture and widely practiced in Brazil, a MOAI is a group of people who commit to contributing a fixed amount monthly. Each month, the total pool goes to one member. The cycle continues until everyone has received. It's unregulated, trust-based, and solves a real problem: people who can't discipline themselves to save alone use the group commitment as a forcing function. The MOAI works not because the economics are optimal (they're not, the early receivers get an interest-free loan while later ones effectively lose to inflation), but because the social pressure makes people actually follow through.

**Caixinhas and vaquinhas:** Informal group funds for shared goals. Friends pool for trips, coworkers collect for year-end parties, families save together. Same trust-based mechanics, same enforcement problem.

**Consórcios:** The formalized version. Regulated by the Central Bank, managed by administrator companies charging 15-20% fees. In 2024, the system hit 11.2 million active participants and R$378 billion in credits contracted. Consórcios prove the demand is massive, but they're expensive, rigid, and bureaucratic.

All three patterns reveal the same insight: **Brazilians don't have a savings problem. They have an enforcement problem.** People know they should save. They want to save. But without social accountability and commitment mechanics, individual discipline fails. MOAIs, caixinhas, and consórcios exist because groups solve what willpower alone cannot.

But these systems break in predictable ways. Someone holds the money and disappears. The group grows past the point where social pressure works. People miss deposits and there's no enforcement mechanism beyond awkward WhatsApp messages. The MOAI organizer tracks everything in a spreadsheet. The consórcio administrator charges R$15K+ in fees on a R$80K car.

The trust problem is the bottleneck. The mechanics are simple. The enforcement is hard. And the fees for outsourcing that enforcement to a regulated administrator are absurd.

## The Solution

SafeNudge is a group accountability savings protocol on Solana. It replaces the trust layer of MOAIs and informal savings groups with smart contract enforcement while keeping the social dynamics that make these groups work.

Think of it as a **digital MOAI with better rules**: no administrator fees, no trust required, penalties for missed commitments that reward consistent savers, and yield on pooled funds that a WhatsApp group coordinator could never offer.

A group creator sets the rules: how much to deposit, how often, for how long, and what happens when someone misses. Members join with an invite code, make their first deposit to commit, and the cycle begins. Deposits are locked until the cycle ends. Missed deposits trigger penalties that get redistributed to members who stayed consistent. At the end of the cycle, everyone gets their savings back, adjusted for penalties earned or owed.

The blockchain handles the rules. The group handles the motivation.

**Why this is better than a traditional MOAI:**
- No trust required (code enforces the rules, not a person)
- No administrator fees (vs. 15-20% in formal consórcios)
- Penalties create positive incentives (consistent savers earn more, not just their money back)
- Yield on idle funds (USDC lending during cycles, something no WhatsApp-coordinated group can do)
- Transparent tracking (every deposit, every miss, every penalty visible on-chain)
- Portable (join from a link, not limited to people you know in person)

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

## Market Size

### The Consórcio Market is Massive and Growing

Brazil's formal consórcio system (regulated group buying pools) is not a niche product. According to ABAC (the industry association), in 2024 the system hit all-time records: 11.2 million active participants, 4.49 million new memberships sold, and R$378.7 billion in credits contracted (roughly $73B USD). Credits actually disbursed to members reached R$100.6 billion ($19.4B USD), growing 19.8% year-over-year.

That's just the regulated system. Informal caixinhas, vaquinhas, and friend-group savings pools are by definition unmeasured, but they are culturally ubiquitous. Every Brazilian knows someone who participates in one.

### TAM / SAM / SOM

**TAM (Total Addressable Market):** The global group savings and ROSCA (Rotating Savings and Credit Association) market spans Brazil, Sub-Saharan Africa, South and Southeast Asia, and diaspora communities worldwide. Estimates vary, but ROSCAs collectively handle hundreds of billions of dollars annually across these regions. Brazil alone has 11M+ formal consórcio participants, plus an uncounted informal market.

**SAM (Serviceable Addressable Market):** Brazilian informal savings groups among digitally active users. Brazil has 150M+ Pix users, 100M+ smartphone users under 40, and a cultural familiarity with group savings. Conservative estimate: 5-10M Brazilians participate in informal savings groups annually. At an average group size of 5 and an average commitment of R$200/month for 6 months, that's R$6-12B flowing through informal groups annually ($1.2-2.4B USD).

**SOM (Serviceable Obtainable Market):** Year 1 target: 10,000 active users across 2,000 groups. At an average of R$200/month per member for 6 months, that's R$12M in TVL flowing through the protocol annually.

### Web2 Equivalent

**"SafeNudge is the digital MOAI — group savings with smart contract enforcement, a single 5% protocol fee on penalties, and yield on idle deposits (planned)."**

For judges who need a quick anchor: "Think of SafeNudge as StickK meets Nubank, on Solana." StickK (commitment contracts with financial stakes) provides the behavioral mechanic. Nubank (accessible fintech for underbanked populations) provides the distribution model. Solana provides the trustless enforcement layer.

The web2 equivalents are savings challenge apps (Goalz, SaverLife, Qapital) and accountability apps (StickK, Beeminder, GymRats). None of them combine group accountability with financial commitment mechanics and on-chain enforcement. The closest web3 comp is PoolTogether (no-loss prize savings on Ethereum), but PoolTogether is individual, not group-based, and the behavioral mechanic is reward-driven (lottery) rather than loss-aversion-driven (penalties).

SafeNudge's moat is the combination: group social pressure + financial penalties + blockchain enforcement + Brazilian cultural fit (MOAI/caixinha behavior already exists). No pure web2 app can offer trustless enforcement. No existing web3 protocol targets the MOAI use case. And the formal consórcio system charges 15-20% for what SafeNudge does at near-zero cost.

## Revenue Model

Three revenue streams, layered over time:

### Stream 0: Protocol Fee on Penalties (v1, ships first)

A flat 5% protocol fee on the penalty pool, charged at `distribute` time. Routed to a PDA-controlled treasury USDC token account; withdrawn only by a hardcoded `FEE_RECIPIENT` (founder wallet now, Squads multisig before mainnet TVL becomes meaningful — tracked separately).

Charged only when at least one member is compliant (the H1 pro-rata refund branch sets the fee to zero). Capped implicitly at `total_penalties × 500 / 10_000`. The remaining 95% of the penalty pool becomes the bonus for compliant members, exactly as before — the fee is skimmed off the redistribution, never off the principal of compliant members' deposits.

**Unit economics at scale:**
- 100,000 active users, $40 average deposit, 6-month cycles, conservative 8% per-member miss rate, 50% of cycles have at least one penalty
- Penalty pool per cycle ≈ 0.5% of TVL ($60K on $12M TVL)
- Annual penalty volume ≈ $720K (12 cycles × $60K)
- 5% protocol fee ≈ $36K ARR

This stream is small in absolute terms but operationally important: it lets the protocol cover its own costs without yield infrastructure, and demonstrates a working revenue pipe from day one.

### Stream 1: Protocol Fee on Yield (v2, primary revenue)

When the yield integration launches (Kamino K-Lend or similar), pooled USDC earns lending yield during active cycles. SafeNudge takes a 10-15% performance fee on yield generated. The user's principal is never touched. This is the same model as Lido (10% of staking rewards), Yearn (20% performance fee), and most DeFi yield aggregators.

**Why this works:** Users don't perceive a cost because they never had the yield before. The protocol earns by making their idle savings productive. This is the cleanest revenue model for a savings protocol.

**Unit economics at scale:**
- 100,000 active users, average deposit R$200/month ($40 USD), 6-month cycles
- Average TVL: $12M (half of total flow, accounting for cycle timing)
- USDC lending yield: 5-8% APY (conservative Kamino K-Lend range)
- Annual yield on TVL: $600K-$960K
- SafeNudge 15% performance fee: $90K-$144K ARR

This alone doesn't hit $1M ARR. But yield revenue scales directly with TVL, and TVL compounds as groups re-form for new cycles.

### Stream 2: Premium Group Features (v2-v3, subscription)

Free tier: basic group savings with penalties and on-chain enforcement.
Premium tier ($2-5/month per group creator): yield integration, WhatsApp notifications, analytics dashboard (savings streaks, group leaderboards), custom penalty structures, larger group sizes (20+), multiple concurrent groups.

**Unit economics:**
- 2,000 premium group creators at $3/month average = $72K ARR
- 10,000 premium creators at $3/month = $360K ARR

### Stream 3: B2B / White-Label (v3-v4)

Brazilian fintechs (Nubank, Inter, PagBank, Mercado Pago) and neobanks could integrate SafeNudge as a feature. Group savings is a proven engagement driver, but none of these platforms offer it today. SafeNudge licenses the protocol as infrastructure.

**Model:** Revenue share on deposits flowing through the white-label integration, or a flat SaaS fee per institution.

**Why this is credible:** The formal consórcio market (R$378B in credits) is dominated by banks and administrators that charge 15-20% administration fees. SafeNudge's on-chain enforcement eliminates the administrator, reducing the cost to near-zero while offering a better user experience. Any fintech that integrates this immediately differentiates against traditional consórcio administrators.

### Path to $1M ARR

The realistic path combines yield fees + premium subscriptions at scale:

| Milestone | Users | TVL | Penalty Fee | Yield Fee | Premium | Total ARR |
|-----------|-------|-----|-------------|-----------|---------|-----------|
| Month 6 | 5,000 | $1M | $3K | $7.5K | $18K | ~$28K |
| Month 12 | 25,000 | $5M | $15K | $37.5K | $90K | ~$143K |
| Month 18 | 100,000 | $20M | $60K | $150K | $360K | ~$570K |
| Month 24 | 250,000 | $50M | $150K | $375K | $900K | ~$1.425M |

$1M ARR is reachable around 200K active users and $40M TVL with all three streams active. For context, Nubank has 100M+ customers in Brazil. Capturing 0.2% of digitally active Brazilians who already save in groups is conservative if the product works.

## Go-to-Market

### Phase 1: Crypto-Native Launch (Months 1-3)

**Who:** Solana community members, crypto-native Brazilians, hackathon network.
**How:** Build in public on X, Superteam Brasil community, Colosseum network. First groups are friends-and-family: savings challenges among existing crypto users who understand wallets.
**Goal:** 100 active users, 20 groups. Validate the core loop (do groups actually complete cycles?).

### Phase 2: Brazilian Crypto Community (Months 3-6)

**Who:** Brazilian crypto Twitter, Discord communities, Mercado Bitcoin users, Binance BR users.
**How:** Portuguese content, Pix on-ramp live, partnerships with Brazilian crypto influencers. Target the intersection: people who understand crypto AND participate in informal savings groups.
**Goal:** 2,000 active users, 400 groups. Prove retention (do groups re-form for second cycles?).

### Phase 3: Non-Crypto Brazilians (Months 6-12)

**Who:** The actual target market. People who use Pix daily, save in WhatsApp groups, and have never used a crypto app.
**How:** Embedded wallets (no seed phrases), full Pix on/off-ramp, WhatsApp integration for group invites and deposit reminders. The onboarding flow looks like signing up for Nubank, not connecting Phantom.
**Goal:** 25,000 active users. This is where the unit economics start to work.

### Distribution Moat

SafeNudge has a built-in viral loop that most crypto protocols lack: every group member invites 2-9 other people. If a group of 5 completes a cycle and 3 of those members start new groups, the network grows organically. The invite code mechanic is the distribution mechanism. WhatsApp sharing is the growth channel. No paid acquisition needed for initial traction.

## Why This Wins

The product that wins in crypto consumer apps isn't the one with the most sophisticated smart contract. It's the one where a user in Campo Grande can join a savings group from a link shared in a WhatsApp group and never think about blockchain.

SafeNudge's edge is that the underlying behavior already exists. Millions of Brazilians already save in groups. The protocol doesn't create new behavior. It removes the trust bottleneck from behavior that's already happening, using technology the user never needs to see.

The business case is grounded in real numbers: Brazil's formal consórcio system alone handles R$378B annually with 11M+ participants. SafeNudge doesn't need to create demand. It needs to give existing demand a better tool.

---

*SafeNudge — Colosseum Spring 2026 Hackathon*
*Davi Giroux — April 2026*
