# Design System Specification: The Organic Trust Framework

## Design System Name: SafeNudge Bossa

**Stitch Project ID:** `10039124106189115021`
**Design System Asset:** `assets/0871232978fe4833b12baab8ded96ab7`

---

## 1. Overview & Creative North Star

**Creative North Star: "The Human Ledger"**

This design system rejects the cold, mechanical precision of traditional banking in favor of a warm, editorial-led experience. We are moving beyond "Standard Fintech" to create a "Human Ledger"—a digital space that feels as tactile as high-quality stationery and as intuitive as a conversation with a trusted advisor.

To break the "template" look, we utilize **Intentional Asymmetry** and **Tonal Depth**. We avoid rigid, boxy layouts by using generous white space and overlapping elements that suggest a fluid, organic flow of capital and growth. The interface doesn't just display data; it "nudges" the user through a sophisticated hierarchy of information.

---

## 2. Color Philosophy & Surface Architecture

Our palette transitions from the stability of deep Teal to the vitality of Spring Green, anchored by warm, paper-like neutrals.

### The "No-Line" Rule

**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning.
Boundaries must be defined solely through background color shifts. To separate a header from a body, or a sidebar from a feed, transition from `surface` to `surface-container-low`. We define space through mass and tone, not lines.

### Surface Hierarchy & Nesting

Treat the UI as a series of stacked sheets of fine paper.
- **Base Layer:** `surface` (#faf9f5) – The canvas.
- **Structural Sections:** `surface-container-low` (#f4f4f0).
- **Interactive Cards:** `surface-container-lowest` (#ffffff) – This creates a "lifted" effect against the warm background without needing heavy shadows.

### Glass & Gradient Soul

To provide a professional polish that flat colors cannot achieve:
- **CTAs:** Use a subtle linear gradient from `primary` (#006565) to `primary_container` (#008080) at a 135-degree angle.
- **Floating Elements:** Use Glassmorphism for overlays. Combine `surface` at 80% opacity with a `backdrop-blur` of 12px.

---

## 3. Typography: Editorial Authority

We use a dual-typeface system to balance character with extreme legibility.

- **Display & Headlines (Manrope):** A modern geometric sans with an organic touch. High-contrast scaling (from `display-lg` at 3.5rem to `headline-sm` at 1.5rem) creates an editorial rhythm. Use `headline-lg` for welcome messages to feel authoritative yet welcoming.
- **Body & UI (Inter):** The workhorse. Chosen for its tall x-height and exceptional readability in financial tables and micro-copy.

**Hierarchy Note:** Use `title-lg` (Inter, 1.375rem) for card headings to maintain a "friendly" Brazilian tone—approachable, clear, and direct.

### Typography Scale

| Token | Font | Size | Usage |
|-------|------|------|-------|
| display-lg | Manrope | 3.5rem | Hero headlines |
| display-md | Manrope | 2.75rem | Section headlines |
| display-sm | Manrope | 2.25rem | Sub-headlines |
| headline-lg | Manrope | 2rem | Welcome messages |
| headline-md | Manrope | 1.75rem | Page titles |
| headline-sm | Manrope | 1.5rem | Section titles |
| title-lg | Inter | 1.375rem | Card headings |
| title-md | Inter | 1rem | Subheadings |
| title-sm | Inter | 0.875rem | Labels |
| body-lg | Inter | 1rem | Primary body text |
| body-md | Inter | 0.875rem | Secondary body text |
| body-sm | Inter | 0.75rem | Captions |
| label-lg | Inter | 0.875rem | Button text |
| label-md | Inter | 0.75rem | Input labels |
| label-sm | Inter | 0.6875rem | Micro-copy |

---

## 4. Elevation & Depth

We convey hierarchy through **Tonal Layering** rather than traditional structural lines.

- **The Layering Principle:** Depth is achieved by "stacking." Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural lift.
- **Ambient Shadows:** If a card requires a "floating" state (e.g., a triggered nudge), use an extra-diffused shadow: `box-shadow: 0 12px 32px -4px rgba(0, 101, 101, 0.06)`. Note the tint: the shadow is a low-opacity version of our `primary` teal, not gray.
- **The "Ghost Border" Fallback:** If a container lacks contrast on certain displays, use a "Ghost Border": `outline-variant` (#bdc9c8) at 15% opacity.

---

## 5. Components & Interaction Patterns

### Buttons (The "Nudge" Interaction)

- **Primary:** Gradient (`primary` to `primary_container`), `md` (0.75rem) rounded corners. High-end, tactile feel.
- **Secondary:** `on_secondary_container` text on `secondary_fixed` background. Reserved for "growth" actions (Investir, Poupar).
- **Tertiary:** `tertiary` (#804f00) text. Used for "Nudges"—soft warnings or tips that feel distinct from financial actions.

### Cards & Lists

- **Prohibition:** Never use divider lines between list items.
- **Execution:** Separate items using 12px of vertical white space or a subtle hover state shift to `surface_container_high`.
- **Rounding:** Use `md` (0.75rem / 12px) for standard cards and `xl` (1.5rem) for featured "Financial Health" cards.

### Input Fields

- **Style:** `surface_container_lowest` backgrounds with a `ghost-border` on focus.
- **Labels:** Use `label-md` (Inter, 0.75rem) in `on_surface_variant` for a sophisticated, "quiet" UI.

### Signature Component: The "Nudge Toast"

A floating glassmorphic element using `tertiary_fixed` (#ffddb9) accents. Positioned asymmetrically (e.g., bottom-right) to break the grid and catch the eye naturally.

---

## 6. Do's and Don'ts

### Do

- **Use Natural Language:** Use PT-BR voice that is "parceiro" (partner-like). Instead of "Erro de sistema," use "Algo não deu certo. Vamos tentar de novo?"
- **Embrace Whitespace:** If a screen feels "busy," increase the padding. Our "High-End" feel comes from the luxury of space.
- **Nest Surfaces:** Always place a lighter surface on a darker surface to indicate importance.

### Don't

- **No Dark Mode/Neon:** Avoid high-contrast black backgrounds or neon glows. We are a stable bank, not a crypto exchange.
- **No Hard Borders:** Never use `#000000` or high-opacity grays for borders. It breaks the "Human Ledger" softness.
- **No Default Shadows:** Avoid standard `0 2px 4px` shadows. They look "cheap" and "out-of-the-box." Always use our tinted Ambient Shadows.

---

## 7. Spacing Scale

Maintain a rigid 4px/8px baseline grid to ensure that despite the "organic" feel, the implementation remains mathematically sound.

- **Squish (Buttons):** 8px top/bottom, 16px left/right.
- **Stretch (Cards):** 24px padding globally.
- **Gutter:** 16px or 24px for mobile; 32px for desktop editorial layouts.

---

## 8. CSS Utilities

Custom Tailwind utilities that encode the design system:

```css
/* Glassmorphism */
.bg-glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
}

.glass-nudge {
  background: rgba(250, 249, 245, 0.8);
  backdrop-filter: blur(12px);
}

/* Tinted Ambient Shadows */
.nudge-shadow {
  box-shadow: 0 12px 32px -4px rgba(0, 101, 101, 0.06);
}

.active-glow {
  box-shadow: 0 0 15px rgba(0, 101, 101, 0.2);
}

/* Material Symbols */
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

---

## 9. Enforcement Rules (for PR Review)

1. **No 1px borders** — boundaries through bg color shifts only
2. **No `#000000`** — use `on-surface` (#1a1c1a) for dark text
3. **No default shadows** — use `.nudge-shadow` (tinted teal) or `.active-glow`
4. **No hardcoded strings** — all through i18n `t()` function
5. **Surfaces nest light-on-dark** — `surface-container-lowest` cards on `surface-container-low` sections
6. **CTA gradients** — primary buttons always `linear-gradient(135deg, #006565, #008080)`
7. **Font pairing** — headlines/display = Manrope, body/UI = Inter, labels = Inter
8. **Spacing** — 4px/8px grid, cards 24px padding, gutters 16-24px mobile / 32px desktop
9. **Token amounts** — always human-readable with locale separators, never raw u64
10. **Material Symbols Outlined** — icon font, not SVGs
