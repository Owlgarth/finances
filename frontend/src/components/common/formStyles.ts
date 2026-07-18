// Shared Tailwind class strings for form primitives, matching design/components.md
// (§3 Buttons, §4 Form Inputs). These are the single source of truth for the
// redesign's forms — audited against the spec in U1.

// Shared control height: 32px (§4 input height, matching §9 table rows), with
// a 44px floor on coarse pointers — keyed on the pointer, not viewport width,
// so tablets above `sm` keep full touch targets. Composed into every control
// that can share a row — inputs, selects, buttons, pickers — so they always align.
export const controlHeightClass = 'min-h-8 pointer-coarse:min-h-[44px]'

// §4 Standard Text Input: bg-surface, rounded-none, px-2 py-1.5, mono text-xs,
// focus = border-focus + ring-1 (not ring-2), muted placeholder, muted disabled bg.
export const inputClass =
  `w-full bg-surface border border-border rounded-none px-2 py-1.5 font-mono text-xs text-text ${controlHeightClass} ` +
  'placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus ' +
  'transition-colors disabled:bg-surface-muted disabled:opacity-50'

// §4 Labels: Geist 11px, uppercase, tracking-wider, muted, 4px below.
export const labelClass = 'block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1'

// §3 Primary Button: flat, focus-visible outline (not a ring).
export const primaryButtonClass =
  'bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors ' +
  `${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// Outline-destructive variant of the secondary button — footer Delete actions
// that chain into a confirm dialog (not the solid-negative confirm button).
export const destructiveButtonClass =
  'bg-surface border border-border text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors ' +
  `${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// Positive counterpart of destructiveButtonClass — footer Execute actions.
export const positiveButtonClass =
  'bg-surface border border-border text-positive px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-positive-bg transition-colors ' +
  `${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// Warning counterpart of destructiveButtonClass — footer Cancel-plan actions.
export const warningButtonClass =
  'bg-surface border border-border text-warning px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-warning-bg transition-colors ' +
  `${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// §3 Secondary Button.
export const secondaryButtonClass =
  'bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors ' +
  `${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'
