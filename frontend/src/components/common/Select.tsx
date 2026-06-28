import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string | number> {
  value: T
  label: ReactNode
}

export interface SelectProps<T extends string | number> {
  /** Currently selected value (controlled). `null` = nothing selected → shows placeholder. */
  value: T | null
  /** Called with the newly chosen option's `value`. */
  onChange: (value: T) => void
  /** The option list. */
  options: SelectOption<T>[]
  /** Muted text shown on the trigger when `value` is `null` (e.g. "Select category"). */
  placeholder?: string
  /** Accessible label; required when no visible `<label htmlFor>` is associated. */
  'aria-label'?: string
  /** Associates a visible `<label htmlFor={id}>` with the trigger button. */
  id?: string
  /** Disable the trigger (e.g. category select before a period is chosen). */
  disabled?: boolean
  /** Render the trigger value in JetBrains Mono (currency codes, IDs, page sizes). */
  mono?: boolean
  /** Show an inline search input at the top of the panel (lists > 5 items). */
  searchable?: boolean
  /** Error message. Applies the §4 error treatment to the trigger + renders the message below. */
  error?: string
  /** Width/layout pass-through (e.g. `w-24`). Do NOT use to override tokens. */
  className?: string
}

/** Stringify an option for type-ahead matching (falls back to value for non-string labels). */
function optionToString<T extends string | number>(opt: SelectOption<T>): string {
  return typeof opt.label === 'string' ? opt.label : String(opt.value)
}

/** Case-insensitive substring match for the search box. */
function matchesQuery<T extends string | number>(opt: SelectOption<T>, query: string): boolean {
  return optionToString(opt).toLowerCase().includes(query.trim().toLowerCase())
}

const TYPE_AHEAD_RESET_MS = 500

export default function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
  id,
  disabled = false,
  mono = false,
  searchable = false,
  error,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const typeAheadRef = useRef<{ buffer: string; t: number }>({ buffer: '', t: 0 })

  const baseId = useId()
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const filteredOptions =
    searchable && searchQuery ? options.filter((opt) => matchesQuery(opt, searchQuery)) : options

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selectedLabel =
    selectedIndex >= 0 ? options[selectedIndex].label : (placeholder ?? '\u00A0')

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

  function openPanel() {
    setOpen(true)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function selectIndex(i: number) {
    const opt = filteredOptions[i]
    if (!opt) return
    onChange(opt.value)
    closePanel(true)
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
        if (highlightedIndex >= 0) selectIndex(highlightedIndex)
        else closePanel(true)
        break
      case 'Escape':
        e.preventDefault()
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

  const triggerClass =
    'w-full flex items-center justify-between ' +
    'bg-surface border border-border rounded-none px-2 py-1.5 ' +
    'min-h-[44px] md:min-h-[36px] ' +
    'text-xs text-text text-left ' +
    'hover:bg-surface-hover ' +
    'focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus ' +
    'transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
    (mono ? 'font-mono ' : '') +
    (error ? 'bg-negative-bg border-negative ring-1 ring-negative ' : '') +
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
        aria-activedescendant={open && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClass}
      >
        <span className={value == null ? 'truncate text-text-muted' : 'truncate'}>
          {selectedLabel}
        </span>
        <ChevronDown
          size={12}
          className={'text-text-muted flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div role="listbox" className={panelClass}>
          {searchable && (
            <div className="px-2 pb-1">
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setHighlightedIndex(0)
                }}
                placeholder="Search…"
                className="w-full bg-background border border-border rounded-none px-2 py-1.5 text-xs font-mono text-text focus:border-border-focus focus:outline-none placeholder:text-text-muted/50"
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-text-muted">No options</div>
          ) : (
            filteredOptions.map((opt, i) => {
              const selected = opt.value === value
              const highlighted = i === highlightedIndex
              return (
                <button
                  key={`${String(opt.value)}-${i}`}
                  type="button"
                  role="option"
                  id={optionId(i)}
                  aria-selected={selected}
                  tabIndex={-1}
                  onClick={() => selectIndex(i)}
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
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })
          )}
        </div>
      )}

      {error && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
          <AlertCircle size={12} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
