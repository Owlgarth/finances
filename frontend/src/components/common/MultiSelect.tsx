import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import BottomSheet from './BottomSheet'
import { controlHeightClass } from './formStyles'

export interface MultiSelectOption<T extends string | number> {
  value: T
  label: ReactNode
}

export interface MultiSelectProps<T extends string | number> {
  /** Currently selected values (controlled). Empty = nothing selected → placeholder ("all"). */
  values: T[]
  /** Called with the full new selection after a toggle. */
  onChange: (values: T[]) => void
  options: MultiSelectOption<T>[]
  /** Muted trigger text when nothing is selected (e.g. "All accounts"). */
  placeholder?: string
  'aria-label'?: string
  id?: string
  disabled?: boolean
  /** Show an inline search input at the top of the panel (lists > 5 items). */
  searchable?: boolean
  className?: string
}

/** Stringify an option for search/type-ahead matching. */
function optionToString<T extends string | number>(opt: MultiSelectOption<T>): string {
  return typeof opt.label === 'string' ? opt.label : String(opt.value)
}

function matchesQuery<T extends string | number>(opt: MultiSelectOption<T>, query: string): boolean {
  return optionToString(opt).toLowerCase().includes(query.trim().toLowerCase())
}

const TYPE_AHEAD_RESET_MS = 500

/**
 * Multi-select variant of Select (filters that combine, e.g. two categories at
 * once). Same adaptive presentation — anchored dropdown on desktop, bottom
 * sheet on mobile — but toggling an option keeps the panel open, and the
 * trigger summarises the selection ("All accounts" / the label / "3 selected").
 */
export default function MultiSelect<T extends string | number>({
  values,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
  id,
  disabled = false,
  searchable = false,
  className,
}: MultiSelectProps<T>) {
  const { isMobile } = useBreakpoint()

  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetListRef = useRef<HTMLDivElement>(null)
  const typeAheadRef = useRef<{ buffer: string; t: number }>({ buffer: '', t: 0 })

  const baseId = useId()
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const filteredOptions =
    searchable && searchQuery ? options.filter((opt) => matchesQuery(opt, searchQuery)) : options

  const selected = new Set(values)
  const triggerLabel =
    values.length === 0
      ? (placeholder ?? ' ')
      : values.length === 1
        ? (options.find((opt) => opt.value === values[0])?.label ?? '1 selected')
        : `${values.length} selected`

  // Close on outside pointer-down while open.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  // Reset transient panel state when the panel closes.
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setHighlightedIndex(-1)
    }
  }, [open])

  // Sheet: bring the first selected option into view on open.
  useEffect(() => {
    if (!open || !isMobile) return
    sheetListRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'center' })
  }, [open, isMobile])

  function openPanel() {
    setOpen(true)
    const firstSelected = options.findIndex((opt) => selected.has(opt.value))
    setHighlightedIndex(firstSelected >= 0 ? firstSelected : 0)
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  // Toggling keeps the panel open — that's the point of a multi-select.
  function toggleIndex(i: number) {
    const opt = filteredOptions[i]
    if (!opt) return
    onChange(
      selected.has(opt.value) ? values.filter((v) => v !== opt.value) : [...values, opt.value],
    )
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    if (!open) {
      // Let native Enter/Space activation open via onClick; intercept only arrows.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openPanel()
      }
      return
    }

    const count = filteredOptions.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (count === 0 ? -1 : prev < 0 ? 0 : (prev + 1) % count))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (count === 0 ? -1 : prev <= 0 ? count - 1 : prev - 1))
        break
      case 'Home':
        e.preventDefault()
        setHighlightedIndex(count === 0 ? -1 : 0)
        break
      case 'End':
        e.preventDefault()
        setHighlightedIndex(count === 0 ? -1 : count - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (highlightedIndex >= 0) toggleIndex(highlightedIndex)
        else closePanel(true)
        break
      case 'Escape':
        e.preventDefault()
        // Consume the key so a surrounding Modal's Escape listener doesn't co-fire.
        e.stopPropagation()
        closePanel(true)
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        // Printable char → type-ahead jump to first matching label.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          const now = Date.now()
          const ta = typeAheadRef.current
          const buffer = now - ta.t < TYPE_AHEAD_RESET_MS ? ta.buffer + e.key : e.key
          typeAheadRef.current = { buffer, t: now }
          const lower = buffer.toLowerCase()
          const idx = filteredOptions.findIndex((opt) =>
            optionToString(opt).toLowerCase().startsWith(lower),
          )
          if (idx >= 0) setHighlightedIndex(idx)
        }
        break
    }
  }

  // Same reasoning as Select's search input: consume Escape, and make Enter
  // toggle the highlighted/first match instead of submitting a form.
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closePanel(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions.length === 0) return
      const i = highlightedIndex >= 0 && highlightedIndex < filteredOptions.length ? highlightedIndex : 0
      toggleIndex(i)
    }
  }

  const triggerClass =
    'w-full flex items-center justify-between ' +
    'bg-surface border border-border rounded-none px-2 py-1.5 ' +
    `${controlHeightClass} ` +
    'text-xs text-text text-left ' +
    'hover:bg-surface-hover ' +
    'focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus ' +
    'transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
    (className ?? '')

  const panelClass =
    'absolute z-dropdown mt-1 w-full ' +
    'bg-surface border border-border rounded-sm ' +
    'max-h-[280px] overflow-y-auto'

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        aria-activedescendant={open && !isMobile && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClass}
      >
        <span className={values.length === 0 ? 'truncate text-text-muted' : 'truncate'}>
          {triggerLabel}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {values.length > 1 && (
            <span className="min-w-[16px] h-4 px-1 rounded-sm bg-primary text-white text-[10px] font-mono inline-flex items-center justify-center">
              {values.length}
            </span>
          )}
          <ChevronDown
            size={12}
            className={'text-text-muted transition-transform ' + (open ? 'rotate-180' : '')}
          />
        </span>
      </button>

      {/* Mobile panel: bottom sheet of 44px toggle rows (dismiss = done). */}
      {isMobile && (
        <BottomSheet
          open={open}
          onClose={() => closePanel(true)}
          aria-label={ariaLabel ?? placeholder ?? 'Select options'}
        >
          {searchable && (
            <div className="sticky top-4 z-10 bg-surface px-4 pb-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search…"
                aria-label="Search options"
                className="w-full bg-background border border-border rounded-none px-2 py-2 text-xs font-mono text-text focus:border-border-focus focus:outline-none placeholder:text-text-muted/50"
              />
            </div>
          )}

          <div ref={sheetListRef} role="listbox" aria-multiselectable="true" className="pb-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-text-muted">No options</div>
            ) : (
              filteredOptions.map((opt, i) => {
                const isSelected = selected.has(opt.value)
                return (
                  <button
                    key={`${String(opt.value)}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleIndex(i)}
                    className={
                      'w-full min-h-[44px] px-4 flex items-center gap-3 text-left text-sm text-text transition-colors active:bg-surface-hover ' +
                      (isSelected ? 'font-medium bg-surface-muted ' : '')
                    }
                  >
                    {isSelected ? (
                      <Check size={16} className="text-primary flex-shrink-0" />
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </BottomSheet>
      )}

      {/* Desktop panel: anchored dropdown; option clicks toggle without closing. */}
      {open && !isMobile && (
        <div role="listbox" aria-multiselectable="true" className={panelClass}>
          {searchable && (
            <div className="px-2 pb-1">
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setHighlightedIndex(0)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search…"
                className="w-full bg-background border border-border rounded-none px-2 py-1.5 text-xs font-mono text-text focus:border-border-focus focus:outline-none placeholder:text-text-muted/50"
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-text-muted">No options</div>
          ) : (
            filteredOptions.map((opt, i) => {
              const isSelected = selected.has(opt.value)
              const highlighted = i === highlightedIndex
              return (
                <button
                  key={`${String(opt.value)}-${i}`}
                  type="button"
                  role="option"
                  id={optionId(i)}
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => toggleIndex(i)}
                  className={
                    'w-full flex items-center gap-2 px-2 h-8 text-left text-xs transition-colors ' +
                    (isSelected
                      ? 'text-text font-medium bg-surface-muted '
                      : highlighted
                        ? 'text-text bg-surface-hover '
                        : 'text-text hover:bg-surface-hover ')
                  }
                >
                  {isSelected ? (
                    <Check size={12} className="text-primary flex-shrink-0" />
                  ) : (
                    <span className="w-3 flex-shrink-0" />
                  )}
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
