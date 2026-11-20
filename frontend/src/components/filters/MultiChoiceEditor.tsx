import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { EmptyOptions, PanelSearchInput } from '../common/listboxParts'
import { controlHeightClass } from '../common/formStyles'

export interface ChoiceOption<T extends string | number> {
  value: T
  label: ReactNode
}

// Search field appears above this many options. Deliberately higher than
// MultiSelect's >5: the editor bodies are wider and host their own scroll,
// so shorter lists scan without search.
const SEARCH_THRESHOLD = 8

// Same stringification as useListboxPanel's module-private optionToString
// (second copy; keep in sync - extract into a shared module at a third
// consumer).
function optionText(option: ChoiceOption<string | number>): string {
  return typeof option.label === 'string' ? option.label : String(option.value)
}

interface MultiChoiceEditorProps<T extends string | number> {
  /** Parsed selection (intListParam result / CSV split) - empty = "all". */
  value: T[]
  /** Full new selection after every toggle. */
  onChange: (next: T[]) => void
  options: ChoiceOption<T>[]
  /** Def-level always-searchable override (category today). */
  searchable?: boolean
  'aria-label': string
}

/** Container-agnostic multi-select body: checkmark rows, no trigger, no
 *  chrome, no internal scrolling - the host (bottom sheet or popover) owns
 *  the panel, focus and Escape. */
export default function MultiChoiceEditor<T extends string | number>({
  value,
  onChange,
  options,
  searchable = false,
  'aria-label': ariaLabel,
}: MultiChoiceEditorProps<T>) {
  const [query, setQuery] = useState('')
  const selected = new Set(value)
  const showSearch = searchable || options.length > SEARCH_THRESHOLD
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? options.filter((o) => optionText(o).toLowerCase().includes(needle))
    : options

  const toggle = (v: T) =>
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <div role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
      {showSearch && (
        <PanelSearchInput
          value={query}
          onChange={setQuery}
          /* Enter is kept from any implicit submission; Escape is NOT
             consumed - the host panel owns it (unlike useListboxPanel's
             search, these editors open no panel of their own). */
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          variant="dropdown"
        />
      )}
      {filtered.length === 0 ? (
        <EmptyOptions variant="dropdown" />
      ) : (
        filtered.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            role="option"
            aria-selected={selected.has(opt.value)}
            onClick={() => toggle(opt.value)}
            className={
              'w-full flex items-center gap-2 px-2 text-left text-xs transition-colors ' +
              `${controlHeightClass} ` +
              (selected.has(opt.value)
                ? 'text-text font-medium bg-surface-muted '
                : 'text-text hover:bg-surface-hover ')
            }
          >
            {selected.has(opt.value) ? (
              <Check size={12} className="text-primary shrink-0" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className="truncate">{opt.label}</span>
          </button>
        ))
      )}
    </div>
  )
}
