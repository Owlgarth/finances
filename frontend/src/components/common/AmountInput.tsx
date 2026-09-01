import { useDebouncedField } from '../../hooks/useDebouncedField'
import { normalizeAmountInput } from '../../utils/amountInput'
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
  // Commits go to the URL param in the wire's dot-decimal shape: normalize
  // each debounced commit (never per keystroke - the draft keeps what the
  // user typed). Empty and unparseable drafts pass through unchanged: the
  // caller maps '' to a cleared param, and garbage travels raw so the API's
  // validator rejects it with a pretty-printed message.
  const commit = (next: string) => onCommit(normalizeAmountInput(next) ?? next)
  const [draft, setDraft] = useDebouncedField(value, commit, 400)
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
