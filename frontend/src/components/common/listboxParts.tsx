import type { KeyboardEvent, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { controlHeightClass } from './formStyles'

// Shared listbox trigger styling for Select and MultiSelect (§4 form controls),
// in the spirit of formStyles.ts: the base is identical; Select appends its
// mono/error variants and the caller's className, MultiSelect the mono/auth
// variant and the caller's className.
export const listboxTriggerBaseClass =
  'w-full flex items-center justify-between ' +
  'bg-surface border border-border rounded-none px-2 py-1.5 ' +
  `${controlHeightClass} ` +
  'text-xs text-text text-left ' +
  'hover:bg-surface-hover ' +
  'focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed '

// Auth-form trigger variant (MultiSelect variant="auth"): mirrors
// formStyles.authInputClass - bg-background, px-3 py-2, text-sm, ring-2
// focus, no hover swap - for Login/Register-style forms whose text inputs
// predate the §4 redesign. The default stays listboxTriggerBaseClass.
export const listboxTriggerAuthClass =
  'w-full flex items-center justify-between ' +
  'bg-background border border-border rounded-none px-3 py-2 ' +
  `${controlHeightClass} ` +
  'text-sm text-text text-left ' +
  'focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-focus ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed '

// Anchored desktop panel container (both components, verbatim).
export const listboxPanelClass =
  'absolute z-dropdown mt-1 w-full ' +
  'bg-surface border border-border rounded-sm ' +
  'max-h-[280px] overflow-y-auto' // thin scrollbars applied globally (index.css)

interface PanelSearchInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  /** 'sheet' = sticky input atop the mobile BottomSheet list; 'dropdown' = desktop panel top. */
  variant: 'sheet' | 'dropdown'
}

/**
 * The panel search input. `aria-label` covers BOTH variants — the desktop copy
 * was missing it in both components (fixed once, here).
 */
export function PanelSearchInput({ value, onChange, onKeyDown, variant }: PanelSearchInputProps) {
  return (
    // sheet: top-4 sits just below BottomSheet's 16px drag-handle row
    <div className={variant === 'sheet' ? 'sticky top-4 z-10 bg-surface px-4 pb-2' : 'px-2 pb-1'}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        aria-label="Search options"
        className={
          'w-full bg-background border border-border rounded-none px-2 text-xs font-mono text-text focus:border-border-focus focus:outline-none placeholder:text-text-muted/50 ' +
          (variant === 'sheet' ? 'py-2' : 'py-1.5')
        }
      />
    </div>
  )
}

interface SheetOptionRowProps {
  label: ReactNode
  selected: boolean
  /** Select renders mobile rows in JetBrains Mono (currency codes, IDs). */
  mono?: boolean
  onClick: () => void
}

/** 44px touch row inside the mobile BottomSheet listbox. */
export function SheetOptionRow({ label, selected, mono = false, onClick }: SheetOptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={
        'w-full min-h-[44px] px-4 flex items-center gap-3 text-left text-sm text-text transition-colors active:bg-surface-hover ' +
        (selected ? 'font-medium bg-surface-muted ' : '') +
        (mono ? 'font-mono ' : '')
      }
    >
      {selected ? (
        <Check size={16} className="text-primary flex-shrink-0" />
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

interface DropdownOptionRowProps {
  /** aria-activedescendant target id from the hook's `optionId(i)`. */
  id: string
  label: ReactNode
  selected: boolean
  highlighted: boolean
  onClick: () => void
}

/** Compact desktop dropdown row. */
export function DropdownOptionRow({ id, label, selected, highlighted, onClick }: DropdownOptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      id={id}
      aria-selected={selected}
      tabIndex={-1}
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-2 h-8 text-left text-xs transition-colors ' +
        (selected
          ? 'text-text font-medium bg-surface-muted '
          : highlighted
            ? 'text-text bg-surface-hover '
            : 'text-text hover:bg-surface-hover ')
      }
    >
      {selected ? (
        <Check size={12} className="text-primary flex-shrink-0" />
      ) : (
        <span className="w-3 flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** "No options" empty state for either panel variant. */
export function EmptyOptions({ variant }: { variant: 'sheet' | 'dropdown' }) {
  return (
    <div
      className={
        variant === 'sheet'
          ? 'px-4 py-3 text-sm text-text-muted'
          : 'px-2 py-1.5 text-xs text-text-muted'
      }
    >
      No options
    </div>
  )
}
