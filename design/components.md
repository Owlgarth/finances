# Components

> All UI component specs with the Architectural Ledger design system.
> For icon specs see the Icons section at the bottom. For responsive behaviour see `responsive.md`.

---

## 1. Sidebar

Fixed-width left navigation panel. No shadows, no container-low fills — only a right border defines the boundary.

```html
<aside class="fixed left-0 top-0 h-full w-60 bg-surface border-r border-border flex flex-col z-sidebar">

  <!-- Brand -->
  <div class="flex items-center justify-between px-4 h-12 flex-shrink-0">
    Denarly
    <button class="p-1 rounded-none text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Collapse sidebar">
      <PanelLeftClose size={14} />
    </button>
  </div>

  <!-- Selectors (hidden when collapsed) -->
  <div class="px-3 space-y-1 flex-shrink-0 mb-2">
    <!-- Workspace selector -->
    <!-- Account selector -->
    <!-- Period selector -->
  </div>

  <!-- Divider -->
  <div class="border-t border-border mx-3 mb-2"></div>

  <!-- Nav links -->
  <nav class="flex-1 overflow-y-auto px-2">
    <!-- Active nav item -->
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
              bg-surface-hover border-l-2 border-primary text-text
              text-xs font-medium transition-colors">
      <Wallet size={14} />
      <span>Budgets</span>
    </a>

    <!-- Inactive nav item -->
    <a class="flex items-center gap-2 h-8 px-3 rounded-none
              text-text-muted hover:text-text hover:bg-surface-hover
              text-xs transition-colors">
      <LayoutDashboard size={14} />
      <span>Dashboard</span>
    </a>
  </nav>

  <!-- Bottom section -->
  <div class="px-2 flex-shrink-0 py-3 border-t border-border">
    <button class="flex items-center gap-2 w-full h-8 px-3 rounded-none
                   text-text-muted hover:text-text hover:bg-surface-hover
                   text-xs transition-colors">
      <Settings size={14} />
      <span>Settings</span>
    </button>
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
| Nav label font | Geist, 12px, standard case (`text-xs`) |
| Nav icon size | 14px, Lucide, 1.5px stroke |
| Active bg | `bg-surface-hover` (`#F5F5F5`) |
| Active indicator | 2px left border, `border-l-2 border-primary` |
| Active text | `text-text`, weight 500 |
| Inactive text | `text-text-muted` (`#737373`) |
| Inactive hover | `hover:text-text hover:bg-surface-hover` |
| Divider | `border-t border-border` between sections |
| Shadows | **None** — zero shadows |
| Tablet (641–1024px) | Collapses to `56px` (`w-14`) — labels hidden, icons only |
| Mobile (≤640px) | Hidden entirely — replaced by Bottom Navigation |

### Context Selectors (Sidebar)

Compact workspace / account / period selectors at the top of the sidebar, above nav items.

```html
<!-- Workspace selector -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none
               hover:bg-surface-hover transition-colors text-left">
  <Home size={14} class="text-text-muted flex-shrink-0" />
  <div class="flex-1 min-w-0">
    <div class="text-[11px] uppercase tracking-wider text-text-muted leading-tight">Workspace</div>
    <div class="text-xs font-medium text-text truncate">Home</div>
  </div>
  <ChevronDown size={12} class="text-text-muted flex-shrink-0" />
</button>

<!-- Account selector (active / highlighted) -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none
               bg-surface-hover transition-colors text-left">
  <Landmark size={14} class="text-text flex-shrink-0" />
  <div class="flex-1 min-w-0">
    <div class="text-[11px] uppercase tracking-wider text-text-muted leading-tight">Account</div>
    <div class="text-xs font-medium text-text truncate">Example Account</div>
  </div>
  <ChevronDown size={12} class="text-text-muted flex-shrink-0" />
</button>

<!-- Period selector -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none
               hover:bg-surface-hover transition-colors text-left">
  <Calendar size={14} class="text-text-muted flex-shrink-0" />
  <div class="flex-1 min-w-0">
    <div class="text-[11px] uppercase tracking-wider text-text-muted leading-tight">Period</div>
    <div class="font-mono text-xs font-medium text-text">Feb 2026</div>
  </div>
  <ChevronDown size={12} class="text-text-muted flex-shrink-0" />
</button>
```

| Property | Value |
|---|---|
| Position | Top of sidebar, below brand, above nav divider |
| Row height | `32px` |
| Micro-label | Geist 11px, uppercase, `tracking-wider`, `text-text-muted` |
| Value (Workspace/Account) | Geist 12px, weight 500, `text-text` |
| Value (Period) | JetBrains Mono 12px, weight 500, `text-text` — always mono for dates |
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
      Feb 2026 · Example Account
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
| Breadcrumb content | `{Period} · {Account name} / {Page Title}` |
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
| Loading | Same as default + `cursor-wait`; text changes to "-ing..." form |
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
              focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
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

### Error State

```html
<div>
  <label class="block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1">
    Amount <span class="text-negative">*</span>
  </label>
  <input class="w-full bg-negative-bg border border-negative rounded-none px-2 py-1.5
                font-mono text-xs text-text
                ring-1 ring-negative
                focus:outline-none transition-colors" />
  <div class="flex items-center gap-1 mt-1">
    <AlertCircle size={12} class="text-negative flex-shrink-0" />
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
               focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
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
              focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
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
                focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus" />
  <span class="font-mono text-xs text-text-muted">#171717</span>
</div>
```

Uses standard HTML `<input type="color">` with border treatment matching other inputs.

### Input Specs Summary

| Element | Height | Padding | Radius |
|---|---|---|---|
| Text input | `32px` | `px-2 py-1.5` | `rounded-none` |
| Select (native) | `32px` | `px-2 py-1.5` | `rounded-none` |
| Date trigger | `32px` | `px-2 py-1.5` | `rounded-none` |
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
                 focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
                 transition-colors">
    <div class="flex items-center gap-2 min-w-0">
      <span class="truncate">Food & Groceries</span>
    </div>
    <ChevronDown size={12} class="text-text-muted flex-shrink-0 transition-transform" />
  </button>
</div>

<!-- Trigger: placeholder (nothing selected) -->
<button class="w-full flex items-center justify-between
               bg-surface border border-border rounded-none px-2 py-1.5
               text-xs text-text-muted text-left
               hover:bg-surface-hover
               focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
               transition-colors">
  <span>Select category...</span>
  <ChevronDown size={12} class="text-text-muted flex-shrink-0 transition-transform" />
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
    <Check size={12} class="text-primary flex-shrink-0" />
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
  <div class="font-mono text-sm font-medium tabular-nums text-positive leading-none mb-3">
    1,786.20
  </div>

  <!-- Meta grid: show only rows with non-zero values -->
  <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
    <div>
      <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Income</div>
      <div class="font-mono text-xs font-medium tabular-nums text-positive">+6,500.00</div>
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
| Closing balance | JetBrains Mono 14px, weight 500 — `text-positive` if > 0, `text-negative` if < 0 |
| Currency label | Geist 12px, weight 500, `text-text` |
| Meta labels | Geist 10px, uppercase, `tracking-wider`, `text-text-muted` |
| Meta values | JetBrains Mono 12px, weight 500, `tabular-nums` — semantic color only if sign matters |
| Omit zero rows | Do not render exchange rows when the value is zero or null |
| Shadow | **None** |

### Budget Category Card

Compact card for individual budget category display with progress bar.

```html
<div class="bg-surface border border-border rounded-sm p-3">
  <!-- Row 1: name + amounts -->
  <div class="flex justify-between items-start mb-2">
    <div class="flex items-center gap-2">
      <div class="h-6 w-6 bg-surface-hover border border-border rounded-none
                  flex items-center justify-center">
        <Home size={12} class="text-text-muted" />
      </div>
      <div>
        <span class="text-xs font-medium text-text">Housing & Utilities</span>
      </div>
    </div>
    <div class="text-right">
      <span class="font-mono text-xs font-medium tabular-nums text-text">2,450.00</span>
      <span class="font-mono text-[10px] text-text-muted ml-1">of 2,500.00</span>
    </div>
  </div>

  <!-- Progress bar: sharp corners, not rounded-full -->
  <div class="w-full h-1 bg-surface-muted rounded-none overflow-hidden mb-1.5">
    <div class="h-full bg-negative rounded-none transition-all" style="width: 98%"></div>
  </div>

  <!-- Status row -->
  <div class="flex justify-between text-[10px] font-mono font-medium uppercase tracking-wider">
    <span class="text-negative">High Burn</span>
    <span class="text-negative">50.00 Left</span>
  </div>
</div>
```

**Progress bar status colors:**

| Status | Bar color | Text color | Threshold |
|---|---|---|---|
| On Track | `bg-primary` | `text-text-muted` | < 75% |
| Near Limit | `bg-warning` | `text-warning` | 75–94% |
| High Burn | `bg-negative` | `text-negative` | ≥ 95% |

| Property | Value |
|---|---|
| Container | `bg-surface border border-border rounded-sm p-3` |
| Icon container | `h-6 w-6 bg-surface-hover border border-border rounded-none` |
| Icon | Lucide 12px, `text-text-muted` |
| Category name | Geist 12px, weight 500, `text-text` |
| Amount | JetBrains Mono 12px, weight 500, `tabular-nums` |
| Progress track | `h-1 bg-surface-muted rounded-none` — sharp corners |
| Progress fill | `rounded-none` — sharp corners, not `rounded-full` |
| Status text | JetBrains Mono 10px, uppercase, `tracking-wider`, semantic color |
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
<div class="w-full border border-border rounded-sm overflow-hidden">
  <table class="w-full border-collapse">
    <!-- thead, tbody -->
  </table>
</div>
```

| Property | Value |
|---|---|
| Container | `w-full border border-border rounded-sm overflow-hidden` |
| Table | `w-full border-collapse` |
| Outer border | 1px, `--color-border` (`#E5E5E5`) |
| Internal borders | `border-b border-border` on every `<tr>` (header + data) |
| Border radius | `rounded-sm` on container only; `rounded-none` on internal cells |

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
    <td class="font-mono text-xs font-medium text-positive px-3 py-1 text-right tabular-nums">+6,500.00</td>
    <td class="px-3 py-1"><!-- chip component --></td>
  </tr>
</tbody>
```

| Property | Value |
|---|---|
| Row height | `32px` **strict** (`h-8`) |
| Zebra striping | Even: `bg-surface` (`#FFFFFF`); Odd: `bg-background` (`#FAFAFA`) |
| Row border | `border-b border-border` on every row |
| Hover | `hover:bg-surface-hover` (`#F5F5F5`) |
| Transition | `transition-colors` |
| Text cells | Geist 13px, `text-text`, left-aligned |
| Amount cells | JetBrains Mono 12px, `text-right`, `tabular-nums`, semantic color |
| Positive amount | `text-positive` with `+` prefix |
| Negative amount | `text-negative` with `-` prefix |
| Neutral amount | `text-text` (no prefix) |
| Date cells | JetBrains Mono 12px, `text-text-muted` |
| Padding | `px-3 py-1` |

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

### Progress Bars (Within Tables)

```html
<!-- Budget progress bar within a table row -->
<div class="h-1 w-full bg-surface-muted rounded-none overflow-hidden">
  <div class="h-full bg-negative rounded-none transition-all" style="width: 95%"></div>
</div>
```

| Property | Value |
|---|---|
| Track | `h-1 bg-surface-muted rounded-none` |
| Fill | `h-full rounded-none` — never `rounded-full` |
| Fill color | Semantic: `bg-positive`, `bg-warning`, or `bg-negative` based on threshold |
| Radius | `rounded-none` (0px) — flat bar, not pill-shaped |

**Progress bar status colors:**

| Status | Fill Color | Text Color | Threshold |
|---|---|---|---|
| On Track | `bg-positive` | `text-positive` | < 75% |
| Near Limit | `bg-warning` | `text-warning` | 75–94% |
| Over Budget | `bg-negative` | `text-negative` | ≥ 95% |

### Table Footer (Totals Row)

```html
<tfoot>
  <tr class="bg-background border-t border-border h-8">
    <td class="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1">Total</td>
    <td class="font-mono text-xs font-medium text-text px-3 py-1 text-right tabular-nums">4,715.80</td>
  </tr>
</tfoot>
```

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
<span class="inline-flex items-center px-2 py-0.5 border border-positive/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-positive-bg text-positive select-none">
  Income
</span>

<!-- Expense -->
<span class="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none">
  Expense
</span>
```

### Status Chips (Planned Transactions)

```html
<!-- Done -->
<span class="inline-flex items-center px-2 py-0.5 border border-positive/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-positive-bg text-positive select-none">
  Done
</span>

<!-- Pending -->
<span class="inline-flex items-center px-2 py-0.5 border border-warning/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-warning-bg text-warning select-none">
  Pending
</span>

<!-- Cancelled -->
<span class="inline-flex items-center px-2 py-0.5 border border-negative/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-negative-bg text-negative select-none">
  Cancelled
</span>
```

### Role Badges

```html
<!-- Owner -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 border border-warning/20 rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-warning-bg text-warning select-none">
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
| Close icon | Lucide `X`, 14px (`h-3.5 w-3.5`) |
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
                  focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus
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
                  ring-1 ring-negative/40 focus:outline-none transition-colors"/>
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
| Input height | `32px` (`py-1.5` + text) — matches row height |
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
    <div class="h-8 w-8 border border-negative/20 rounded-sm bg-negative-bg flex items-center justify-center flex-shrink-0">
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
                     focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus">
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
<div class="h-8 w-8 rounded-full overflow-hidden bg-surface-muted flex-shrink-0">
  <img src="/avatar.jpg" alt="John D." class="h-full w-full object-cover"/>
</div>

<!-- Initials fallback -->
<div class="h-8 w-8 rounded-full bg-surface-muted border border-border flex items-center justify-center flex-shrink-0">
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

Fixed bottom bar visible only on mobile (≤640px). Replaces the sidebar. Maximum 5 slots — center is always the primary action.

### Structure

```html
<nav class="fixed bottom-0 left-0 right-0 z-bottom-nav
            bg-surface border-t border-border
            flex justify-around items-end
            pb-[env(safe-area-inset-bottom)]">

  <!-- Active tab -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-primary">
    <LayoutDashboard class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Home</span>
  </button>

  <!-- Inactive tab -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <FileText class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Txns</span>
  </button>

  <!-- Center FAB slot — elevated above the bar -->
  <button class="flex-1 flex flex-col items-center -mt-5">
    <div class="w-12 h-12 bg-primary border border-border
                flex items-center justify-center rounded-sm
                hover:bg-primary-hover active:scale-95 transition-all">
      <Plus class="h-5 w-5 text-white" />
    </div>
  </button>

  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <Calendar class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">Planned</span>
  </button>

  <!-- "More" opens a bottom sheet -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-text-muted">
    <Grid3X3 class="h-5 w-5" />
    <span class="text-[10px] font-medium uppercase tracking-wider">More</span>
  </button>
</nav>
```

### Properties

| Property | Value |
|---|---|
| Visibility | Mobile only (`≤640px`) — `display: none` at ≥641px |
| Background | `bg-surface` (`#FFFFFF`) |
| Border | `border-t border-border` — no glassmorphism, no blur |
| Shadow | **None** |
| Height | ~56px + `safe-area-inset-bottom` |
| Tab labels | Geist, 10px, weight 500, `uppercase`, `tracking-wider` |
| Tab icons | Lucide, 20px (`h-5 w-5`) |
| Active tab | `text-primary` (icon + label) |
| Inactive tab | `text-text-muted` |
| FAB | `48px` square (`w-12 h-12`), `bg-primary`, `border border-border`, `rounded-sm` |
| FAB icon | Lucide `Plus`, 20px, `text-white` |
| FAB offset | `-20px` (`-mt-5`) above the bar |
| Max tabs | 5 including FAB slot |
| Overflow nav | Accessible via "More" → bottom sheet |
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
| Transactions | `FileText` | `receipt_long` |
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
| Grid / More | `Grid3X3` | `grid_view` |

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
