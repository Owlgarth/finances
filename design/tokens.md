# Design Tokens

> Colors, typography, spacing, borders, and border radius.
> For dark mode token overrides see `dark-mode.md`.

---

## 1. Fonts

Always import both. No substitutes (no Inter, Roboto, Arial, system-ui).

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
```

| Role | Font | Use |
|---|---|---|
| UI text, headings, labels, body, navigation | `Geist` | All prose, navigation labels, headings, button text |
| **All financial data** | `JetBrains Mono` | Currency, percentages, dates, IDs, transaction amounts, balance displays |

**Rule:** Every currency value, percentage, date, and transaction ID **must** use JetBrains Mono. Never render `$4,280.00` in Geist. This applies to all tabular data, balance cards, budget amounts, and financial summaries.

### Type Scale

The type scale is intentionally narrow (11–16px) to maintain a dense, ledger-like aesthetic. Headings lead with weight and spacing, not size.

| Element | Font | Weight | Size | Style | Tailwind Classes |
|---|---|---|---|---|---|
| Page Titles | Geist | 600 | 16px | Standard | `text-base font-semibold` |
| Section Titles | Geist | 500 | 14px | Standard | `text-sm font-medium` |
| Body UI | Geist | 400 | 13px | Standard | `text-[13px] font-normal` |
| Financial Amounts | JetBrains Mono | 500 | 12px | Tabular | `font-mono text-xs font-medium tabular-nums` |
| Labels / Headers | Geist | 500 | 11px | Uppercase, tracking-wider | `text-[11px] font-medium uppercase tracking-wider` |
| Metadata | JetBrains Mono | 400 | 11px | Standard | `font-mono text-[11px] font-normal` |
| Table Headers | Geist | 500 | 10px | Uppercase, tracking-wider | `text-[10px] font-medium uppercase tracking-wider` |

> **Note on `tabular-nums`:** JetBrains Mono is already tabular by design, but explicitly setting `font-variant-numeric: tabular-nums` via the `tabular-nums` Tailwind utility ensures consistent column alignment in all browsers.

---

## 2. Color Tokens — CSS Variables

These are the **only** hex values in the system. Every component references the CSS variable, never the raw hex. Dark mode overrides are defined in `dark-mode.md`.

```css
:root {
  /* Brand / Primary */
  --color-primary: #171717;
  --color-primary-hover: #262626;

  /* Surfaces */
  --color-background: #FAFAFA;
  --color-surface: #FFFFFF;
  --color-surface-hover: #F5F5F5;
  --color-surface-muted: #E5E5E5;

  /* Borders */
  --color-border: #E5E5E5;
  --color-border-focus: #171717;

  /* Text */
  --color-text: #171717;
  --color-text-muted: #737373;

  /* Semantic / Financial */
  --color-positive: #059669;
  --color-positive-bg: #ECFDF5;
  --color-negative: #DC2626;
  --color-negative-bg: #FEF2F2;
  --color-warning: #D97706;
  --color-warning-bg: #FFFBEB;
}
```

### Token Reference Table

#### Brand / Primary

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `primary` | `--color-primary` | `#171717` | Primary buttons, active states, CTAs, focus borders |
| `primary-hover` | `--color-primary-hover` | `#262626` | Button hover state, active hover |

#### Surfaces

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `background` | `--color-background` | `#FAFAFA` | Page background, zebra stripe alternate rows |
| `surface` | `--color-surface` | `#FFFFFF` | Cards, modals, panels, zebra stripe primary rows |
| `surface-hover` | `--color-surface-hover` | `#F5F5F5` | Row hover, item hover, interactive surface hover |
| `surface-muted` | `--color-surface-muted` | `#E5E5E5` | Disabled backgrounds, inactive fills, secondary button backgrounds |

#### Borders

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `border` | `--color-border` | `#E5E5E5` | All container borders, dividers, card borders, table cell borders |
| `border-focus` | `--color-border-focus` | `#171717` | Input focus state, active card indicator, focus ring |

#### Text

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `text` | `--color-text` | `#171717` | Primary body text, headings — **never use `#000`** |
| `text-muted` | `--color-text-muted` | `#737373` | Secondary labels, subtitles, placeholder text, metadata |

#### Semantic / Financial

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `positive` | `--color-positive` | `#059669` | Income, inflow, under-budget indicators |
| `positive-bg` | `--color-positive-bg` | `#ECFDF5` | Income chip backgrounds, positive highlight fills |
| `negative` | `--color-negative` | `#DC2626` | Expenses, outflow, over-budget, error states, required field markers |
| `negative-bg` | `--color-negative-bg` | `#FEF2F2` | Expense chip backgrounds, destructive action hover, error fills |
| `warning` | `--color-warning` | `#D97706` | Non-critical warnings, caution states, nearing budget limits |
| `warning-bg` | `--color-warning-bg` | `#FFFBEB` | Warning chip backgrounds, caution fills |

> **Rule:** Only use `positive` / `negative` colors for financial movement. `warning` is for non-blocking caution states (e.g., nearing budget limit). Neutral data stays in `text` / `text-muted`.

---

## 3. Tailwind Config

Paste this into every Moniteria project. Uses CSS custom properties so dark mode works automatically — see `dark-mode.md` for the variable overrides.

```js
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand
        "primary":        "var(--color-primary)",
        "primary-hover":  "var(--color-primary-hover)",

        // Surfaces
        "background":     "var(--color-background)",
        "surface":        "var(--color-surface)",
        "surface-hover":  "var(--color-surface-hover)",
        "surface-muted":  "var(--color-surface-muted)",

        // Borders
        "border":         "var(--color-border)",
        "border-focus":   "var(--color-border-focus)",

        // Text
        "text":           "var(--color-text)",
        "text-muted":     "var(--color-text-muted)",

        // Semantic / Financial
        "positive":       "var(--color-positive)",
        "positive-bg":    "var(--color-positive-bg)",
        "negative":       "var(--color-negative)",
        "negative-bg":    "var(--color-negative-bg)",
        "warning":        "var(--color-warning)",
        "warning-bg":     "var(--color-warning-bg)",
      },
      fontFamily: {
        "sans":   ["Geist", "sans-serif"],
        "mono":   ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "sm":    "4px",     // Containers, cards, modals
        "none":  "0px",     // Internal grid elements, inputs, table cells
      },
      zIndex: {
        "dropdown":       "100",
        "sticky":         "200",
        "sidebar":        "300",
        "bottom-nav":     "300",
        "topbar":         "400",
        "modal-backdrop": "500",
        "modal":          "510",
        "toast":          "600",
        "tooltip":        "700",
      },
    },
  },
}
```

### Usage Examples

```html
<!-- Container with border -->
<div class="bg-surface border border-border rounded-sm p-4">

<!-- Primary button -->
<button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover">

<!-- Input -->
<input class="bg-surface border border-border rounded-none px-2 py-1.5 text-xs font-mono text-text focus:border-border-focus focus:outline-none">

<!-- Chip (rectangular) -->
<span class="px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] uppercase tracking-wider">

<!-- Table row (zebra) -->
<tr class="bg-surface">  <!-- or bg-background for alternate -->
```

---

## 4. Layout & Spacing

4px baseline grid. All margins and paddings must be multiples of 4.

| Element | Value | Tailwind |
|---|---|---|
| Sidebar width | `240px` fixed | `w-60` |
| Top bar height | `48px` fixed | `h-12` |
| Main container padding | `16px` | `p-4` |
| Card internal padding | `12px` or `16px` | `p-3` or `p-4` |
| Table row height | `32px` **strict** | `h-8` |
| Dashboard grid gap | `12px` | `gap-3` |
| Major section separation | `32px` | `mb-8` or `space-y-8` |
| Item separation within groups | `8px` or `12px` | `gap-2` or `gap-3` |
| Sidebar nav item height | `32px` | `h-8` |
| Standard button padding | `12px 6px` | `px-3 py-1.5` |
| Input padding | `8px 6px` | `px-2 py-1.5` |
| Touch target minimum | `44px × 44px` (mobile) | `min-h-[44px] min-w-[44px]` |

---

## 5. Borders & Radius

### The Border Rule

All container boundaries are defined by **1px borders** (`border border-border`). Depth is achieved through the contrast between `--color-background` and `--color-surface`, not through shadows or surface layering. Borders are structural — they define edges and boundaries. They are not decorative.

### Border Radius

| Context | Value | Tailwind | Use |
|---|---|---|---|
| Containers | `4px` | `rounded-sm` | Cards, modals, panels, dropdowns, popovers |
| Internal elements | `0px` | `rounded-none` | Inputs, table cells, grid items, inline fields, progress bars |
| Chips / Tags | `4px` | `rounded-sm` | Rectangular chips with borders — never pills |

**Never** use `rounded-lg` (8px), `rounded-xl` (16px), or `rounded-full` (9999px) on any element.

### Border Usage

| Element | Border | Tailwind |
|---|---|---|
| Cards | 1px, `--color-border` | `border border-border` |
| Table container | 1px, `--color-border` | `border border-border` |
| Table rows | 1px bottom, `--color-border` | `border-b border-border` |
| Table header | 1px bottom, `--color-border` | `border-b border-border` |
| Inputs | 1px, `--color-border`; focus → `--color-border-focus` | `border border-border focus:border-border-focus` |
| Chips | 1px, semantic or `--color-border` | `border border-border` |
| Modals | 1px, `--color-border` | `border border-border` |
| Dropdowns | 1px, `--color-border` | `border border-border` |
| Sidebar separator | 1px right, `--color-border` | `border-r border-border` |
| Active nav indicator | 2px left, `--color-primary` | `border-l-2 border-primary` |

### Zero Shadows

```css
/* This entire section is empty by design. */
/* No shadows exist in the Architectural Ledger system. */
/* Depth comes from 1px borders and surface contrast only. */
```

The CSS variables `--shadow-card` and `--shadow-float` have been removed. Any existing `shadow-sm`, `shadow-lg`, `shadow-card`, or `shadow-float` usage in the codebase must be replaced with `border border-border`.
