# UI Patterns

> Motion, empty states, loading/skeleton, toasts, dropdowns, z-index scale, tooltips.

---

## Motion & Transitions

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
| Hover (color/bg) | `150ms` | `ease` | `background, color` |
| Button press (scale) | `80ms` | `ease` | `transform` |
| Toast enter | `150ms` | `ease-out` | `transform, opacity` |
| Toast exit | `100ms` | `ease-in` | `opacity` |
| Focus ring | `100ms` | `ease` | `box-shadow` |
| Sidebar collapse | `150ms` | `ease-standard` | `width` |
| Page/screen change | `0ms` | — | Instant swap, no animation |

### Rules

- **Maximum duration: 200ms.** No UI transition may exceed this.
- No entrance animations on initial page load — content appears instantly.
- Prefer `transform` + `opacity` over layout-triggering properties (`width`, `height`, `top`).
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

## Empty States

Appear when a page or section has no data. Must feel intentional, not broken.

### Layout

```html
<div class="flex flex-col items-center justify-center py-16 text-center">
  <!-- Option A: Material Symbol icon (simple) -->
  <span class="material-symbols-outlined text-outline/30" style="font-size:48px">
    receipt_long
  </span>

  <!-- Option B: SVG illustration (richer, max 120px height) -->
  <!-- <img src="/illustrations/empty-transactions.svg" class="h-[120px] w-auto opacity-60"/> -->

  <h3 class="font-headline text-sm font-semibold text-on-surface-variant mt-4">
    No transactions yet
  </h3>
  <p class="font-body text-[13px] text-outline mt-1.5 max-w-[280px] leading-relaxed">
    Add your first transaction to start tracking your spending.
  </p>
  <button class="mt-5 bg-gradient-to-br from-primary to-primary-dim text-on-primary
                 px-4 py-2 rounded-lg text-[13px] font-semibold
                 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
    Add Transaction
  </button>
</div>
```

### Specs

| Property | Value |
|---|---|
| Container | Centered horizontally and vertically within its parent |
| Vertical padding | `64px` top and bottom |
| Icon (Option A) | Material Symbols Outlined, 48px, `outline` color at 30% opacity |
| Illustration (Option B) | SVG, max `120px` height, brand colors at reduced opacity |
| Heading | Geist, 14px, semibold, `on-surface-variant` |
| Description | Geist, 13px, `outline`, max-width `280px`, `leading-relaxed` |
| CTA button | Primary button variant, `20px` top margin |

### Per-Page Text

| Page | Icon | Heading | Description |
|---|---|---|---|
| Transactions | `receipt_long` | No transactions yet | Add your first transaction to start tracking your spending. |
| Planned | `event_note` | No planned transactions | Schedule recurring or future transactions here. |
| Categories | `category` | No categories | Create categories to organize your transactions. |
| Budgets | `savings` | No budgets set | Set budgets for your categories to track spending limits. |
| Exchanges | `currency_exchange` | No currency exchanges | Record exchanges between your currencies here. |
| Periods | `calendar_month` | No budget periods | Create a period to start budgeting. |
| Members | `group` | Just you for now | Invite team members to collaborate on this workspace. |

### SVG Illustration Style Guide

- Colors: `primary`, `primary-container`, `secondary-container`, `surface-container-low` only
- Opacity: 40–60% to keep illustrations subdued
- Stroke: 1.5px, matching Material Symbols weight
- No gradients or complex shading — flat shapes only
- Abstract/geometric style, not literal or cartoonish
- Max `120px` height, responsive width

---

## Loading & Skeleton States

Use shimmer placeholders matching content shape. Never show a raw spinner for page-level loads.

### Shimmer Animation

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #f3f4f3 25%,
    #e6e9e8 37%,
    #f3f4f3 63%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

/* Dark mode */
.dark .skeleton {
  background: linear-gradient(
    90deg,
    #1a1d20 25%,
    #2c3033 37%,
    #1a1d20 63%
  );
  background-size: 200% 100%;
}
```

### Skeleton Shapes by Component

```html
<!-- Balance card skeleton -->
<div class="bg-surface-container-lowest rounded-md p-4 shadow-sm">
  <div class="skeleton h-3 w-10 mb-2"></div>
  <div class="skeleton h-6 w-24 mb-3"></div>
  <div class="grid grid-cols-2 gap-2">
    <div class="skeleton h-3 w-16"></div>
    <div class="skeleton h-3 w-16"></div>
    <div class="skeleton h-3 w-14"></div>
    <div class="skeleton h-3 w-14"></div>
  </div>
</div>

<!-- Table row skeleton -->
<tr style="height: 40px">
  <td class="px-4"><div class="skeleton h-3 w-20"></div></td>
  <td class="px-4"><div class="skeleton h-3 w-32"></div></td>
  <td class="px-4"><div class="skeleton h-4 w-16 rounded-full"></div></td>
  <td class="px-4 text-right"><div class="skeleton h-3 w-24 ml-auto"></div></td>
</tr>

<!-- Modal form skeleton (for modals that load data asynchronously) -->
<div class="space-y-4 px-6 py-2">
  <div>
    <div class="skeleton h-2.5 w-16 mb-2"></div>
    <div class="skeleton h-10 w-full rounded-lg"></div>
  </div>
  <div>
    <div class="skeleton h-2.5 w-20 mb-2"></div>
    <div class="skeleton h-10 w-full rounded-lg"></div>
  </div>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <div class="skeleton h-2.5 w-14 mb-2"></div>
      <div class="skeleton h-10 w-full rounded-lg"></div>
    </div>
    <div>
      <div class="skeleton h-2.5 w-12 mb-2"></div>
      <div class="skeleton h-10 w-full rounded-lg"></div>
    </div>
  </div>
</div>
```

### Rules

| Rule | Detail |
|---|---|
| Delay threshold | Don't show skeletons if data loads in < `300ms` |
| Row count | Show 5–8 skeleton rows for table loading |
| Card count | Match the expected number of real cards |
| Shape fidelity | Shapes must approximate real content dimensions |
| No spinner fallback | Never fall back to a centered spinner |
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

## Toast Notifications

Transient, non-blocking feedback for user actions.

### Layout

```html
<div class="fixed top-5 right-5 z-toast flex flex-col gap-2 pointer-events-none"
     style="max-width: 360px">

  <div class="bg-surface-container-lowest rounded-md shadow-lg
              px-4 py-3 flex items-start gap-3
              pointer-events-auto
              animate-[slideInRight_150ms_ease-out]">
    <span class="material-symbols-outlined text-positive flex-shrink-0" style="font-size:20px">
      check_circle
    </span>
    <div class="flex-1 min-w-0">
      <div class="font-headline text-[13px] font-semibold text-on-surface">
        Transaction saved
      </div>
      <div class="font-body text-[12px] text-on-surface-variant mt-0.5">
        150.00 PLN added to Food & Groceries
      </div>
    </div>
    <button class="text-outline hover:text-on-surface transition-colors flex-shrink-0 mt-0.5">
      <span class="material-symbols-outlined" style="font-size:16px">close</span>
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

| Variant | Icon | Icon Color | Use |
|---|---|---|---|
| Success | `check_circle` | `positive` | Successful actions (save, create, delete) |
| Error | `error` | `negative` | Failed actions, server errors |
| Info | `info` | `primary` | Informational notices |
| Warning | `warning` | `#f59e0b` | Non-critical warnings |

All variants use `surface-container-lowest` background.

### Specs

| Property | Value |
|---|---|
| Position | Fixed, `top: 20px`, `right: 20px` |
| Z-index | `toast` (600) |
| Max width | `360px` |
| Padding | `12px 16px` |
| Radius | `8px` |
| Shadow | `0 8px 32px rgba(75,87,170,0.12), 0 2px 8px rgba(47,51,51,0.06)` |
| Title font | Geist, 13px, semibold |
| Body font | Geist, 12px, `on-surface-variant` |
| Default duration | **2000ms** — configurable via `UserPreferences` (1s / 2s / 3s / 5s / persistent) |
| Max visible | **3** — older ones fade out |
| Gap between toasts | `8px` |
| Enter animation | `slideInRight` 150ms ease-out |
| Exit animation | `fadeOut` 100ms ease-in |
| Hover | Pause auto-dismiss timer while mouse is over |
| On mobile | Full width, `top: 12px`, `left: 12px`, `right: 12px` |

---

## Dropdown & Menu

Floating panels below a trigger. Used for context selectors, category pickers, action menus.

### Structure

```html
<div class="absolute top-full mt-1 left-0 w-56
            bg-surface-container-lowest rounded-md
            shadow-[0_8px_32px_rgba(75,87,170,0.12),0_2px_8px_rgba(47,51,51,0.06)]
            py-1 z-dropdown
            animate-[fadeIn_100ms_ease-out]
            overflow-hidden">

  <!-- Search (render when list has > 5 items) -->
  <div class="px-2 pb-1">
    <input class="w-full bg-surface-container-low rounded-lg px-2.5 py-1.5
                  text-[12px] text-on-surface border-none outline-none
                  focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary-container
                  font-body placeholder:text-outline/50"
           placeholder="Search…"/>
  </div>

  <!-- Group label -->
  <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 px-3 py-1.5">
    Workspaces
  </div>

  <!-- Item: selected -->
  <button class="w-full flex items-center gap-2.5 px-3 h-9 text-left
                 text-[13px] text-on-surface font-medium
                 bg-primary-container/30 transition-colors">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:16px">home</span>
    <span class="flex-1 truncate">Home</span>
    <span class="material-symbols-outlined text-primary" style="font-size:16px">check</span>
  </button>

  <!-- Item: unselected -->
  <button class="w-full flex items-center gap-2.5 px-3 h-9 text-left
                 text-[13px] text-on-surface
                 hover:bg-surface-container-low transition-colors">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:16px">business</span>
    <span class="flex-1 truncate">Business</span>
  </button>

  <!-- Divider between groups -->
  <div class="h-px bg-[rgba(174,179,178,0.15)] my-1 mx-2"></div>

  <!-- Destructive action -->
  <button class="w-full flex items-center gap-2.5 px-3 h-9 text-left
                 text-[13px] text-error hover:bg-error/[0.05] transition-colors">
    <span class="material-symbols-outlined" style="font-size:16px">delete</span>
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
| Background | `surface-container-lowest` |
| Radius | `12px` |
| Shadow | `0 8px 32px rgba(75,87,170,0.12), 0 2px 8px rgba(47,51,51,0.06)` |
| Vertical padding | `4px` |
| Max height | `280px`, `overflow-y: auto` |
| Min width | Trigger width or `224px` minimum |
| Item height | `36px` |
| Item font | Geist, 13px |
| Item icon | 16px, `on-surface-variant` |
| Item hover | `surface-container-low` bg |
| Selected item | `primary-container/30` bg + `check` icon in `primary` |
| Group label | JetBrains Mono, 8px, UPPERCASE, `outline/60` |
| Group divider | `rgba(174,179,178,0.15)`, 1px, `4px` horizontal margin |
| Destructive items | `error` text, `error/5` hover bg |
| Search | Show when list has > 5 items |
| Open animation | `fadeIn` 100ms ease-out |
| Close | Instant — no animation |
| Dismiss | Click outside, `Escape` key, or item selection |
| On mobile | Render as bottom sheet |

---

## Z-Index Scale

Never use arbitrary `z-index` values — always reference this scale.

| Token | Value | Use |
|---|---|---|
| `z-base` | `0` | Default document flow |
| `z-dropdown` | `100` | Dropdowns, popovers, context menus |
| `z-sticky` | `200` | Sticky table headers, floating toolbars |
| `z-sidebar` | `300` | Sidebar navigation |
| `z-bottom-nav` | `300` | Bottom navigation (mobile) — never coexists with sidebar |
| `z-topbar` | `400` | Top bar (glassmorphism header) |
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

## Tooltips

Small floating labels on hover/focus. Used for collapsed sidebar icons, icon-only buttons, truncated text.

### Structure

```html
<div class="relative group">
  <button>
    <span class="material-symbols-outlined">dashboard</span>
  </button>

  <div class="absolute left-full ml-2 top-1/2 -translate-y-1/2
              bg-on-surface text-on-primary
              font-mono text-[10px] font-medium
              px-2 py-1 rounded-md whitespace-nowrap
              shadow-[0_2px_8px_rgba(47,51,51,0.20)]
              z-tooltip
              opacity-0 group-hover:opacity-100
              transition-opacity delay-[400ms]
              pointer-events-none">
    Dashboard
    <!-- Arrow pointing left -->
    <div class="absolute right-full top-1/2 -translate-y-1/2
                border-t-[4px] border-b-[4px] border-r-[4px]
                border-t-transparent border-b-transparent border-r-on-surface">
    </div>
  </div>
</div>
```

### Specs

| Property | Value |
|---|---|
| Background | `on-surface` (#2f3333 light / #e3e6e5 dark) |
| Text | `on-primary` (#f9f6ff light / #1a1c1e dark) |
| Font | JetBrains Mono, 10px, medium |
| Radius | `6px` |
| Padding | `4px 8px` |
| Arrow | `4px` CSS border triangle |
| Show delay | `400ms` |
| Hide delay | `0ms` — instant |
| Max width | `200px` |
| Z-index | `700` |
| Animation | Opacity, `100ms` |
| Placement | Right of trigger (sidebar). Flip if viewport-clipped. |

### When to Use / Not Use

| Use | Don't use |
|---|---|
| Collapsed sidebar icons (tablet) | Elements with visible text labels |
| Icon-only buttons | On mobile (no hover state) |
| Truncated text | For content that needs to be interactive |
| Abbreviations | |

---

## Scrollbar Styling

Custom thin scrollbars for all scrollable containers. Hidden on mobile (touch scrolling only).

```css
/* Apply to all scrollable containers (modal bodies, dropdowns, long lists) */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(174, 179, 178, 0.4) transparent;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(174, 179, 178, 0.4);
  border-radius: 3px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(119, 124, 123, 0.6);
}

/* Dark mode */
.dark .scrollbar-thin {
  scrollbar-color: rgba(74, 78, 77, 0.5) transparent;
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(74, 78, 77, 0.5);
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(141, 145, 143, 0.5);
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
| Thumb | `outline-variant` at 40% opacity |
| Thumb hover | `outline` at 60% opacity |
| Thumb radius | `3px` |
| Apply to | Modal bodies, dropdown lists, sidebar overflow, long tables |
| Mobile | Use `scrollbar-none` — rely on native touch scrolling |

---

## Keyboard Navigation & Focus Management

### General Rules

| Rule | Detail |
|---|---|
| Tab order | Follows visual left-to-right, top-to-bottom reading order |
| Focus style | `2px solid primary-container`, `2px offset` (defined in `README.md`) |
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

## File Upload & Download

### Upload Zone

For import flows (categories, transactions, etc.).

```html
<!-- Drop zone: idle -->
<div class="border-2 border-dashed border-outline-variant/30 rounded-xl p-8
            flex flex-col items-center gap-3 text-center transition-colors
            hover:border-primary/30 hover:bg-primary/[0.02]">
  <span class="material-symbols-outlined text-outline/40" style="font-size:36px">upload_file</span>
  <div>
    <p class="font-headline text-[13px] font-semibold text-on-surface">
      Drop your file here or <button class="text-primary font-semibold underline">browse</button>
    </p>
    <p class="font-body text-[12px] text-outline mt-1">JSON files only, max 5 MB</p>
  </div>
</div>

<!-- Drop zone: active drag -->
<div class="border-2 border-dashed border-primary rounded-xl p-8
            bg-primary/[0.05] flex flex-col items-center gap-3 text-center">
  <span class="material-symbols-outlined text-primary/60" style="font-size:36px">upload_file</span>
  <p class="font-headline text-[13px] font-semibold text-primary">Drop to upload</p>
</div>

<!-- Upload progress -->
<div class="bg-surface-container-lowest rounded-lg p-4 flex items-center gap-3">
  <span class="material-symbols-outlined text-primary" style="font-size:20px">description</span>
  <div class="flex-1 min-w-0">
    <div class="font-body text-[13px] text-on-surface truncate">transactions-export.json</div>
    <div class="h-1 bg-surface-container-low rounded-full mt-2 overflow-hidden">
      <div class="h-full bg-primary rounded-full transition-all" style="width: 65%"></div>
    </div>
  </div>
  <button class="text-outline hover:text-on-surface transition-colors">
    <span class="material-symbols-outlined" style="font-size:16px">close</span>
  </button>
</div>
```

| Property | Value |
|---|---|
| Border | `2px dashed`, `outline-variant` at 30% opacity |
| Active drag | `primary` border, `primary/5` bg |
| Icon | `upload_file`, 36px, `outline/40` |
| Accepted types | Display in muted helper text (e.g., "JSON files only, max 5 MB") |
| Progress bar | `primary` fill, `surface-container-low` track, `4px` height, `rounded-full` |
| Success | Replace zone with filename + toast success notification |
| Error | Toast error + "Try again" link in the zone |

### Download

Downloads use button triggers + toast feedback:

| Step | Feedback |
|---|---|
| Click "Export" | Info toast: "Preparing export..." |
| File ready | Browser download starts + success toast: "Export complete" |
| Error | Error toast with retry action |

---

## Stepper / Wizard

For multi-step flows (copy budget period, complex imports). Maximum **4 steps** — if more are needed, simplify the flow.

```html
<!-- Step indicator -->
<div class="flex items-center gap-2 mb-6">
  <!-- Completed step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
      <span class="material-symbols-outlined text-on-primary" style="font-size:16px">check</span>
    </div>
    <span class="font-mono text-[11px] font-semibold text-primary hidden sm:inline">Source</span>
  </div>

  <div class="flex-1 h-px bg-primary max-w-[48px]"></div>

  <!-- Current step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 rounded-full bg-primary-container flex items-center justify-center">
      <span class="font-mono text-[11px] font-bold text-on-primary-container">2</span>
    </div>
    <span class="font-mono text-[11px] font-semibold text-on-surface hidden sm:inline">Options</span>
  </div>

  <div class="flex-1 h-px bg-surface-container-high max-w-[48px]"></div>

  <!-- Future step -->
  <div class="flex items-center gap-2">
    <div class="h-7 w-7 rounded-full bg-surface-container-high flex items-center justify-center">
      <span class="font-mono text-[11px] font-bold text-outline">3</span>
    </div>
    <span class="font-mono text-[11px] text-outline hidden sm:inline">Review</span>
  </div>
</div>

<!-- Step content -->
<div class="min-h-[200px]">
  <!-- current step's form / content -->
</div>

<!-- Step navigation -->
<div class="flex justify-between pt-4">
  <button class="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg text-[13px] font-medium
                 hover:bg-surface-container transition-all">
    Back
  </button>
  <button class="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg
                 text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
    Continue
  </button>
</div>
```

### Step States

| State | Dot | Connector | Label |
|---|---|---|---|
| Completed | `primary` bg + `check` icon (white) | `primary` line | `primary` text |
| Current | `primary-container` bg + number | — | `on-surface` text |
| Future | `surface-container-high` bg + number | `surface-container-high` line | `outline` text |

| Property | Value |
|---|---|
| Dot size | `28px` circle |
| Number font | JetBrains Mono, 11px, bold |
| Label font | JetBrains Mono, 11px, semibold |
| Connector | `1px` height, `max-width: 48px` |
| Labels | Hidden on mobile (`hidden sm:inline`) — dots only |
| Navigation | Back (secondary) left, Continue (primary) right |
| Last step | "Continue" label changes to "Confirm" or "Finish" |
| Max steps | **4** — rethink the UX if more are needed |
