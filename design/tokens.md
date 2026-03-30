# Design Tokens

> Colors, typography, spacing, borders, and border radius.
> For dark mode token overrides see `dark-mode.md`.

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
| `positive-container` | `#d1fae5` | Income chip/tag backgrounds |
| `on-positive-container` | `#065f46` | Text on positive-container bg |
| `negative` | `#e11d48` | Expenses, outflow, over budget |
| `negative-container` | `#ffe4e9` | Expense chip/tag backgrounds |
| `on-negative-container` | `#6b1728` | Text on negative-container bg |
| `warning` | `#f59e0b` | Non-critical warnings, caution states |
| `warning-container` | `#fef3c7` | Warning chip/tag backgrounds |
| `on-warning-container` | `#78350f` | Text on warning-container bg |
| `error` | `#9e3f4e` | Form errors, critical warnings |
| `error-container` | `#ff8b9a` | Error chip/tag backgrounds |
| `tertiary-container` | `#91f78e` | Success/low-burn backgrounds |
| `on-tertiary-container` | `#005e17` | Text on tertiary-container |

> **Rule:** Only use `positive`/`negative` colors for financial movement. `warning` is for non-blocking caution states (e.g., nearing budget limit). Neutral data stays in `on-surface` / `on-surface-variant`.

---

## 3. Tailwind Config

Paste this into every Monie project. Uses CSS custom properties so dark mode works automatically — see `dark-mode.md` for the variable definitions.

```js
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary":                  "var(--color-primary)",
        "primary-dim":              "var(--color-primary-dim)",
        "primary-container":        "var(--color-primary-container)",
        "on-primary":               "var(--color-on-primary)",
        "on-primary-container":     "var(--color-on-primary-container)",
        "secondary":                "var(--color-secondary)",
        "secondary-container":      "var(--color-secondary-container)",
        "on-secondary-container":   "var(--color-on-secondary-container)",
        "secondary-fixed":          "var(--color-secondary-fixed)",
        "on-secondary-fixed":       "var(--color-on-secondary-fixed)",
        "surface":                  "var(--color-surface)",
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        "surface-container-low":    "var(--color-surface-container-low)",
        "surface-container":        "var(--color-surface-container)",
        "surface-container-high":   "var(--color-surface-container-high)",
        "surface-container-highest":"var(--color-surface-container-highest)",
        "surface-variant":          "var(--color-surface-variant)",
        "on-surface":               "var(--color-on-surface)",
        "on-surface-variant":       "var(--color-on-surface-variant)",
        "outline":                  "var(--color-outline)",
        "outline-variant":          "var(--color-outline-variant)",
        "error":                    "var(--color-error)",
        "error-container":          "var(--color-error-container)",
        "tertiary":                 "var(--color-tertiary)",
        "tertiary-container":       "var(--color-tertiary-container)",
        "on-tertiary-container":    "var(--color-on-tertiary-container)",
        "warning":                  "var(--color-warning)",
        "warning-container":        "var(--color-warning-container)",
        "on-warning-container":     "var(--color-on-warning-container)",
        "positive":                 "var(--color-positive)",
        "positive-container":       "var(--color-positive-container)",
        "on-positive-container":    "var(--color-on-positive-container)",
        "negative":                 "var(--color-negative)",
        "negative-container":       "var(--color-negative-container)",
        "on-negative-container":    "var(--color-on-negative-container)",
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
