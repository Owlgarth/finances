# Moniteria Design System

> Philosophy: **"The Architectural Ledger"** — A professional financial tool aesthetic utilizing fine-line wireframe grids, compact tabular layouts, zero drop shadows, and strict 1px borders.
> Stack: Tailwind CSS + Geist + JetBrains Mono + Lucide Icons (14px, 1.5px stroke weight).

---

## File Index

| File | Contents |
|---|---|
| `README.md` | This file — philosophy, core principles, accessibility, rules, migration delta |
| `tokens.md` | Fonts, type scale, color tokens (CSS variables), Tailwind config, spacing, borders, radius |
| `components.md` | All UI components: sidebar, page header, buttons, inputs, segmented control, cards, balance card, budget card, chips, tables, modals, form layout, confirmation dialog, select, toggle, avatar, badge, pagination, search results, bottom nav, icons |
| `responsive.md` | Breakpoints, layout behavior per device, mobile bottom sheets, touch targets, content density |
| `patterns.md` | Motion, empty states, loading/skeleton, toasts, dropdowns, z-index, tooltips, scrollbars, keyboard navigation, file upload/download, stepper/wizard |
| `data-formatting.md` | Number, currency, percentage, and date formatting rules |
| `dark-mode.md` | Full dark mode token mapping, CSS variable overrides, surface layers, toggle mechanism |
| `mockup.html` | Interactive HTML mockup of key screens (not updated in this phase) |

---

## Core Principles

### 1. Zero Shadows

Depth is achieved exclusively through **1px borders** and the contrast between `--color-background` (`#FAFAFA`) and `--color-surface` (`#FFFFFF`). No `shadow-sm`, `shadow-lg`, `shadow-card`, or any drop shadows exist anywhere in the system. Borders are structural — they define boundaries and containers, never decorative.

### 2. Single Icon Library: Lucide Icons

All icons use **Lucide Icons** exclusively. No Material Symbols, no HeroIcons, no inline SVGs, no other icon libraries. Consistent sizing at **14px** with **1.5px stroke weight**. A single import (`lucide-react`) serves the entire application.

### 3. Strict Token Usage

Every color must reference a semantic CSS variable (`--color-*`). Hardcoded Tailwind color classes (`bg-gray-100`, `text-blue-600`, `border-slate-300`) are banned. The only hex values that exist are in the CSS variable definitions themselves (`tokens.md`). All downstream usage goes through the token layer.

### 4. Maximum Data Density

Financial applications demand density. Row height is fixed at **32px**. Typography ranges from **11px to 16px** only. Spacing is compact: `p-3` (12px) or `p-4` (16px) for standard containers. Tables use zebra striping and 1px borders for scanability at high density. Every pixel earns its place.

### 5. Typographic Hierarchy

Two fonts, strictly separated by role:

- **Geist** — All UI text: headings, labels, navigation, body copy, buttons.
- **JetBrains Mono** — All financial data: currency amounts, percentages, dates, IDs, transaction values. **Never** render a currency amount in Geist.

Type scale is intentionally narrow (11–16px) to maintain the dense, ledger-like feel. Headings don't shout — they lead with weight and spacing, not size.

---

## Accessibility

| Text / Background pair | Contrast | Standard |
|---|---|---|
| `#171717` on `#FAFAFA` (text on background) | ~17.1:1 | AAA ✓ |
| `#FFFFFF` on `#171717` (button text on primary) | ~17.1:1 | AAA ✓ |
| `#059669` on `#ECFDF5` (positive on positive-bg) | ~5.6:1 | AA ✓ |
| `#DC2626` on `#FEF2F2` (negative on negative-bg) | ~5.7:1 | AA ✓ |
| `#737373` on `#FAFAFA` (muted text on background) | ~4.6:1 | AA (large text) ✓ |
| `#171717` on `#FFFFFF` (text on surface) | ~18.1:1 | AAA ✓ |

### Focus States

All interactive elements:

```css
:focus-visible {
  outline: 2px solid var(--color-border-focus); /* #171717 */
  outline-offset: 2px;
  border-radius: inherit;
}
```

### High-Contrast Mode Fallback

```css
@media (forced-colors: active) {
  .card, .input, .nav-item, .btn { border: 1px solid ButtonText; }
}
```

---

## Rules Summary

### NEVER

- Use drop shadows of any kind (`shadow-sm`, `shadow-lg`, `shadow-card`, `shadow-float`, custom `box-shadow`)
- Use Material Symbols, HeroIcons, React Icons, or inline SVGs for icons
- Hardcode Tailwind color classes (`bg-gray-100`, `text-blue-600`, `border-slate-300`)
- Use `rounded-lg` (8px) or `rounded-xl` (16px) on containers — only `rounded-sm` (4px) or `rounded-none` (0px)
- Use gradient buttons — primary buttons are flat `bg-primary` (`#171717`)
- Use `rounded-full` for chips/tags — use `rounded-sm` rectangular chips with borders
- Render currency amounts, percentages, or financial data in Geist — JetBrains Mono only
- Use opaque borders on containers without structural purpose — borders define boundaries, not decoration
- Use `#000` for text — always use `--color-text` (`#171717`)
- Use Inter, Roboto, Arial, or system fonts
- Use animation durations exceeding `200ms` for any UI transition
- Show a raw spinner for initial data loads — use top-edge progress bars or wireframe skeletons instead
- Use blocking `alert()` or `confirm()` dialogs — use toasts or modals
- Format negative amounts with parentheses — always use minus prefix
- Place currency symbol before the number — it goes **after**, space-separated
- Use arbitrary `z-index` values — always reference the z-index scale
- Use native browser scrollbars — apply `scrollbar-thin` or `scrollbar-none` classes
- Use radio buttons for binary choices — use Segmented Control
- Use a checkbox for on/off settings — use the Toggle / Switch component
- Use a native `<select>` — use the custom Select component

### ALWAYS

- Use **Lucide Icons** exclusively at **14px** with **1.5px stroke weight**
- Reference semantic CSS variables (`var(--color-*)`) for every color — no hardcoded hex in components
- Use `border border-border` (1px, `#E5E5E5`) for cards, panels, tables, and containers
- Use zebra striping (`bg-surface` / `bg-background`) for table data rows
- Keep table rows strictly at **32px** height
- Right-align all amount columns in tables
- Use `rounded-sm` (4px) for containers, `rounded-none` (0px) for internal grid elements, inputs, and inline fields
- Use JetBrains Mono for every number, percentage, date, and ID
- Use flat `bg-primary` (`#171717`) for primary buttons — no gradient
- Use `rounded-sm` with `border border-border` for chips and tags — never `rounded-full` pills
- Use 1px borders as the sole depth mechanism — zero shadows
- Include `aria-checked` and `role="switch"` on all Toggle / Switch components
- Trap focus inside open modals and restore focus to the trigger on close
- Validate form fields on blur (first touch), then re-validate on every keystroke
- Mark required form fields with `*` in `negative` color after the label text
- Auto-focus Cancel (not the destructive action) when opening confirmation dialogs
- Use `scrollbar-thin` on desktop scrollable areas, `scrollbar-none` on mobile
- Reference the z-index scale for all layered elements — no arbitrary values
- Use comma (`,`) as thousands separator for all currency values
- Show exactly 2 decimal places for currency amounts
- Render negative amounts with minus prefix in `negative` color — no parentheses
- Place currency symbol **after** the number, space-separated (e.g., `1,234.56 PLN`)
- Show Bottom Navigation on mobile (≤640px) with central FAB for primary action
- Collapse sidebar to 56px icon-only on tablet (641–1024px)

---

## Migration Delta

This section lists every change required to migrate from the current frontend codebase (documented in `STITCH.md`) to the new Architectural Ledger design system.

### Icon Library

| Current | New | Action |
|---|---|---|
| Material Symbols Outlined (`<span className="material-symbols-outlined">`) | Lucide Icons (`import { IconName } from 'lucide-react'`) | Replace all instances. Remove Google Fonts Material Symbols import from `index.html`. Install `lucide-react`. |
| HeroIcons (`react-icons/hi`) | Lucide Icons | Replace `HiCheck`, `HiPlus`, `HiCog`, `HiOfficeBuilding` in `WorkspaceSelector.tsx` and `CreateWorkspaceForm.tsx`. Remove `react-icons` dependency. |
| Inline SVGs (`EmailVerificationBadge.tsx`) | Lucide Icons | Replace checkmark and warning SVGs with `<Check />` and `<AlertTriangle />` from Lucide. |

### Primary Color

| Current | New |
|---|---|
| `#4b57aa` (indigo/purple) | `#171717` (near-black) |
| `--color-primary: #4b57aa` | `--color-primary: #171717` |
| `--color-primary-dim: #3f4b9d` | `--color-primary-hover: #262626` |
| `--color-primary-container: #dfe0ff` | Removed — no primary-container concept |
| `--color-on-primary: #f9f6ff` | `--color-on-primary` → white text on `#171717` is `#FFFFFF` |

### Shadows — Remove All

| Current | New | Action |
|---|---|---|
| `--shadow-card` CSS variable | Remove | Delete from `:root` in `index.css` |
| `--shadow-float` CSS variable | Remove | Delete from `:root` in `index.css` |
| `shadow-card` Tailwind utility | `border border-border` | Replace all `shadow-card` / `shadow-float` classes with `border border-border` |
| `box-shadow` in custom CSS | Remove | No `box-shadow` anywhere |

### Button Style

| Current | New | Action |
|---|---|---|
| Gradient: `linear-gradient(135deg, #4b57aa, #3f4b9d)` | Flat: `bg-primary` (`#171717`) | Remove gradient classes, use flat background |
| `rounded-lg` / `rounded-xl` | `rounded-sm` | Update all button border-radius |
| Hover: gradient shift | Hover: `bg-primary-hover` (`#262626`) | Simple background color change on hover |

### Border Radius

| Current | New | Action |
|---|---|---|
| `rounded-xl` (16px) on cards, modals | `rounded-sm` (4px) | Global find-and-replace |
| `rounded-lg` (8px) on buttons, nav items | `rounded-sm` (4px) for containers, `rounded-none` (0px) for internal elements | Update per context |
| `rounded-full` (9999px) on chips, pills | `rounded-sm` (4px) with `border border-border` | Chips become rectangular with borders |
| `rounded-md` (12px) on category widgets | `rounded-sm` (4px) | Update |
| Tailwind config `borderRadius.DEFAULT: 8px` | `borderRadius.DEFAULT: 4px` | Update config |

### Surface System

| Current | New | Action |
|---|---|---|
| Surface layering: `#f3f4f3` → `#faf9f8` → `#ffffff` | Two surfaces: `#FAFAFA` (background) → `#FFFFFF` (surface) | Simplify to two-tier system |
| Glassmorphism on top bar (`backdrop-filter: blur(12px)`) | `bg-surface border-b border-border` | Remove blur, add border |
| Background color shifts for depth | `border border-border` for boundaries | Borders replace background shifts |

### Cards

| Current | New | Action |
|---|---|---|
| `rounded-xl shadow-card` | `rounded-sm border border-border` | Remove shadow, add border, reduce radius |
| Surface layering for elevation | Flat `bg-surface` with border | No elevation hierarchy |

### Tables

| Current | New | Action |
|---|---|---|
| No row dividers, hover highlight only | 1px borders on all cells + zebra striping | Add `border border-border` on table container, `border-b border-border` on rows |
| No sticky headers | Sticky headers (`sticky top-0`) | Add `bg-background` to header row for z-index layering |
| No zebra striping | Alternating `bg-surface` / `bg-background` rows | Add zebra pattern |

### Typography

| Current | New | Action |
|---|---|---|
| Size range: 9–32px | Size range: 11–16px | Reduce all sizes. Remove `display-lg` (28–32px) and `heading` (18–22px) scales |
| `display-lg` (28–32px, weight 900) | Page title: 16px, weight 600 | Drastically reduce hero number sizes |
| `heading` (18–22px, weight 800) | Section title: 14px, weight 500 | Reduce heading scale |
| `micro` (9–11px, weight 700) | Labels: 11px, weight 500, uppercase | Adjust micro scale |
| Tailwind config radius overrides | Remove all radius overrides | Use `rounded-sm` / `rounded-none` utility classes directly |

### Semantic Colors

| Current | New | Action |
|---|---|---|
| `positive: #10b981` | `positive: #059669` | Update hex |
| `positive-container: #d1fae5` | `positive-bg: #ECFDF5` | Rename and update hex |
| `negative: #e11d48` | `negative: #DC2626` | Update hex |
| `negative-container: #ffe4e9` | `negative-bg: #FEF2F2` | Rename and update hex |
| `warning: #f59e0b` | `warning: #D97706` | Update hex |
| `warning-container: #fef3c7` | `warning-bg: #FFFBEB` | Rename and update hex |

### CSS Variables to Add

```css
:root {
  --color-primary: #171717;
  --color-primary-hover: #262626;
  --color-background: #FAFAFA;
  --color-surface: #FFFFFF;
  --color-surface-hover: #F5F5F5;
  --color-surface-muted: #E5E5E5;
  --color-border: #E5E5E5;
  --color-border-focus: #171717;
  --color-text: #171717;
  --color-text-muted: #737373;
  --color-positive: #059669;
  --color-positive-bg: #ECFDF5;
  --color-negative: #DC2626;
  --color-negative-bg: #FEF2F2;
  --color-warning: #D97706;
  --color-warning-bg: #FFFBEB;
}
```

### CSS Variables to Remove

```css
/* Remove these from :root */
--shadow-card
--shadow-float
--color-primary-dim
--color-primary-container
--color-on-primary-container
--color-secondary
--color-secondary-container
--color-on-secondary-container
--color-secondary-fixed
--color-on-secondary-fixed
--color-surface-container-low
--color-surface-container-lowest
--color-surface-container
--color-surface-container-high
--color-surface-container-highest
--color-surface-variant
--color-on-surface (renamed to --color-text)
--color-on-surface-variant (renamed to --color-text-muted)
--color-outline
--color-outline-variant
--color-error
--color-error-container
--color-tertiary-container
--color-on-tertiary-container
--color-on-positive-container
--color-on-negative-container
--color-on-warning-container
```

### Dependencies

| Current | New | Action |
|---|---|---|
| Google Fonts Material Symbols | Remove | Delete `<link>` from `index.html` |
| `react-icons` (HeroIcons) | Remove | Uninstall `react-icons`, replace all usages with Lucide |
| — | `lucide-react` | Install `lucide-react` |
