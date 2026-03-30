# Components

> All UI component specs with HTML examples and property tables.
> For icon specs see bottom of this file. For responsive behaviour see `responsive.md`.

---

## Sidebar

```html
<aside class="fixed left-0 top-0 h-full w-60 bg-surface-container-low flex flex-col p-6 z-sidebar">
  <!-- Brand -->
  <div class="text-2xl font-black text-primary font-headline tracking-tight mb-8">Monie</div>

  <!-- Active nav item -->
  <a class="flex items-center gap-3 px-4 py-3 bg-white text-primary rounded-lg shadow-sm font-bold transition-all translate-x-1">
    <span class="material-symbols-outlined">account_balance_wallet</span>
    <span class="font-['JetBrains_Mono'] text-xs uppercase tracking-wider">Budgets</span>
  </a>

  <!-- Inactive nav item -->
  <a class="flex items-center gap-3 px-4 py-3 text-on-surface/70 hover:text-primary hover:bg-white/50 transition-all rounded-lg">
    <span class="material-symbols-outlined">dashboard</span>
    <span class="font-['JetBrains_Mono'] text-xs uppercase tracking-wider">Dashboard</span>
  </a>
</aside>
```

| Property | Value |
|---|---|
| Width | `240px` (`w-60`) fixed |
| Background | `#f3f4f3` (`surface-container-low`) |
| Brand | Geist, 22px, weight 900, `text-primary` |
| Nav label font | JetBrains Mono, 10px, `uppercase`, `tracking-wider` |
| Nav icon size | `20px`, stroke `1.5px` |
| Active bg | `#ffffff` + `shadow-sm` |
| Active text | `text-primary`, bold, `translate-x-1` |
| Inactive text | `text-on-surface/70` |
| Hover | `hover:bg-white/50 hover:text-primary` |
| Tablet (641–1024px) | Collapses to `56px` — labels hidden, icons only, tooltips on hover |
| Mobile (≤640px) | Hidden entirely — replaced by Bottom Navigation component |

---

## Context Selectors (Sidebar)

Compact workspace / account / period selectors at the top of the sidebar, above nav items.

```html
<!-- Workspace selector (inactive) -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/60 transition-colors text-left">
  <span class="material-symbols-outlined text-outline" style="font-size:16px">home</span>
  <div class="flex-1 min-w-0">
    <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 leading-tight">Workspace</div>
    <div class="text-[12px] font-semibold text-on-surface truncate">Home</div>
  </div>
  <span class="material-symbols-outlined text-outline/40" style="font-size:14px">unfold_more</span>
</button>

<!-- Account selector (active — highlighted) -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/[0.08] text-left mt-0.5">
  <span class="material-symbols-outlined text-primary" style="font-size:16px">account_balance</span>
  <div class="flex-1 min-w-0">
    <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 leading-tight">Account</div>
    <div class="text-[12px] font-semibold text-primary truncate">Example Account</div>
  </div>
  <span class="material-symbols-outlined text-outline/40" style="font-size:14px">unfold_more</span>
</button>

<!-- Period selector (inactive) -->
<button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/60 transition-colors text-left mt-0.5">
  <span class="material-symbols-outlined text-outline" style="font-size:16px">calendar_month</span>
  <div class="flex-1 min-w-0">
    <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 leading-tight">Period</div>
    <div class="font-mono text-[12px] font-bold text-on-surface">Feb 2026</div>
  </div>
  <span class="material-symbols-outlined text-outline/40" style="font-size:14px">unfold_more</span>
</button>
```

| Property | Value |
|---|---|
| Position | Top of sidebar, below brand mark, above nav divider |
| Row height | ~40px |
| Micro-label | JetBrains Mono, 8px, UPPERCASE, `outline` at 60% opacity |
| Value (Workspace/Account) | Geist 12px semibold, `on-surface` or `primary` when active |
| Value (Period) | JetBrains Mono 12px bold — always mono for date values |
| Active/selected state | `bg-primary/8`, icon and value in `primary` |
| Inactive hover | `bg-white/60` |
| Tablet (collapsed sidebar) | Show icon only, centered; label/value hidden |
| Mobile | Not rendered — current context shown via page header breadcrumb instead |

---

## Top Bar

```html
<header class="fixed top-0 right-0 left-60 z-topbar h-16
               bg-[rgba(250,249,248,0.80)] backdrop-blur-md
               flex items-center justify-between px-8">
  <!-- Search: pill shape, surface-container-low bg -->
  <div class="bg-surface-container-low h-10 w-64 rounded-full flex items-center px-4 gap-2 focus-within:bg-surface-container-lowest transition-colors">
    <span class="material-symbols-outlined text-on-surface/60 text-lg">search</span>
    <input class="bg-transparent border-none focus:ring-0 text-sm w-full font-headline" placeholder="Search..."/>
  </div>
  <!-- Actions -->
  <div class="flex items-center gap-6">
    <button class="text-on-surface/60 hover:text-primary transition-colors">
      <span class="material-symbols-outlined">notifications</span>
    </button>
    <!-- Primary CTA -->
    <button class="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
      Add Entry
    </button>
  </div>
</header>
```

---

## Page Header

Every page uses a compact two-line header. **Never use `display-lg` scale (28–32px) for page titles** — the title is a navigational anchor, not a hero element.

```html
<div class="flex items-end justify-between mb-7">
  <div>
    <!-- Context breadcrumb: always JetBrains Mono, muted -->
    <div class="font-mono text-[9px] uppercase tracking-widest text-outline/70 mb-1.5">
      Feb 2026 · Example Account
    </div>
    <!-- Page title: heading scale — NOT display-lg -->
    <h1 class="text-[20px] font-headline font-extrabold tracking-tight text-on-surface leading-none">
      Transactions
    </h1>
  </div>
  <!-- Page-level actions -->
  <div class="flex gap-2 items-center">
    <button class="bg-surface-container-high text-on-surface px-3.5 py-2 rounded-lg text-[13px] font-medium hover:bg-surface-container transition-all">
      Export
    </button>
    <button class="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <span class="material-symbols-outlined text-base">add</span>
      Add Transaction
    </button>
  </div>
</div>
```

| Property | Value |
|---|---|
| Title size | `20px`, weight `800` — `heading` scale only |
| Breadcrumb | JetBrains Mono, 9px, UPPERCASE, `outline` at 70% opacity |
| Breadcrumb content | `{Period} · {Account name}` |
| Bottom margin | `28px` before first content section |
| On mobile | Title and actions wrap; actions row sits below title |

---

## Buttons

```html
<!-- Primary -->
<button class="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg text-sm font-semibold
               hover:opacity-90 active:scale-[0.98] transition-all
               shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
  Add Entry
</button>

<!-- Secondary -->
<button class="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg text-sm font-medium
               hover:bg-surface-container transition-all">
  Cancel
</button>

<!-- FAB -->
<button class="fixed bottom-6 right-6 h-12 w-12 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-full
               shadow-[0_8px_32px_rgba(75,87,170,0.20),0_4px_12px_rgba(47,51,51,0.08)]
               flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-modal">
  <span class="material-symbols-outlined text-xl">add_task</span>
</button>

<!-- Ghost (on primary-bg panels) -->
<button class="bg-white/10 hover:bg-white/20 text-on-primary px-4 py-2 rounded-lg
               text-xs font-bold uppercase tracking-widest font-mono transition-colors">
  Upgrade Plan
</button>
```

| Variant | Background | Text | Notes |
|---|---|---|---|
| Primary | `linear-gradient(135deg, #4b57aa, #3f4b9d)` | `#f9f6ff` | Inner glow via `box-shadow: inset 0 1px 0 rgba(255,255,255,0.10)` |
| Secondary | `surface-container-high` | `on-surface` | No border, no shadow |
| Ghost | `rgba(255,255,255,0.10)` | `on-primary` | On primary-bg panels only |
| FAB | Primary gradient | `on-primary` | 48px circle, indigo float shadow |

Never use a flat hex on CTA buttons. Always use the gradient.

---

## Input Fields

```html
<!-- Label always JetBrains Mono uppercase -->
<label class="font-mono text-[9px] uppercase tracking-widest text-outline">Amount</label>

<!-- Input -->
<input class="bg-surface-container-highest border-none rounded-lg px-3 py-2
              font-mono text-sm text-on-surface
              focus:bg-surface-container-lowest focus:outline-none
              focus:ring-2 focus:ring-primary-container
              transition-all"/>
```

| State | Background | Ring |
|---|---|---|
| Inactive | `surface-container-highest` (#dfe3e2) | None |
| Hover | `surface-container-high` (#e6e9e8) | None |
| Focus | `surface-container-lowest` (#ffffff) | `2px primary-container` (#dfe0ff) |
| Error | `error-container` at 15% opacity | `2px error` |
| Disabled | `surface-container` (#edeeed), opacity 50% | None |

---

## Segmented Control

Replaces radio buttons for binary or ternary exclusive choices. Primary use: Expense / Income type selector in transaction forms.

```html
<div class="bg-surface-container-low rounded-lg p-0.5 flex gap-0.5">
  <!-- Active: Expense -->
  <button class="flex-1 py-1.5 rounded-md text-[12px] font-semibold transition-all
                 bg-surface-container-lowest text-negative
                 shadow-[0_1px_3px_rgba(47,51,51,0.10)]">
    Expense
  </button>
  <!-- Inactive: Income -->
  <button class="flex-1 py-1.5 rounded-md text-[12px] font-semibold transition-all
                 bg-transparent text-on-surface-variant hover:text-on-surface">
    Income
  </button>
</div>
```

| State | Background | Text |
|---|---|---|
| Track | `surface-container-low` | — |
| Active (expense) | `surface-container-lowest` + subtle shadow | `negative` (#e11d48) |
| Active (income) | `surface-container-lowest` + subtle shadow | `positive` (#10b981) |
| Inactive | Transparent | `on-surface-variant` |
| Inactive hover | Transparent | `on-surface` |

**Rule:** Never use radio buttons for a binary choice that appears inside a modal or form.

---

## Cards

```html
<div class="bg-surface-container-lowest px-4 py-3 rounded-lg shadow-sm
            group hover:ring-1 hover:ring-primary/20 transition-all">
  <!-- content -->
</div>
```

| Property | Value |
|---|---|
| Background | `surface-container-lowest` (#ffffff) |
| Radius | `12px` (md) or `16px` (lg) — never 8px for main cards |
| Padding | `16px` compact, `20–24px` standard |
| Item separation | `gap: 12px` whitespace — **no divider lines** |
| Group separation | Background shift to `surface-container-lowest` — **no divider lines** |
| Hover | `ring-1 ring-primary/20` |

---

## Balance Card (Compact)

Compact design for per-currency balance cards on the Dashboard.

```html
<div class="bg-surface-container-lowest rounded-md p-4 shadow-sm hover:shadow-md transition-shadow">
  <!-- Currency label + recalc action -->
  <div class="flex items-center justify-between mb-1.5">
    <span class="font-mono text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">PLN</span>
    <button class="font-mono text-[8px] uppercase tracking-wider text-outline
                   bg-surface-container-low px-2 py-0.5 rounded-full
                   hover:text-on-surface-variant transition-colors">
      Recalc
    </button>
  </div>
  <!-- Closing balance — primary number, always positive/negative color -->
  <div class="font-mono text-[22px] font-bold text-positive tracking-tight leading-none mb-2.5">
    1,786.20
  </div>
  <!-- Meta grid: show only rows with non-zero values -->
  <div class="grid grid-cols-2 gap-x-2 gap-y-1.5">
    <div>
      <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 mb-0.5">Income</div>
      <div class="font-mono text-[11px] font-semibold text-positive">+6,500.00</div>
    </div>
    <div>
      <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 mb-0.5">Expenses</div>
      <div class="font-mono text-[11px] font-semibold text-negative">6,968.00</div>
    </div>
    <div>
      <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 mb-0.5">Opening</div>
      <div class="font-mono text-[11px] font-semibold text-on-surface-variant">1,000.00</div>
    </div>
    <!-- Only render if value ≠ 0 -->
    <div>
      <div class="font-mono text-[8px] uppercase tracking-widest text-outline/60 mb-0.5">Exch In</div>
      <div class="font-mono text-[11px] font-semibold text-on-surface-variant">+1,255.00</div>
    </div>
  </div>
</div>
```

| Property | Value |
|---|---|
| Grid | `repeat(auto-fill, minmax(190px, 1fr))`, gap `10px` |
| Closing balance | JetBrains Mono, 22px, bold — `positive` if > 0, `negative` if < 0 |
| Currency label | JetBrains Mono, 11px, bold uppercase, `on-surface-variant` |
| Meta labels | JetBrains Mono, 8px, uppercase, `outline` at 60% opacity |
| Meta values | JetBrains Mono, 11px, semibold — semantic color only if sign matters |
| Omit zero rows | Do not render exchange rows when the value is zero or null |

---

## Budget Category Card

```html
<div class="bg-surface-container-lowest px-4 py-3 rounded-lg shadow-sm
            group hover:ring-1 hover:ring-primary/20 transition-all">
  <!-- Row 1: icon + name + amount -->
  <div class="flex justify-between items-start mb-2">
    <div class="flex items-center gap-3">
      <div class="h-8 w-8 bg-primary-container text-on-primary-container rounded flex items-center justify-center">
        <span class="material-symbols-outlined text-lg">home</span>
      </div>
      <div>
        <h4 class="font-headline font-semibold text-xs text-on-surface">Housing & Utilities</h4>
        <p class="font-mono text-[8px] uppercase text-on-surface/40">Recurring</p>
      </div>
    </div>
    <div class="text-right">
      <span class="font-mono text-sm font-bold text-on-surface">2,450.00</span>
      <p class="font-mono text-[8px] text-on-surface/40">of 2,500.00</p>
    </div>
  </div>
  <!-- Progress bar: 4px height -->
  <div class="relative w-full h-1 bg-surface-container-low rounded-full overflow-hidden mb-1.5">
    <div class="absolute top-0 left-0 h-full bg-error rounded-full transition-all" style="width: 98%"></div>
  </div>
  <!-- Status row -->
  <div class="flex justify-between font-mono text-[8px] text-error font-bold uppercase">
    <span>High Burn</span>
    <span>50.00 Left</span>
  </div>
</div>
```

**Progress bar status colors:**

| Status | Bar | Text | Threshold |
|---|---|---|---|
| Low Burn | `bg-primary` | `text-primary/60` | < 30% |
| On Track | `bg-primary` | `text-primary/60` | 30–74% |
| Near Limit | `bg-error` | `text-error font-bold` | 75–94% |
| High Burn | `bg-error` | `text-error font-bold` | ≥ 95% |

---

## Financial Chips / Tags

```html
<!-- Default (category) -->
<span class="inline-flex items-center bg-secondary-container text-on-secondary-container
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Housing
</span>

<!-- Positive (income) -->
<span class="inline-flex items-center bg-positive-container text-on-positive-container
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Income
</span>

<!-- Negative (expense) -->
<span class="inline-flex items-center bg-negative-container text-on-negative-container
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Expense
</span>
```

Shape is always `rounded-full` (pill). Never use rectangular chips.

---

## Data Tables (High Density)

```html
<table class="w-full">
  <!-- Sticky header -->
  <thead class="sticky top-0 bg-surface-container-low">
    <tr>
      <th class="font-mono text-[9px] uppercase tracking-widest text-outline px-3 py-2 text-left">Description</th>
      <th class="font-mono text-[9px] uppercase tracking-widest text-outline px-3 py-2 text-right">Amount</th>
      <th class="font-mono text-[9px] uppercase tracking-widest text-outline px-3 py-2 text-left">Category</th>
    </tr>
  </thead>
  <tbody>
    <tr class="hover:bg-surface-container-lowest transition-colors" style="height: 32px;">
      <td class="font-body text-sm text-on-surface px-3">Grocery Store</td>
      <td class="font-mono text-sm font-bold text-negative px-3 text-right">-84.20 PLN</td>
      <td class="px-3"><!-- chip --></td>
    </tr>
  </tbody>
</table>
```

| Property | Value |
|---|---|
| Row height | Strictly `28px–32px` (desktop), `40px` (mobile) |
| Header bg | `surface-container-low` (#f3f4f3), sticky |
| Header font | JetBrains Mono, 9px, UPPERCASE, `outline` color |
| Row dividers | **None** — hover highlight only |
| Amount column | Always **right-aligned**, JetBrains Mono |
| Text/description | Left-aligned, Geist |
| Selected row | Persistent `surface-container-low` bg |
| Hover row | `surface-container-lowest` bg |

---

## Charts & Sparklines

| Element | Spec |
|---|---|
| Sparkline stroke | `1.5px`, no fill |
| Positive line | `#10b981` (Emerald) |
| Negative line | `#e11d48` (Rose) |
| Bar: inactive | `surface-container-low` fill |
| Bar: active | `primary` fill |
| Bar: hover | `primary/20` fill |
| Progress bar height | `6px–8px` |
| Progress bar radius | `4px` |
| Progress track | `surface-container-low` |
| Axis labels | JetBrains Mono, 8–9px, UPPERCASE, `outline` color |
| Rendering | SVG only (no canvas where avoidable) |

---

## Savings / Goal Panel (Full-Width)

```html
<div class="bg-primary rounded-xl p-6 text-on-primary flex items-center justify-between relative overflow-hidden">
  <!-- Decorative blur spot -->
  <div class="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
  <div class="flex-1">
    <span class="font-mono text-[8px] uppercase tracking-widest opacity-70">Focus Goal</span>
    <h3 class="text-lg font-headline font-bold">New York Vacation Fund</h3>
    <div class="mt-2 flex items-baseline gap-4">
      <span class="font-mono text-2xl font-bold">4,800.00</span>
      <span class="font-headline text-[10px] opacity-70">Target: 6,500.00</span>
    </div>
    <div class="mt-4 max-w-md">
      <div class="h-1.5 w-full bg-white/20 rounded-full overflow-hidden mb-1.5">
        <div class="h-full bg-white rounded-full" style="width: 74%"></div>
      </div>
      <div class="flex justify-between font-mono text-[8px] font-bold uppercase">
        <span>74% Complete</span><span>1,700 to go</span>
      </div>
    </div>
  </div>
  <div class="pl-6 border-l border-white/10 ml-6">
    <p class="font-mono text-[8px] uppercase opacity-50 mb-1">Timeline</p>
    <p class="font-headline text-xs font-bold">Dec 2026</p>
  </div>
</div>
```

---

## Bottom Navigation (Mobile)

Fixed bottom bar visible only on mobile (≤640px). Replaces the sidebar. Maximum 5 slots — center is always the primary action FAB.

```html
<nav class="fixed bottom-0 left-0 right-0 z-bottom-nav
            bg-[rgba(250,249,248,0.96)] backdrop-blur-md
            border-t border-[rgba(174,179,178,0.15)]
            flex justify-around items-end
            pb-[env(safe-area-inset-bottom)]">

  <!-- Standard tab -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-primary">
    <span class="material-symbols-outlined" style="font-size:22px">dashboard</span>
    <span class="font-mono text-[8px] uppercase tracking-wider font-bold">Home</span>
  </button>

  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-outline">
    <span class="material-symbols-outlined" style="font-size:22px">receipt_long</span>
    <span class="font-mono text-[8px] uppercase tracking-wider font-bold">Txns</span>
  </button>

  <!-- Center FAB slot — elevated above the bar -->
  <button class="flex-1 flex flex-col items-center -mt-5">
    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-dim
                flex items-center justify-center
                shadow-[0_6px_20px_rgba(75,87,170,0.32)]
                hover:scale-105 active:scale-95 transition-all">
      <span class="material-symbols-outlined text-on-primary" style="font-size:24px">add</span>
    </div>
  </button>

  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-outline">
    <span class="material-symbols-outlined" style="font-size:22px">event_note</span>
    <span class="font-mono text-[8px] uppercase tracking-wider font-bold">Planned</span>
  </button>

  <!-- "More" opens a bottom sheet with remaining nav items -->
  <button class="flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 text-outline">
    <span class="material-symbols-outlined" style="font-size:22px">grid_view</span>
    <span class="font-mono text-[8px] uppercase tracking-wider font-bold">More</span>
  </button>
</nav>
```

| Property | Value |
|---|---|
| Visibility | Mobile only (`≤640px`) — `display: none` at ≥641px |
| Background | `rgba(250,249,248,0.96)` + `backdrop-blur-md` |
| Border | `1px solid rgba(174,179,178,0.15)` — ghost only |
| Height | ~56px + `safe-area-inset-bottom` |
| Tab labels | JetBrains Mono, 8px, UPPERCASE |
| Active tab | `primary` color (icon + label) |
| Inactive tab | `outline` color |
| FAB | 48px circle, indigo gradient, `box-shadow: 0 6px 20px rgba(75,87,170,0.32)`, `-20px` top margin |
| Max tabs | 5 including FAB slot |
| Overflow nav | Accessible via "More" → bottom sheet |
| Safe area | Always apply `padding-bottom: env(safe-area-inset-bottom)` |

---

## Modal / Dialog

Overlay panel for focused tasks — forms, confirmations, detail views. The most common pattern in the app (15+ modals).

```html
<!-- Backdrop -->
<div class="fixed inset-0 z-modal-backdrop bg-on-surface/40 backdrop-blur-[2px]"></div>

<!-- Panel (medium size) -->
<div class="fixed inset-0 z-modal flex items-center justify-center p-4">
  <div class="bg-surface-container-lowest rounded-xl w-full max-w-lg
              shadow-[0_8px_32px_rgba(75,87,170,0.12),0_2px_8px_rgba(47,51,51,0.06)]
              animate-[modalIn_120ms_ease-out]
              flex flex-col max-h-[85vh]">

    <!-- Header -->
    <div class="flex items-center justify-between px-6 pt-5 pb-3">
      <h2 class="font-headline text-[17px] font-bold text-on-surface">Add Transaction</h2>
      <button class="text-outline hover:text-on-surface transition-colors p-1 -mr-1
                     rounded-lg hover:bg-surface-container-high">
        <span class="material-symbols-outlined" style="font-size:20px">close</span>
      </button>
    </div>

    <!-- Body (scrollable) -->
    <div class="flex-1 overflow-y-auto px-6 py-2 scrollbar-thin">
      <!-- form fields or content -->
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-2 px-6 pt-3 pb-5">
      <button class="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg text-[13px] font-medium
                     hover:bg-surface-container transition-all">
        Cancel
      </button>
      <button class="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg
                     text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        Save Transaction
      </button>
    </div>
  </div>
</div>
```

```css
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.97) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

| Property | Value |
|---|---|
| Backdrop | `on-surface` at 40% opacity + `blur(2px)` |
| Panel bg | `surface-container-lowest` |
| Radius | `16px` (xl) |
| Shadow | `0 8px 32px rgba(75,87,170,0.12), 0 2px 8px rgba(47,51,51,0.06)` |
| Max height | `85vh` |
| Header padding | `24px` left/right, `20px` top, `12px` bottom |
| Body padding | `24px` left/right, `8px` top/bottom — scrollable with `scrollbar-thin` |
| Footer padding | `24px` left/right, `12px` top, `20px` bottom |
| Open | `scale(0.97) translateY(4px)` → identity, `120ms ease-out` |
| Close | `80ms ease-in`, opacity only — no scale on exit |
| Dismiss | Click backdrop, `Escape` key, or close button |

### Size Variants

| Size | Max Width | Use |
|---|---|---|
| `sm` | `400px` | Confirmation dialogs, simple prompts |
| `md` | `520px` (`max-w-lg`) | Standard forms (transaction, category, budget) |
| `lg` | `640px` (`max-w-2xl`) | Complex forms, import/export, multi-step wizards |

### Mobile (≤640px)

Modal converts to a bottom sheet — see `responsive.md` for the CSS. Additional specs:

| Property | Value |
|---|---|
| Width | `100%`, no horizontal margin |
| Radius | `16px 16px 0 0` (top corners only) |
| Max height | `92dvh` |
| Drag handle | `32px × 4px` rounded bar, `surface-container-high`, centered, `8px` top margin |
| Swipe down | Dismiss gesture (threshold: 80px drag distance) |
| Footer | Sticky to bottom with `safe-area-inset-bottom` padding |

---

## Form Layout

Standard vertical form used inside modals and pages.

```html
<form class="space-y-4">
  <!-- Single field -->
  <div>
    <label class="font-mono text-[9px] uppercase tracking-widest text-outline mb-1.5 block">
      Description <span class="text-negative">*</span>
    </label>
    <input class="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5
                  font-body text-sm text-on-surface
                  focus:bg-surface-container-lowest focus:outline-none
                  focus:ring-2 focus:ring-primary-container transition-all"
           placeholder="What was this for?"/>
  </div>

  <!-- Field with validation error -->
  <div>
    <label class="font-mono text-[9px] uppercase tracking-widest text-outline mb-1.5 block">
      Amount <span class="text-negative">*</span>
    </label>
    <input class="w-full bg-error/[0.06] border-none rounded-lg px-3 py-2.5
                  font-mono text-sm text-on-surface
                  ring-2 ring-error/40 focus:outline-none transition-all"/>
    <div class="flex items-center gap-1 mt-1.5">
      <span class="material-symbols-outlined text-error" style="font-size:14px">error</span>
      <span class="text-[12px] text-error font-medium">Amount must be greater than 0</span>
    </div>
  </div>

  <!-- Two-column row (collapses on mobile) -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label class="font-mono text-[9px] uppercase tracking-widest text-outline mb-1.5 block">
        Category
      </label>
      <!-- select component -->
    </div>
    <div>
      <label class="font-mono text-[9px] uppercase tracking-widest text-outline mb-1.5 block">
        Date
      </label>
      <!-- date input -->
    </div>
  </div>

  <!-- Helper text -->
  <p class="text-[12px] text-outline leading-relaxed">
    Transactions are recorded in the current period's currency.
  </p>
</form>
```

| Property | Value |
|---|---|
| Field gap | `16px` (`space-y-4`) |
| Group gap | `24px` between logical field groups (`space-y-6` between groups) |
| Label | JetBrains Mono, 9px, UPPERCASE, `outline` — `6px` below label |
| Required indicator | `*` in `negative` color, placed after label text |
| Input height | `40px` (`py-2.5` + `text-sm`) |
| Error input bg | `error` at 6% opacity |
| Error ring | `error` at 40% opacity, `2px` |
| Error message | 12px, `error`, medium weight, `14px` error icon, `6px` top margin |
| Helper text | 12px, `outline`, `leading-relaxed` |
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

## Confirmation Dialog

Uses the Modal at `sm` size (400px). Always requires explicit user action — never auto-dismiss.

```html
<div class="bg-surface-container-lowest rounded-xl w-full max-w-[400px] p-6
            shadow-[0_8px_32px_rgba(75,87,170,0.12),0_2px_8px_rgba(47,51,51,0.06)]">
  <!-- Icon + text -->
  <div class="flex items-start gap-3 mb-5">
    <div class="h-10 w-10 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
      <span class="material-symbols-outlined text-error" style="font-size:22px">warning</span>
    </div>
    <div>
      <h3 class="font-headline text-[15px] font-bold text-on-surface">Delete transaction?</h3>
      <p class="font-body text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">
        This will permanently remove "Grocery Store — 84.20 PLN". This action cannot be undone.
      </p>
    </div>
  </div>
  <!-- Actions -->
  <div class="flex justify-end gap-2">
    <button class="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg text-[13px] font-medium
                   hover:bg-surface-container transition-all">
      Cancel
    </button>
    <button class="bg-error text-white px-4 py-2 rounded-lg text-[13px] font-semibold
                   hover:bg-error/90 transition-all">
      Delete
    </button>
  </div>
</div>
```

### Variants

| Variant | Icon | Icon bg | CTA bg | CTA text |
|---|---|---|---|---|
| Destructive | `warning` | `error/10` | `error` solid | `white` |
| Confirm | `help` | `primary/10` | Primary gradient | `on-primary` |
| Warning | `warning` | `warning/10` | `warning` solid | `white` |

| Property | Value |
|---|---|
| Max width | `400px` |
| Padding | `24px` uniform |
| Icon container | `40px` circle, semantic color at 10% opacity |
| Title | Geist, 15px, bold |
| Description | Geist, 13px, `on-surface-variant`, `leading-relaxed` |
| Button gap | `8px` |
| Focus on open | Auto-focus **Cancel** button (never the destructive action) |
| Mobile | Bottom sheet, same content layout |

---

## Select / Custom Dropdown

Styled dropdown trigger that replaces native `<select>`. Opens the Dropdown & Menu component (see `patterns.md`).

```html
<!-- Trigger: value selected -->
<div>
  <label class="font-mono text-[9px] uppercase tracking-widest text-outline mb-1.5 block">Category</label>
  <button class="w-full flex items-center justify-between
                 bg-surface-container-highest rounded-lg px-3 py-2.5
                 text-sm text-on-surface text-left
                 hover:bg-surface-container-high
                 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none
                 transition-all">
    <div class="flex items-center gap-2 min-w-0">
      <span class="material-symbols-outlined text-on-surface-variant" style="font-size:16px">restaurant</span>
      <span class="truncate">Food & Groceries</span>
    </div>
    <span class="material-symbols-outlined text-outline flex-shrink-0 transition-transform"
          style="font-size:18px">expand_more</span>
  </button>
</div>

<!-- Trigger: placeholder (nothing selected) -->
<button class="w-full flex items-center justify-between
               bg-surface-container-highest rounded-lg px-3 py-2.5
               text-sm text-outline text-left ...">
  <span>Select category...</span>
  <span class="material-symbols-outlined text-outline" style="font-size:18px">expand_more</span>
</button>
```

| Property | Value |
|---|---|
| Trigger style | Identical to text inputs (same bg, radius, height, focus ring) |
| Placeholder | `outline` color text |
| Selected value | `on-surface` color, optional leading icon (16px) |
| Chevron | `expand_more`, 18px, `outline` — rotates `180deg` when open (120ms) |
| Dropdown panel | Reuses Dropdown & Menu from `patterns.md` |
| Keyboard | `Space`/`Enter` opens; `ArrowDown`/`ArrowUp` navigate; `Enter` selects; `Escape` closes |
| On mobile | Opens as a bottom sheet instead of floating dropdown |
| Error state | Same error ring/bg as text inputs when validation fails |

---

## Toggle / Switch

Binary on/off control. Use for settings and preferences — **never** use a checkbox for on/off toggles.

```html
<!-- Off state -->
<label class="inline-flex items-center gap-3 cursor-pointer">
  <button role="switch" aria-checked="false"
          class="relative inline-flex h-6 w-11 items-center rounded-full
                 bg-surface-container-high transition-colors duration-[120ms]
                 focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2">
    <span class="inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm
                 translate-x-[3px] transition-transform duration-[120ms]"></span>
  </button>
  <span class="font-body text-sm text-on-surface">Dark mode</span>
</label>

<!-- On state -->
<label class="inline-flex items-center gap-3 cursor-pointer">
  <button role="switch" aria-checked="true"
          class="relative inline-flex h-6 w-11 items-center rounded-full
                 bg-primary transition-colors duration-[120ms]
                 focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2">
    <span class="inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm
                 translate-x-[22px] transition-transform duration-[120ms]"></span>
  </button>
  <span class="font-body text-sm text-on-surface">Dark mode</span>
</label>
```

| State | Track | Thumb |
|---|---|---|
| Off | `surface-container-high` | `white`, left position |
| Off hover | `surface-container` | — |
| On | `primary` | `white`, right position |
| On hover | `primary-dim` | — |
| Disabled | `surface-container` at 50% opacity | — |

| Property | Value |
|---|---|
| Track | `44px × 24px`, `rounded-full` |
| Thumb | `18px` circle, `white`, `shadow-sm` |
| Transition | `120ms` for both track color and thumb position |
| Focus | `2px primary-container` ring, `2px` offset |
| ARIA | `role="switch"`, `aria-checked`, `aria-label` required |
| Label | Geist body text to the right, `12px` gap |

---

## Avatar

User identity indicator. Shows a photo or initials fallback.

```html
<!-- With image -->
<div class="h-8 w-8 rounded-full overflow-hidden bg-primary-container flex-shrink-0">
  <img src="/avatar.jpg" alt="John D." class="h-full w-full object-cover"/>
</div>

<!-- Initials fallback -->
<div class="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
  <span class="font-mono text-[10px] font-bold text-on-primary-container">JD</span>
</div>

<!-- With online indicator -->
<div class="relative">
  <div class="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center">
    <span class="font-mono text-[10px] font-bold text-on-primary-container">JD</span>
  </div>
  <div class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-positive
              ring-2 ring-surface-container-lowest"></div>
</div>
```

### Size Scale

| Size | Class | Initials Font | Use |
|---|---|---|---|
| `xs` | `h-6 w-6` (24px) | 8px | Inline mentions, compact lists |
| `sm` | `h-8 w-8` (32px) | 10px | Sidebar user footer, table rows |
| `md` | `h-10 w-10` (40px) | 12px | Member lists, workspace cards |
| `lg` | `h-12 w-12` (48px) | 14px | Profile page, settings header |

| Property | Value |
|---|---|
| Shape | Always `rounded-full` |
| Fallback bg | `primary-container` |
| Initials | JetBrains Mono, bold, `on-primary-container` — max 2 chars |
| Online dot | `positive` bg, `12px`, `ring-2 ring-surface-container-lowest` |
| Group (stacked) | Overlap by `8px`, each with `ring-2 ring-surface-container-lowest` |

---

## Badge / Notification Dot

Small indicators for unread counts or status. Always positioned on a parent element.

```html
<!-- Dot only (unread indicator) -->
<div class="relative">
  <span class="material-symbols-outlined">notifications</span>
  <div class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-negative"></div>
</div>

<!-- Count badge -->
<div class="relative">
  <span class="material-symbols-outlined">notifications</span>
  <div class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1
              bg-negative rounded-full flex items-center justify-center
              font-mono text-[9px] font-bold text-white">
    3
  </div>
</div>

<!-- Large count (capped) -->
<div class="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1.5
            bg-negative rounded-full flex items-center justify-center
            font-mono text-[9px] font-bold text-white">
  99+
</div>
```

| Variant | Size | Content |
|---|---|---|
| Dot | `8px` circle | None — presence indicator only |
| Count | `18px` min-height/width, pill shape | Number, capped at `99+` |

| Property | Value |
|---|---|
| Background | `negative` |
| Text | `white`, JetBrains Mono, 9px, bold |
| Position | `absolute`, offset `-2px` to `-6px` from parent corner |
| Radius | `rounded-full` |
| Max display | `99+` — values above 99 truncate |
| Parent | Must have `position: relative` |

---

## Pagination

For long lists (transactions, members). Desktop shows page numbers; mobile uses "Load More".

```html
<!-- Desktop: numbered pagination -->
<div class="flex items-center justify-between py-3">
  <span class="font-mono text-[11px] text-outline">1-50 of 1,234</span>

  <div class="flex items-center gap-1">
    <button disabled class="h-8 w-8 rounded-lg flex items-center justify-center text-outline/40">
      <span class="material-symbols-outlined" style="font-size:18px">chevron_left</span>
    </button>
    <!-- Active page -->
    <button class="h-8 min-w-[32px] px-1 rounded-lg flex items-center justify-center
                   bg-primary text-on-primary font-mono text-[12px] font-bold">1</button>
    <button class="h-8 min-w-[32px] px-1 rounded-lg flex items-center justify-center
                   text-on-surface font-mono text-[12px] hover:bg-surface-container-low transition-colors">2</button>
    <button class="h-8 min-w-[32px] px-1 rounded-lg flex items-center justify-center
                   text-on-surface font-mono text-[12px] hover:bg-surface-container-low transition-colors">3</button>
    <span class="text-outline font-mono text-[12px] px-1">...</span>
    <button class="h-8 min-w-[32px] px-1 rounded-lg flex items-center justify-center
                   text-on-surface font-mono text-[12px] hover:bg-surface-container-low transition-colors">25</button>
    <button class="h-8 w-8 rounded-lg flex items-center justify-center
                   text-on-surface hover:bg-surface-container-low transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">chevron_right</span>
    </button>
  </div>
</div>

<!-- Mobile: Load More -->
<div class="flex flex-col items-center py-6 gap-2">
  <button class="bg-surface-container-high text-on-surface px-6 py-2.5 rounded-lg text-[13px] font-medium
                 hover:bg-surface-container transition-all">
    Load More
  </button>
  <span class="font-mono text-[11px] text-outline">Showing 50 of 1,234</span>
</div>
```

| Property | Value |
|---|---|
| Count text | JetBrains Mono, 11px, `outline` |
| Page button | `32px` min square, `rounded-lg` |
| Active page | `primary` bg, `on-primary` text, bold |
| Inactive page | Transparent bg, `on-surface` text |
| Hover | `surface-container-low` bg |
| Disabled arrow | `outline/40`, `cursor-not-allowed` |
| Ellipsis | `...` in `outline` color |
| Font | JetBrains Mono, 12px |
| Desktop | Full numbered pages with prev/next arrows |
| Mobile | "Load More" button — simpler, one-thumb friendly |
| Default per page | `50` — future user preference for `25 / 50 / 100` |

---

## Search Results Dropdown

Appears below the top-bar search input on focus. Groups results by type.

```html
<div class="absolute top-full mt-1 left-0 right-0
            bg-surface-container-lowest rounded-xl
            shadow-[0_8px_32px_rgba(75,87,170,0.12),0_2px_8px_rgba(47,51,51,0.06)]
            z-dropdown max-h-[360px] overflow-y-auto scrollbar-thin
            animate-[fadeIn_100ms_ease-out]">

  <!-- Recent searches (shown when input is empty) -->
  <div class="px-3 pt-3 pb-1">
    <span class="font-mono text-[8px] uppercase tracking-widest text-outline/60">Recent</span>
  </div>
  <button class="w-full flex items-center gap-2.5 px-3 h-9 text-left
                 text-[13px] text-on-surface-variant hover:bg-surface-container-low transition-colors">
    <span class="material-symbols-outlined" style="font-size:16px">history</span>
    <span>Grocery</span>
  </button>

  <!-- Grouped results -->
  <div class="px-3 pt-3 pb-1">
    <span class="font-mono text-[8px] uppercase tracking-widest text-outline/60">Transactions</span>
  </div>
  <button class="w-full flex items-center gap-2.5 px-3 h-10 text-left
                 hover:bg-surface-container-low transition-colors">
    <span class="material-symbols-outlined text-on-surface-variant" style="font-size:16px">receipt_long</span>
    <div class="flex-1 min-w-0">
      <span class="text-[13px] text-on-surface">
        <mark class="bg-primary-container/50 text-on-surface rounded-sm px-0.5">Grocery</mark> Store
      </span>
    </div>
    <span class="font-mono text-[11px] text-negative font-semibold">-84.20</span>
  </button>

  <!-- No results state -->
  <div class="px-3 py-8 text-center">
    <span class="text-[13px] text-outline">No results for "xyz"</span>
  </div>
</div>
```

| Property | Value |
|---|---|
| Trigger | Search input focus; minimum 2 characters for query results |
| Max height | `360px`, `overflow-y: auto` with `scrollbar-thin` |
| Match highlight | `<mark>` with `primary-container/50` bg, `rounded-sm` |
| Groups | Transactions, Categories, Planned — each with a group label |
| Recent | Shown when input is empty; `history` icon, `on-surface-variant` |
| No results | Centered "No results for ..." in `outline` color |
| Max per group | `5` items, with "View all {type}" link at bottom of group |
| Keyboard | `ArrowDown`/`ArrowUp` navigate; `Enter` selects; `Escape` closes |
| Dismiss | Click outside, `Escape`, or select an item |

---

## Icons

Use **Material Symbols Outlined** exclusively.

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<style>
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
</style>
```

| Context | Size | Stroke |
|---|---|---|
| Sidebar nav | `20px` | `1.5px` (via `wght` 200) |
| Top bar actions | `24px` | default |
| Card icons (in containers) | `18–20px` | default |
| Inline / micro | `16px` | default |
