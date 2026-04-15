# Responsive Layout System

> Three-breakpoint layout — sidebar on desktop/tablet, bottom nav on mobile.
> All styling uses the Architectural Ledger tokens from `tokens.md`.

---

## Breakpoints

| Name | Range | Sidebar | Navigation |
|---|---|---|---|
| Mobile | `≤640px` | Hidden | Bottom Navigation (fixed) |
| Tablet | `641px–1024px` | `56px` icon-only, collapsed | Sidebar (icons + tooltips) |
| Desktop | `≥1025px` | `240px` full | Sidebar (icons + labels) |

---

## Sidebar Styling

The sidebar uses Architectural Ledger tokens — no shadows, borders for structure only.

```css
/* Desktop sidebar */
.sidebar {
  background-color: var(--color-surface);       /* bg-surface */
  border-right: 1px solid var(--color-border);  /* border-r border-border */
  width: 240px;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 300;
}
```

### Nav Item States

| State | Styling |
|---|---|
| Active | `bg-surface-hover border-l-2 border-primary text-text` |
| Inactive | `text-text-muted hover:text-text hover:bg-surface-hover` |
| Hover | `bg-surface-hover` |

### Breakpoint Behavior

```css
/* Tablet: collapse sidebar */
@media (max-width: 1024px) and (min-width: 641px) {
  .sidebar { width: 56px; }
  .sidebar-label { display: none; }   /* labels, breadcrumb text, user name */
  .main-area { margin-left: 56px; }
}

/* Mobile: hide sidebar entirely */
@media (max-width: 640px) {
  .sidebar { display: none; }
  .main-area { margin-left: 0; padding-bottom: 72px; } /* clear bottom nav */
  .bottom-nav { display: flex; }
}
```

---

## Layout Behavior by Breakpoint

### Desktop (≥1025px)

- Full 240px sidebar: `bg-surface border-r border-border` — brand, context selectors, nav labels, user footer
- Main content area: `margin-left: 240px`
- Page content padding: `28px 32px`
- Balance cards: `minmax(190px, 1fr)` — typically 3 per row
- Major section spacing: `56–64px`
- Table row height: **32px** strict (`h-8`)

### Tablet (641–1024px)

- Sidebar collapses to `56px` — icons only, no labels; `bg-surface border-r border-border` preserved
- Context selectors: icon only (no workspace/account/period text)
- User avatar shown, name hidden
- Nav items: icon only; tooltip on hover shows label
- Main content area: `margin-left: 56px`
- Page content padding: `24px`
- Balance cards: typically 2 per row
- Table row height: **32px** strict (`h-8`)

### Mobile (≤640px)

- Sidebar hidden entirely
- Bottom Navigation replaces sidebar (see below)
- Current context (period + account) shown only via page header breadcrumb
- Main content area: full width, `padding-bottom: 72px` to clear bottom nav
- Page content padding: `20px 16px`
- Balance cards: 1 per row (full width) or 2 narrow
- Page header wraps: title on first line, actions row below
- Tables: horizontal scroll on overflow — do not truncate amount columns; row height remains **32px** strict
- Modals: full-screen sheet from bottom (see Modal Behavior below)
- Major section spacing: reduced to `32px`

---

## Bottom Navigation (Mobile)

Fixed at the bottom of the viewport. Uses Architectural Ledger tokens.

```css
.bottom-nav {
  display: none; /* shown only on mobile */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background-color: var(--color-surface);       /* bg-surface */
  border-top: 1px solid var(--color-border);     /* border-t border-border */
  z-index: 300; /* z-bottom-nav */
}
```

| Nav Item State | Styling |
|---|---|
| Active | `text-text` with Lucide icon + label |
| Inactive | `text-text-muted` with Lucide icon only (no label) |
| Hover / Tap | `bg-surface-hover` |

Each nav item is a 44×44px minimum touch target. Icons are Lucide at 14px, 1.5px stroke.

---

## Modal Behavior on Mobile

On mobile, modals slide up as a bottom sheet rather than appearing as a centered overlay. Uses `rounded-sm` (4px) on top corners — not `rounded-xl`.

```css
/* Desktop: centered overlay with border */
.modal-panel {
  background-color: var(--color-surface);       /* bg-surface */
  border: 1px solid var(--color-border);         /* border border-border */
  border-radius: 4px;                            /* rounded-sm */
}

/* Mobile: bottom sheet */
@media (max-width: 640px) {
  .modal-overlay { align-items: flex-end; padding: 0; }
  .modal-panel {
    width: 100%;
    border-radius: 4px 4px 0 0;                  /* rounded-sm top corners only */
    border: 1px solid var(--color-border);         /* border border-border */
    max-height: 92dvh;
    overflow-y: auto;
    animation: slideUp 0.12s cubic-bezier(0.32, 0.72, 0, 1);
  }
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

No shadows on any breakpoint. The `border border-border` provides visual separation from the backdrop.

---

## Touch Targets

All interactive elements on mobile must meet a minimum touch target of **44×44px**, even if the visual element is smaller.

```css
/* Expand tap area without changing visual size */
.touch-target { position: relative; }
.touch-target::after {
  content: '';
  position: absolute;
  inset: -8px; /* expands hit area by 8px on all sides */
}
```

| Element | Min Touch Target |
|---|---|
| Nav items (sidebar + bottom) | `44×44px` |
| Table row actions | `44×44px` (padding around icon) |
| Buttons | `44×44px` min height/width |
| Form inputs | `44px` min height |
| Chips / tags | `44px` min height when interactive |

---

## Content Density Across Breakpoints

| Element | Desktop | Tablet | Mobile |
|---|---|---|---|
| Table row height | `32px` strict (`h-8`) | `32px` strict (`h-8`) | `32px` strict (`h-8`) |
| Category chips | Always visible | Always visible | May be hidden; show on expand |
| Row actions | Inline text ("Edit", "Delete") | Inline text | Hidden; reveal via swipe or long-press |
| Major section spacing | `56–64px` | `48px` | `32px` |
| Page content padding | `28px 32px` | `24px` | `20px 16px` |
| Balance card columns | 3 | 2 | 1–2 |
| Sidebar width | `240px` | `56px` (icons only) | Hidden |
| Modal style | Centered, `rounded-sm`, `border border-border` | Centered, `rounded-sm` | Bottom sheet, `rounded-sm` top corners |

> **Note:** Table row height is **always 32px** across all breakpoints. The Architectural Ledger aesthetic prioritizes data density — rows do not expand on mobile.
