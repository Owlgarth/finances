# Components

> All UI component specs with the Architectural Ledger design system.
> For icon specs see the Icons section at the bottom. For responsive behaviour see `responsive.md`.

---

## 1. Sidebar

Fixed-width left navigation panel. No shadows, no container-low fills — only a right border defines the boundary.

```html
<aside class="fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex flex-col z-sidebar">

  <!-- Brand -->
  <div class="flex items-center justify-between px-4 h-12 shrink-0">
    Owlgarth Finances
    <button class="p-1 rounded-none text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Collapse sidebar">
      <PanelLeftClose size={14} />
    </button>
  </div>

  <!-- Selectors -->
  <div class="px-3 space-y-1 shrink-0 mb-2">
    <!-- Workspace selector (icon-only in the collapsed rail) -->
  </div>

  <!-- Divider -->
  <div class="border-t border-border mx-3 mb-2"></div>

  <!-- Nav links -->
  <nav class="flex-1 overflow-y-auto px-2">
    <!-- Search row (⌘K / Ctrl K) -->

    <!-- Active nav item -->
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
              bg-surface-hover border-l-2 border-primary text-text
              text-xs font-medium transition-colors">
      <LayoutDashboard size={14} />
      <span>Home</span>
    </a>

    <!-- Inactive nav item: Activity lights on /transactions, /planned
         and /transfers alike (pathname-prefix match) -->
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
              text-text-muted hover:text-text hover:bg-surface-hover
              text-xs transition-colors">
      <FileText size={14} />
      <span>Activity</span>
    </a>

    <!-- Accounts (Landmark): followed by up to six account sub-rows
         (name + balance), then a View-all link - expanded sidebar only -->

    <!-- Budgets (Wallet): followed by up to six budget sub-rows (name),
         then a View-all link - expanded sidebar only -->

    <!-- Bookmarks section: divider + the user's visible bookmarks + Manage -->
  </nav>

  <!-- Bottom section -->
  <div class="px-2 shrink-0 py-3 border-t border-border">
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
               text-text-muted hover:text-text hover:bg-surface-hover
               text-xs transition-colors">
      <Users size={14} />
      <span>Members</span>
    </a>
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
               text-text-muted hover:text-text hover:bg-surface-hover
               text-xs transition-colors">
      <Settings size={14} />
      <span>Settings</span>
    </a>
    <!-- User menu -->
  </div>
</aside>
```

### Properties

| Property | Value |
|---|---|
| Width | `240px` (`w-60`) fixed |
| Background | `bg-surface` (`#FFFFFF`) |
| Right border | `border-r border-border` (1px, `#E5E5E5`) |
| Brand text | Geist, 16px, weight 600, `text-text` |
| Nav item height | `32px` (`h-8`) |
| Nav label font | JetBrains Mono, 12px, uppercase, `tracking-wider` (`font-mono text-xs`) |
| Nav icon size | 14px, Lucide, 1.5px stroke |
| Active bg | `bg-surface-hover` (`#F5F5F5`) |
| Active indicator | 2px left border, `border-l-2 border-primary` |
| Active text | `text-text`, weight 500 |
| Inactive text | `text-text-muted` (`#737373`) |
| Inactive hover | `hover:text-text hover:bg-surface-hover` |
| Divider | `border-t border-border` between sections |
| Shadows | **None** — zero shadows |
| Nav destinations | Home (`LayoutDashboard`), Activity (`FileText`), Accounts (`Landmark`), Budgets (`Wallet`); footer rows Members (`Users`) and Settings (`Settings`) above the user menu |
| Activity coverage | One row lights on all of `/transactions`, `/planned` and `/transfers` - the active state derives from the live pathname prefix, not NavLink's own match |
| Sub-rows | Accounts and Budgets list up to six child rows beneath their item (account rows carry name + balance), then a View-all link; sub-rows render in the expanded sidebar only |
| Tablet (641–1024px) | Collapses to `56px` (`w-14`) — labels hidden, icons only |
| Mobile (≤640px) | Hidden entirely — replaced by Bottom Navigation |

> **Note (pending designer ruling):** the currency code beside an account balance is
> shown inconsistently across the two account surfaces. The sidebar's account sub-rows and
> the Dashboard balance list append the code only in multi-currency workspaces
> (`multiCurrency ? code : ''` in `Sidebar.tsx` / `Dashboard.tsx`); the Accounts page card
> inverts the ternary (`multiCurrency ? '' : code` in `AccountsPage.tsx`) - there the code
> follows the amount only in single-currency workspaces, and multi-currency workspaces
> show it as a badge chip in the card header instead. The surfaces deliberately differ
> pending a ruling; do not "fix" one to match the other without it.

### Context Selectors (Sidebar)

Compact workspace selector at the top of the sidebar, above nav items. Its glyph is `Home`; `Landmark` is reserved for Accounts (sidebar nav, bottom bar, account menu sheet). Icon-only in the collapsed rail.

```html
<!-- Workspace selector -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none
               hover:bg-surface-hover transition-colors text-left">
  <Home size={14} class="text-text-muted shrink-0" />
  <div class="flex-1 min-w-0">
    <div class="text-[11px] uppercase tracking-wider text-text-muted leading-tight">Workspace</div>
    <div class="text-xs font-medium text-text truncate">Home</div>
  </div>
  <ChevronDown size={12} class="text-text-muted shrink-0" />
</button>
```

| Property | Value |
|---|---|
| Position | Top of sidebar, below brand, above nav divider |
| Row height | `32px` |
| Micro-label | Geist 11px, uppercase, `tracking-wider`, `text-text-muted` |
| Value (Workspace) | Geist 12px, weight 500, `text-text` |
| Active state | `bg-surface-hover` background |
| Inactive hover | `bg-surface-hover` background |
| Icons | Lucide 14px, `text-text-muted` |
| Chevron | Lucide `ChevronDown` 12px, `text-text-muted` |

---

## 2. Page Header

Every page uses a compact single-row header with the page title and primary action. **Never use sizes above 16px for page titles** — the title is a navigational anchor, not a hero element.

```html
<div class="flex items-center justify-between h-8 mb-6">
  <div class="flex items-center gap-3">
    <!-- Context breadcrumb: JetBrains Mono, muted -->
    <span class="font-mono text-[11px] text-text-muted">
      Feb 2026 / Example Account
    </span>
    <!-- Separator -->
    <span class="text-text-muted">/</span>
    <!-- Page title -->
    <h1 class="text-base font-semibold text-text">Transactions</h1>
  </div>
  <!-- Page-level actions -->
  <div class="flex gap-2 items-center">
    <button class="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium
                   hover:bg-surface-hover transition-colors">
      Export
    </button>
    <button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium
                   hover:bg-primary-hover transition-colors flex items-center gap-1.5">
      <Plus size={14} />
      Add Transaction
    </button>
  </div>
</div>
```

### Properties

| Property | Value |
|---|---|
| Title font | Geist 16px, weight 600 (`text-base font-semibold`) |
| Title color | `text-text` |
| Row height | `32px` (`h-8`) for the action row |
| Bottom margin | `24px` (`mb-6`) before first content section |
| Breadcrumb | JetBrains Mono, 11px, `text-text-muted` |
| Breadcrumb content | `{Month} / {Account name} / {Page Title}` - the month label appears when the URL date range is an exact calendar month, the account name when exactly one account is filtered (the Activity pages' scope breadcrumb); budget detail breadcrumbs to the Budgets section, the periods page to its budget's name |
| Primary action | Flat primary button (see Buttons section) |
| Secondary actions | Secondary button variant |
| On mobile | Title and actions wrap; actions row sits below title |

---

## 3. Buttons

All buttons are flat — no gradients. Depth and hierarchy come from background color and border treatment.

### Primary Button

```html
<button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium
               hover:bg-primary-hover transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
  Save Transaction
</button>
```

| State | Background | Text |
|---|---|---|
| Default | `bg-primary` (`#171717`) | `text-white` |
| Hover | `bg-primary-hover` (`#262626`) | `text-white` |
| Active | `bg-primary-hover` | `text-white` |
| Disabled | `bg-primary` at 50% opacity | `text-white` at 50% opacity |
| Loading | Same as default + `disabled:cursor-not-allowed`; text changes to "-ing..." form |
| Focus | `outline: 2px solid border-focus; outline-offset: 2px` |

### Secondary Button

```html
<button class="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium
               hover:bg-surface-hover transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
  Cancel
</button>
```

| State | Background | Border | Text |
|---|---|---|---|
| Default | `bg-surface` | `border border-border` | `text-text` |
| Hover | `bg-surface-hover` | `border border-border` | `text-text` |
| Disabled | `bg-surface` at 50% opacity | `border border-border` | `text-text` at 50% opacity |

### Destructive Button

```html
<button class="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium
               hover:bg-negative-bg transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
  Delete
</button>
```

| State | Background | Border | Text |
|---|---|---|---|
| Default | `bg-surface` | `border-negative/30` | `text-negative` |
| Hover | `bg-negative-bg` (`#FEF2F2`) | `border-negative/30` | `text-negative` |
| Disabled | `bg-surface` at 50% opacity | `border-negative/30` | `text-negative` at 50% opacity |

### Action Icon Buttons

Small icon-only buttons for table row actions, toolbar controls, and inline actions.

```html
<!-- Standard action icon -->
<button class="p-1 text-text-muted hover:text-text hover:bg-surface-hover
               rounded-none transition-colors
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        aria-label="Edit">
  <Pencil size={14} />
</button>

<!-- Destructive action icon -->
<button class="p-1 text-text-muted hover:text-negative hover:bg-negative-bg
               rounded-none transition-colors"
        aria-label="Delete">
  <Trash2 size={14} />
</button>
```

| Context | Size | Color Default | Color Hover |
|---|---|---|---|
| Standard actions | Lucide 14px | `text-text-muted` | `hover:text-text` |
| Destructive actions | Lucide 14px | `text-text-muted` | `hover:text-negative` |
| Positive actions | Lucide 14px | `text-text-muted` | `hover:text-positive` |

### Button Specs Summary

| Variant | Padding | Radius | Font |
|---|---|---|---|
| Primary | `px-3 py-1.5` | `rounded-sm` | Geist 12px, weight 500 |
| Secondary | `px-3 py-1.5` | `rounded-sm` | Geist 12px, weight 500 |
| Destructive | `px-3 py-1.5` | `rounded-sm` | Geist 12px, weight 500 |
| Icon only | `p-1` | `rounded-none` | — |

**Loading state text patterns:** `"Saving..."`, `"Creating..."`, `"Updating..."`, `"Deleting..."`, `"Processing..."`, `"Copying..."`

**Rule:** Never use a gradient on any button. Primary buttons are flat `bg-primary` (`#171717`). Secondary buttons use a border. Destructive buttons use a colored border.

---

## 4. Form Inputs

### Standard Text Input

```html
<input class="w-full bg-surface border border-border rounded-none px-2 py-1.5
              font-mono text-xs text-text
              focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
              transition-colors
              placeholder:text-text-muted"
       type="text"
       placeholder="Enter value..." />
```

| State | Background | Border | Ring |
|---|---|---|---|
| Default | `bg-surface` | `border border-border` | None |
| Hover | `bg-surface` | `border border-border` | None |
| Focus | `bg-surface` | `border-border-focus` | `ring-1 ring-border-focus` |
| Error | `bg-negative-bg` | `border-negative` | `ring-1 ring-negative` |
| Disabled | `bg-surface-muted` | `border border-border` | None; `opacity-50` |

### Labels

```html
<label class="block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1">
  Amount <span class="text-negative">*</span>
</label>
```

| Property | Value |
|---|---|
| Font | Geist 11px, weight 500 |
| Case | Uppercase, `tracking-wider` |
| Color | `text-text-muted` |
| Spacing | `4px` (`mb-1`) above input |
| Required indicator | `*` in `text-negative` color, placed after label text |

### Info Hint (`common/InfoHint.tsx`)

Inline "?" hint icon placed after a form label, showing a short bubble of explanatory prose - the interactive counterpart to the passive hover tooltip in `patterns.md` §7. Props: `text` (plain prose only - the bubble renders no markup) and an optional `ariaLabel` for the button (defaults to `text`).

```html
<!-- Usage: inside the label, after the text (and any required *) -->
<label class="block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1">
  Lead days <InfoHint text="The planned transaction appears this many days before its due date. 0 means it appears on the due date itself." />
</label>

<!-- Rendered structure -->
<span class="relative inline-flex">
  <button type="button" aria-expanded="false" aria-describedby="{hintId}"
          class="inline-flex items-center justify-center p-1 -my-1 pointer-coarse:p-2 pointer-coarse:-my-2
                 rounded-none text-text-muted hover:text-text transition-colors touch-hit
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
    <HelpCircle size={13} strokeWidth={1.5} aria-hidden="true" />
  </button>
  <span role="tooltip" id="{hintId}"
        class="absolute left-0 top-full mt-1 z-tooltip w-max max-w-[240px] bg-text text-surface
               rounded-sm px-2 py-1.5 text-[11px] font-normal leading-relaxed
               transition-opacity duration-100 pointer-events-none opacity-0">
    The planned transaction appears this many days before its due date. 0 means it appears on the due date itself.
    <span aria-hidden="true"
          class="absolute -top-1 left-2 border-l-[4px] border-r-[4px] border-b-[4px]
                 border-l-transparent border-r-transparent border-b-text"></span>
  </span>
</span>
```

| Property | Value |
|---|---|
| Icon | Lucide `HelpCircle`, 13px, 1.5px stroke, `text-text-muted hover:text-text` |
| Layout invariant | The button's negative vertical margins (`-my-1`; `pointer-coarse:-my-2`) cancel its padding's share of the layout height, so its margin box stays 13px - the icon's size - on every device and never exceeds the label's line box. **A hint must never grow its label row**, or its input drops below its neighbor's |
| Hover | Hover-capable devices only. The mouse handlers are gated in JS on the `(hover: hover)` media query (not CSS `group-hover`), so a touch tap's sticky synthetic hover can never wedge the bubble open on touch - hybrid devices (touchscreen laptops) are both, and gating on pointer coarseness would break them |
| Click / tap | Click pins the bubble open (toggle); on touch the same tap toggles it. `touch-hit` expands the tap area 8px per side (the `responsive.md` recipe) without changing the visual size |
| Keyboard | `:focus-visible` shows the bubble; pointer taps never match it, so a tap-focus never stacks a focus bubble on the click toggle |
| Single open | Only one hint may be pinned at a time - pinning one closes whichever hint another instance had pinned |
| Escape | Capture-phase listener with `stopPropagation`: the first Escape closes only the hint (the enclosing modal's bubble-phase listener never sees it); the next Escape closes the modal |
| Outside tap | A `pointerdown` outside the wrapper closes the pinned hint - touch's dismissal path |
| Pin guard | On pin, the bubble runs `scrollIntoView({ block: 'nearest' })` to scroll the minimum needed to stay visible inside a capped scroll container (the mobile bottom sheet) instead of clipping |
| Bubble | Inverted per `patterns.md` §7: `bg-text text-surface`, `z-tooltip`, `rounded-sm px-2 py-1.5`, `max-w-[240px]` (`w-max` below that), Geist 11px `leading-relaxed` - prose styling, not the §7 tooltip's mono label |
| Bubble mounting | Always mounted, toggled with opacity (never `display`), so `aria-describedby` resolves and screen readers announce the hint together with the button; `pointer-events-none` lets taps pass through to the input beneath |
| Arrow | 4px CSS border triangle (`border-b-text`), 8px in from the bubble's left edge |

### Error State

```html
<div>
  <label class="block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1">
    Amount <span class="text-negative">*</span>
  </label>
  <input class="w-full bg-negative-bg border border-negative rounded-none px-2 py-1.5
                font-mono text-xs text-text
                ring-1 ring-negative
                focus:outline-hidden transition-colors" />
  <div class="flex items-center gap-1 mt-1">
    <AlertCircle size={12} class="text-negative shrink-0" />
    <span class="text-[11px] text-negative font-medium">Amount must be greater than 0</span>
  </div>
</div>
```

| Property | Value |
|---|---|
| Error input bg | `bg-negative-bg` (`#FEF2F2`) |
| Error input border | `border border-negative` |
| Error ring | `ring-1 ring-negative` |
| Error icon | Lucide `AlertCircle`, 12px, `text-negative` |
| Error text | Geist 11px, weight 500, `text-negative` |
| Error spacing | `4px` (`mt-1`) above error message |

### Select (Native)

```html
<select class="w-full bg-surface border border-border rounded-none px-2 py-1.5
               font-mono text-xs text-text
               focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
               transition-colors
               disabled:opacity-50">
  <option value="">Select category...</option>
  <option value="food">Food & Groceries</option>
</select>
```

Uses the same border treatment and focus styling as standard text inputs. See Section 6 for the custom Select/Dropdown component.

### Date Picker

A composite component — a read-only input that opens a calendar popup.

```html
<!-- Trigger input -->
<input class="w-full bg-surface border border-border rounded-none px-2 py-1.5
              font-mono text-xs text-text
              focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
              transition-colors cursor-pointer"
       readOnly
       placeholder="Select date..." />

<!-- Calendar popup -->
<div class="absolute z-dropdown mt-1 bg-surface border border-border rounded-sm p-3">
  <!-- Calendar content (react-day-picker) -->
</div>
```

| Property | Value |
|---|---|
| Trigger | Identical to standard input + `cursor-pointer` + `readOnly` |
| Popup background | `bg-surface` |
| Popup border | `border border-border rounded-sm` |
| Popup shadow | **None** — border only |
| Z-index | `z-dropdown` |

### Color Picker

```html
<div class="flex items-center gap-2">
  <input type="color"
         class="h-8 w-8 rounded-none border border-border cursor-pointer
                focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus" />
  <span class="font-mono text-xs text-text-muted">#171717</span>
</div>
```

Uses standard HTML `<input type="color">` with border treatment matching other inputs.

### Input Specs Summary

Heights are **enforced** by `controlHeightClass` (`min-h-8 pointer-coarse:min-h-[44px]`
in `components/common/formStyles.ts`): 32px base, 44px floor on coarse pointers.
The floor keys on `@media (pointer: coarse)` (custom `pointer-coarse:` variant
registered via `@custom-variant` in `src/index.css`), not viewport width, so
tablets and landscape phones above
`sm` keep full touch targets. Every control that can share a row — text inputs,
Select/MultiSelect triggers, date trigger, search input, buttons, Filters
toggle — composes it, so mixed rows (e.g. a Select next to a text input) always align.

| Element | Height | Padding | Radius |
|---|---|---|---|
| Text input | `32px` (44px touch) | `px-2 py-1.5` | `rounded-none` |
| Select trigger | `32px` (44px touch) | `px-2 py-1.5` | `rounded-none` |
| Date trigger | `32px` (44px touch) | `px-2 py-1.5` | `rounded-none` |
| Buttons (§3) | `32px` (44px touch) | `px-3 py-1.5` | `rounded-sm` |
| Color picker | `32px` | N/A | `rounded-none` |

### Validation Timing

| Event | Behavior |
|---|---|
| Initial render | No errors shown — fields are clean |
| On blur (first touch) | Validate the field; show error if invalid |
| On change (after first error) | Re-validate on every keystroke so errors clear quickly |
| On submit | Validate all fields; scroll to and focus the first invalid field |

---

## 5. Segmented Control

Replaces radio buttons for binary or ternary exclusive choices. Primary use: Expense / Income type selector in transaction forms.

```html
<div class="flex border border-border rounded-none overflow-hidden">
  <!-- Active segment (Expense) -->
  <button class="flex-1 py-1.5 text-xs font-medium transition-colors
                 bg-primary text-white">
    Expense
  </button>
  <!-- Inactive segment (Income) -->
  <button class="flex-1 py-1.5 text-xs font-medium transition-colors
                 bg-surface text-text-muted
                 hover:text-text hover:bg-surface-hover
                 border-l border-border">
    Income
  </button>
</div>
```

### Properties

| Property | Value |
|---|---|
| Container | `border border-border rounded-none` — sharp corners |
| Segment padding | `py-1.5` |
| Font | Geist 12px, weight 500 |
| Active background | `bg-primary` (`#171717`) |
| Active text | `text-white` |
| Inactive background | `bg-surface` |
| Inactive text | `text-text-muted` |
| Inactive hover | `hover:text-text hover:bg-surface-hover` |
| Segment divider | `border-l border-border` between segments |
| Transition | `transition-colors` only (no scale, no shadow) |
| Radius | `rounded-none` (0px) — no rounded corners anywhere |

### Color Variants for Active Segment

| Context | Active bg | Active text |
|---|---|---|
| Default / Expense | `bg-primary` | `text-white` |
| Income selected | `bg-positive` (`#059669`) | `text-white` |
| Neutral toggle | `bg-primary` | `text-white` |

**Rule:** Never use radio buttons for a binary choice that appears inside a modal or form. Always use the Segmented Control.

**Navigation instance - the Activity tab row:** `layout/ActivityTabs.tsx`, shared by the three activity routes (`/transactions`, `/planned`, `/transfers`), renders this register with `NavLink` segments instead of `SegmentedControl`: the active segment is the active route (Transactions / Planned / Transfers, labels from the `nav` catalog), segments add the 44px phone floor (`max-sm:min-h-[44px]`) and a focus ring, and a tab switch carries the current scope in the query string - `from`/`to` always when present, and the `account` filter as a comma list between the two list pages or as a single id to Transfers only when exactly one account is selected (the transfers filter holds one id); every other param stays behind. The control carries no width class (it sizes to its segments); the surrounding row - margins and space for future header actions - belongs to the page.

---

## 6. Select / Custom Dropdown

Styled dropdown trigger that replaces native `<select>`. Opens a floating panel with the same border treatment as all containers.

```html
<!-- Trigger: value selected -->
<div>
  <label class="block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1">
    Category <span class="text-negative">*</span>
  </label>
  <button class="w-full flex items-center justify-between
                 bg-surface border border-border rounded-none px-2 py-1.5
                 text-xs text-text text-left
                 hover:bg-surface-hover
                 focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
                 transition-colors">
    <div class="flex items-center gap-2 min-w-0">
      <span class="truncate">Food & Groceries</span>
    </div>
    <ChevronDown size={12} class="text-text-muted shrink-0 transition-transform" />
  </button>
</div>

<!-- Trigger: placeholder (nothing selected) -->
<button class="w-full flex items-center justify-between
               bg-surface border border-border rounded-none px-2 py-1.5
               text-xs text-text-muted text-left
               hover:bg-surface-hover
               focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
               transition-colors">
  <span>Select category...</span>
  <ChevronDown size={12} class="text-text-muted shrink-0 transition-transform" />
</button>

<!-- Dropdown panel -->
<div class="absolute z-dropdown mt-1 w-full
            bg-surface border border-border rounded-sm
            max-h-[280px] overflow-y-auto scrollbar-thin">
  <!-- Item -->
  <button class="w-full flex items-center gap-2 px-2 h-8 text-left
                 text-xs text-text
                 hover:bg-surface-hover transition-colors">
    <span class="truncate">Food & Groceries</span>
  </button>
  <!-- Selected item -->
  <button class="w-full flex items-center gap-2 px-2 h-8 text-left
                 text-xs text-text font-medium
                 bg-surface-muted transition-colors">
    <Check size={12} class="text-primary shrink-0" />
    <span class="truncate">Housing</span>
  </button>
  <!-- Group label -->
  <div class="px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">
    Common
  </div>
</div>
```

### Properties

| Property | Value |
|---|---|
| Trigger style | Identical to text inputs — same border, radius, height, focus |
| Trigger border | `border border-border rounded-none` |
| Placeholder | `text-text-muted` color |
| Selected value | `text-text` color |
| Chevron | Lucide `ChevronDown`, 12px, `text-text-muted`; rotates 180° when open (`transition-transform`) |
| Dropdown panel bg | `bg-surface` |
| Dropdown panel border | `border border-border rounded-sm` |
| Dropdown panel shadow | **None** — border only |
| Item height | `32px` (`h-8`) |
| Item font | Geist 12px |
| Item hover | `hover:bg-surface-hover` |
| Item selected | `bg-surface-muted`, bold, with check icon |
| Group label | Geist 10px, uppercase, `tracking-wider`, `text-text-muted` |
| Max height | `280px`, overflow with `scrollbar-thin` |
| Error state | Same error styling as text inputs |
| Keyboard | `Space`/`Enter` opens; `ArrowDown`/`ArrowUp` navigate; `Enter` selects; `Escape` closes |
| On mobile | Opens as a bottom sheet instead of floating dropdown |

---

## 7. Toggle / Switch

Binary on/off control. Use for settings and preferences — **never** use a checkbox for on/off toggles.

```html
<!-- Off state -->
<label class="inline-flex items-center gap-3 cursor-pointer">
  <button role="switch" aria-checked="false" aria-label="Dark mode"
          class="relative inline-flex h-5 w-9 items-center rounded-none
                 bg-surface-muted border border-border
                 transition-colors duration-150
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
    <span class="inline-block h-3.5 w-3.5 bg-white border border-border
                 translate-x-[3px] transition-transform duration-150"></span>
  </button>
  <span class="text-xs text-text">Dark mode</span>
</label>

<!-- On state -->
<label class="inline-flex items-center gap-3 cursor-pointer">
  <button role="switch" aria-checked="true" aria-label="Dark mode"
          class="relative inline-flex h-5 w-9 items-center rounded-none
                 bg-primary
                 transition-colors duration-150
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
    <span class="inline-block h-3.5 w-3.5 bg-white
                 translate-x-[19px] transition-transform duration-150"></span>
  </button>
  <span class="text-xs text-text">Dark mode</span>
</label>
```

### Properties

| State | Track Background | Track Border | Thumb |
|---|---|---|---|
| Off | `bg-surface-muted` (`#E5E5E5`) | `border border-border` | `bg-white border border-border`, left position (`translate-x-[3px]`) |
| Off hover | `bg-surface-hover` | `border border-border` | — |
| On | `bg-primary` (`#171717`) | None | `bg-white`, right position (`translate-x-[19px]`) |
| On hover | `bg-primary-hover` (`#262626`) | None | — |
| Disabled | `bg-surface-muted` at 50% opacity | `border border-border` | — |

| Property | Value |
|---|---|
| Track size | `36px × 20px` (`w-9 h-5`) |
| Track radius | `rounded-none` (0px) — sharp corners |
| Thumb size | `14px` (`h-3.5 w-3.5`) |
| Thumb radius | Full circle (`rounded-full`) — thumb remains circular |
| Transition | `150ms` for both track color and thumb position |
| Focus | `outline: 2px solid border-focus; outline-offset: 2px` |
| ARIA | `role="switch"`, `aria-checked`, `aria-label` required |
| Label | Geist 12px, `text-text`, `12px` gap (`gap-3`) |

---

## 8. Cards

All cards use 1px borders instead of shadows. No elevation hierarchy — all cards are flat `bg-surface` with `border border-border`.

### Standard Card

```html
<div class="bg-surface border border-border rounded-sm p-4">
  <!-- content -->
</div>
```

| Property | Value |
|---|---|
| Background | `bg-surface` (`#FFFFFF`) |
| Border | `border border-border` (1px, `#E5E5E5`) |
| Radius | `rounded-sm` (4px) |
| Padding | `12px` (`p-3`) or `16px` (`p-4`) |
| Hover | No hover effect on standard cards |
| Shadow | **None** |

### Account Card

Used for budget account selection in modals and inline selectors.

```html
<!-- Unselected -->
<button class="w-full p-4 rounded-sm text-left relative overflow-hidden
               bg-surface border border-border
               hover:bg-surface-hover transition-colors">
  <!-- Left color indicator -->
  <div class="absolute left-0 top-0 bottom-0 w-0.5"
       style="background-color: #4b57aa"></div>

  <!-- Icon + name -->
  <div class="flex items-center gap-3 mb-2 pl-2">
    <span class="text-base">🏦</span>
    <span class="text-sm font-medium text-text truncate">Example Account</span>
  </div>
  <!-- Description -->
  <p class="text-xs text-text-muted pl-2 line-clamp-2">Personal finances</p>
</button>

<!-- Selected -->
<button class="w-full p-4 rounded-sm text-left relative overflow-hidden
               bg-surface border-primary ring-1 ring-primary
               transition-colors">
  <!-- Left color indicator -->
  <div class="absolute left-0 top-0 bottom-0 w-0.5"
       style="background-color: #4b57aa"></div>

  <!-- Icon + name -->
  <div class="flex items-center gap-3 mb-2 pl-2">
    <span class="text-base">🏦</span>
    <span class="text-sm font-medium text-text truncate">Example Account</span>
  </div>
  <!-- Selected indicator -->
  <div class="absolute top-2 right-2">
    <Check size={14} class="text-primary" />
  </div>
</button>

<!-- Inactive / disabled -->
<button class="w-full p-4 rounded-sm text-left relative overflow-hidden
               bg-surface border border-border opacity-60 cursor-not-allowed">
  <!-- content -->
</button>
```

| Property | Value |
|---|---|
| Unselected | `bg-surface border border-border` |
| Selected | `border-primary ring-1 ring-primary` |
| Inactive | `opacity-60 cursor-not-allowed` |
| Left indicator | `2px` colored bar (`w-0.5`), absolute positioned |
| Radius | `rounded-sm` |
| Shadow | **None** |

### Balance Card

Compact design for per-currency balance displays. All financial data in JetBrains Mono.

```html
<div class="bg-surface border border-border rounded-sm p-4">
  <!-- Currency label + recalc action -->
  <div class="flex items-center justify-between mb-2">
    <span class="font-mono text-xs font-medium text-text">PLN</span>
    <button class="flex items-center gap-1 text-text-muted hover:text-text transition-colors
                   text-[10px] font-mono uppercase tracking-wider">
      <RefreshCw size={10} />
      Recalc
    </button>
  </div>

  <!-- Closing balance — always positive/negative color -->
  <div class="font-mono text-sm font-medium tabular-nums text-positive-text leading-none mb-3">
    1,786.20
  </div>

  <!-- Meta grid: show only rows with non-zero values -->
  <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
    <div>
      <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Income</div>
      <div class="font-mono text-xs font-medium tabular-nums text-positive-text">+6,500.00</div>
    </div>
    <div>
      <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Expenses</div>
      <div class="font-mono text-xs font-medium tabular-nums text-negative">-6,968.00</div>
    </div>
    <div>
      <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Opening</div>
      <div class="font-mono text-xs font-medium tabular-nums text-text">1,000.00</div>
    </div>
    <!-- Only render if value ≠ 0 -->
    <div>
      <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Exch In</div>
      <div class="font-mono text-xs font-medium tabular-nums text-text">+1,255.00</div>
    </div>
  </div>
</div>
```

| Property | Value |
|---|---|
| Container | `bg-surface border border-border rounded-sm p-4` |
| Grid layout | `repeat(auto-fill, minmax(180px, 1fr))`, gap `12px` (`gap-3`) |
| Closing balance | JetBrains Mono 14px, weight 500 — `text-positive-text` if > 0, `text-negative` if < 0 |
| Currency label | Geist 12px, weight 500, `text-text` |
| Meta labels | Geist 10px, uppercase, `tracking-wider`, `text-text-muted` |
| Meta values | JetBrains Mono 12px, weight 500, `tabular-nums` — semantic color only if sign matters |
| Omit zero rows | Do not render exchange rows when the value is zero or null |
| Shadow | **None** |

### Budget Category Card

Compact card for one budget category in the Budget page's phone layout
(`components/budgets/BudgetCategoryList.tsx`). The card body is a toggle that
selects the category for plan editing. Its bar and status row are the shared
`BudgetBar` (§9, "Budget Bars"); the fence below is the landed markup with the
plan-editing input branch and the event handlers left out.

```tsx
<div
  role="button"
  tabIndex={0}
  aria-pressed={isSelected}
  className={`bg-surface border rounded-sm p-3 cursor-pointer transition-colors ${isSelected ? 'border-border-focus' : 'border-border'}`}
>
  {/* Row 1 per the card spec: name left, spent-of-planned
      right, trailing chevron to the Activity list. Card body
      is the highlight toggle - inner controls stop
      propagation. */}
  <div className="flex items-start justify-between gap-2 mb-2">
    <span className="text-xs font-medium text-text min-w-0 truncate">{category.name}</span>
    <span className="flex items-center gap-1 shrink-0">
      <span className="font-mono text-xs font-medium tabular-nums text-text whitespace-nowrap">
        {formatAmount(actual)}{' '}
        <span className="text-[10px] text-text-muted">
          {t('detail.ofAmount', { amount: formatAmount(planned) })}
        </span>
      </span>
      <Link
        to={activityUrl}
        aria-label={t('detail.viewCategoryActivity', { name: category.name })}
        onClick={(e) => e.stopPropagation()}
        className={chevronLinkClass}
      >
        <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </span>
  </div>
  {/* Bar and status row: the shared bar owns the tick and
      the pace word; the status word and the figure are
      the card's, both in the status color. */}
  <BudgetBar
    spent={actual}
    planned={planned}
    fillClass={fillClassOf(status)}
    elapsed={paceElapsed}
    statusWord={statusWord}
    statusWordClass={statusColor}
    trailing={t('detail.amountLeft', { amount: formatAmount(remaining) })}
    trailingClass={statusColor}
    className="mb-1.5"
  />
</div>
```

**Bar status rules.** The card's own rule; the other three sites are listed in
§9. Near-limit text takes the warning text token: `color-warning` is never used
for text smaller than 24px on a light surface.

| Status | Word on the card | Bar color | Text color | Rule |
|---|---|---|---|---|
| On track | none; the group heading carries it | `bg-primary` | `text-text-muted` | under 75% of the plan |
| Near limit | Near limit | `bg-warning` | `text-warning-text` | 75% of the plan and up, without going over |
| Over | Over | `bg-negative` | `text-negative` | spent more than planned |

**Tick.** A 1px tick on the bar marks how much of the period has gone: the
elapsed share in whole days, today included (day 16 of a 30-day period is
53%). It shows on the current period only; a past or future period shows the
same bar with no tick. While the tick shows, the track is `role="img"` named
"53% of the period gone" (an integer percent). Without a tick it is
`aria-hidden="true"` and has no role. The name never says "ahead of pace":
the pace word is real text in the row.

**Pace word.** Spending is ahead of pace when the spent share is more than
five percentage points above the elapsed share. The row then says "Ahead of
pace"; the tick is never the only signal. The word never shows without the
tick: a past or future period never shows it, and neither does a category
with no plan. A tick can show on its own, when spending is not ahead.

**Status row.** One row under the bar, mono 10px uppercase, in two cells. Left:
the status word, a middle dot, the pace word ("Near limit · Ahead of pace").
Right: the site's figure, "50.00 left" on these cards. The status word and the
pace word share one color: the status color when a status word is present,
`text-text-muted` when the pace word stands alone. The row wraps by whole
phrase and never truncates: the figure drops to a second line, right-aligned,
when both cells do not fit.

| Property | Value |
|---|---|
| Container | `bg-surface border rounded-sm p-3 cursor-pointer transition-colors`; `border-border`, or `border-border-focus` while selected |
| Control | `role="button"`, `tabIndex={0}`, `aria-pressed`. The card body toggles the category's selection; inner controls stop propagation |
| Category name | Geist 12px, weight 500, `text-text`, `min-w-0 truncate` |
| Amount | JetBrains Mono 12px, weight 500, `tabular-nums`, `text-text`: spent, then "of planned" in 10px `text-text-muted` |
| Bar and status row | The shared `BudgetBar` (§9): `className="mb-1.5"`, the fill by the status table above, the status word and the figure both in the status color |
| Shadow | **None** |

### Card Specs Summary

| Card type | Padding | Radius | Border | Shadow |
|---|---|---|---|---|
| Standard | `p-3` or `p-4` | `rounded-sm` | `border border-border` | None |
| Account | `p-4` | `rounded-sm` | `border border-border` / `border-primary ring-1 ring-primary` (selected) | None |
| Balance | `p-4` | `rounded-sm` | `border border-border` | None |
| Budget Category | `p-3` | `rounded-sm` | `border border-border` | None |

---

## 9. The Ledger System (Tables)

Tables are the primary data display component. They follow a strict ledger aesthetic: 1px borders, zebra striping, fixed row heights, and sticky headers. Every financial amount uses JetBrains Mono.

### Table Container

```html
<div class="w-full min-w-0 border border-border rounded-sm">
  <table class="w-full border-collapse">
    <!-- thead, tbody -->
  </table>
</div>
```

| Property | Value |
|---|---|
| Container | `w-full min-w-0 border border-border rounded-sm` - no `overflow-hidden` (see note) |
| Table | `w-full border-collapse` |
| Outer border | 1px, `--color-border` (`#E5E5E5`) |
| Internal borders | `border-b border-border` on every `<tr>` (header + data) |
| Border radius | `rounded-sm` on container; corners finished at the cells (see note) |

The container must NOT carry `overflow-hidden`: `position: sticky` never engages
inside an `overflow: hidden` ancestor (the hidden box becomes the sticky's
scrollport and itself never scrolls), and the sticky thead is the functional
requirement (640-1023px scrolls long lists inside `<main>`). Corner handling
moves to the cells: the sticky header's top corners sit color-invisible
(`bg-background` header on the `bg-background` page), and the tbody's last row
carries `rounded-bl-sm` / `rounded-br-sm` on its end cells
(`[&_tr:last-child>td:first-child]:rounded-bl-sm
[&_tr:last-child>td:last-child]:rounded-br-sm` on the tbody) so the bottom
zebra corners do not bleed past the container. `min-w-0` is defense-in-depth:
squeezed beside a panel, the card can never push past its slot.

### Header Row

```html
<thead class="sticky top-0 z-sticky">
  <tr class="bg-background border-b border-border h-8">
    <th class="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left border-r border-border last:border-r-0">
      Description
    </th>
    <th class="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-right">
      Amount
    </th>
  </tr>
</thead>
```

| Property | Value |
|---|---|
| Position | `sticky top-0 z-sticky` — stays visible on scroll |
| Height | `32px` (`h-8`) |
| Background | `bg-background` (`#FAFAFA`) |
| Bottom border | `border-b border-border` |
| Font | Geist, 10px, weight 500, `uppercase`, `tracking-wider` |
| Text color | `text-muted` (`--color-text-muted`, `#737373`) |
| Cell borders | `border-r border-border` between columns (optional); none on last column |
| Alignment | Text: left; Amounts: `text-right`; Status/Actions: `text-center` |
| Padding | `px-3 py-1` |

### Sortable Header

```html
<th class="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left">
  <button class="flex items-center gap-1 hover:text-text transition-colors">
    Date
    <ChevronDown class="h-3.5 w-3.5 transition-transform" />
  </button>
</th>
```

The chevron icon rotates `180deg` when sort direction is ascending. Uses Lucide `ChevronDown` (not Material Symbols).

### Data Rows

```html
<tbody>
  <!-- Even rows -->
  <tr class="bg-surface border-b border-border h-8 hover:bg-surface-hover transition-colors">
    <td class="text-[13px] text-text px-3 py-1">Grocery Store</td>
    <td class="font-mono text-xs font-medium text-negative px-3 py-1 text-right tabular-nums">-84.20</td>
    <td class="px-3 py-1"><!-- chip component --></td>
  </tr>
  <!-- Odd rows (zebra stripe) -->
  <tr class="bg-background border-b border-border h-8 hover:bg-surface-hover transition-colors">
    <td class="text-[13px] text-text px-3 py-1">Salary</td>
    <td class="font-mono text-xs font-medium text-positive-text px-3 py-1 text-right tabular-nums">+6,500.00</td>
    <td class="px-3 py-1"><!-- chip component --></td>
  </tr>
</tbody>
```

| Property | Value |
|---|---|
| Row height | Floor via `h-8` on the `<tr>`: `height` acts as a MINIMUM in CSS table sizing (taller content still grows the row), and Chrome's automatic table layout ignores `min-height` on BOTH `<tr>` and `<td>` (measured - a computed 44px `min-height` left the row at its 33px content height), so never `min-h-*`. Coarse pointers get `pointer-coarse:h-[44px]`, and the stacked two-line narrow set `pointer-coarse:@max-[559.98px]:h-[52px]` (the transactions row floor: `h-8 pointer-coarse:h-[44px] pointer-coarse:@max-[559.98px]:h-[52px]`) |
| Zebra striping | `odd:bg-surface` (`#FFFFFF`) / `even:bg-background` (`#FAFAFA`) on interactive rows; the SELECTED row swaps to a mutually exclusive class string carrying `bg-surface-hover` alone - zebra pseudo-classes (`(0,2,0)`) out-cascade a plain bg utility, so a selected row must not also carry zebra classes |
| Selected border | Every row reserves `border-l-2 border-l-transparent`; the selected row swaps in `border-l-primary` - the 2px are always paid, so selection never shifts content |
| Row border | `border-b border-border` on every row |
| Hover | `hover:bg-surface-hover` (`#F5F5F5`) - emitted after `odd:`/`even:` in the sheet, so hover beats zebra |
| Transition | `transition-colors` |
| Text cells | Geist 13px, `text-text`, left-aligned |
| Amount cells | JetBrains Mono 12px, `text-right`, `tabular-nums`, semantic color |
| Positive amount | `text-positive-text` with `+` prefix |
| Negative amount | `text-negative` with `-` prefix |
| Neutral amount | `text-text` (no prefix) |
| Date cells | JetBrains Mono 12px, `text-text-muted` |
| Padding | `px-3 py-1` |

### Inputs Inside the Table (Intrinsic-Width Claims)

A table-hosted input must not feed the table's minimum width. Chrome's
automatic table layout counts an input's intrinsic width into its column's
floor: a native date input carries a browser-set ~130px claim no percentage
width or `min-width: 0` shrinks, and a bare `w-full` text input directly in a
cell contributes ~149px min-content. The idiom is a `w-0 min-w-full` wrapper:
the definite zero width shields the content from intrinsic sizing while
`min-width: 100%` restores the fill, so the input keeps filling whatever the
column gives it.

The wrapper also kills max-content, so a claim that should apply only in some
column sets is restored with container-query bands (the transactions add row):

- Date input - banded restore: `w-0 min-w-full @min-[560px]:w-auto
  @min-[560px]:min-w-0 @min-[760px]:w-0 @min-[760px]:min-w-full`. The claim is
  allowed only in the middle band (560-759 container px), where the table shows
  at most four columns; in the narrowest set (squeezed beside the panel) and in
  the widest set (where the data rows' full dates are narrower than the input's
  claim) the wrapper stays collapsed - letting the claim stand pushed the whole
  table past its card.
- Description input - no restore: `w-0 min-w-full` at every width. A text
  input's ~400px preference would re-pin the table at whatever width it was
  handed back, so it stays collapsed and spare column width redistributes
  through the table's own auto layout.

Data cells use the same wrapper for floor-carrying content: a `truncate` span
still counts its full text into the column floor, so the transactions
description cell wraps its first line in `w-0 min-w-full` with a
`@min-[760px]:w-auto @min-[760px]:min-w-0` restore (collapsed only in the
squeezed sets, byte-identical proportions at full width); the A/B second line
needs no restore (it is `display: none` from 760 up).

### Group Dividers (Date Banners)

Sticky date banners that separate transaction groups by date.

```html
<tr class="sticky top-8 z-sticky bg-background border-y border-border">
  <td colspan="99" class="px-3 py-1">
    <span class="font-mono text-[10px] font-medium text-text-muted uppercase tracking-wider">
      2026-02-15 · 3 transactions
    </span>
  </td>
</tr>
```

| Property | Value |
|---|---|
| Position | `sticky` with `top-8` (below header row) |
| Z-index | `z-sticky` — below header, above data rows |
| Background | `bg-background` (`#FAFAFA`) |
| Border | `border-y border-border` — top and bottom 1px lines |
| Font | JetBrains Mono, 10px, weight 500, `uppercase`, `tracking-wider` |
| Text color | `text-muted` |
| Colspan | `colspan="99"` to span full width |

### Status Chips (Budget Ledger)

The Budget page's desktop ledger has no bar. A row's status is a chip in the
sticky category cell, beside the category link, on two statuses only; an
on-track row has no chip. Status never relies on color: the word carries it.

```html
<!-- Over: spent more than planned -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none shrink-0 text-negative border-negative/20 bg-negative-bg">
  Over
</span>

<!-- Near limit: 75% of the plan and up, without going over -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none shrink-0 text-warning-text bg-surface border-border">
  Near limit
</span>
```

| Chip | Rule | Text color | Fill and border |
|---|---|---|---|
| Over | spent more than planned, compared in exact cents | `text-negative` | `bg-negative-bg`, `border-negative/20` |
| Near limit | 75% of the plan and up, without going over | `text-warning-text` | `bg-surface`, `border-border` |

### Budget Bars (the Shared `BudgetBar`)

The four 4px budget bars (the Budget page's phone cards and currency chips,
the Home widget, the transaction record) are one component,
`components/budgets/BudgetBar.tsx`. It renders the track and, when there is
something to show, one status row under it; both are `span`s, so the bar is
valid inside a `button`. The tick and the status-row grammar are in §8,
"Budget Category Card". The tables here are the markup and the per-site rules.

| Part | Spec |
|---|---|
| Track | `relative block w-full h-1 bg-surface-muted rounded-none`: 4px, sharp corners, and it never clips (no `overflow-hidden`). The site's own spacing arrives through `className` |
| Fill | `block h-full rounded-none transition-[width] duration-150` plus the site's `fillClass`. Its width is the spent share of the plan, clamped to 0 and 100, so an over-plan fill ends at the track's edge |
| Tick | `absolute -top-0.5 h-2 w-px bg-text`: 1px by 8px, in the text color, centered on the track (2px overhang above and below), drawn above the fill, at the elapsed share and on the track's last pixel at 100% |
| Why it overhangs | In light mode the primary fill equals the text color, and in dark mode the two are close, so a tick inside the track would vanish once the fill had passed it. For the same reason the track does not clip: the fill is clamped instead |
| Status row | `flex flex-wrap gap-x-2 text-[10px] font-mono font-medium uppercase tracking-wider`; each cell `whitespace-nowrap`, the figure `ml-auto` |
| Accessible name | With a tick: `role="img"`, `aria-label` "53% of the period gone". Without: `aria-hidden="true"` and no role. Never both |
| No plan | A plan of 0 gives an empty bar and no pace word. The tick is unaffected |

**The four sites.** Each site keeps its own fill rule and passes it as
`fillClass`; the bar never derives it. `spent` and `planned` are the API's exact
amount strings: the bar computes its own width, and the pace claim is exact.

| Site | Fill rule | Status word and text color | Right-hand figure | `className` |
|---|---|---|---|---|
| Budget page, phone cards (`components/budgets/BudgetCategoryList.tsx`) | `bg-primary` under 75%, `bg-warning` at 75% and up without going over, `bg-negative` over | Over in `text-negative`, Near limit in `text-warning-text`, none on track | "50.00 left" in the same status color | `mb-1.5` |
| Home widget (`components/dashboard/BudgetWidget.tsx`) | `bg-negative` when over, else `bg-warning`: every row shown is over or at 75% and up | Over in `text-negative`, Near limit in `text-warning-text` | the percent, `text-text-muted` in every state | `mb-1` |
| Budget page, currency chips (`pages/BudgetDetailPage.tsx`) | `bg-negative` at 95% and up, `bg-warning` at 75% and up, else `bg-primary` | none | none: the pace word alone, a caption in `text-text-muted` | none |
| Transaction record (`SpentOfPlanned` in `components/transactions/TransactionRecord.tsx`) | `bg-negative` at 95% and up, `bg-warning` at 75% and up, else `bg-primary` | none | none: the pace word alone, a caption in `text-text-muted` | `mt-1` |

Two site facts. A currency with no plan shows no bar in its chip. The phone
cards and the transaction record render the bar with or without a plan, so a
no-plan row shows the empty bar of the "No plan" row; the Home widget's
attention list filters no-plan rows out. In the record the tick follows the
transaction's own period, so a transaction dated in a past or future period
shows a plain bar.

### Table Footer (Totals Row)

```html
<tfoot>
  <tr class="bg-background border-t border-border h-8">
    <td class="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1">Total</td>
    <td class="font-mono text-xs font-medium text-text px-3 py-1 text-right tabular-nums">4,715.80</td>
  </tr>
</tfoot>
```

Pages whose table already established a column-label dialect and semantic column colors (e.g. the budget detail ledger's `text-[9px] tracking-widest` labels and `text-planned`/`text-actual`/`text-remaining` amounts) keep that dialect in their `tfoot` totals row instead of adopting this neutral form.

### Mobile Card Layout (Instead of Table)

On mobile (≤640px), tables convert to stacked cards:

```html
<div class="p-2 space-y-2 md:hidden">
  <div class="p-3 bg-surface border border-border rounded-sm">
    <!-- Header row -->
    <div class="flex justify-between items-start mb-2">
      <div>
        <div class="text-[13px] font-medium text-text">Grocery Store</div>
        <div class="font-mono text-[11px] text-text-muted">2026-02-15</div>
      </div>
      <div class="font-mono text-xs font-medium text-negative tabular-nums">-84.20</div>
    </div>
    <!-- Meta row -->
    <div class="flex justify-between items-center">
      <div class="font-mono text-[11px] text-text-muted">PLN</div>
      <!-- chip -->
    </div>
  </div>
</div>
```

| Property | Value |
|---|---|
| Card | `bg-surface border border-border rounded-sm p-3` |
| Spacing | `space-y-2` between cards |
| Amount | JetBrains Mono, right-aligned, semantic color |
| Date | JetBrains Mono 11px, `text-muted` |

---

## 10. Chips & Tags

Chips are rectangular with 1px borders and 4px border-radius. **Never** use `rounded-full` (pill shape). All chips use JetBrains Mono at 10px, uppercase, with wider letter-spacing.

### Transaction Type Chips

```html
<!-- Income -->
<span class="inline-flex items-center px-2 py-0.5 border border-positive/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-positive-bg text-positive-text select-none">
  Income
</span>

<!-- Expense -->
<span class="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none">
  Expense
</span>
```

### Status Chips (Planned Transactions)

One chip for a planned item's status (`components/transactions/PlannedStatusChip.tsx`),
shared by the list row and the record so the two cannot disagree. The word
keeps the normal text color on every tint: color alone never carries the
meaning. Overdue is derived at render from the local date, never stored.

```html
<!-- Upcoming -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none bg-surface border-border text-text">
  Upcoming
</span>

<!-- Overdue -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none bg-warning-bg border-warning/20 text-text">
  Overdue
</span>

<!-- Paid -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none bg-positive-bg border-positive/20 text-text">
  Paid
</span>

<!-- Skipped -->
<span class="inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none bg-surface border-border text-text-muted">
  Skipped
</span>
```

| Status | When | Fill and border | Text color |
|---|---|---|---|
| Upcoming | pending and dated today or later | `bg-surface`, `border-border` | `text-text` |
| Overdue | pending and dated before today | `bg-warning-bg`, `border-warning/20` | `text-text` |
| Paid | status `done` | `bg-positive-bg`, `border-positive/20` | `text-text` |
| Skipped | status `cancelled` | `bg-surface`, `border-border` | `text-text-muted` |

### Role Badges

```html
<!-- Owner -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 border border-warning/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-warning-bg text-warning-text select-none">
  <Star class="h-3 w-3" />
  Owner
</span>

<!-- Admin -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none">
  <Shield class="h-3 w-3" />
  Admin
</span>

<!-- Member -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
  <User class="h-3 w-3" />
  Member
</span>

<!-- Viewer -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-background text-text-muted select-none">
  <Eye class="h-3 w-3" />
  Viewer
</span>
```

### Category Chips

```html
<span class="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none">
  Housing
</span>
```

### "You" Badge

```html
<span class="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
  You
</span>
```

### Chip Property Reference

| Property | Value |
|---|---|
| Shape | `rounded-sm` (4px) — **never** `rounded-full` |
| Border | `border border-border` or `border border-{semantic}/20` |
| Font | JetBrains Mono, 10px, weight 500 |
| Casing | `uppercase` |
| Letter spacing | `tracking-wider` |
| Padding | `px-2 py-0.5` |
| Selection | `select-none` |

---

## 11. Modals

Overlay panels for focused tasks — forms, confirmations, detail views. Zero shadows, 1px borders, `rounded-sm`.

### Structure

```html
<!-- Backdrop -->
<div class="fixed inset-0 z-modal-backdrop bg-primary/20 backdrop-blur-sm"></div>

<!-- Panel wrapper -->
<div class="fixed inset-0 z-modal flex items-center justify-center p-4">
  <div class="bg-surface border border-border rounded-sm w-full max-w-lg
              flex flex-col max-h-[85vh]">

    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
      <h2 class="text-sm font-semibold text-text">Add Transaction</h2>
      <button class="text-text-muted hover:text-text transition-colors p-1 -mr-1
                     hover:bg-surface-hover rounded-none">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Body (scrollable) -->
    <div class="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
      <!-- form fields or content -->
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-2 px-4 pt-3 pb-4 border-t border-border">
      <button class="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium
                     hover:bg-surface-hover transition-colors">
        Cancel
      </button>
      <button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium
                     hover:bg-primary-hover transition-colors">
        Save Transaction
      </button>
    </div>
  </div>
</div>
```

### Animation

```css
@keyframes modalIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

| Property | Value |
|---|---|
| Backdrop | `bg-primary/20` (`#171717` at 20%) + `backdrop-blur-sm` |
| Panel bg | `bg-surface` (`#FFFFFF`) |
| Panel border | `border border-border` (1px, `#E5E5E5`) |
| Panel radius | `rounded-sm` (4px) |
| Shadow | **None** — `shadow-none` (no `box-shadow`) |
| Max height | `85vh` |
| Header padding | `px-4 pt-4 pb-3` |
| Header border | `border-b border-border` |
| Title | Geist, 14px (`text-sm`), weight 600 (`font-semibold`), `text-text` |
| Header row | Always rendered: title left, Close button right (`flex items-start justify-between`), `mb-4` before content — the Close button has a reserved slot and can never overlap the title |
| Close button | Labeled: Lucide `X` 14px + "Close" text (`text-xs font-medium`), `text-text-muted hover:text-text hover:bg-surface-hover`, right-aligned, `min-h-[44px]` on coarse pointers |
| Body padding | `px-4 py-3` — scrollable with `scrollbar-thin` |
| Footer padding | `px-4 pt-3 pb-4` |
| Footer border | `border-t border-border` |
| Open animation | `translateY(4px)` → identity, `120ms ease-out` |
| Close | `80ms ease-in`, opacity only |
| Dismiss | Click backdrop, `Escape` key, or close button |

### Size Variants

| Size | Max Width | Use |
|---|---|---|
| `sm` | `400px` (`max-w-sm`) | Confirmation dialogs, simple prompts |
| `md` | `520px` (`max-w-lg`) | Standard forms (transaction, category, budget) |
| `lg` | `640px` (`max-w-2xl`) | Complex forms, import/export, multi-step wizards |

### Mobile (≤640px)

Modal converts to a bottom sheet:

| Property | Value |
|---|---|
| Width | `100%`, no horizontal margin |
| Radius | `rounded-t-sm` (top corners only) |
| Max height | `92dvh` |
| Drag handle | `32px × 4px` bar, `bg-surface-muted`, centered, `8px` top margin |
| Swipe down | Dismiss gesture (threshold: 80px drag distance) |
| Footer | Sticky to bottom with `safe-area-inset-bottom` padding |

### In-Flow Panels and Inline Editors (Escape Consumption)

`DetailPanel` is an in-flow record panel for SplitView's panel slot - a card in
the page flow, NOT an overlay: no scrim, focus trap, scroll lock, `useOverlay`,
or z-index. Escape closes it through a document-level bubble listener that
yields while any blocking overlay is open (the overlay stack owns the key then,
topmost-only close) and while the keypress was already consumed. It carries no
width utility - the host slot owns width. A `footer` prop row pins actions
below the scrolling body.

Consumed-Escape contract: an inline editor that handles Escape marks the
keypress consumed with `preventDefault()` on the native event (`EditableField`'s
base keydown arm and every override - an `EditorBag` contract), and enclosing
hosts yield on `e.defaultPrevented` (DetailPanel's close listener). The first
Escape ends the editor only; the next, unconsumed Escape closes the panel.
Popups that consume Escape at their own focusable element (DatePicker's desktop
popup) still stop propagation before the listener fires - a capture-phase
listener would close both, which is why the listener is bubble-phase.

---

## 12. Form Layout

Standard vertical form used inside modals and pages. Adapts the Architectural Ledger design: `rounded-none` inputs, uppercase labels, compact spacing.

### Standard Form

```html
<form class="space-y-4">
  <!-- Single field -->
  <div>
    <label class="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1 block">
      Description <span class="text-negative">*</span>
    </label>
    <input class="w-full bg-surface border border-border rounded-none px-2 py-1.5
                  text-[13px] text-text
                  focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus
                  transition-colors"
           placeholder="What was this for?"/>
  </div>

  <!-- Field with validation error -->
  <div>
    <label class="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1 block">
      Amount <span class="text-negative">*</span>
    </label>
    <input class="w-full bg-negative-bg border border-negative/30 rounded-none px-2 py-1.5
                  font-mono text-[13px] text-text
                  ring-1 ring-negative/40 focus:outline-hidden transition-colors"/>
    <div class="flex items-center gap-1 mt-1">
      <AlertCircle class="h-3.5 w-3.5 text-negative" />
      <span class="text-[11px] text-negative font-medium">Amount must be greater than 0</span>
    </div>
  </div>

  <!-- Two-column row (collapses on mobile) -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label class="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1 block">
        Category
      </label>
      <!-- select component -->
    </div>
    <div>
      <label class="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1 block">
        Date
      </label>
      <!-- date input -->
    </div>
  </div>

  <!-- Helper text -->
  <p class="text-[11px] text-text-muted leading-relaxed">
    Transactions are recorded in the current period's currency.
  </p>
</form>
```

### Form Properties

| Property | Value |
|---|---|
| Field gap | `16px` (`space-y-4`) |
| Group gap | `24px` between logical field groups (`space-y-6` between groups) |
| Label | Geist, 11px, weight 500, `uppercase`, `tracking-wider`, `text-muted` — `4px` (`mb-1`) above input |
| Required indicator | `*` in `negative` color, placed after label text |
| Input height | `32px` (`controlHeightClass`: `min-h-8 pointer-coarse:min-h-[44px]`) — matches row height; 44px on coarse pointers |
| Input radius | `rounded-none` (0px) |
| Input border | `border border-border`; focus → `border-border-focus` + `ring-1 ring-border-focus` |
| Error input bg | `bg-negative-bg` with `border-negative/30` |
| Error ring | `ring-1 ring-negative/40` |
| Error message | 11px, `text-negative`, medium weight, Lucide `AlertCircle` 14px, `4px` top margin |
| Helper text | 11px, `text-muted`, `leading-relaxed` |
| Multi-column | `grid-cols-2` at `sm:` breakpoint, single column on mobile |
| Actions | Right-aligned inside modal footer — **not** inside the `<form>` body |

### Validation Timing

| Event | Behavior |
|---|---|
| Initial render | No errors shown — fields are clean |
| On blur (first touch) | Validate the field; show error if invalid |
| On change (after first error) | Re-validate on every keystroke so errors clear quickly |
| On submit | Validate all fields; scroll to and focus the first invalid field |

---

## 13. Confirmation Dialog

Uses the Modal at `sm` size (400px). Always requires explicit user action — never auto-dismiss. Flat styling, no shadows.

### Structure

```html
<div class="bg-surface border border-border rounded-sm w-full max-w-sm p-4">
  <!-- Icon + text -->
  <div class="flex items-start gap-3 mb-4">
    <div class="h-8 w-8 border border-negative/20 rounded-sm bg-negative-bg flex items-center justify-center shrink-0">
      <AlertTriangle class="h-4 w-4 text-negative" />
    </div>
    <div>
      <h3 class="text-sm font-semibold text-text">Delete transaction?</h3>
      <p class="text-[13px] text-text-muted mt-1 leading-relaxed">
        This will permanently remove "Grocery Store — 84.20 PLN". This action cannot be undone.
      </p>
    </div>
  </div>
  <!-- Actions -->
  <div class="flex justify-end gap-2">
    <button class="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium
                   hover:bg-surface-hover transition-colors">
      Cancel
    </button>
    <button class="bg-negative text-white px-3 py-1.5 rounded-sm text-xs font-medium
                   hover:bg-negative/90 transition-colors">
      Delete
    </button>
  </div>
</div>
```

### Variants

| Variant | Icon (Lucide) | Icon bg | Icon border | CTA bg | CTA text |
|---|---|---|---|---|---|
| Destructive | `AlertTriangle` | `bg-negative-bg` | `border-negative/20` | `bg-negative` | `white` |
| Confirm | `HelpCircle` | `bg-surface` | `border-border` | `bg-primary` | `white` |
| Warning | `AlertTriangle` | `bg-warning-bg` | `border-warning/20` | `bg-warning` | `white` |

### Properties

| Property | Value |
|---|---|
| Max width | `400px` (`max-w-sm`) |
| Padding | `16px` uniform (`p-4`) |
| Panel border | `border border-border` |
| Panel radius | `rounded-sm` (4px) |
| Shadow | **None** |
| Icon container | `32px` square (`h-8 w-8`), `rounded-sm`, semantic color border + bg |
| Title | Geist, 14px (`text-sm`), weight 600 (`font-semibold`), `text-text` |
| Description | Geist, 13px, `text-muted`, `leading-relaxed` |
| Button gap | `8px` (`gap-2`) |
| Focus on open | Auto-focus **Cancel** button (never the destructive action) |
| Mobile | Bottom sheet, same content layout |

---

## 14. Empty States

Simplified for the high-density Architectural Ledger aesthetic. Minimal vertical space, muted icon, single line of text, flat CTA button.

### Full Empty State

```html
<div class="text-center py-8">
  <FileX class="h-12 w-12 text-text-muted/30 mx-auto mb-3" />
  <p class="text-sm font-medium text-text-muted mb-4">No transactions yet</p>
  <button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium
                 hover:bg-primary-hover transition-colors">
    Add Transaction
  </button>
</div>
```

### Inline Empty State (Within Tables)

```html
<div class="text-center py-6 text-text-muted text-[13px]">
  No transactions yet
</div>
```

### Properties

| Property | Value |
|---|---|
| Container padding | `py-8` (32px) |
| Icon | Lucide at 48px (`h-12 w-12`), `text-text-muted/30` |
| Icon spacing | `mb-3` (12px) below icon |
| Message | Geist, 14px (`text-sm`), weight 500, `text-text-muted` |
| Message spacing | `mb-4` (16px) below message |
| CTA button | Flat primary button (`bg-primary`, no gradient) |
| Inline variant | No icon, 13px text, `py-6` |

### Lucide Icons for Empty States

| Context | Icon |
|---|---|
| Transactions | `FileX` |
| Planned Transactions | `CalendarX` |
| Categories | `Tag` |
| Members | `Users` |
| Search results | `SearchX` |

---

## 15. Loading States

The Architectural Ledger uses **top-edge progress bars** and **wireframe skeletons** — never spinners.

### Top-Edge Progress Bar

A thin progress bar fixed at the top of the viewport or container, indicating ongoing data loading.

```html
<!-- Fixed at viewport top -->
<div class="fixed top-0 left-0 right-0 z-toast h-1 bg-primary animate-pulse"></div>

<!-- Determinate progress -->
<div class="fixed top-0 left-0 right-0 z-toast h-1 bg-surface-muted">
  <div class="h-full bg-primary transition-all" style="width: 60%"></div>
</div>
```

| Property | Value |
|---|---|
| Height | `4px` (`h-1`) |
| Background (indeterminate) | `bg-primary animate-pulse` |
| Background (track) | `bg-surface-muted` |
| Fill color | `bg-primary` |
| Position | `fixed top-0 left-0 right-0 z-toast` |
| Radius | `rounded-none` |

### Wireframe Skeletons

1px-bordered empty boxes that show layout structure while content loads. Not rounded, not filled — just wireframe outlines.

```html
<!-- Card skeleton -->
<div class="border border-border rounded-sm p-4 space-y-3 animate-pulse">
  <div class="h-3 w-24 border border-border rounded-none"></div>
  <div class="h-4 w-40 border border-border rounded-none"></div>
  <div class="grid grid-cols-2 gap-2">
    <div class="h-3 w-20 border border-border rounded-none"></div>
    <div class="h-3 w-16 border border-border rounded-none"></div>
  </div>
</div>

<!-- Table row skeleton -->
<div class="border-b border-border h-8 flex items-center px-3 gap-3 animate-pulse">
  <div class="h-3 w-32 border border-border rounded-none"></div>
  <div class="flex-1"></div>
  <div class="h-3 w-20 border border-border rounded-none"></div>
</div>

<!-- Inline skeleton (compact) -->
<div class="flex items-center gap-2 px-3 py-1.5 animate-pulse">
  <div class="h-4 w-4 border border-border rounded-none"></div>
  <div class="h-3 w-24 border border-border rounded-none"></div>
</div>
```

| Property | Value |
|---|---|
| Skeleton shape | `border border-border rounded-none` — wireframe outline only |
| Animation | `animate-pulse` |
| Fill | Transparent (no background fill) — only the 1px border is visible |
| Radius | `rounded-none` — rectangular wireframe |
| Sizes | Match expected content: `h-3 w-24`, `h-4 w-40`, etc. |

### Loading Text (Inline)

For inline loading indicators where a progress bar or skeleton isn't appropriate:

```html
<div class="flex items-center gap-2 py-4 text-text-muted text-[13px]">
  <Loader2 class="h-3.5 w-3.5 animate-spin" />
  Loading balances...
</div>
```

Uses Lucide `Loader2` with `animate-spin` only for inline micro-loaders — not for full-page or section loading states.
Progress checklists (staged setup panels): a completed step renders a Lucide `Check` in `text-positive`; the active step renders `Loader2` with `animate-spin` - inline progress only, never a page-level loader.

---

## 16. Pagination

Desktop shows numbered pages with prev/next; mobile uses "Load More". All styling uses the Architectural Ledger tokens.

### Desktop Pagination

```html
<div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-3 py-2 border-t border-border">
  <!-- Left: info + page size -->
  <div class="flex items-center gap-3">
    <span class="font-mono text-[11px] text-text-muted">1–50 of 1,234</span>
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Rows</span>
      <select class="bg-surface border border-border rounded-none px-2 py-1 text-[11px] font-mono text-text
                     focus:border-border-focus focus:outline-hidden focus:ring-1 focus:ring-border-focus">
        <option>50</option>
        <option>100</option>
      </select>
    </div>
  </div>

  <!-- Right: page navigation -->
  <div class="flex items-center gap-1">
    <button disabled class="h-8 w-8 flex items-center justify-center rounded-none text-text-muted/40 cursor-not-allowed">
      <ChevronLeft class="h-4 w-4" />
    </button>
    <!-- Active page -->
    <button class="h-8 min-w-[32px] px-1 flex items-center justify-center rounded-none
                   bg-primary text-white font-mono text-[11px] font-medium">1</button>
    <button class="h-8 min-w-[32px] px-1 flex items-center justify-center rounded-none
                   text-text font-mono text-[11px] hover:bg-surface-hover transition-colors">2</button>
    <button class="h-8 min-w-[32px] px-1 flex items-center justify-center rounded-none
                   text-text font-mono text-[11px] hover:bg-surface-hover transition-colors">3</button>
    <span class="text-text-muted font-mono text-[11px] px-1">…</span>
    <button class="h-8 min-w-[32px] px-1 flex items-center justify-center rounded-none
                   text-text font-mono text-[11px] hover:bg-surface-hover transition-colors">25</button>
    <button class="h-8 w-8 flex items-center justify-center rounded-none
                   text-text hover:bg-surface-hover transition-colors">
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>
</div>
```

### Mobile: Load More

```html
<div class="flex flex-col items-center py-4 gap-2">
  <button class="bg-surface border border-border text-text px-4 py-1.5 rounded-sm text-xs font-medium
                 hover:bg-surface-hover transition-colors">
    Load More
  </button>
  <span class="font-mono text-[11px] text-text-muted">Showing 50 of 1,234</span>
</div>
```

### Properties

| Property | Value |
|---|---|
| Container border | `border-t border-border` |
| Container padding | `px-3 py-2` |
| Count text | JetBrains Mono, 11px, `text-muted` |
| "Rows" label | Geist, 10px, uppercase, `tracking-wider`, `text-muted` |
| Page size select | `border border-border rounded-none`, JetBrains Mono 11px |
| Page button | `32px` min square (`h-8 min-w-[32px]`), `rounded-none` |
| Active page | `bg-primary text-white` (flat, no shadow) |
| Inactive page | `text-text`, transparent bg |
| Hover | `bg-surface-hover` |
| Disabled arrow | `text-text-muted/40`, `cursor-not-allowed` |
| Ellipsis | `…` in `text-muted` |
| Font | JetBrains Mono, 11px |
| Prev/next icons | Lucide `ChevronLeft` / `ChevronRight`, 16px |
| Default per page | `50` |

---

## 17. Toast Notifications

Uses `react-hot-toast` with custom styling via the `<Toaster>` component. Flat styling, 1px borders, no shadows.

### Custom Toaster Configuration

```tsx
<Toaster
  toastOptions={{
    duration: 3000,
    style: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
      borderRadius: '4px',
      boxShadow: 'none',
      fontSize: '13px',
      padding: '12px 16px',
    },
    success: {
      iconTheme: {
        primary: 'var(--color-positive)',
        secondary: 'var(--color-surface)',
      },
    },
    error: {
      iconTheme: {
        primary: 'var(--color-negative)',
        secondary: 'var(--color-surface)',
      },
    },
  }}
/>
```

### Visual Properties

| Property | Value |
|---|---|
| Background | `bg-surface` (`#FFFFFF`) |
| Border | `1px solid var(--color-border)` (`#E5E5E5`) |
| Radius | `4px` (equivalent to `rounded-sm`) |
| Shadow | **None** — `boxShadow: 'none'` |
| Text | `text-text` (`#171717`), 13px |
| Padding | `12px 16px` |
| Position | Bottom-center (default) |
| Duration | 3000ms |

### Usage Patterns

```tsx
// Success
toast.success('Transaction saved')

// Error with API message extraction
toast.error(getApiErrorMessage(error, 'Failed to save transaction'))

// Validation error
toast.error('Amount must be greater than 0')
```

### Toast Icon Colors

| Type | Icon Color |
|---|---|
| Success | `--color-positive` (`#059669`) |
| Error | `--color-negative` (`#DC2626`) |
| Default | `--color-text-muted` (`#737373`) |

---

## 18. Avatar, Badge & Search Results

### Avatar

```html
<!-- With image -->
<div class="h-8 w-8 rounded-full overflow-hidden bg-surface-muted shrink-0">
  <img src="/avatar.jpg" alt="John D." class="h-full w-full object-cover"/>
</div>

<!-- Initials fallback -->
<div class="h-8 w-8 rounded-full bg-surface-muted border border-border flex items-center justify-center shrink-0">
  <span class="font-mono text-[10px] font-medium text-text">JD</span>
</div>

<!-- With online indicator -->
<div class="relative">
  <div class="h-8 w-8 rounded-full bg-surface-muted border border-border flex items-center justify-center">
    <span class="font-mono text-[10px] font-medium text-text">JD</span>
  </div>
  <div class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-positive
              ring-2 ring-surface"></div>
</div>
```

#### Avatar Size Scale

| Size | Class | Initials Font | Use |
|---|---|---|---|
| `xs` | `h-6 w-6` (24px) | 8px | Inline mentions, compact lists |
| `sm` | `h-8 w-8` (32px) | 10px | Sidebar user footer, table rows |
| `md` | `h-10 w-10` (40px) | 11px | Member lists, workspace cards |
| `lg` | `h-12 w-12` (48px) | 12px | Profile page, settings header |

#### Avatar Properties

| Property | Value |
|---|---|
| Shape | `rounded-full` (circles only for avatars) |
| Fallback bg | `bg-surface-muted` with `border border-border` |
| Initials | JetBrains Mono, weight 500, `text-text` — max 2 chars |
| Online dot | `bg-positive`, `12px`, `ring-2 ring-surface` |
| Group (stacked) | Overlap by `8px`, each with `ring-2 ring-surface` |

### Badge / Notification Dot

```html
<!-- Dot only (unread indicator) -->
<div class="relative">
  <Bell class="h-4 w-4 text-text-muted" />
  <div class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-negative"></div>
</div>

<!-- Count badge -->
<div class="relative">
  <Bell class="h-4 w-4 text-text-muted" />
  <div class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1
              bg-negative rounded-full flex items-center justify-center
              font-mono text-[9px] font-medium text-white">
    3
  </div>
</div>

<!-- Large count (capped at 99+) -->
<div class="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1.5
            bg-negative rounded-full flex items-center justify-center
            font-mono text-[9px] font-medium text-white">
  99+
</div>
```

#### Badge Properties

| Property | Value |
|---|---|
| Background | `bg-negative` |
| Text | `text-white`, JetBrains Mono, 9px, weight 500 |
| Position | `absolute`, offset from parent corner |
| Radius | `rounded-full` (dots and badges remain circular) |
| Max display | `99+` — values above 99 truncate |
| Parent | Must have `position: relative` |

### Search Results Dropdown

```html
<div class="absolute top-full mt-1 left-0 right-0
            bg-surface border border-border rounded-sm
            z-dropdown max-h-[360px] overflow-y-auto scrollbar-thin">

  <!-- Group label -->
  <div class="px-3 pt-3 pb-1">
    <span class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Recent</span>
  </div>

  <!-- Recent search item -->
  <button class="w-full flex items-center gap-2.5 px-3 h-8 text-left
                 text-[13px] text-text-muted hover:bg-surface-hover transition-colors">
    <Clock class="h-3.5 w-3.5 text-text-muted" />
    <span>Grocery</span>
  </button>

  <!-- Grouped results -->
  <div class="px-3 pt-3 pb-1">
    <span class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Transactions</span>
  </div>
  <button class="w-full flex items-center gap-2.5 px-3 h-10 text-left
                 hover:bg-surface-hover transition-colors">
    <FileText class="h-3.5 w-3.5 text-text-muted" />
    <div class="flex-1 min-w-0">
      <span class="text-[13px] text-text">
        <mark class="bg-positive-bg text-text rounded-none px-0.5">Grocery</mark> Store
      </span>
    </div>
    <span class="font-mono text-[11px] text-negative font-medium tabular-nums">-84.20</span>
  </button>

  <!-- No results -->
  <div class="px-3 py-6 text-center">
    <span class="text-[13px] text-text-muted">No results for "xyz"</span>
  </div>
</div>
```

#### Search Results Properties

| Property | Value |
|---|---|
| Trigger | Search input focus; minimum 2 characters for query results |
| Background | `bg-surface` |
| Border | `border border-border` |
| Radius | `rounded-sm` (4px) |
| Shadow | **None** |
| Max height | `360px`, `overflow-y-auto` with `scrollbar-thin` |
| Match highlight | `<mark>` with `bg-positive-bg`, `rounded-none`, `text-text` |
| Groups | Transactions, Categories, Planned — each with a group label |
| Group label | Geist, 10px, uppercase, `tracking-wider`, `text-muted` |
| Recent | Shown when input is empty; Lucide `Clock` icon, `text-muted` |
| Result icons | Lucide, 14px (`h-3.5 w-3.5`), `text-muted` |
| No results | Centered text in `text-muted` |
| Max per group | 5 items, with "View all {type}" link at bottom of group |
| Keyboard | `ArrowDown`/`ArrowUp` navigate; `Enter` selects; `Escape` closes |
| Dismiss | Click outside, `Escape`, or select an item |

---

## 19. Bottom Navigation (Mobile)

Fixed bottom bar visible only on mobile (≤640px). Replaces the sidebar. Five slots - Home · Activity · FAB · Accounts · Budgets; the center slot is always the primary action. There is no More tab: overflow destinations and workspace/user controls live in the account menu sheet, opened from the page-header profile button.

### Structure

```html
<nav class="fixed bottom-0 left-0 right-0 z-bottom-nav
            bg-surface border-t border-border
            flex justify-around items-end
            pb-[env(safe-area-inset-bottom)]">

  <!-- Home (active tab) -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-primary">
    <LayoutDashboard class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Home</span>
  </button>

  <!-- Activity: one tab for /transactions, /planned and /transfers
       (active state from the live pathname prefix) -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <FileText class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Activity</span>
  </button>

  <!-- Center FAB slot - elevated above the bar; the slot stays mounted even
       when the FAB is hidden (viewer role / no workspace) so the four tabs
       don't shift -->
  <button class="flex-1 flex flex-col items-center -mt-5">
    <div class="w-12 h-12 bg-primary border border-border
                flex items-center justify-center rounded-sm
                hover:bg-primary-hover active:scale-95 transition-all">
      <Plus class="h-5 w-5 text-white" />
    </div>
  </button>

  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <Landmark class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Accounts</span>
  </button>

  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <Wallet class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Budgets</span>
  </button>
</nav>
```

### Properties

| Property | Value |
|---|---|
| Visibility | Mobile only (`≤640px`) - `display: none` at ≥641px |
| Background | `bg-surface` (`#FFFFFF`) |
| Border | `border-t border-border` - no glassmorphism, no blur |
| Shadow | **None** |
| Height | ~56px + `safe-area-inset-bottom` |
| Tab labels | Geist, 10px, weight 500, `uppercase`, `tracking-wider` |
| Tab icons | Lucide, 20px (`h-5 w-5`) |
| Active tab | `text-primary` (icon + label) |
| Inactive tab | `text-text-muted` |
| Tabs | Home (`LayoutDashboard`, exact match), Activity (`FileText`), Accounts (`Landmark`), Budgets (`Wallet`) |
| Activity coverage | One tab lights on all of `/transactions`, `/planned` and `/transfers` - the active state derives from the live pathname prefix, not NavLink's own match |
| FAB | `48px` square (`w-12 h-12`), `bg-primary`, `border border-border`, `rounded-sm` |
| FAB icon | Lucide `Plus`, 20px, `text-white` |
| FAB offset | `-20px` (`-mt-5`) above the bar |
| FAB slot | The center slot stays mounted when the FAB is hidden (viewer role / no workspace) so the four tabs don't shift |
| Max tabs | 5 including FAB slot |
| Overflow nav | No More tab: overflow destinations (Accounts, Planned, Members, Settings) plus workspace switching and user controls live in the account menu sheet (`layout/AccountMenuSheet.tsx`), opened from the page-header profile button on every page |
| Safe area | Always apply `padding-bottom: env(safe-area-inset-bottom)` |

---

## 20. Icons

### Library: Lucide Icons (Exclusively)

All icons use **Lucide** (`lucide-react`). No Material Symbols, no HeroIcons, no `react-icons`, no inline SVGs.

```bash
npm install lucide-react
```

```tsx
import { Plus, X, ChevronDown, AlertTriangle } from 'lucide-react'
```

### Icon Sizing & Stroke

| Context | Size | Tailwind | Stroke Weight |
|---|---|---|---|
| Default (most UI) | 14px | `h-3.5 w-3.5` | 1.5px (Lucide default) |
| Navigation (sidebar, bottom nav) | 20px | `h-5 w-5` | 1.5px |
| Table headers, inline micro | 14px | `h-3.5 w-3.5` | 1.5px |
| Empty state illustrations | 48px | `h-12 w-12` | 1.5px |
| FAB / prominent actions | 20px | `h-5 w-5` | 1.5px |

> **Note:** Lucide's default stroke width is 2px at 24px. At 14px rendered size, the effective stroke is ~1.5px visual weight. No `strokeWidth` prop override is needed — use the Lucide defaults.

> **Note:** A filled glyph (fill="currentColor", stroke weight unchanged) is an exists/saved affordance - use it only on a glyph whose outline form is the create affordance in the same location.

### Common Icon Mappings

| Context | Lucide Icon | Old (Material Symbols) |
|---|---|---|
| Add / Create | `Plus` | `add` |
| Close | `X` | `close` |
| Edit | `Pencil` | `edit` |
| Delete | `Trash2` | `delete` |
| Search | `Search` | `search` |
| Notifications | `Bell` | `notifications` |
| Settings | `Settings` | `settings` |
| Warning | `AlertTriangle` | `warning` |
| Error | `AlertCircle` | `error` |
| Success / Check | `Check` | `check` |
| Calendar | `Calendar` | `calendar_month` |
| Budget | `Wallet` | `account_balance_wallet` |
| Dashboard | `LayoutDashboard` | `dashboard` |
| Activity (transactions/planned/transfers) | `FileText` | `receipt_long` |
| Accounts | `Landmark` | `account_balance` |
| Planned | `CalendarClock` | `event_note` |
| Categories | `Tag` | `category` |
| Members | `Users` | `group` |
| Person | `User` | `person` |
| Home / Workspace | `Home` | `home` |
| Expand / Collapse | `ChevronDown` | `expand_more` |
| Navigate left | `ChevronLeft` | `chevron_left` |
| Navigate right | `ChevronRight` | `chevron_right` |
| Loading | `Loader2` | — (was inline SVG spinner) |
| Upload | `Upload` | `upload` |
| Download | `Download` | `download` |
| Sort | `ArrowUpDown` | — |
| Filter | `Filter` | `filter_list` |
| Export | `FileDown` | — |
| Info | `Info` | `info` |
| Help | `HelpCircle` | `help` |
| Eye / View | `Eye` | `visibility` |
| Shield / Admin | `Shield` | `admin_panel_settings` |
| Star / Owner | `Star` | `star` |
| History | `Clock` | `history` |

### Icon Color Rules

Icons inherit their color from the parent element's text color. Use semantic tokens:

| Context | Color | Tailwind |
|---|---|---|
| Default | `--color-text-muted` | `text-text-muted` |
| Active / Hover | `--color-text` | `text-text` |
| Primary actions | `--color-primary` | `text-primary` |
| Destructive | `--color-negative` | `text-negative` |
| Success | `--color-positive` | `text-positive` |
| On primary bg | `white` | `text-white` |
| Disabled | `--color-text-muted` at 40% | `text-text-muted/40` |

---

## 21. Bottom Sheet & Action Sheet (Mobile)

The **bottom sheet is the universal mobile container**: modals, selects, action menus, the
date picker, and the "More" navigation all render inside one primitive on mobile.

### BottomSheet (`common/BottomSheet.tsx`)

Same `{ open, onClose, children, className }` contract as `Modal` (which delegates to it on
mobile — call sites never branch on device).

| Property | Value |
|---|---|
| Panel | full-width, pinned bottom, `bg-surface border border-border rounded-t-sm` (top corners only) |
| Height | `max-h-[92dvh]`, internal scroll, `overscroll-contain` |
| Drag handle | centered `h-1 w-9 bg-surface-muted` bar, sticky at top (visual affordance; drag gesture not implemented) |
| Scrim | `bg-scrim backdrop-blur-sm`, tap dismisses |
| Motion | slide-up 120ms `ease-out`, slide-down 80ms `ease-in` (patterns.md §1); reduced-motion disables |
| Safe area | `pb-safe` on the panel |
| Behavior | body scroll-lock (refcounted), stack-aware Escape (topmost only), focus capture/restore — via `hooks/useOverlay.ts` |
| Keyboard | lifts above the on-screen keyboard via `visualViewport` |

### ActionSheet (`common/ActionSheet.tsx`)

The touch replacement for hover-revealed row actions: tapping a list row/card opens a titled
sheet of actions. `{ open, onClose, title?, actions: { label, icon?, onSelect, destructive?,
disabled? }[] }`.

- Rows: full-width, `min-h-[44px] px-4 text-sm`, 16px Lucide icons, `text-negative` when
  destructive, `active:bg-surface-hover` press feedback; trailing full-width **Cancel** row.
- Selecting **closes the sheet first, then runs the action** — safe for chaining into a
  modal (`ConfirmDialog`, edit form).

### Adaptive components

`Select` and `DatePicker` are adaptive: one exported API, desktop keeps the anchored
dropdown/popover, mobile presents a sheet (44px option rows with check mark; 44px calendar
day cells via the `rdp-sheet` scope). See `design/patterns.md` §13 for the pattern rules.

---

## 22. Filters (Activity Lists)

The filter surface of the three Activity lists (`/transactions`, `/planned`,
`/transfers`) is registry-driven: one ordered filter-def list per page
(`utils/listFilters.ts`) over the UNCHANGED URL param names (`from`/`to`,
`account`, `type`, `currency`, `budget`, `category`, `amount_min`/`amount_max`),
so bookmarks and saved defaults replay by construction. Every surface - the
trigger's badge count, Clear, the applied chips, the phone sheet's hub rows and
the 640+ "Add filter" menu - consumes the same defs. Each def declares its own
param keys, a label key, an editor kind (`date` / `multi` / `amount` /
`single`), a runtime availability condition, an `isActive` predicate over the
page's EFFECTIVE values (a materialized default counts as active), a short
pre-localized summary fragment, a per-def clear patch, and an optional change
patch (the budget def prunes category selections that no longer belong to the
selected budgets). Counting and clearing run over the FULL def list -
availability only gates what hosts may OFFER (a stale param replayed from a
bookmark still counts in the badge and still clears; it just gets no hub row or
menu entry while the facet is empty on this workspace). Sort is not a registry
def: the pages' sort option lists feed the sheet's Sort row and the toolbar's
Select. Shared filter chrome self-translates through the transactions namespace
(the established cross-page filter home); page-specific strings arrive as props.

### MonthStepper (`common/MonthStepper.tsx`)

Always visible on all three lists (each page renders a standalone phone row and
an `inline` toolbar member - a CSS-gated dual embed; the shared state is the
URL).

| Property | Value |
|---|---|
| Chevrons | Prev/next render only while the effective range is exactly one calendar month - the page gates them through the `onShift` prop (custom ranges, partial ranges and All time show the label alone) |
| Label | Always a button (the date-editor trigger) in both states, with `aria-haspopup`/`aria-expanded` keyed on the `onOpenEditor` prop's presence: without an exact-month range there is no other date entry point, so the label button must exist everywhere. The 640+ toolbar wires it to the date-editor popover; the standalone phone rows wire it to the filter sheet |
| Label text | `stepperRangeLabel(from, to, allTimeLabel)`: the month name for an exact calendar month, the configured all-time wording when both bounds are empty, the short localized period range when both are set, the single formatted bound for a partial range |
| Announcement | The changing value is announced by a visually-hidden polite sibling region (a live region must never be an interactive element); the button keeps a stable accessible name |
| Sizing | `min-w-[128px]` on the label keeps the chevrons in place across locales' month-name widths; `max-sm:flex-1` absorbs the full-width mobile row; chevron buttons `w-8 h-8` with `touch-hit`; `inline` drops the standalone row's bottom margin and phone width claim (the host row owns spacing) |
| Fonts | Label in the mono register (`font-mono text-xs font-medium`); month names and date shapes come from the date-fns locale / number-style config, never from i18n catalogs |

### AppliedFilters (`common/AppliedFilters.tsx`)

One removable chip per active registry filter except the date range (the
stepper owns the date), plus a "Clear all" link (the registry-wide clear patch
through the page's URL updater). Renders nothing when no chip is active, so the
row never takes vertical space on an unfiltered list.

| Property | Value |
|---|---|
| Standalone gate | 640px and up only, CSS-gated: `hidden sm:flex`, the hidden CLASS never the HTML attribute, so the row stays in the accessibility tree's DOM at every width and simply display-nones below `sm` (phones see the applied state through the trigger's badge and the sheet's hub rows) |
| `inline` | Toolbar membership: drops the width gate and bottom margin (the toolbar row owns both) |
| Chip anatomy | The chip body button and its X button are siblings inside a wrapper (a button may never descend from a button); the wrapper owns the chip skin and the popover anchor while its editor is open |
| Editor seams | `onOpenEditor` (chip body click opens the filter's editor popover; without it the body stays an inert label), `editorOpenId` (the open chip, the popover's anchor), `renderEditorPanel` (the host-built panel anchored under the chip). Focus returns to the chip body when its popover closes and focus would otherwise fall to `<body>` |
| Removal | The X alone removes, through the def's clear patch via the page's URL-param updater (a replace write); rows and X interpolate the full height constant (`min-h-8` base plus the 44px coarse floor; the icon-only X also carries the coarse width floor) |

### Editor bodies (`filters/*Editor.tsx`)

Four container-agnostic bodies: no trigger, no popup chrome, no internal
scrolling, no Escape handling, no width pins - the host (the sheet's editor
level or a toolbar popover) owns the panel, focus and Escape. The page wires
each def to its body once (options + URL writes); one wiring feeds every host,
so the surfaces never diverge. Every change applies to the URL immediately.

| Editor | Body |
|---|---|
| `DateRangeEditor` | Preset chips (This month / Last month / Last 30 days / This year / All time; a range preset lights only on an exact match, All time only when neither bound is set - clicking it clears both bounds), localized From/To short-date text inputs (the input mirror of the quick-pick date format; an invalid entry reverts on blur with an under-field error, never a toast), and the first range-mode calendar: `.rdp-range-editor` layered on `.rdp-inline` (range-state colors, compact geometry and coarse-pointer 44px targets, `index.css`), `resetOnSelect` so a third click restarts the range instead of extending it |
| `MultiChoiceEditor` | Checkmark rows (`role="listbox"` `aria-multiselectable`); a search field appears above 8 options - deliberately higher than MultiSelect's >5, since the editor bodies are wider and host their own scroll; the `searchable` prop is the def-level always-on override (category). The search consumes Enter but not Escape: the host panel owns Escape |
| `AmountRangeEditor` | `AmountInput` min/max pair (debounced commits); empty passes through as a param delete, unparseable text travels raw for the API validator to reject |
| `SingleChoiceEditor` | One-active-row list (the Transfers account filter, the sort options); clicking a selected row keeps it selected - there is no "none" state unless the host offers one through its options |

### FiltersTrigger + FilterSheet (below 640px)

`FiltersTrigger` is the phone-only entry (`sm:hidden` baked in - no call site
can forget the gate): a secondary-register button with the registry badge count
(active filters, date included). It opens `FilterSheet`, a presentational
two-level `BottomSheet` composition; the page owns every piece of state (open
flag, URL params, queries).

| Property | Value |
|---|---|
| Hub level | One row per OFFERABLE def: label plus short summary (active rows only), the active marker (left accent bar + surface tint, never color-alone - inactive rows reserve the bar's space so text never shifts) and an X clear on active rows; optional Sort row (no marker, no clear - the default option is always selectable); the save rows (Save as default, bookmark where the page has a bookmark kind) live here on phones instead of the toolbar |
| Editor level | One filter's editor body behind each row, under a sticky Back header (ArrowLeft plus the filter's label; the back button autofocuses on entry) |
| Escape | Steps exactly one level per press: the editor level consumes it at its own container; hub-level Escape passes to the sheet's own listener and closes the sheet. A scrim tap closes the whole sheet from either level |
| Footer | Sticky full-width primary "Show N <noun>" (font-mono numeral); the previous total shows while the list refetches - intended |
| Reset | Every close path funnels through the parent's `open=false`, which resets the level so the next open starts at the hub |

### FilterChipsBar (640px and up)

The 640+ toolbar: one wrapping flex row (`hidden sm:flex flex-wrap`), one
popover open at a time, tracked in a single state slot.

| Property | Value |
|---|---|
| Members | Month stepper (its label opens the date-editor popover anchored below), applied chips (a chip body opens that filter's editor, anchored under the chip), the "Add filter" menu, optional search and sort slots (the pages' own SearchInput / Select, given a min-width floor so the row wraps instead of collapsing them), and the "Save view" menu at the row's right edge |
| Add filter | A menu of inactive defs only (an entry is never a no-op); picking one swaps straight into that def's editor; disabled when every offerable def is active |
| Save view | Save-as-default row plus the bookmark row on pages with a bookmark kind; on Transfers the menu carries save-default alone (the page header keeps only New). The menu closes before the bookmark modal mounts, so Escape always faces one layer |
| Z tier | Editor panels and menus sit at `z-popover` (250, the `tokens.md` §3 fence) so they overlay the table's sticky THEAD (`z-sticky`, 200) and stay clickable - the dropdown tier (100) sits below sticky by original design |
| Escape | Consumed at the row (document bubble-phase preventDefault + stopPropagation) so nothing beneath reacts; the editors carry no Escape handling by contract - the row owns it for every popover it hosts. An outside click landing on a focusable element moves focus there; anything else dismisses and returns focus to the trigger |

### Paired-input wrap recipe and the wrap-row floor

The paired-input recipe (both bound-pair editors): `flex max-sm:flex-wrap` -
below `sm` each `w-full` input claims its own full line (`w-full` doubles as
`basis-full`) and the separator hides (`max-sm:hidden`); at `>=sm` the pair
shares one line. It was formerly a de facto convention documented only in code
comments across its then-two sites; it is spec'd here now that the two editors
carry it.

Its old neighbor defect is gone by construction: the retired controls row
collapsed its search input toward 0px in the ~640-725px band, and the
`position: relative` wrapper painted over the Filters toggle, intercepting its
clicks. The toolbar replaces the per-input fix with the wrapping-flex row
itself: the search slot carries `flex-1 min-w-40` (a 160px floor), so the input
can no longer collapse under the shrink-0 controls - the row wraps instead of
overlapping.

---

## Appendix A — Primitive Audit (U1)

Inventory of the React primitives against this spec, recorded 2026-07. The shared
primitives are the reference implementation; screen-level conformance is swept in U2.

### Primitives & source of truth

| Primitive | File | Notes |
|---|---|---|
| Input / label / buttons | `components/common/formStyles.ts` | Class constants reused by every redesign form |
| Select / dropdown | `components/common/Select.tsx` | Custom trigger + floating panel |
| Modal | `components/common/Modal.tsx` | Scrim + centered panel, labeled "Close" button in header row |
| Confirm dialog | `components/common/ConfirmDialog.tsx` | Built on Modal |
| Date picker | `components/DatePicker.tsx` | react-day-picker, `.rdp-inline` theming in `index.css` |
| Pagination / Select page-size | `components/common/Pagination.tsx` | |
| Tables | inline (`BudgetDetailPage`, item/attachment editors) | Ledger tables per §9 |

### Checklist

| Check | Status |
|---|---|
| Colors reference tokens only — no hex / `text-gray` / raw rgb in primitives | ✅ (only `text-white` on primary/scrim, intentional) |
| Dark-mode parity — every primitive uses semantic tokens, dark values resolve automatically | ✅ (no `dark:` overrides needed) |
| Input focus = `border-border-focus` + `ring-1 ring-border-focus` (was `ring-2`, no border) | ✅ fixed in `formStyles.ts` |
| Input radius `rounded-none`, buttons/containers/modals `rounded-sm` | ✅ |
| Input sizing `px-2 py-1.5 text-xs`, `bg-surface`, muted placeholder, `disabled:bg-surface-muted` | ✅ fixed |
| Labels Geist 11px uppercase `tracking-wider` `mb-1` (was mono 9px) | ✅ fixed |
| Buttons use `focus-visible:outline-2 outline-offset-2 outline-border-focus` (was `focus:ring-2`) | ✅ fixed |
| Button disabled `opacity-50 cursor-not-allowed` | ✅ |
| Dropdown panel: `bg-surface border border-border rounded-sm`, no shadow, `max-h-[280px]` scroll | ✅ |
| Dropdown corners clip row fills — no fill bleed past corners in either theme | ✅ (overflow establishes the clip; verified light + dark) |
| Thin scrollbars | ✅ applied globally in `index.css`; no per-element class needed |
| Modal: 1px border, `rounded-sm`, zero shadow, scrim + labeled "Close" header button | ✅ |
| Table row height 32px, header 10px uppercase | ✅ |

### Open tickets

1. **Primary-button contrast in dark mode.** `components.md` §3 specifies `text-white`
   for the primary button in all states, but `dark-mode.md` says the primary button
   inverts to a light surface with dark text. These two docs conflict. Current code
   follows §3 (`text-white`). Resolve the spec conflict, then align the token/class.
2. **Dropdown clipping inside scrollable modals.** `Select`'s panel is absolutely
   positioned, so an ancestor with `overflow-y-auto` can clip it when scrolled. Low
   impact today. Proper fix: render the panel in a portal positioned from the trigger.
