import type { ReactNode } from 'react'
import { AlertCircle, ChevronDown, type LucideIcon } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useListboxPanel } from '../../hooks/useListboxPanel'
import BottomSheet from './BottomSheet'
import {
  DropdownOptionRow,
  EmptyOptions,
  ListboxFooterAction,
  PanelSearchInput,
  SheetOptionRow,
  listboxPanelClass,
  listboxTriggerBaseClass,
} from './listboxParts'

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
  /** Optional non-option action rendered as the panel's LAST row in BOTH
      variants (below the option list). Search filtering never hides it.
      Keyboard: reachable via arrows/End like an option; Enter/Space fires
      `onSelect` and commits NO value - the panel closes and focus returns
      to the trigger. Absent (default) = the panel renders exactly as
      before; all existing call sites are unaffected. */
  footerAction?: {
    icon?: LucideIcon
    label: string
    onSelect: () => void
  }
}

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
  footerAction,
}: SelectProps<T>) {
  // Adaptive variant (plan decision 4): shared trigger/state, panel presentation
  // switches — anchored dropdown on desktop, bottom sheet on mobile. All panel
  // state lives in useListboxPanel above the variant branches, so a resize
  // mid-open loses nothing.
  const { isMobile } = useBreakpoint()

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selectedLabel =
    selectedIndex >= 0 ? options[selectedIndex].label : (placeholder ?? '\u00A0')

  // `selectIndex` below is a hoisted function declaration, so referencing it
  // here is safe: it is only invoked from event handlers after render, by which
  // time the hook returns its body closes over are initialized (no TDZ at call
  // time).
  const {
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
  } = useListboxPanel({
    options,
    searchable,
    disabled,
    isMobile,
    initialHighlightIndex: selectedIndex >= 0 ? selectedIndex : 0,
    onActivate: selectIndex,
    hasFooterAction: footerAction != null,
  })

  // Pick the highlighted option and close. The footer action row occupies
  // index === filteredOptions.length when present - activating it fires the
  // action and closes without committing a value.
  function selectIndex(i: number) {
    if (footerAction && i === filteredOptions.length) {
      footerAction.onSelect()
      closePanel(true)
      return
    }
    const opt = filteredOptions[i]
    if (!opt) return
    onChange(opt.value)
    closePanel(true)
  }

  const triggerClass =
    listboxTriggerBaseClass +
    (mono ? 'font-mono ' : '') +
    (error ? 'bg-negative-bg border-negative ring-1 ring-negative ' : '') +
    (className ?? '')

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
        <span className={value == null ? 'truncate text-text-muted' : 'truncate'}>
          {selectedLabel}
        </span>
        <ChevronDown
          size={12}
          className={'text-text-muted flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {/* Mobile panel: bottom sheet of 44px option rows. Rendered whenever mobile
          (not gated on `open`) so BottomSheet can play its exit animation. */}
      {isMobile && (
        <BottomSheet
          open={open}
          onClose={() => closePanel(true)}
          aria-label={ariaLabel ?? placeholder ?? 'Select an option'}
        >
          {searchable && (
            <PanelSearchInput
              value={searchQuery}
              onChange={(v) => handleSearchChange(v, false)}
              onKeyDown={handleSearchKeyDown}
              variant="sheet"
            />
          )}

          <div ref={sheetListRef} role="listbox" className="pb-1">
            {filteredOptions.length === 0 ? (
              <EmptyOptions variant="sheet" />
            ) : (
              filteredOptions.map((opt, i) => (
                <SheetOptionRow
                  key={`${String(opt.value)}-${i}`}
                  label={opt.label}
                  selected={opt.value === value}
                  mono={mono}
                  onClick={() => selectIndex(i)}
                />
              ))
            )}
            {footerAction && (
              <ListboxFooterAction
                variant="sheet"
                icon={footerAction.icon}
                label={footerAction.label}
                onClick={() => selectIndex(filteredOptions.length)}
              />
            )}
          </div>
        </BottomSheet>
      )}

      {/* Desktop panel: anchored dropdown with keyboard nav + type-ahead. */}
      {open && !isMobile && (
        <div role="listbox" className={listboxPanelClass}>
          {searchable && (
            <PanelSearchInput
              value={searchQuery}
              onChange={(v) => handleSearchChange(v, true)}
              onKeyDown={handleSearchKeyDown}
              variant="dropdown"
            />
          )}

          {filteredOptions.length === 0 ? (
            <EmptyOptions variant="dropdown" />
          ) : (
            filteredOptions.map((opt, i) => (
              <DropdownOptionRow
                key={`${String(opt.value)}-${i}`}
                id={optionId(i)}
                label={opt.label}
                selected={opt.value === value}
                highlighted={i === highlightedIndex}
                onClick={() => selectIndex(i)}
              />
            ))
          )}
          {footerAction && (
            <ListboxFooterAction
              variant="dropdown"
              id={optionId(filteredOptions.length)}
              icon={footerAction.icon}
              label={footerAction.label}
              highlighted={highlightedIndex === filteredOptions.length}
              onClick={() => selectIndex(filteredOptions.length)}
            />
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
