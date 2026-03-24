# Monie Design System — AI Agent Reference
> Philosophy: **"Warm Precision"** — editorial financial UI. No cold brutalism, no bubbly consumer apps.
> Stack: Tailwind CSS + Geist + JetBrains Mono + Material Symbols Outlined icons.

---

## 1. Fonts

Always import both. No substitutes (no Inter, Roboto, Arial, system-ui).

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
```

| Role | Font | Use |
|---|---|---|
| Headlines, UI labels, body | `Geist` | All prose, navigation labels, headings |
| **All numbers** | `JetBrains Mono` | Currency, percentages, dates, IDs, transaction amounts, nav items |

**Rule:** Every currency value, percentage, date, and transaction ID **must** use JetBrains Mono. Never render `$4,280.00` in Geist.

### Type Scale

| Token | Font | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-lg` | Geist | 28–32px | 900 | -0.04em | Account balances, hero numbers |
| `heading` | Geist | 18–22px | 800 | -0.025em | Page titles, section headers |
| `body` | Geist | 13–14px | 500 | 0 | Labels, descriptions, body text |
| `mono-amount` | JetBrains Mono | 13–14px | 700 | 0 | All currency/numerical values |
| `micro` | JetBrains Mono | 9–11px | 700 | 0.12em | UPPERCASE tags, status labels, nav items |

---

## 2. Color Tokens

These are the **only** hex values to use. Do not invent new colors.

### Brand

| Token | Hex | Use |
|---|---|---|
| `primary` | `#4b57aa` | CTAs, active states, brand accents |
| `primary-dim` | `#3f4b9d` | Button gradient end, hover |
| `primary-container` | `#dfe0ff` | Focus rings, chip backgrounds, highlights |
| `on-primary` | `#f9f6ff` | Text on primary buttons |
| `on-primary-container` | `#3e4a9c` | Text on primary-container bg |

### Secondary

| Token | Hex | Use |
|---|---|---|
| `secondary-container` | `#c9e7f7` | Financial chip backgrounds |
| `on-secondary-container` | `#395663` | Text on secondary-container |
| `secondary-fixed` | `#c9e7f7` | Alternate chip/tag bg |
| `on-secondary-fixed` | `#264350` | Text on secondary-fixed |

### Surface Layers (use in this order — deepest to highest)

| Token | Hex | Layer | Use |
|---|---|---|---|
| `surface-container-low` | `#f3f4f3` | L1 | Sidebar, secondary panels |
| `surface` | `#faf9f8` | L2 | Main canvas background |
| `surface-container-lowest` | `#ffffff` | L3 | Cards, modals, floating elements |
| `surface-container` | `#edeeed` | — | Mid-level containers |
| `surface-container-high` | `#e6e9e8` | — | Secondary button fill |
| `surface-container-highest` | `#dfe3e2` | — | Inactive input backgrounds |
| `surface-variant` | `#dfe3e2` | — | Icon container backgrounds |

### Text

| Token | Hex | Use |
|---|---|---|
| `on-surface` | `#2f3333` | All body text — **never use `#000`** |
| `on-surface-variant` | `#5b605f` | Secondary labels, subtitles |
| `outline` | `#777c7b` | Muted labels, axis text |
| `outline-variant` | `#aeb3b2` | Ghost borders (at 15% opacity only) |

### Semantic (financial data only)

| Token | Hex | Use |
|---|---|---|
| `positive` | `#10b981` | Income, inflow, under budget |
| `negative` | `#e11d48` | Expenses, outflow, over budget |
| `error` | `#9e3f4e` | Form errors, critical warnings |
| `error-container` | `#ff8b9a` | Error chip/tag backgrounds |
| `tertiary-container` | `#91f78e` | Success/low-burn backgrounds |
| `on-tertiary-container` | `#005e17` | Text on tertiary-container |

> **Rule:** Only use `positive`/`negative` colors for financial movement. Neutral data stays in `on-surface` / `on-surface-variant`.

---

## 3. Tailwind Config

Paste this into every Monie project:

```js
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary":                  "#4b57aa",
        "primary-dim":              "#3f4b9d",
        "primary-container":        "#dfe0ff",
        "on-primary":               "#f9f6ff",
        "on-primary-container":     "#3e4a9c",
        "secondary":                "#466370",
        "secondary-container":      "#c9e7f7",
        "on-secondary-container":   "#395663",
        "secondary-fixed":          "#c9e7f7",
        "on-secondary-fixed":       "#264350",
        "surface":                  "#faf9f8",
        "surface-container-lowest": "#ffffff",
        "surface-container-low":    "#f3f4f3",
        "surface-container":        "#edeeed",
        "surface-container-high":   "#e6e9e8",
        "surface-container-highest":"#dfe3e2",
        "surface-variant":          "#dfe3e2",
        "on-surface":               "#2f3333",
        "on-surface-variant":       "#5b605f",
        "outline":                  "#777c7b",
        "outline-variant":          "#aeb3b2",
        "error":                    "#9e3f4e",
        "error-container":          "#ff8b9a",
        "tertiary":                 "#006f1d",
        "tertiary-container":       "#91f78e",
        "on-tertiary-container":    "#005e17",
      },
      fontFamily: {
        "headline": ["Geist", "sans-serif"],
        "body":     ["Geist", "sans-serif"],
        "mono":     ["JetBrains Mono", "monospace"],
        "label":    ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "sm":      "4px",    // avoid — checkboxes only
        "DEFAULT": "8px",    // buttons, nav items
        "md":      "12px",   // cards
        "lg":      "16px",   // large cards, modals
        "xl":      "16px",
        "full":    "9999px", // chips, pills, search
      },
    },
  },
}
```

---

## 4. Layout & Spacing

4px baseline grid. All margins and paddings must be multiples of 4.

| Element | Value |
|---|---|
| Sidebar width | `240px` fixed |
| Top bar height | `64px` fixed, sticky |
| Main container padding | `24px–32px` |
| Card internal padding | `16px–20px` |
| Table row height | `28px–32px` (strict) |
| Dashboard grid gap | `16px` |
| Major section separation | `56px–64px` whitespace — no dividers |
| Item separation within groups | `12px` whitespace — no dividers |
| Sidebar nav item height | `40px` |

---

## 5. Borders & Depth

### The No-Border Rule
**Never** use `1px solid` borders to define containers, sections, or list items. Structure is achieved through background color shifts only.

### Surface Layering (primary depth method)
Stack surfaces to create depth without shadows:
- Sidebar (`#f3f4f3`) → Main canvas (`#faf9f8`) → Cards (`#ffffff`)
- This contrast creates natural lift without visual noise.

### Shadows (use sparingly)
```css
/* Ambient card shadow */
box-shadow: 0 4px 24px rgba(47,51,51,0.06), 0 1px 4px rgba(47,51,51,0.04);

/* Floating element / FAB (indigo-tinted) */
box-shadow: 0 8px 32px rgba(75,87,170,0.12), 0 2px 8px rgba(47,51,51,0.06);
```
Never use black-based shadows (`rgba(0,0,0,...)`). Always tint with `on-surface` or the brand indigo.

### Ghost Border (accessibility fallback only)
```css
/* Use ONLY when a boundary is required for accessibility */
border: 1px solid rgba(174, 179, 178, 0.15); /* outline-variant at 15% max */
```
100% opaque borders are forbidden everywhere.

### Glassmorphism (top bar & floating nav)
```css
background: rgba(250, 249, 248, 0.80);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
/* No border-bottom. No box-shadow on the bar. */
```

---

## 6. Border Radius

| Token | Value | Use |
|---|---|---|
| `sm` | `4px` | Avoid. Checkboxes only. |
| `DEFAULT` | `8px` | Buttons, nav items, small containers |
| `md` | `12px` | Cards, category widgets |
| `lg` / `xl` | `16px` | Large cards, panels, modals |
| `full` | `9999px` | Chips, pills, search bar |

Never use `0px` radius on any user-facing element larger than a checkbox.

---

## 7. Components

### Sidebar

```html
<aside class="fixed left-0 top-0 h-full w-60 bg-[#f3f4f3] flex flex-col p-6 z-50">
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

---

### Top Bar

```html
<header class="fixed top-0 right-0 left-60 z-40 h-16
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
    <button class="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all">
      Add Entry
    </button>
  </div>
</header>
```

---

### Buttons

```html
<!-- Primary -->
<button class="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium
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
<button class="fixed bottom-6 right-6 h-12 w-12 bg-primary text-on-primary rounded-full
               shadow-[0_8px_32px_rgba(75,87,170,0.20),0_4px_12px_rgba(47,51,51,0.08)]
               flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50">
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

### Input Fields

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

### Cards

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

### Budget Category Card

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
      <span class="font-mono text-sm font-bold text-on-surface">$2,450</span>
      <p class="font-mono text-[8px] text-on-surface/40">of $2,500</p>
    </div>
  </div>
  <!-- Progress bar: 4px height -->
  <div class="relative w-full h-1 bg-surface-container-low rounded-full overflow-hidden mb-1.5">
    <div class="absolute top-0 left-0 h-full bg-error rounded-full transition-all" style="width: 98%"></div>
  </div>
  <!-- Status row -->
  <div class="flex justify-between font-mono text-[8px] text-error font-bold uppercase">
    <span>High Burn</span>
    <span>$50 Left</span>
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

### Financial Chips / Tags

```html
<!-- Default -->
<span class="inline-flex items-center bg-secondary-container text-on-secondary-container
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Housing
</span>

<!-- Positive -->
<span class="inline-flex items-center bg-[#d1fae5] text-[#065f46]
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Income
</span>

<!-- Negative / Error -->
<span class="inline-flex items-center bg-error-container text-[#6b1728]
             px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider">
  Overdue
</span>
```

Shape is always `rounded-full` (pill). Never use rectangular chips.

---

### Data Tables (High Density)

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
      <td class="font-mono text-sm font-bold text-on-surface px-3 text-right">-$84.20</td>
      <td class="px-3"><!-- chip --></td>
    </tr>
  </tbody>
</table>
```

| Property | Value |
|---|---|
| Row height | Strictly `28px–32px` |
| Header bg | `surface-container-low` (#f3f4f3), sticky |
| Header font | JetBrains Mono, 9px, UPPERCASE, `outline` color |
| Row dividers | **None** — hover highlight only |
| Amount column | Always **right-aligned**, JetBrains Mono |
| Text/description | Left-aligned, Geist |
| Selected row | Persistent `surface-container-low` bg |
| Hover row | `surface-container-lowest` bg |

---

### Charts & Sparklines

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

### Savings / Goal Panel (Full-Width)

```html
<div class="bg-primary rounded-xl p-6 text-on-primary flex items-center justify-between relative overflow-hidden">
  <!-- Decorative blur spot -->
  <div class="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
  <div class="flex-1">
    <span class="font-mono text-[8px] uppercase tracking-widest opacity-70">Focus Goal</span>
    <h3 class="text-lg font-headline font-bold">New York Vacation Fund</h3>
    <div class="mt-2 flex items-baseline gap-4">
      <span class="font-mono text-2xl font-bold">$4,800.00</span>
      <span class="font-headline text-[10px] opacity-70">Target: $6,500.00</span>
    </div>
    <div class="mt-4 max-w-md">
      <div class="h-1.5 w-full bg-white/20 rounded-full overflow-hidden mb-1.5">
        <div class="h-full bg-white rounded-full" style="width: 74%"></div>
      </div>
      <div class="flex justify-between font-mono text-[8px] font-bold uppercase">
        <span>74% Complete</span><span>$1,700 to go</span>
      </div>
    </div>
  </div>
  <div class="pl-6 border-l border-white/10 ml-6">
    <p class="font-mono text-[8px] uppercase opacity-50 mb-1">Timeline</p>
    <p class="font-headline text-xs font-bold">Dec 2024</p>
  </div>
</div>
```

---

## 8. Icons

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
- Use `#000` for text — always use `#2f3333`
- Use `0px` or `4px` radius on cards or panels
- Use Inter, Roboto, Arial, or system fonts
- Use opaque headers — top bar requires glassmorphism
- Use black-based shadows (`rgba(0,0,0,...)`)
- Use divider lines between table rows or list items
- Render currency/amounts in Geist — Mono only
- Use flat hex on primary CTA buttons — always use gradient
- Apply positive/negative semantic colors to non-financial data

### ALWAYS
- Structure sections with background color shifts, not borders
- Use `surface-container-low` → `surface` → `surface-container-lowest` for depth
- Use JetBrains Mono for every number, percentage, date, ID, and nav label
- Apply glassmorphism to the top bar
- Tint shadows with `on-surface` (#2f3333) or indigo (#4b57aa) — never black
- Use gradient `linear-gradient(135deg, #4b57aa, #3f4b9d)` on primary buttons
- Right-align all amount columns in tables
- Use `rounded-full` (pill) for all chips and tags
- Use whitespace (56–64px) between major sections
- Keep table rows strictly within 28–32px height
