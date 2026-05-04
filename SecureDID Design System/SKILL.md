---
name: securedid-design
description: Use this skill to generate well-branded interfaces and assets for SecureDID, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files:
- `README.md` — product context, content fundamentals, visual foundations, iconography
- `colors_and_type.css` — all design tokens as CSS variables (import this)
- `assets/logo.svg`, `assets/mark.svg` — brand marks
- `assets/icons/` — Lucide SVGs used across the system
- `ui_kits/_shared.css` — shared component styles (buttons, cards, pills, etc.)
- `ui_kits/{factory,panelist,student,university,college,explorer}/index.html` — per-app recreations; use `data-app="<name>"` on the root element to apply the app's accent color

House rules:
- Sentence case everywhere. No emoji in UI. Plain English over crypto jargon (with tooltips).
- Max content width ~1100px. Cards over tables.
- Inter for UI, DM Serif Display for outcome numbers (48px+), JetBrains Mono for addresses/hashes/CIDs only.
- One gradient in the system: the DID hero card in the Student app.
- Per-app accent: Factory/Panelist = indigo, Student = emerald, University = violet, College = orange, Explorer = sky.
