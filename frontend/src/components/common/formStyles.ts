// Shared Tailwind class strings for form primitives, matching design/components.md
// (§3 Buttons, §4 Form Inputs). These are the single source of truth for the
// redesign's forms — audited against the spec in U1.

// §4 Standard Text Input: bg-surface, rounded-none, px-2 py-1.5, mono text-xs,
// focus = border-focus + ring-1 (not ring-2), muted placeholder, muted disabled bg.
export const inputClass =
  'w-full bg-surface border border-border rounded-none px-2 py-1.5 font-mono text-xs text-text ' +
  'placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus ' +
  'transition-colors disabled:bg-surface-muted disabled:opacity-50'

// §4 Labels: Geist 11px, uppercase, tracking-wider, muted, 4px below.
export const labelClass = 'block text-[11px] font-medium uppercase tracking-wider text-text-muted mb-1'

// §3 Primary Button: flat, focus-visible outline (not a ring).
// max-sm:min-h-[44px]: mobile touch-target floor (responsive.md), M7.
export const primaryButtonClass =
  'bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors ' +
  'max-sm:min-h-[44px] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// §3 Secondary Button.
export const secondaryButtonClass =
  'bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors ' +
  'max-sm:min-h-[44px] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'
