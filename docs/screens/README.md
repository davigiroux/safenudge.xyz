# Stitch Screen Reference

**Project:** `projects/10039124106189115021`

## Screens

| # | Title | Screen ID | Dimensions | Route |
|---|-------|-----------|------------|-------|
| 1 | Landing Page | `dd5eb67b74484a3095851c4e61b9994b` | 2560x5898 | `/` |
| 2 | Criar Grupo | `5febfa1f2ce84e689b5a5985d4d95db1` | 2560x2594 | `/criar` |
| 3 | Participar do Grupo | `19ab14062abe48e687a1a20404438032` | 2560x2156 | `/entrar/:code` |
| 4 | Painel do Grupo | `8f7937759c4d4b27b7d23431c7e7a803` | 2560x2048 | `/grupo/:code` |
| 5 | Estados de Transacao | `4d21000a82f0455a9e0e66aab0d99d26` | 2560x2048 | (overlay/modal) |
| 6 | Estados Vazios | `c01013541f8c4d2fb930db9be12ba96d` | 2560x2048 | (integrated) |

## How to Fetch

```bash
# Get screen details via Stitch MCP
mcp__stitch__get_screen(
  name="projects/10039124106189115021/screens/{screenId}",
  projectId="10039124106189115021",
  screenId="{screenId}"
)

# Get screen HTML
# Each screen has an htmlCode.downloadUrl field with the rendered HTML
```

## Screen Descriptions

### 1. Landing Page
Marketing page with hero, value props (+12% a.a., 100% Auditado, 65% success), social proof, CTA. Full-scroll editorial layout. No wallet needed.

### 2. Criar Grupo (Create Group)
Two-column form (mobile: stacked). Left: group code, deposit amount (USDC + BRL estimate), frequency radios, duration select, member limit, penalty config. Right: real-time preview card with impact estimate + security card.

### 3. Participar do Grupo (Join Group)
Invitation page showing group details (R$150/week, 4/10 members). Member avatars. "Entrar e Depositar" primary CTA. Pix on-ramp alternative. Motivational stat nudge.

### 4. Painel do Grupo (Group Dashboard)
Active group view. Header with code display (TECH-8291). Cycle progress (Week 3/12, 25%). Countdown to next deposit. 4 member cards with streaks + amounts. "Enviar cutucada" nudge button for late members. Plan details. Security assurance.

### 5. Estados de Transacao (Transaction States)
Four states: awaiting signature, confirming on network, deposit confirmed (success), insufficient balance (error). Each is a full-screen state with appropriate messaging and CTAs.

### 6. Estados Vazios (Empty States)
Two empty states: no groups (prompt to create/join, WhatsApp share), group awaiting members (sharing code, "3+ members save 15% faster" nudge).
