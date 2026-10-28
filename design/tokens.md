# Design Tokens

> Colors, typography, spacing, borders, and border radius.
> For dark mode token overrides see `dark-mode.md`.

---

## 1. Fonts

Always declare both. No substitutes (no Inter, Roboto, Arial, system-ui).

Both families are self-hosted: the woff2 files live in `frontend/public/fonts/`, declared by the `@font-face` block at the top of `frontend/src/index.css` - no fonts are fetched from a third-party CDN. One representative rule (the full set - one rule per family, weight, and subset - lives in `index.css`):

```css
/* latin */
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/fonts/geist-2026-09-12-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

The declarations mirror the css2 response the previous CDN link served - same family names, weights, `unicode-range` splitting, and `font-display: swap` - so rendering and glyph coverage are unchanged; the subsets include latin-ext (Polish) and cyrillic (Ukrainian), covering every supported UI language. Filenames carry the fetch date (`geist-2026-09-12-latin.woff2`) so a future font swap changes the URL and cleanly busts nginx's 1-year immutable caching for `.woff2`. Both families are licensed SIL OFL 1.1; the license files ship alongside the fonts (`frontend/public/fonts/OFL-*.txt`).

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

#### Budget Ledger Columns

| Token | CSS Variable | Hex | Use |
|---|---|---|---|
| `planned` | `--color-planned` | `#64809F` | Planned-value column in the budget ledger (slate blue) |
| `actual` | `--color-actual` | `#A3814F` | Actual-spend column in the budget ledger (tan) |
| `remaining` | `--color-remaining` | `#5E937B` | Remaining-value column in the budget ledger (sage green) |

The three ledger columns are deliberately muted pastels so the planned/actual/remaining value columns stay tellable apart without competing with the semantic red/green used for financial movement. Dark mode maps them to lighter pastel steps of the same hues (see `dark-mode.md`).

#### Overlays

| Token | CSS Variable | Value | Use |
|---|---|---|---|
| `scrim` | `--color-scrim` | `rgba(23, 23, 23, 0.20)` | Modal/drawer backdrop - `#171717` (primary) at 20%; dark mode uses pure black at 50% |

---

## 3. Tailwind CSS 4 Theme (CSS-First)

Since Tailwind CSS 4 the theme lives in CSS at the top of `frontend/src/index.css` - there is no `tailwind.config.js`. Uses CSS custom properties so dark mode works automatically — see `dark-mode.md` for the variable overrides.

```css
@import "tailwindcss" source(none);
@source "./**/*.{js,ts,jsx,tsx}";
@source "../index.html";

@custom-variant dark (&:where(.dark, .dark *));

/* Touch-target floor keys on pointer coarseness, not viewport width:
   tablets and landscape phones above `sm` are still touch devices. */
@custom-variant pointer-coarse (@media (pointer: coarse));

/* Design tokens (design/tokens.md is the contract) - inline mode: utilities emit the
   :root/.dark runtime vars below, no duplicate :root emission. Key name == var name. */
@theme inline {
  /* Brand */
  --color-primary: var(--color-primary);
  --color-primary-hover: var(--color-primary-hover);
  /* Surfaces */
  --color-background: var(--color-background);
  --color-surface: var(--color-surface);
  --color-surface-hover: var(--color-surface-hover);
  --color-surface-muted: var(--color-surface-muted);
  /* Borders */
  --color-border: var(--color-border);
  --color-border-focus: var(--color-border-focus);
  /* Text */
  --color-text: var(--color-text);
  --color-text-muted: var(--color-text-muted);
  /* Semantic / Financial */
  --color-positive: var(--color-positive);
  --color-positive-bg: var(--color-positive-bg);
  --color-negative: var(--color-negative);
  --color-negative-bg: var(--color-negative-bg);
  --color-warning: var(--color-warning);
  --color-warning-bg: var(--color-warning-bg);
  /* Budget ledger columns (muted pastels) */
  --color-planned: var(--color-planned);
  --color-actual: var(--color-actual);
  --color-remaining: var(--color-remaining);
  /* Overlays */
  --color-scrim: var(--color-scrim);
}

@theme {
  --font-sans: "Geist", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --radius-sm: 4px;   /* == v4 native 0.25rem; explicit as contract documentation */
  --radius-none: 0px; /* == v4 native; explicit for the contract */
  /* v3 line-height contract: ABSOLUTE values so arbitrary-size children
     (text-[10px] etc.) inherit the used px, not a unitless ratio. v4 pairs
     each named size with a unitless ratio (sm: calc(1.25 / .875)), which
     recomputes against every child font size; these are the v3 absolute
     pairings, pinned for every named size the tree uses (a census governs
     the list - add a size here when a new named size enters the tree). */
  --text-xs--line-height: 1rem;
  --text-sm--line-height: 1.25rem;
  --text-base--line-height: 1.5rem;
  --text-lg--line-height: 1.75rem;
  --text-xl--line-height: 1.75rem;
}

/* v4 has no --z-index-* namespace: the semantic z-scale (design rule: never raw
   z-10/z-50 for overlays) lives as utilities. */
@utility z-dropdown { z-index: 100; }
@utility z-sticky { z-index: 200; }
@utility z-sidebar { z-index: 300; }
@utility z-bottom-nav { z-index: 300; }
@utility z-topbar { z-index: 400; }
@utility z-modal-backdrop { z-index: 500; }
@utility z-modal { z-index: 510; }
@utility z-toast { z-index: 600; }
@utility z-tooltip { z-index: 700; }

/* Variant-composable custom utility (supersedes the v3 addUtilities plugin; plain
   @layer utilities classes stay variant-inert - see .touch-hit below). The property
   pair mirrors the global scrollbar block lower in this file (§9): standard
   `scrollbar-width` (Firefox, Chrome 121+) plus the WebKit pseudo-element. No
   `-ms-overflow-style`: the codebase ships no -ms- prefixes anywhere. */
@utility scrollbar-none {
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

/* v4 preflight drops the v3 button cursor - preserve app behavior. */
@layer base {
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
}
```

Three contract statements:

1. **The runtime `:root`/`.dark` custom properties remain the source of every token VALUE.** `@theme inline` makes each utility emit a `var(--color-*)` reference; Tailwind never re-emits the `:root` definitions into the compiled sheet, so dark mode still works purely by variable override (`dark-mode.md`).
2. **Theme key name == variable name.** The `@theme inline` key `--color-primary-hover` IS the token: it generates the `*-primary-hover` utilities. Never rename one side without the other.
3. **`/N` alpha modifiers are active.** Token utilities compose with opacity modifiers (`border-positive/20`, `text-text-muted/30`) resolved via `color-mix()`. Tailwind 4 activates them; Tailwind 3 silently dropped them for `var()`-mapped colors, so a v3-era `/N` suffix never rendered.

### Usage Examples

```html
<!-- Container with border -->
<div class="bg-surface border border-border rounded-sm p-4">

<!-- Primary button -->
<button class="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover">

<!-- Input -->
<input class="bg-surface border border-border rounded-none px-2 py-1.5 text-xs font-mono text-text focus:border-border-focus focus:outline-hidden">

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
