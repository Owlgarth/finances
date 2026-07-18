import { Search, X } from 'lucide-react'
import { useDebouncedField } from '../../hooks/useDebouncedField'
import { controlHeightClass } from './formStyles'

interface SearchInputProps {
  /** Committed value (usually from URL search params). */
  value: string
  /** Fires debounced on typing, immediately on clear. */
  onChange: (next: string) => void
  placeholder?: string
  'aria-label'?: string
  className?: string
}

/** §4-styled search box with a leading icon, debounced commit and a clear X. */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  'aria-label': ariaLabel,
  className = '',
}: SearchInputProps) {
  const [draft, setDraft] = useDebouncedField(value, onChange)

  return (
    <div className={`relative ${className}`}>
      <Search
        size={13}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        // 16px font floor on mobile so iOS doesn't zoom the input (mobile-ux §4).
        className={`w-full bg-surface border border-border rounded-none pl-7 pr-7 py-1.5 font-mono text-xs max-sm:text-base ${controlHeightClass} text-text placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus transition-colors [&::-webkit-search-cancel-button]:hidden`}
      />
      {draft !== '' && (
        <button
          type="button"
          onClick={() => {
            setDraft('')
            onChange('')
          }}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}
