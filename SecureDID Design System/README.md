# SecureDID Design System

A design language for SecureDID — wallet-based decentralized identity for higher education.
The goal: make on-chain identity feel like a clean university portal, not a crypto dapp.
**"Stripe meets Linear," not "Uniswap."**

---

## Product context

SecureDID replaces college username/password auth with wallet-based DIDs. Each institution deploys
its own on-chain registry via a global factory on **Base Sepolia (chain 84532)**. Five panelists
(department heads) govern each registry through a **3-of-5 multisig**: they pre-authorize student
enrollments, approve registrations, revoke credentials, and replace themselves.

- **Identity** = wallet address. No passwords anywhere.
- **DID format**: `did:securedid:<registry-prefix>:<wallet-address>`
- **Credentials** are encrypted client-side with MetaMask's `eth_getEncryptionPublicKey`, pinned to
  IPFS, decrypted only by the student.
- **Access grants** are time-limited, on-chain, revocable. Verifier portals (University, College)
  gate every page render on `hasAccess(student, platform)`.

### The six apps

| Port | App         | User                        | Accent   | Purpose                                              |
|------|-------------|-----------------------------|----------|------------------------------------------------------|
| 3000 | Factory     | Institution admins          | Indigo   | Deploy a new registry for your college               |
| 3001 | Panelist    | Panelists (dept heads)      | Indigo   | Vote on proposals, approve students                  |
| 3002 | Student     | Students                    | Emerald  | Register, view encrypted VC, manage access grants    |
| 3003 | University  | Faculty / DID-gated portal  | Purple   | View transcripts (gated by access grant)             |
| 3004 | College     | Faculty / DID-gated portal  | Orange   | View attendance (access grant + SIWE signature)      |
| 3005 | Explorer    | Anyone                      | Sky      | Public read-only dashboard of registries + events    |

### Personas

- **Institution admin** — low crypto knowledge, deploys once, wants a Safe-like wizard.
- **Panelist (professor)** — low crypto knowledge, weekly user. Needs "what does this proposal
  do, should I approve?" framing.
- **Student** — low crypto knowledge, uses a few times a semester. Needs hand-holding on the
  commitment concept. Often on mobile.
- **Verifier faculty** — lowest crypto knowledge. Just wants to see transcripts/attendance after
  connecting a wallet.
- **Explorer** — developer or researcher. Doesn't touch wallet.

### Sources given for this design system

- **Written brief** pasted into the kickoff message (SecureDID v6 — UI Redesign Brief).
- **No codebase, Figma, or screenshots were attached.** The visual direction here is an original
  interpretation of the brief, not a recreation of existing UI. If real components exist in the
  SecureDID monorepo, attach them and I'll rebuild the UI kits against source of truth.

---

## Content fundamentals

**Voice: calm, precise, reassuring. Academic-institutional tone, not crypto-bro.**

- Use **"you"** when addressing the user. Use **"your department"**, **"your institution"** for
  shared context. Avoid "we" — SecureDID is infrastructure, not a brand personality.
- **Sentence case** for every label, heading, button. Never Title Case. Never ALL CAPS except for
  very short UI pills (`ACTIVE`, `EXPIRED`) where SMALL CAPS at 11px is fine.
- **Replace crypto jargon with plain English in primary copy**, keep the technical term in a
  tooltip.

| Avoid (crypto)       | Prefer (plain English)                         |
|----------------------|-------------------------------------------------|
| Execute              | Submit, send, confirm                           |
| Broadcast            | Send to network                                 |
| Nonce                | Unique code                                     |
| Sign message         | Sign in with your wallet                        |
| Mint credential      | Issue credential                                |
| Approve (ERC20)      | Allow access                                    |
| Revert               | The request didn't go through                   |
| Commitment hash      | Enrollment code (with tooltip)                  |
| CID                  | IPFS address (with tooltip)                     |
| Panelist             | Panelist (defined on first use each screen)     |

- **Every piece of crypto jargon gets a tooltip** with a one-sentence, plain-English definition.
  A small `?` badge, muted, revealed on hover/tap.
- **Numbers deserve display-sized treatment.** 2 of 3 approvals, 8.94 CGPA, 74% attendance — these
  are the outcomes users look at first. Use the display type scale.
- **Error copy follows this pattern:** lead with the human-readable reason, collapse the hex.
  *"Your enrollment code doesn't match what your department pre-authorized. Double-check with
  them. (`error 0xa1b2…`)"*
- **No emoji in UI copy.** SecureDID is institutional. Emoji are fine only inside illustrations.
- **Empty states are reassuring, not scolding.** *"No proposals yet. When a panelist creates one,
  it'll appear here."* Never *"Nothing found."*
- **Action verbs are specific.** Never "Click here" or "Learn more." Prefer "Open in Panelist
  portal", "See transcript", "Fetch encrypted credential."

### Vocabulary to always define on first use

Commitment, revocation index, CID, panelist, multisig, access grant, SIWE (Sign-In With Ethereum),
verifiable credential, registry, proposal.

---

## Visual foundations

**The feeling we want**: opening a clean student portal at a well-funded university. Trustworthy,
crisp, a little warm. Not cold crypto.

### Color

- **Neutrals first.** 95% of every screen is neutral slate. Accents are sparing, used only for
  state and the per-app signature color.
- **Each app has one accent color** that appears in: the top-nav product name underline, primary
  buttons, active nav items, focus rings. Never used as a large flood.
- **Semantic colors** (success/warn/danger/info) are shared across all apps and never app-tinted.
- **Both light and dark modes ship.** Light is the default for first-time users; dark is a one-
  click toggle in the nav. Dark isn't pure black — it's a desaturated deep slate (see
  `colors_and_type.css`).
- **Gradients are used once per app**, on the DID card in the Student app (the "hero" credential
  card). That's the only gradient in the system. Everywhere else: flat fills.

### Typography

- **Inter** for UI text, 400/500/600/700. Humanist, legible, institutional.
- **DM Serif Display** for the display scale — the hero numbers (CGPA, approval count, student
  count). Reserved only for 48px+.
- **JetBrains Mono** for wallet addresses, hashes, tx IDs, CIDs. Never for body copy.
- **`text-wrap: pretty`** on every paragraph and card title.
- **Numbers use `font-feature-settings: "tnum"`** everywhere — tabular numerals for addresses,
  counts, progress fractions.

### Spacing & layout

- **4-point grid**. Tokens: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96.
- **Max content width ~1100px.** Cards over full-bleed tables. Multi-column layouts only when
  scanning is the primary task (proposal queue, event feed).
- **Generous whitespace** — institutional feel, not dashboard density.

### Cards, borders, shadows

- **Cards** are the primary container. 1px border in neutral-200, radius **12px**, background
  surface-0 (pure white in light, slate-900 in dark). Shadow is extremely subtle: `0 1px 2px
  rgba(15,23,42,0.04)`. Hover lifts to `0 4px 12px rgba(15,23,42,0.06)`.
- **Elevation** has only **three levels**: flat (border only), raised (small shadow), modal
  (larger shadow + backdrop blur).
- **Corner radii**: 6px on buttons/inputs/pills, **12px on cards**, 20px on the DID hero card,
  full (999px) on avatars and address pills.
- **Inner shadows** are not used. Outer only.
- **Borders are always 1px**, never 2px+. Focus rings use a 2px **outline** offset by 2px, never
  `box-shadow`.

### Backgrounds, imagery, illustration

- **Page backgrounds** are neutral-50 (light) / slate-950 (dark). No textures, no gradients on
  page backgrounds.
- **Imagery is minimal.** Illustrations appear only in empty states and the Factory hero. Style:
  simple, line-forward, two-color (neutral + app accent), no gradients, no 3D, no isometric. Think
  early Linear marketing site.
- **No stock photography.** No hand-drawn look. No patterns or textures.

### Motion

- **Transitions are short.** 150ms for hover/press, 220ms for enter/exit, 320ms for modal.
- **Easing**: `cubic-bezier(0.2, 0, 0, 1)` (ease-out-quart) for enters, `cubic-bezier(0.4, 0, 1,
  1)` (ease-in) for exits.
- **Fade + 4px slide-up** is the universal enter. No bounces. No spring overshoots.
- **Loading is a skeleton**, never a spinner on lists. Spinners only for in-button tx pending.
- **Tx pending state** uses an indeterminate progress bar under the button label, not a modal.

### Interaction states

- **Hover** on buttons: background darkens 8% (primary) or background fills neutral-100 (ghost).
  Never a lift animation on buttons.
- **Hover** on cards: border darkens one step (neutral-200 → neutral-300), tiny shadow lift. No
  scale transform.
- **Press**: background darkens 4% more, no scale.
- **Focus**: 2px outline in the app accent color, 2px offset.
- **Disabled**: 40% opacity, no hover response. Always paired with a tooltip explaining why.

### Transparency & blur

- **Modals** use a `rgba(15,23,42,0.4)` backdrop with `backdrop-filter: blur(8px)`.
- **Top nav** is sticky with `backdrop-filter: blur(12px)` and 80% surface opacity on scroll.
- **Nowhere else.** Glassmorphism stays scoped to nav + modals.

### Status & state surfaces

- **Status pills** are a sharply defined system. See the pills card in the Design System tab.
  Active = emerald. Executed = slate. Expired = amber. Revoked = red. Pending = indigo.
- **Toasts** for transactions — bottom-right, stacking, auto-dismissing on confirm. Three states:
  broadcasting (indigo, spinner), confirmed (emerald, check), reverted (red, collapsed hex).

---

## Iconography

**SecureDID uses [Lucide](https://lucide.dev) icons** throughout — 1.5px stroke, 20px default,
24px for primary nav. Copied into `assets/icons/` as individual SVGs and also available via CDN.

- **Why Lucide:** institutional feel, consistent stroke, broad coverage for both crypto concepts
  (wallet, key, link) and academic concepts (book, graduation-cap, file-text).
- **No emoji in product UI.** Ever.
- **No icon fonts.** Inline SVG only.
- **Unicode:** used only for middle-dot separators (`·`) in metadata rows and the ellipsis (`…`)
  in truncated addresses. Never ✓ or ✗ — those come from Lucide (`check`, `x`).
- **Custom icons:** the SecureDID mark (shield + chain-link) is custom and lives at
  `assets/logo.svg`. The six app marks are color variants of the same glyph.

### Icon sizes

- 16px — inline in text, badges
- 20px — default UI (buttons, list rows, inputs)
- 24px — top-nav, empty-state hint icons
- 48px — empty-state hero illustrations (these are custom, not Lucide)

---

## Index

```
README.md                   ← you are here
SKILL.md                    ← skill manifest for Claude Code
colors_and_type.css         ← all design tokens as CSS vars
assets/
  logo.svg                  ← SecureDID wordmark
  mark.svg                  ← shield + link glyph (standalone)
  icons/                    ← Lucide SVGs used across the system
preview/                    ← design-system cards (registered for the DS tab)
  type-display.html
  type-body.html
  type-mono.html
  colors-neutral.html
  colors-accents.html
  colors-semantic.html
  spacing-scale.html
  radii.html
  shadows.html
  buttons.html
  inputs.html
  status-pills.html
  address-pill.html
  did-card.html
  empty-state.html
  transaction-toast.html
  logo.html
ui_kits/
  factory/         ← port 3000 — deploy a registry
  panelist/        ← port 3001 — govern proposals
  student/         ← port 3002 — your DID + credential
  university/      ← port 3003 — transcript portal
  college/         ← port 3004 — attendance portal (with SIWE)
  explorer/        ← port 3005 — public block-explorer
```
