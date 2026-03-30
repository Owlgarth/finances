# Monie Design System

> Philosophy: **"Warm Precision"** — editorial financial UI. No cold brutalism, no bubbly consumer apps.
> Stack: Tailwind CSS + Geist + JetBrains Mono + Material Symbols Outlined icons.

---

## File Index

| File | Contents |
|---|---|
| `tokens.md` | Fonts, type scale, color tokens (incl. warning), Tailwind config (all CSS vars), spacing, borders, radius |
| `components.md` | All UI components: sidebar, top bar, page header, buttons, inputs, segmented control, cards, balance card, budget card, chips, tables, charts, savings panel, bottom nav, **modal, form layout, confirmation dialog, select, toggle, avatar, badge, pagination, search results**, icons |
| `responsive.md` | Breakpoints, layout behavior per device, mobile bottom sheets, touch targets, content density |
| `patterns.md` | Motion, empty states, loading/skeleton, toasts, dropdowns, z-index, tooltips, **scrollbars, keyboard navigation, file upload/download, stepper/wizard** |
| `data-formatting.md` | Number, currency, percentage, and date formatting rules |
| `dark-mode.md` | Full dark mode token mapping (all tokens incl. secondary, tertiary, warning), CSS variables, shadows, glassmorphism, toggle mechanism |
| `mockup.html` | Interactive HTML mockup of key screens |

---

## 9. Accessibility

| Text / Background pair | Contrast | Standard |
|---|---|---|
| `#2f3333` on `#faf9f8` | ~10.1:1 | AAA ✓ |
| `#f9f6ff` on `#4b57aa` | ~6.8:1 | AA+ ✓ |
| `#395663` on `#c9e7f7` | ~5.2:1 | AA ✓ |
| `#065f46` on `#d1fae5` | ~6.9:1 | AA+ ✓ |

Focus states — all interactive elements:
```css
:focus-visible {
  outline: 2px solid #dfe0ff; /* primary-container */
  outline-offset: 2px;
  border-radius: inherit;
}
```

High-contrast mode fallback:
```css
@media (forced-colors: active) {
  .card, .input, .nav-item { border: 1px solid ButtonText; }
}
```

---

## 10. Rules Summary

### NEVER
- Use `1px solid` borders on containers, sections, or list items
- Use `#000` for text — always use `#2f3333` (light) or `#e3e6e5` (dark)
- Use `0px` or `4px` radius on cards or panels
- Use Inter, Roboto, Arial, or system fonts
- Use opaque headers — top bar requires glassmorphism
- Use black-based shadows in **light mode** (`rgba(0,0,0,...)`) — tint with on-surface or indigo
- Use divider lines between table rows or list items
- Render currency/amounts in Geist — Mono only
- Use flat hex on primary CTA buttons — always use gradient
- Apply positive/negative semantic colors to non-financial data
- Use `display-lg` scale (28–32px) for page titles — page headers use `heading` scale (20px/800)
- Use radio buttons for binary choices in forms — use Segmented Control
- Use a checkbox for on/off settings — use the Toggle / Switch component
- Use a native `<select>` — use the custom Select component
- Show the full sidebar on mobile
- Show a modal as a centered overlay on mobile — convert to bottom sheet
- Render zero-value exchange rows on Balance Cards
- Use animation durations exceeding `200ms` for any UI transition
- Show a raw spinner for initial data loads — use shimmer skeletons instead
- Use blocking `alert()` or `confirm()` dialogs — use toasts or modals
- Format negative amounts with parentheses — always use minus prefix
- Place currency symbol before the number — it goes **after**, space-separated
- Use arbitrary `z-index` values — always reference the z-index scale
- Use native browser scrollbars — apply `scrollbar-thin` or `scrollbar-none` classes
- Auto-focus the destructive action in confirmation dialogs — focus Cancel instead
- Build a wizard with more than 4 steps — simplify the flow

### ALWAYS
- Structure sections with background color shifts, not borders
- Use `surface-container-low` → `surface` → `surface-container-lowest` for depth
- Use JetBrains Mono for every number, percentage, date, ID, and nav label
- Apply glassmorphism to the top bar
- Tint shadows with `on-surface` (#2f3333) or indigo (#4b57aa) in light mode — never black
- Use gradient `linear-gradient(135deg, #4b57aa, #3f4b9d)` on primary buttons
- Right-align all amount columns in tables
- Use `rounded-full` (pill) for all chips and tags
- Use whitespace (56–64px) between major sections
- Keep table rows strictly within 28–32px height (40px on mobile)
- Include context breadcrumb (`{Period} · {Account}`) above every page title
- Show Bottom Navigation on mobile (≤640px) with central FAB for primary action
- Collapse sidebar to 56px icon-only on tablet (641–1024px)
- Apply `safe-area-inset-bottom` padding to Bottom Navigation on notched devices
- Show toast notifications in the top-right corner, 2-second default duration
- Use comma (`,`) as thousands separator for all currency values
- Show exactly 2 decimal places for currency amounts
- Render negative amounts with minus prefix in `negative` color — no parentheses
- Place currency symbol **after** the number, space-separated (e.g., `1,234.56 PLN`)
- Use shimmer skeleton placeholders for all asynchronous content loading
- Reference the z-index scale for all layered elements — no arbitrary values
- Trap focus inside open modals and restore focus to the trigger on close
- Validate form fields on blur (first touch), then re-validate on every keystroke
- Mark required form fields with `*` in `negative` color after the label text
- Use `scrollbar-thin` on desktop scrollable areas, `scrollbar-none` on mobile
- Auto-focus Cancel (not the destructive action) when opening confirmation dialogs
- Use CSS custom properties (`var(--color-*)`) for all Tailwind colors — no hardcoded hex in config
- Include `aria-checked` and `role="switch"` on all Toggle / Switch components
