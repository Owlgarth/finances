import { useDebouncedField } from '../../hooks/useDebouncedField'
import { inputClass } from './formStyles'

interface AmountInputProps {
  /** Committed value as a string (usually from URL search params). */
  value: string
  /** Fires debounced while typing. */
  onCommit: (next: string) => void
  placeholder: string
  'aria-label': string
}

/** Debounced numeric-bound input for amount range filters (min/max). */
export default function AmountInput({
  value,
  onCommit,
  placeholder,
  'aria-label': ariaLabel,
}: AmountInputProps) {
  const [draft, setDraft] = useDebouncedField(value, onCommit, 400)
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={inputClass}
    />
  )
}
