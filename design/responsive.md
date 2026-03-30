# Responsive Layout System

> Three-breakpoint layout — sidebar on desktop/tablet, bottom nav on mobile.

---

## Breakpoints

| Name | Range | Sidebar | Navigation |
|---|---|---|---|
| Mobile | `≤640px` | Hidden | Bottom Navigation (fixed) |
| Tablet | `641px–1024px` | `56px` icon-only, collapsed | Sidebar (icons + tooltips) |
| Desktop | `≥1025px` | `240px` full | Sidebar (icons + labels) |

---

## CSS

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

- Full 240px sidebar with brand, context selectors, nav labels, user footer
- Main content area: `margin-left: 240px`
- Page content padding: `28px 32px`
- Balance cards: `minmax(190px, 1fr)` — typically 3 per row
- Major section spacing: `56–64px`

### Tablet (641–1024px)

- Sidebar collapses to `56px` — icons only, no labels
- Context selectors: icon only (no workspace/account/period text)
- User avatar shown, name hidden
- Nav items: icon only; tooltip on hover shows label
- Main content area: `margin-left: 56px`
- Page content padding: `24px`
- Balance cards: typically 2 per row

### Mobile (≤640px)

- Sidebar hidden entirely
- Bottom Navigation replaces sidebar (see `components.md`)
- Current context (period + account) shown only via page header breadcrumb
- Main content area: full width, `padding-bottom: 72px` to clear bottom nav
- Page content padding: `20px 16px`
- Balance cards: 1 per row (full width) or 2 narrow
- Page header wraps: title on first line, actions row below
- Tables: horizontal scroll on overflow — do not truncate amount columns
- Modals: full-screen sheet from bottom (not centered overlay)
- Major section spacing: reduced to `32px`

---

## Modal Behavior on Mobile

On mobile, modals slide up as a bottom sheet rather than appearing as a centered overlay.

```css
@media (max-width: 640px) {
  .modal-overlay { align-items: flex-end; padding: 0; }
  .modal-panel {
    width: 100%;
    border-radius: 16px 16px 0 0;
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

---

## Content Density on Mobile

| Element | Desktop | Mobile |
|---|---|---|
| Table row height | `28–32px` | `40px` |
| Category chips | Always visible | May be hidden to preserve row width; show on expand |
| Row actions | Inline text ("Edit", "Delete") | Hidden; reveal via swipe or long-press |
| Major section spacing | `56–64px` | `32px` |
| Page content padding | `28px 32px` | `20px 16px` |
| Balance card columns | 3 | 1–2 |
