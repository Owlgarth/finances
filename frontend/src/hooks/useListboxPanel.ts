import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/** Structural option shape shared by Select and MultiSelect. */
export interface ListboxOption<T extends string | number> {
  value: T
  label: ReactNode
}

export interface UseListboxPanelOptions<T extends string | number> {
  /** Full option list; search filtering happens inside the hook. */
  options: ListboxOption<T>[]
  /** Whether the panel shows the search input. */
  searchable: boolean
  /** Mirrors the component's `disabled` prop; trigger keydown no-ops when set. */
  disabled: boolean
  /** Current tier from `useBreakpoint()` — keys the sheet scroll-into-view effect. */
  isMobile: boolean
  /** Highlight index applied when the panel opens (caller derives it from its selection). */
  initialHighlightIndex: number
  /**
   * Enter/Space on the highlighted row (index into `filteredOptions`). The caller
   * owns the semantics: Select picks and closes; MultiSelect toggles and stays open.
   */
  onActivate: (index: number) => void
}

/** Stringify an option for type-ahead matching (falls back to value for non-string labels). */
function optionToString<T extends string | number>(opt: ListboxOption<T>): string {
  return typeof opt.label === 'string' ? opt.label : String(opt.value)
}

/** Case-insensitive substring match for the search box. */
function matchesQuery<T extends string | number>(opt: ListboxOption<T>, query: string): boolean {
  return optionToString(opt).toLowerCase().includes(query.trim().toLowerCase())
}

const TYPE_AHEAD_RESET_MS = 500

/**
 * Open/highlight/search/type-ahead state machine shared by Select and
 * MultiSelect. Owns the open flag, the highlight ring, the search query and
 * filtering, outside-click close, reset-on-close, mobile scroll-into-view,
 * and both keydown handlers. Callers keep only their selection semantics
 * (`onActivate`) and the trigger/label rendering.
 */
export function useListboxPanel<T extends string | number>({
  options,
  searchable,
  disabled,
  isMobile,
  initialHighlightIndex,
  onActivate,
}: UseListboxPanelOptions<T>) {
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

  // Sheet: bring the selected option into view on open (long lists — currencies, categories).
  useEffect(() => {
    if (!open || !isMobile) return
    sheetListRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'center' })
  }, [open, isMobile])

  function openPanel() {
    setOpen(true)
    setHighlightedIndex(initialHighlightIndex)
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
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
        if (highlightedIndex >= 0) onActivate(highlightedIndex)
        else closePanel(true)
        break
      case 'Escape':
        e.preventDefault()
        // Consume the key: without this, a surrounding Modal's document-level
        // Escape listener (useOverlay) fires too and closes the whole dialog.
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

  // The search inputs are focusable, so keys pressed there bypass the trigger
  // handler. Escape must be consumed here too (same reason as the trigger:
  // a surrounding Modal's document-level listener would close the dialog),
  // and Enter must not trigger implicit submission of a surrounding <form> —
  // it picks the highlighted/first match instead.
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closePanel(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions.length === 0) return
      // Desktop keeps highlightedIndex valid on each keystroke; the mobile
      // sheet has no highlight, so fall back to the first match.
      const i = highlightedIndex >= 0 && highlightedIndex < filteredOptions.length ? highlightedIndex : 0
      onActivate(i)
    }
  }

  /**
   * Search input onChange. `highlightFirst` resets the highlight to the first
   * match — the desktop dropdown does this on each keystroke; the mobile sheet
   * has no visible highlight, so it passes `false`.
   */
  function handleSearchChange(value: string, highlightFirst: boolean) {
    setSearchQuery(value)
    if (highlightFirst) setHighlightedIndex(0)
  }

  return {
    open,
    setOpen,
    highlightedIndex,
    searchQuery,
    filteredOptions,
    wrapperRef,
    triggerRef,
    sheetListRef,
    optionId,
    openPanel,
    closePanel,
    handleTriggerKeyDown,
    handleSearchKeyDown,
    handleSearchChange,
  }
}
