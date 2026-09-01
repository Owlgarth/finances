import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useListboxPanel } from '../../hooks/useListboxPanel'
import BottomSheet from './BottomSheet'
import {
  DropdownOptionRow,
  EmptyOptions,
  PanelSearchInput,
  SheetOptionRow,
  listboxPanelClass,
  listboxTriggerBaseClass,
} from './listboxParts'

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
  // Adaptive variant: all panel state lives in useListboxPanel above the
  // variant branches, so a resize mid-open loses nothing.
  const { isMobile } = useBreakpoint()
  const { t } = useTranslation('common')

  const selected = new Set(values)
  const firstSelectedIndex = options.findIndex((opt) => selected.has(opt.value))
  const triggerLabel =
    values.length === 0
      ? // nbsp, not ' ': a plain space collapses and the trigger loses height (Select's deliberate choice)
        (placeholder ?? '\u00A0')
      : values.length === 1
        ? (options.find((opt) => opt.value === values[0])?.label ?? t('multiSelect.selectedCount', { count: 1 }))
        : t('multiSelect.selectedCount', { count: values.length })

  // `toggleIndex` below is a hoisted function declaration — see Select's note:
  // it is only invoked from event handlers after render (no TDZ at call time).
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
    initialHighlightIndex: firstSelectedIndex >= 0 ? firstSelectedIndex : 0,
    onActivate: toggleIndex,
  })

  // Toggling keeps the panel open — that's the point of a multi-select.
  function toggleIndex(i: number) {
    const opt = filteredOptions[i]
    if (!opt) return
    onChange(
      selected.has(opt.value) ? values.filter((v) => v !== opt.value) : [...values, opt.value],
    )
  }

  const triggerClass = listboxTriggerBaseClass + (className ?? '')

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
          aria-label={ariaLabel ?? placeholder ?? t('multiSelect.defaultSheetLabel')}
        >
          {searchable && (
            <PanelSearchInput
              value={searchQuery}
              onChange={(v) => handleSearchChange(v, false)}
              onKeyDown={handleSearchKeyDown}
              variant="sheet"
            />
          )}

          <div ref={sheetListRef} role="listbox" aria-multiselectable="true" className="pb-1">
            {filteredOptions.length === 0 ? (
              <EmptyOptions variant="sheet" />
            ) : (
              filteredOptions.map((opt, i) => (
                <SheetOptionRow
                  key={`${String(opt.value)}-${i}`}
                  label={opt.label}
                  selected={selected.has(opt.value)}
                  onClick={() => toggleIndex(i)}
                />
              ))
            )}
          </div>
        </BottomSheet>
      )}

      {/* Desktop panel: anchored dropdown; option clicks toggle without closing. */}
      {open && !isMobile && (
        <div role="listbox" aria-multiselectable="true" className={listboxPanelClass}>
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
                selected={selected.has(opt.value)}
                highlighted={i === highlightedIndex}
                onClick={() => toggleIndex(i)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
