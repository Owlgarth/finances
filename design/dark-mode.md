# Dark Mode

> Dark mode is controlled by a `.dark` class on `<html>`.
> Implemented via CSS custom properties — see `tokens.md` for the Tailwind config that references these vars.

---

## Token Mapping

### Surface Layers

In dark mode the layering direction stays the same (sidebar = deepest, cards = most elevated) but the colours invert toward dark values.

| Token | Light | Dark |
|---|---|---|
| `surface-container-low` | `#f3f4f3` | `#141618` |
| `surface` | `#faf9f8` | `#1a1c1e` |
| `surface-container-lowest` | `#ffffff` | `#222527` |
| `surface-container` | `#edeeed` | `#2a2d30` |
| `surface-container-high` | `#e6e9e8` | `#333638` |
| `surface-container-highest` | `#dfe3e2` | `#3c3f42` |
| `surface-variant` | `#dfe3e2` | `#3c3f42` |

### Text

| Token | Light | Dark |
|---|---|---|
| `on-surface` | `#2f3333` | `#e3e6e5` |
| `on-surface-variant` | `#5b605f` | `#b0b4b3` |
| `outline` | `#777c7b` | `#8d918f` |
| `outline-variant` | `#aeb3b2` | `#4a4e4d` |

### Brand

| Token | Light | Dark |
|---|---|---|
| `primary` | `#4b57aa` | `#9ba5e8` |
| `primary-dim` | `#3f4b9d` | `#8892d9` |
| `primary-container` | `#dfe0ff` | `#2d3168` |
| `on-primary` | `#f9f6ff` | `#1c1e45` |
| `on-primary-container` | `#3e4a9c` | `#c4c9ff` |

### Secondary

| Token | Light | Dark |
|---|---|---|
| `secondary` | `#466370` | `#8ab4c8` |
| `secondary-container` | `#c9e7f7` | `#1a3540` |
| `on-secondary-container` | `#395663` | `#a5d2e8` |
| `secondary-fixed` | `#c9e7f7` | `#1e3a47` |
| `on-secondary-fixed` | `#264350` | `#a5d2e8` |

### Tertiary

| Token | Light | Dark |
|---|---|---|
| `tertiary` | `#006f1d` | `#6fe56c` |

### Semantic

| Token | Light | Dark |
|---|---|---|
| `positive` | `#10b981` | `#34d399` |
| `positive-container` | `#d1fae5` | `#064e3b` |
| `on-positive-container` | `#065f46` | `#6ee7b7` |
| `negative` | `#e11d48` | `#fb7185` |
| `negative-container` | `#ffe4e9` | `#4c0519` |
| `on-negative-container` | `#6b1728` | `#fda4af` |
| `warning` | `#f59e0b` | `#fbbf24` |
| `warning-container` | `#fef3c7` | `#451a03` |
| `on-warning-container` | `#78350f` | `#fde68a` |
| `error` | `#9e3f4e` | `#f28090` |
| `error-container` | `#ff8b9a` | `#5a1f2b` |
| `tertiary-container` | `#91f78e` | `#0a3a11` |
| `on-tertiary-container` | `#005e17` | `#6fe56c` |

---

## Contrast Checks

| Pair | Ratio | Standard |
|---|---|---|
| `on-surface` (#e3e6e5) on `surface` (#1a1c1e) | ~13.5:1 | AAA ✓ |
| `primary` (#9ba5e8) on `surface` (#1a1c1e) | ~6.2:1 | AA+ ✓ |
| `positive` (#34d399) on `surface` (#1a1c1e) | ~8.3:1 | AAA ✓ |
| `negative` (#fb7185) on `surface` (#1a1c1e) | ~6.1:1 | AA ✓ |
| `on-primary` (#1c1e45) on `primary` (#9ba5e8) | ~4.6:1 | AA ✓ |

---

## CSS Custom Properties

Define in your global stylesheet. The `.dark` class on `<html>` switches all tokens automatically.

```css
:root {
  /* Brand */
  --color-primary:                  #4b57aa;
  --color-primary-dim:              #3f4b9d;
  --color-primary-container:        #dfe0ff;
  --color-on-primary:               #f9f6ff;
  --color-on-primary-container:     #3e4a9c;
  /* Secondary */
  --color-secondary:                #466370;
  --color-secondary-container:      #c9e7f7;
  --color-on-secondary-container:   #395663;
  --color-secondary-fixed:          #c9e7f7;
  --color-on-secondary-fixed:       #264350;
  /* Tertiary */
  --color-tertiary:                 #006f1d;
  --color-tertiary-container:       #91f78e;
  --color-on-tertiary-container:    #005e17;
  /* Surfaces */
  --color-surface:                  #faf9f8;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low:    #f3f4f3;
  --color-surface-container:        #edeeed;
  --color-surface-container-high:   #e6e9e8;
  --color-surface-container-highest:#dfe3e2;
  --color-surface-variant:          #dfe3e2;
  /* Text */
  --color-on-surface:               #2f3333;
  --color-on-surface-variant:       #5b605f;
  --color-outline:                  #777c7b;
  --color-outline-variant:          #aeb3b2;
  /* Semantic */
  --color-positive:                 #10b981;
  --color-positive-container:       #d1fae5;
  --color-on-positive-container:    #065f46;
  --color-negative:                 #e11d48;
  --color-negative-container:       #ffe4e9;
  --color-on-negative-container:    #6b1728;
  --color-warning:                  #f59e0b;
  --color-warning-container:        #fef3c7;
  --color-on-warning-container:     #78350f;
  --color-error:                    #9e3f4e;
  --color-error-container:          #ff8b9a;
}

.dark {
  /* Brand */
  --color-primary:                  #9ba5e8;
  --color-primary-dim:              #8892d9;
  --color-primary-container:        #2d3168;
  --color-on-primary:               #1c1e45;
  --color-on-primary-container:     #c4c9ff;
  /* Secondary */
  --color-secondary:                #8ab4c8;
  --color-secondary-container:      #1a3540;
  --color-on-secondary-container:   #a5d2e8;
  --color-secondary-fixed:          #1e3a47;
  --color-on-secondary-fixed:       #a5d2e8;
  /* Tertiary */
  --color-tertiary:                 #6fe56c;
  --color-tertiary-container:       #0a3a11;
  --color-on-tertiary-container:    #6fe56c;
  /* Surfaces */
  --color-surface:                  #1a1c1e;
  --color-surface-container-lowest: #222527;
  --color-surface-container-low:    #141618;
  --color-surface-container:        #2a2d30;
  --color-surface-container-high:   #333638;
  --color-surface-container-highest:#3c3f42;
  --color-surface-variant:          #3c3f42;
  /* Text */
  --color-on-surface:               #e3e6e5;
  --color-on-surface-variant:       #b0b4b3;
  --color-outline:                  #8d918f;
  --color-outline-variant:          #4a4e4d;
  /* Semantic */
  --color-positive:                 #34d399;
  --color-positive-container:       #064e3b;
  --color-on-positive-container:    #6ee7b7;
  --color-negative:                 #fb7185;
  --color-negative-container:       #4c0519;
  --color-on-negative-container:    #fda4af;
  --color-warning:                  #fbbf24;
  --color-warning-container:        #451a03;
  --color-on-warning-container:     #fde68a;
  --color-error:                    #f28090;
  --color-error-container:          #5a1f2b;
}
```

---

## Shadows in Dark Mode

The "no black shadows" rule applies only to light mode. In dark mode, black-based shadows are correct because tinted shadows are invisible against dark surfaces.

```css
/* Light mode (existing) */
.card {
  box-shadow: 0 4px 24px rgba(47,51,51,0.06), 0 1px 4px rgba(47,51,51,0.04);
}

/* Dark mode */
.dark .card {
  box-shadow: 0 4px 24px rgba(0,0,0,0.30), 0 1px 4px rgba(0,0,0,0.20);
}
.dark .floating {
  box-shadow: 0 8px 32px rgba(0,0,0,0.40), 0 2px 8px rgba(0,0,0,0.25);
}
```

---

## Glassmorphism in Dark Mode

```css
.dark .topbar {
  background: rgba(26, 28, 30, 0.85);
  backdrop-filter: blur(12px);
}
.dark .bottom-nav {
  background: rgba(26, 28, 30, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(74, 78, 77, 0.15);
}
```

---

## Toggle Mechanism

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
```
