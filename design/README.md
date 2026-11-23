# Owlgarth Finances Design System

> Philosophy: **"The Architectural Ledger"** — A professional financial tool aesthetic utilizing fine-line wireframe grids, compact tabular layouts, zero drop shadows, and strict 1px borders.
> Stack: Tailwind CSS + Geist + JetBrains Mono + Lucide Icons (14px, 1.5px stroke weight).

---

## File Index

| File | Contents |
|---|---|
| `README.md` | This file — philosophy, core principles, accessibility, rules |
| `tokens.md` | Fonts, type scale, color tokens (CSS variables), Tailwind theme, spacing, borders, radius |
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

- **Geist** — All UI text: headings, labels, body copy, buttons.
- **JetBrains Mono** — All financial data: currency amounts, percentages, dates, IDs, transaction values. **Never** render a currency amount in Geist. Also navigation labels (12px, uppercase, `tracking-wider`).

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
