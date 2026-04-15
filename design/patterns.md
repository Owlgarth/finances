# UI Patterns

> Motion, empty states, loading/skeleton, toasts, dropdowns, z-index scale, tooltips, scrollbars, keyboard navigation, file upload/download, stepper/wizard.
> All colors reference `--color-*` CSS variables defined in `tokens.md`. All icons reference **Lucide Icons** exclusively (14px, 1.5px stroke weight). Zero shadows.

---

## 1. Motion & Transitions

Speed is the priority. Every transition must feel instant.

### Duration Scale

```css
:root {
  --duration-instant: 80ms;   /* button press, active state */
  --duration-fast:    120ms;  /* modal open, dropdown open */
  --duration-normal:  150ms;  /* hover color, toast enter */
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);   /* entrances */
  --ease-in:  cubic-bezier(0.4, 0, 0.2, 1);     /* exits */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);  /* continuous */
}
```

### Transition Table

| Action | Duration | Easing | Properties |
|---|---|---|---|
| Modal open | `120ms` | `ease-out` | `transform, opacity` |
| Modal close | `80ms` | `ease-in` | `transform, opacity` |
| Bottom sheet slide up | `120ms` | `ease-out` | `transform` |
| Dropdown open | `100ms` | `ease-out` | `opacity, transform` |
| Dropdown close | `80ms` | `ease-in` | `opacity` |
| Hover (color/bg) | `150ms` | `ease` | `background, color, border-color` |
| Button press (scale) | `80ms` | `ease` | `transform` |
| Toast enter | `150ms` | `ease-out` | `transform, opacity` |
| Toast exit | `100ms` | `ease-in` | `opacity` |
| Focus ring | `100ms` | `ease` | `outline-color, outline-offset` |
| Sidebar collapse | `150ms` | `ease-standard` | `width` |
| Page/screen change | `0ms` | — | Instant swap, no animation |
| Progress bar fill | `300ms` | `ease` | `width` |

### Rules

- **Maximum duration: 200ms.** No UI transition may exceed this.
- No entrance animations on initial page load — content appears instantly.
- Prefer `transform` + `opacity` over layout-triggering properties (`width`, `height`, `top`).
- **No shadow animations.** Shadows do not exist in this system — do not animate `box-shadow` for elevation changes. Use `border-color` transitions instead (e.g., `border-border` → `border-border-focus`).
- Disable all motion when `prefers-reduced-motion: reduce` is active:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 2. Empty States

Appear when a page or section has no data. Must feel intentional, not broken.

### Layout

```html
<div class="flex flex-col items-center justify-center py-16 text-center">
  <!-- Lucide icon -->
  <Receipt class="text-text-muted/30" size={48} strokeWidth={1.5} />

  <h3 class="text-sm font-semibold text-text-muted mt-4">
    No transactions yet
  </h3>
  <p class="text-[13px] text-text-muted mt-1.5 max-w-[280px] leading-relaxed">
    Add your first transaction to start tracking your spending.
  </p>
  <button class="mt-5 bg-primary text-white
                 px-3 py-1.5 rounded-sm text-xs font-medium
                 hover:bg-primary-hover transition-colors">
    Add Transaction
  </button>
</div>
```

### Specs

| Property | Value |
|---|---|
| Container | Centered horizontally and vertically within its parent |
| Vertical padding | `64px` top and bottom (`py-16`) |
| Icon | Lucide icon, 48px, `strokeWidth={1.5}`, `text-text-muted` at 30% opacity |
| Heading | Geist, 14px, semibold (`text-sm font-semibold`), `text-text-muted` |
| Description | Geist, 13px, `text-text-muted`, max-width `280px`, `leading-relaxed` |
| CTA button | Primary button variant (flat `bg-primary`), `20px` top margin |

### Per-Page Text

| Page | Lucide Icon | Heading | Description |
|---|---|---|---|
| Transactions | `Receipt` | No transactions yet | Add your first transaction to start tracking your spending. |
| Planned | `CalendarClock` | No planned transactions | Schedule recurring or future transactions here. |
| Categories | `Tag` | No categories | Create categories to organize your transactions. |
| Budgets | `PiggyBank` | No budgets set | Set budgets for your categories to track spending limits. |
| Exchanges | `ArrowLeftRight` | No currency exchanges | Record exchanges between your currencies here. |
| Periods | `CalendarRange` | No budget periods | Create a period to start budgeting. |
| Members | `Users` | Just you for now | Invite team members to collaborate on this workspace. |

### Icon Style Guide

- Size: `48px` (`size={48}`)
- Stroke width: `1.5px` (`strokeWidth={1.5}`)
- Color: `text-text-muted` at 30% opacity (`text-text-muted/30`)
- No SVG illustrations — Lucide icons only, single icon centered above the heading
- No gradients, no complex shading — flat, subdued appearance

---

## 3. Loading & Skeleton States

Replace spinners with **top-edge progress bars** for page-level loads and **wireframe skeletons** for component-level loads.

### Top-Edge Progress Bar

For page-level navigation and data fetching:

```css
@keyframes progress-slide {
  0%   { transform: translateX(-100%); }
  50%  { transform: translateX(0%); }
  100% { transform: translateX(100%); }
}

.progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  z-index: 700;
  overflow: hidden;
}

.progress-bar::after {
  content: '';
  display: block;
  width: 100%;
  height: 100%;
  background-color: var(--color-primary); /* #171717 */
  animation: progress-slide 1.5s ease-in-out infinite;
}
```

```html
<!-- Top-edge progress bar (1px, full width) -->
<div class="fixed top-0 left-0 w-full h-px z-tooltip overflow-hidden">
  <div class="h-full bg-primary animate-[progress-slide_1.5s_ease-in-out_infinite]"></div>
</div>
```

### Wireframe Skeleton

For component-level loading (cards, tables, forms). Uses 1px borders, not rounded shapes.

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #FAFAFA 25%,
    #E5E5E5 37%,
    #FAFAFA 63%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border: 1px solid var(--color-border);
  border-radius: 0; /* rounded-none — wireframe boxes */
}

/* Dark mode */
.dark .skeleton {
  background: linear-gradient(
    90deg,
    #171717 25%,
    #333333 37%,
    #171717 63%
  );
  background-size: 200% 100%;
}
```

### Skeleton Shapes by Component

```html
<!-- Balance card skeleton -->
<div class="bg-surface border border-border rounded-sm p-4">
  <div class="skeleton h-3 w-10 mb-2 rounded-none"></div>
  <div class="skeleton h-6 w-24 mb-3 rounded-none"></div>
  <div class="grid grid-cols-2 gap-2">
    <div class="skeleton h-3 w-16 rounded-none"></div>
    <div class="skeleton h-3 w-16 rounded-none"></div>
    <div class="skeleton h-3 w-14 rounded-none"></div>
    <div class="skeleton h-3 w-14 rounded-none"></div>
  </div>
</div>

<!-- Table row skeleton (32px row height) -->
<tr class="h-8">
  <td class="px-2 border-b border-border"><div class="skeleton h-3 w-20 rounded-none"></div></td>
  <td class="px-2 border-b border-border"><div class="skeleton h-3 w-32 rounded-none"></div></td>
  <td class="px-2 border-b border-border"><div class="skeleton h-3 w-16 rounded-none"></div></td>
  <td class="px-2 border-b border-border text-right"><div class="skeleton h-3 w-24 ml-auto rounded-none"></div></td>
</tr>

<!-- Modal form skeleton -->
<div class="space-y-4 p-4">
  <div>
    <div class="skeleton h-2.5 w-16 mb-2 rounded-none"></div>
    <div class="skeleton h-8 w-full rounded-none"></div>
  </div>
  <div>
    <div class="skeleton h-2.5 w-20 mb-2 rounded-none"></div>
    <div class="skeleton h-8 w-full rounded-none"></div>
  </div>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <div class="skeleton h-2.5 w-14 mb-2 rounded-none"></div>
      <div class="skeleton h-8 w-full rounded-none"></div>
    </div>
    <div>
      <div class="skeleton h-2.5 w-12 mb-2 rounded-none"></div>
      <div class="skeleton h-8 w-full rounded-none"></div>
    </div>
  </div>
</div>
```

### Rules

| Rule | Detail |
|---|---|
| Delay threshold | Don't show skeletons or progress bar if data loads in < `300ms` |
| Row count | Show 5–8 skeleton rows for table loading |
| Card count | Match the expected number of real cards |
| Shape fidelity | Shapes must approximate real content dimensions |
| No spinners | Never use a centered spinner for page-level or component-level loading |
| Skeleton borders | All skeleton shapes use `border border-border rounded-none` — wireframe boxes, not blobs |
| Inline loading | Use pulse animation on a single element being refreshed |

### Inline Pulse (single-value refresh)

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.loading-pulse { animation: pulse 1s ease-in-out infinite; }
```

---

## 4. Toast Notifications

Transient, non-blocking feedback for user actions.

### Layout

```html
<div class="fixed top-5 right-5 z-toast flex flex-col gap-2 pointer-events-none"
     style="max-width: 360px">

  <div class="bg-surface border border-border rounded-sm
              px-4 py-3 flex items-start gap-3
              pointer-events-auto
              animate-[slideInRight_150ms_ease-out]">
    <!-- Lucide icon -->
    <CircleCheck class="text-positive flex-shrink-0" size={20} strokeWidth={1.5} />
    <div class="flex-1 min-w-0">
      <div class="text-[13px] font-semibold text-text">
        Transaction saved
      </div>
      <div class="text-xs text-text-muted mt-0.5">
        150.00 PLN added to Food & Groceries
      </div>
    </div>
    <button class="text-text-muted hover:text-text transition-colors flex-shrink-0 mt-0.5">
      <X size={16} strokeWidth={1.5} />
    </button>
  </div>
</div>
```

### Animations

```css
@keyframes slideInRight {
  from { transform: translateX(calc(100% + 20px)); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
@keyframes fadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

### Variants

| Variant | Lucide Icon | Icon Color | Use |
|---|---|---|---|
| Success | `CircleCheck` | `text-positive` | Successful actions (save, create, delete) |
| Error | `CircleX` | `text-negative` | Failed actions, server errors |
| Info | `Info` | `text-text-muted` | Informational notices |
| Warning | `TriangleAlert` | `text-warning` | Non-critical warnings |

All variants use `bg-surface border border-border rounded-sm`. No shadows.

### Specs

| Property | Value |
|---|---|
| Position | Fixed, `top: 20px`, `right: 20px` |
| Z-index | `toast` (600) |
| Max width | `360px` |
| Padding | `12px 16px` (`px-4 py-3`) |
| Radius | `4px` (`rounded-sm`) |
| Shadow | **None** — `border border-border` only |
| Border | 1px, `--color-border` (`#E5E5E5`) |
| Title font | Geist, 13px, semibold |
| Body font | Geist, 12px, `text-text-muted` |
| Default duration | **2000ms** — configurable via `UserPreferences` (1s / 2s / 3s / 5s / persistent) |
| Max visible | **3** — older ones fade out |
| Gap between toasts | `8px` (`gap-2`) |
| Enter animation | `slideInRight` 150ms ease-out |
| Exit animation | `fadeOut` 100ms ease-in |
| Hover | Pause auto-dismiss timer while mouse is over |
| On mobile | Full width, `top: 12px`, `left: 12px`, `right: 12px` |

---

## 5. Dropdown & Menu

Floating panels below a trigger. Used for context selectors, category pickers, action menus.

### Structure

```html
<div class="absolute top-full mt-1 left-0 w-56
            bg-surface border border-border rounded-sm
            py-1 z-dropdown
            animate-[fadeIn_100ms_ease-out]
            overflow-hidden">

  <!-- Search (render when list has > 5 items) -->
  <div class="px-2 pb-1">
    <input class="w-full bg-background border border-border rounded-none px-2 py-1.5
                  text-xs font-mono text-text
                  focus:border-border-focus focus:outline-none
                  placeholder:text-text-muted/50"
           placeholder="Search…"/>
  </div>

  <!-- Group label -->
  <div class="font-mono text-[10px] uppercase tracking-wider text-text-muted/60 px-3 py-1.5">
    Workspaces
  </div>

  <!-- Item: selected -->
  <button class="w-full flex items-center gap-2.5 px-3 h-8 text-left
                 text-[13px] text-text font-medium
                 bg-surface-hover transition-colors">
    <Home size={14} strokeWidth={1.5} class="text-text-muted" />
    <span class="flex-1 truncate">Home</span>
    <Check size={14} strokeWidth={1.5} class="text-primary" />
  </button>

  <!-- Item: unselected -->
  <button class="w-full flex items-center gap-2.5 px-3 h-8 text-left
                 text-[13px] text-text
                 hover:bg-surface-hover transition-colors">
    <Building2 size={14} strokeWidth={1.5} class="text-text-muted" />
    <span class="flex-1 truncate">Business</span>
  </button>

  <!-- Divider between groups -->
  <div class="h-px bg-border my-1 mx-2"></div>

  <!-- Destructive action -->
  <button class="w-full flex items-center gap-2.5 px-3 h-8 text-left
                 text-[13px] text-negative hover:bg-negative-bg transition-colors">
    <Trash2 size={14} strokeWidth={1.5} />
    <span>Delete workspace</span>
  </button>
</div>
```

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Specs

| Property | Value |
|---|---|
| Background | `bg-surface` (`#FFFFFF`) |
| Border | `border border-border` (1px, `#E5E5E5`) |
| Radius | `4px` (`rounded-sm`) |
| Shadow | **None** — border only |
| Vertical padding | `4px` (`py-1`) |
| Max height | `280px`, `overflow-y: auto` |
| Min width | Trigger width or `224px` minimum (`w-56`) |
| Item height | `32px` (`h-8`) |
| Item font | Geist, 13px (`text-[13px]`) |
| Item icon | Lucide, 14px, 1.5px stroke, `text-text-muted` |
| Item hover | `bg-surface-hover` (`#F5F5F5`) |
| Selected item | `bg-surface-hover` bg + `Check` icon in `text-primary` |
| Group label | JetBrains Mono, 10px, UPPERCASE, `text-text-muted/60` |
| Group divider | `bg-border`, 1px, `4px` horizontal margin (`mx-2`) |
| Destructive items | `text-negative` text, `hover:bg-negative-bg` |
| Search | Show when list has > 5 items |
| Open animation | `fadeIn` 100ms ease-out |
| Close | Instant — no animation |
| Dismiss | Click outside, `Escape` key, or item selection |
| On mobile | Render as bottom sheet |

---

## 6. Z-Index Scale

Never use arbitrary `z-index` values — always reference this scale.

| Token | Value | Use |
|---|---|---|
| `z-base` | `0` | Default document flow |
| `z-dropdown` | `100` | Dropdowns, popovers, context menus |
| `z-sticky` | `200` | Sticky table headers, floating toolbars |
| `z-sidebar` | `300` | Sidebar navigation |
| `z-bottom-nav` | `300` | Bottom navigation (mobile) — never coexists with sidebar |
| `z-topbar` | `400` | Top bar |
| `z-modal-backdrop` | `500` | Modal overlay/backdrop |
| `z-modal` | `510` | Modal panel content |
| `z-toast` | `600` | Toast notifications — visible above modals |
| `z-tooltip` | `700` | Tooltips — always topmost |

```css
:root {
  --z-dropdown:       100;
  --z-sticky:         200;
  --z-sidebar:        300;
  --z-bottom-nav:     300;
  --z-topbar:         400;
  --z-modal-backdrop: 500;
  --z-modal:          510;
  --z-toast:          600;
  --z-tooltip:        700;
}
```

---

## 7. Tooltips

Small floating labels on hover/focus. Used for collapsed sidebar icons, icon-only buttons, truncated text.

### Structure

```html
<div class="relative group">
  <button>
    <LayoutDashboard size={14} strokeWidth={1.5} />
  </button>

  <div class="absolute left-full ml-2 top-1/2 -translate-y-1/2
              bg-text text-surface
              font-mono text-[10px] font-medium
              px-2 py-1 rounded-sm whitespace-nowrap
              z-tooltip
              opacity-0 group-hover:opacity-100
              transition-opacity delay-[400ms]
              pointer-events-none">
    Dashboard
    <!-- Arrow pointing left -->
    <div class="absolute right-full top-1/2 -translate-y-1/2
                border-t-[4px] border-b-[4px] border-r-[4px]
                border-t-transparent border-b-transparent border-r-text">
    </div>
  </div>
</div>
```

### Specs

| Property | Value |
|---|---|
| Background | `--color-text` (`#171717`) — inverted |
| Text | `--color-surface` (`#FFFFFF`) — inverted |
| Font | JetBrains Mono, 10px, medium |
| Radius | `4px` (`rounded-sm`) |
| Padding | `4px 8px` (`px-2 py-1`) |
| Arrow | `4px` CSS border triangle, `border-r-text` |
| Show delay | `400ms` |
| Hide delay | `0ms` — instant |
| Max width | `200px` |
| Z-index | `700` (`z-tooltip`) |
| Animation | Opacity, `100ms` |
| Shadow | **None** — border not needed (opaque inverted bg) |
| Placement | Right of trigger (sidebar). Flip if viewport-clipped. |

### When to Use / Not Use

| Use | Don't use |
|---|---|
| Collapsed sidebar icons (tablet) | Elements with visible text labels |
| Icon-only buttons | On mobile (no hover state) |
| Truncated text | For content that needs to be interactive |
| Abbreviations | |

---

## 8. Scrollbar Styling

Custom thin scrollbars for all scrollable containers. Hidden on mobile (touch scrolling only).

```css
/* Apply to all scrollable containers (modal bodies, dropdowns, long lists) */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(229, 229, 229, 0.4) transparent;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(229, 229, 229, 0.4);
  border-radius: 0; /* rounded-none */
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(229, 229, 229, 0.7);
}

/* Dark mode */
.dark .scrollbar-thin {
  scrollbar-color: rgba(51, 51, 51, 0.5) transparent;
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(51, 51, 51, 0.5);
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(51, 51, 51, 0.7);
}

/* Hide scrollbar entirely — for mobile, horizontal scroll areas */
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

| Property | Value |
|---|---|
| Width | `6px` |
| Track | Transparent |
| Thumb | `--color-border` (`#E5E5E5`) at 40% opacity |
| Thumb hover | `--color-border` at 70% opacity |
| Thumb radius | `0px` (`rounded-none`) — sharp edges |
| Apply to | Modal bodies, dropdown lists, sidebar overflow, long tables |
| Mobile | Use `scrollbar-none` — rely on native touch scrolling |

---

## 9. Keyboard Navigation & Focus Management

### Focus Ring

All interactive elements use the Architectural Ledger focus style:

```css
:focus-visible {
  outline: 2px solid var(--color-border-focus); /* #171717 */
  outline-offset: 2px;
  border-radius: inherit;
}
```

### General Rules

| Rule | Detail |
|---|---|
| Tab order | Follows visual left-to-right, top-to-bottom reading order |
| Focus style | `2px solid border-focus` (`#171717`), `2px offset` (defined in `README.md`) |
| Skip link | First focusable element: "Skip to content" link, visually hidden until focused |
| Route change | Move focus to the page `<h1>` on navigation — prevents focus from getting lost |
| No focus trap on page | Only trap focus inside modals and dialogs |

### Modal Focus Trap

When a modal opens:

1. Record which element was focused before the modal opened
2. Move focus to the first focusable element inside the modal (or the close button)
3. Trap `Tab` / `Shift+Tab` within the modal — wrap at boundaries
4. `Escape` closes the modal
5. On close, restore focus to the previously focused element

### Dropdown / Menu Keyboard

| Key | Action |
|---|---|
| `Enter` / `Space` | Open dropdown; select highlighted item |
| `ArrowDown` | Highlight next item |
| `ArrowUp` | Highlight previous item |
| `Home` | Jump to first item |
| `End` | Jump to last item |
| `Escape` | Close dropdown, return focus to trigger |
| Any letter | Type-ahead — jump to item starting with that character |

### Form Keyboard

| Key | Action |
|---|---|
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Enter` | Submit form (when on last field or submit button) |
| `Escape` | Close containing modal (if in a modal) |

### Table Keyboard

| Key | Action |
|---|---|
| `ArrowDown` / `ArrowUp` | Move row highlight |
| `Enter` | Open detail/edit modal for highlighted row |
| `Delete` / `Backspace` | Open delete confirmation for highlighted row |
| `Escape` | Clear row selection |

---

## 10. File Upload & Download

### Upload Zone

For import flows (categories, transactions, etc.).

```html
<!-- Drop zone: idle -->
<div class="border-2 border-dashed border-border rounded-sm p-8
            flex flex-col items-center gap-3 text-center transition-colors
            hover:border-primary/30 hover:bg-surface-hover">
  <Upload size={36} strokeWidth={1.5} class="text-text-muted/40" />
  <div>
    <p class="text-[13px] font-semibold text-text">
      Drop your file here or <button class="text-primary font-semibold underline">browse</button>
    </p>
    <p class="text-xs text-text-muted mt-1">JSON files only, max 5 MB</p>
  </div>
</div>

<!-- Drop zone: active drag -->
<div class="border-2 border-dashed border-primary rounded-sm p-8
            bg-surface-hover flex flex-col items-center gap-3 text-center">
  <Upload size={36} strokeWidth={1.5} class="text-primary/60" />
  <p class="text-[13px] font-semibold text-primary">Drop to upload</p>
</div>

<!-- Upload progress -->
<div class="bg-surface border border-border rounded-sm p-4 flex items-center gap-3">
  <FileText size={20} strokeWidth={1.5} class="text-primary" />
  <div class="flex-1 min-w-0">
    <div class="text-[13px] text-text truncate">transactions-export.json</div>
    <div class="h-1 bg-surface-muted mt-2 overflow-hidden">
      <div class="h-full bg-primary transition-all" style="width: 65%"></div>
    </div>
  </div>
  <button class="text-text-muted hover:text-text transition-colors">
    <X size={16} strokeWidth={1.5} />
  </button>
</div>
```

| Property | Value |
|---|---|
| Border (idle) | `2px dashed`, `--color-border` (`#E5E5E5`) |
| Border (active drag) | `2px dashed`, `--color-primary` (`#171717`) |
| Radius | `4px` (`rounded-sm`) |
| Icon | Lucide `Upload`, 36px, `strokeWidth={1.5}`, `text-text-muted/40` |
| Accepted types | Display in muted helper text (e.g., "JSON files only, max 5 MB") |
| Progress bar track | `bg-surface-muted` (`#E5E5E5`), 1px height (`h-1`), `rounded-none` |
| Progress bar fill | `bg-primary` (`#171717`), `rounded-none` |
| Success | Replace zone with filename + toast success notification |
| Error | Toast error + "Try again" link in the zone |
| Shadow | **None** — borders only |

### Download

Downloads use button triggers + toast feedback:

| Step | Feedback |
|---|---|
| Click "Export" | Info toast: "Preparing export..." |
| File ready | Browser download starts + success toast: "Export complete" |
| Error | Error toast with retry action |

---

## 11. Stepper / Wizard

For multi-step flows (copy budget period, complex imports). Maximum **4 steps** — if more are needed, simplify the flow.

```html
<!-- Step indicator -->
<div class="flex items-center gap-2 mb-6">
  <!-- Completed step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 bg-primary flex items-center justify-center rounded-none">
      <Check size={14} strokeWidth={1.5} class="text-surface" />
    </div>
    <span class="font-mono text-[11px] font-semibold text-primary hidden sm:inline">Source</span>
  </div>

  <div class="flex-1 h-px bg-primary max-w-[48px]"></div>

  <!-- Current step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 border border-border-focus flex items-center justify-center rounded-none">
      <span class="font-mono text-[11px] font-bold text-text">2</span>
    </div>
    <span class="font-mono text-[11px] font-semibold text-text hidden sm:inline">Options</span>
  </div>

  <div class="flex-1 h-px bg-border max-w-[48px]"></div>

  <!-- Future step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 border border-border flex items-center justify-center rounded-none">
      <span class="font-mono text-[11px] font-bold text-text-muted">3</span>
    </div>
    <span class="font-mono text-[11px] text-text-muted hidden sm:inline">Review</span>
  </div>
</div>

<!-- Step content -->
<div class="min-h-[200px]">
  <!-- current step's form / content -->
</div>

<!-- Step navigation -->
<div class="flex justify-between pt-4">
  <button class="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium
                 hover:bg-surface-hover transition-colors">
    Back
  </button>
  <button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium
                 hover:bg-primary-hover transition-colors">
    Continue
  </button>
</div>
```

### Step States

| State | Dot | Connector | Label |
|---|---|---|---|
| Completed | `bg-primary` fill + `Check` icon (white) | `bg-primary` line (`h-px`) | `text-primary` text |
| Current | `border border-border-focus` + number | — | `text-text` text |
| Future | `border border-border` + number | `bg-border` line (`h-px`) | `text-text-muted` text |

| Property | Value |
|---|---|
| Dot size | `28px` square (`h-7 w-7`), `rounded-none` |
| Number font | JetBrains Mono, 11px, bold |
| Label font | JetBrains Mono, 11px, semibold |
| Connector | `1px` height (`h-px`), `max-width: 48px` |
| Labels | Hidden on mobile (`hidden sm:inline`) — dots only |
| Navigation | Back (secondary with border) left, Continue (primary flat) right |
| Last step | "Continue" label changes to "Confirm" or "Finish" |
| Max steps | **4** — rethink the UX if more are needed |
| Radius | `rounded-none` — sharp squares, not circles |
| Shadow | **None** |
