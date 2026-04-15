# Dark Mode

> Dark mode token overrides for the Architectural Ledger design system.
> Controlled by a `.dark` class on `<html>`. All overrides are CSS custom properties — the Tailwind config in `tokens.md` references these vars, so dark mode works automatically.

---

## 1. CSS Variable Overrides

```css
.dark {
  /* Brand / Primary */
  --color-primary:         #E5E5E5;
  --color-primary-hover:   #D4D4D4;

  /* Surfaces */
  --color-background:      #0A0A0A;
  --color-surface:         #171717;
  --color-surface-hover:   #262626;
  --color-surface-muted:   #333333;

  /* Borders */
  --color-border:          #333333;
  --color-border-focus:    #E5E5E5;

  /* Text */
  --color-text:            #FAFAFA;
  --color-text-muted:      #A3A3A3;

  /* Semantic / Financial */
  --color-positive:        #34D399;
  --color-positive-bg:     #064E3B;
  --color-negative:        #F87171;
  --color-negative-bg:     #450A0A;
  --color-warning:         #FBBF24;
  --color-warning-bg:      #451A03;
}
```

---

## 2. Tailwind Config — Dark Mode Reference

The Tailwind config in `tokens.md` uses `darkMode: "class"` and references `var(--color-*)` for every token. No additional Tailwind configuration is needed for dark mode — the `.dark` class on `<html>` triggers all variable overrides.

```js
tailwind.config = {
  darkMode: "class",  // ← toggled via .dark class on <html>
  theme: {
    extend: {
      colors: {
        "primary":       "var(--color-primary)",       // Light: #171717 → Dark: #E5E5E5
        "primary-hover": "var(--color-primary-hover)",  // Light: #262626 → Dark: #D4D4D4
        "background":    "var(--color-background)",     // Light: #FAFAFA → Dark: #0A0A0A
        "surface":       "var(--color-surface)",        // Light: #FFFFFF  → Dark: #171717
        "surface-hover": "var(--color-surface-hover)",  // Light: #F5F5F5 → Dark: #262626
        "surface-muted": "var(--color-surface-muted)",  // Light: #E5E5E5 → Dark: #333333
        "border":        "var(--color-border)",         // Light: #E5E5E5 → Dark: #333333
        "border-focus":  "var(--color-border-focus)",   // Light: #171717 → Dark: #E5E5E5
        "text":          "var(--color-text)",           // Light: #171717 → Dark: #FAFAFA
        "text-muted":    "var(--color-text-muted)",     // Light: #737373 → Dark: #A3A3A3
        "positive":      "var(--color-positive)",       // Light: #059669 → Dark: #34D399
        "positive-bg":   "var(--color-positive-bg)",    // Light: #ECFDF5 → Dark: #064E3B
        "negative":      "var(--color-negative)",       // Light: #DC2626 → Dark: #F87171
        "negative-bg":   "var(--color-negative-bg)",    // Light: #FEF2F2 → Dark: #450A0A
        "warning":       "var(--color-warning)",        // Light: #D97706 → Dark: #FBBF24
        "warning-bg":    "var(--color-warning-bg)",     // Light: #FFFBEB → Dark: #451A03
      },
    },
  },
}
```

No component-level `dark:` variants are needed — every component already uses semantic tokens (e.g., `bg-surface`, `text-text`, `border-border`) which resolve to the correct dark values automatically.

---

## 3. Surface Layers — Light → Dark Mapping

In dark mode, the layering direction inverts: backgrounds become near-black and surfaces become slightly lighter darks. The relative order is preserved — `background` is always the deepest layer, `surface` is always elevated above it.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-background` | `#FAFAFA` | `#0A0A0A` | Page background, zebra stripe alternate rows |
| `--color-surface` | `#FFFFFF` | `#171717` | Cards, modals, panels, primary zebra rows |
| `--color-surface-hover` | `#F5F5F5` | `#262626` | Row hover, interactive surface hover |
| `--color-surface-muted` | `#E5E5E5` | `#333333` | Disabled backgrounds, inactive fills |

### Dark Surface Hierarchy

```
#0A0A0A  ← background (deepest — page canvas, alternating table rows)
#171717  ← surface (cards, modals, primary table rows)
#262626  ← surface-hover (interactive hover state)
#333333  ← surface-muted (disabled, inactive fills — also serves as border color)
```

---

## 4. Text Colors — Light → Dark Mapping

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-text` | `#171717` | `#FAFAFA` | Primary body text, headings |
| `--color-text-muted` | `#737373` | `#A3A3A3` | Secondary labels, metadata, placeholders |

Text and surface tokens cross-swap between modes — light text on dark surfaces, dark text on light surfaces.

---

## 5. Brand / Primary — Light → Dark Mapping

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-primary` | `#171717` | `#E5E5E5` | Primary buttons, active states, CTAs |
| `--color-primary-hover` | `#262626` | `#D4D4D4` | Button hover state |

In dark mode, the primary button inverts to a light surface color (`#E5E5E5`) with dark text (`#171717` from the text token). This preserves the flat, non-gradient button style while maintaining high contrast.

```html
<!-- Primary button — works in both modes -->
<button class="bg-primary text-white dark:text-background px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover">
  Add Transaction
</button>
```

---

## 6. Borders — Light → Dark Mapping

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-border` | `#E5E5E5` | `#333333` | All container borders, dividers, card edges |
| `--color-border-focus` | `#171717` | `#E5E5E5` | Input focus ring, active card indicator |

Border and focus tokens cross-swap in dark mode, mirroring the text color inversion. The focus ring remains high-contrast against dark surfaces.

---

## 7. Semantic / Financial Colors — Light → Dark Mapping

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-positive` | `#059669` | `#34D399` | Income, inflow, under-budget |
| `--color-positive-bg` | `#ECFDF5` | `#064E3B` | Income chip backgrounds |
| `--color-negative` | `#DC2626` | `#F87171` | Expenses, outflow, over-budget, errors |
| `--color-negative-bg` | `#FEF2F2` | `#450A0A` | Expense chip backgrounds, error fills |
| `--color-warning` | `#D97706` | `#FBBF24` | Non-critical warnings, budget limits |
| `--color-warning-bg` | `#FFFBEB` | `#451A03` | Warning chip backgrounds |

Semantic text colors shift to lighter, more vivid values in dark mode to maintain legibility against dark surfaces. Background tokens become deeply saturated darks rather than pale tints.

### Dark Mode Chip Examples

```html
<!-- Income chip -->
<span class="px-2 py-0.5 border border-positive/20 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-positive-bg text-positive">
  INCOME
</span>

<!-- Expense chip -->
<span class="px-2 py-0.5 border border-negative/20 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-negative-bg text-negative">
  EXPENSE
</span>

<!-- Warning chip -->
<span class="px-2 py-0.5 border border-warning/20 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-warning-bg text-warning">
  WARNING
</span>
```

---

## 8. Shadows — Zero Shadows in Dark Mode

The Architectural Ledger system uses **zero shadows in both light and dark mode**. Depth comes exclusively from 1px borders and surface contrast.

```css
/* This applies equally to light and dark mode. */
/* No shadows exist in the system. */
/* Depth comes from border contrast and surface layering only. */
```

```html
<!-- Card — same border treatment in both modes -->
<div class="bg-surface border border-border rounded-sm p-4">
  <!-- No shadow, no shadow-dark -->
</div>

<!-- Modal — same treatment -->
<div class="bg-surface border border-border rounded-sm">
  <!-- No shadow, no backdrop-shadow -->
</div>
```

The old `--shadow-card` and `--shadow-float` variables have been removed entirely. They do not have dark mode equivalents.

---

## 9. Scrollbar Styling — Dark Mode

### Webkit (Chrome, Safari, Edge)

```css
/* Light mode */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(229, 229, 229, 0.4);   /* #E5E5E5 at 40% */
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(229, 229, 229, 0.6);
}

/* Dark mode */
.dark ::-webkit-scrollbar-thumb {
  background: rgba(51, 51, 51, 0.6);       /* #333333 at 60% — higher opacity for visibility */
  border-radius: 3px;
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(51, 51, 51, 0.8);
}
```

### Firefox

```css
/* Light mode */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(229, 229, 229, 0.4) transparent;
}

/* Dark mode */
.dark * {
  scrollbar-color: rgba(51, 51, 51, 0.6) transparent;
}
```

Dark mode uses a higher base opacity (60% vs 40%) because the near-black thumb against a near-black track requires more contrast to remain perceptible.

---

## 10. Backdrop / Overlay — Dark Mode

Modals and dropdowns use a backdrop in both modes. The dark mode backdrop uses the inverted primary color at low opacity.

```css
/* Light mode */
.modal-backdrop {
  background: rgba(23, 23, 23, 0.20);     /* #171717 at 20% */
  backdrop-filter: blur(4px);
}

/* Dark mode */
.dark .modal-backdrop {
  background: rgba(0, 0, 0, 0.50);         /* Pure black at 50% */
  backdrop-filter: blur(4px);
}
```

```html
<!-- Tailwind classes — works in both modes -->
<div class="bg-primary/20 dark:bg-black/50 backdrop-blur-sm">
  <!-- Modal backdrop -->
</div>
```

---

## 11. Contrast Ratios — WCAG Compliance

All dark mode color pairings meet WCAG AA (4.5:1 for normal text, 3:1 for large text).

### Primary Text on Surfaces

| Foreground | Background | Ratio | Standard |
|---|---|---|---|
| `--color-text` (#FAFAFA) | `--color-background` (#0A0A0A) | ~17.9:1 | AAA ✓ |
| `--color-text` (#FAFAFA) | `--color-surface` (#171717) | ~14.5:1 | AAA ✓ |
| `--color-text-muted` (#A3A3A3) | `--color-surface` (#171717) | ~6.0:1 | AA ✓ |
| `--color-text-muted` (#A3A3A3) | `--color-background` (#0A0A0A) | ~7.5:1 | AAA ✓ |

### Brand / Primary

| Foreground | Background | Ratio | Standard |
|---|---|---|---|
| `--color-primary` (#E5E5E5) | `--color-surface` (#171717) | ~12.1:1 | AAA ✓ |
| `--color-border-focus` (#E5E5E5) | `--color-surface` (#171717) | ~12.1:1 | AAA ✓ |

### Semantic Colors on Surface

| Foreground | Background | Ratio | Standard |
|---|---|---|---|
| `--color-positive` (#34D399) | `--color-surface` (#171717) | ~8.5:1 | AAA ✓ |
| `--color-negative` (#F87171) | `--color-surface` (#171717) | ~5.0:1 | AA ✓ |
| `--color-warning` (#FBBF24) | `--color-surface` (#171717) | ~10.0:1 | AAA ✓ |

### Semantic Colors on Their Backgrounds

| Foreground | Background | Ratio | Standard |
|---|---|---|---|
| `--color-positive` (#34D399) | `--color-positive-bg` (#064E3B) | ~7.4:1 | AAA ✓ |
| `--color-negative` (#F87171) | `--color-negative-bg` (#450A0A) | ~5.3:1 | AA ✓ |
| `--color-warning` (#FBBF24) | `--color-warning-bg` (#451A03) | ~9.7:1 | AAA ✓ |

---

## 12. Toggle Mechanism

Dark mode is controlled by a `.dark` class on `<html>`. It should respect:

1. **User preference** stored in `UserPreferences.theme` (`light`, `dark`, `system`)
2. **System preference** via `prefers-color-scheme` when set to `system`

```js
// On page load — before React renders to avoid flash
const pref = userPreferences?.theme ?? 'system';
if (pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

// When user changes preference
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (theme === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    // system
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  }
}

// Listen for system preference changes (when in 'system' mode)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (userPreferences?.theme === 'system') {
    document.documentElement.classList.toggle('dark', e.matches);
  }
});
```

### Preventing Flash of Wrong Theme

Add an inline `<script>` in `index.html` before React loads:

```html
<script>
  // Prevent flash of wrong theme — runs before React hydration
  (function() {
    var theme = localStorage.getItem('monie_theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (theme === 'dark' || (theme === 'system' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

This ensures the correct background color is applied on first paint, before the JS bundle loads.
