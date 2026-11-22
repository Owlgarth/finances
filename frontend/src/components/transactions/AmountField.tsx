import type { ReactNode, RefObject } from 'react'
import { AlertCircle } from 'lucide-react'
import Select from '../common/Select'
import { inputClass, labelClass } from '../common/formStyles'

/** Trailing currency code button + its picker panel. Every translated
 *  string arrives here already resolved - the component owns layout. */
export interface AmountFieldCurrency {
  /** Visible label above the code button (already translated). */
  label: string
  code: string | null
  options: { value: string; label: string }[]
  onChange: (code: string) => void
  /** Muted placeholder while no code is selected (already translated). */
  placeholder: string
  /** Locked to the account's currency: the button renders disabled but
   *  still shows the code. */
  locked: boolean
  ariaLabel: string
  /** Error line under the button (the same idiom as the amount's). */
  error?: string
}

interface Props {
  /** Label above the input (already translated by the caller). */
  label: string
  value: string
  onChange: (value: string) => void
  /** Sign prefix that follows the record type ('-' expense, '+' income,
   *  '' transfer). Rendered at the input's left edge, decorative and
   *  aria-hidden (the type control carries the state; no prefix for
   *  adjustments - the delta carries its own sign). */
  signPrefix?: string
  /** Trailing currency code button + its picker panel. Omit the whole
   *  group for the transfer flavor - the currency comes from the From
   *  account, so there is nothing to pick. */
  currency?: AmountFieldCurrency
  /** Error line under the input (the EditableField idiom); omit = valid. */
  error?: string
  id: string
  inputRef?: RefObject<HTMLInputElement | null>
  autoFocus?: boolean
  /** Blur signal for the caller's error-display gate (an error shows
   *  after the field's first invalid blur, then tracks keystrokes). */
  onBlur?: () => void
  /** Optional hint row under the error line, inside the amount column
   *  (e.g. the suggestion Last-amount button). Rendered as-is - the
   *  caller owns content, translation, and any styling. */
  hint?: ReactNode
}

/** The amount row shared by every record type: label, optional sign
 *  prefix, text amount input (comma-decimal typing must reach the
 *  submit-time parser), and the trailing currency code button. One-width-
 *  class rule: the row owns layout (flex), the amount column owns
 *  flex-1 min-w-0, the input's w-full (inside inputClass) is its only
 *  width utility, the Select gets exactly one width class. Presentational
 *  - all state and validation live with the caller. */
export default function AmountField({
  label,
  value,
  onChange,
  signPrefix,
  currency,
  error,
  id,
  inputRef,
  autoFocus,
  onBlur,
  hint,
}: Props) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <div className="relative">
          {signPrefix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-text-muted"
            >
              {signPrefix}
            </span>
          )}
          {/* text (not number): comma-decimal typing must arrive as text and
              parse at submit (normalizeAmountInput, hook-side). */}
          <input
            id={id}
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            autoFocus={autoFocus}
            className={`${inputClass} ${signPrefix ? 'pl-6 ' : ''}${error ? 'bg-negative-bg border-negative ring-1 ring-negative ' : ''}`}
          />
        </div>
        {error && (
          <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
            <AlertCircle size={12} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {hint}
      </div>
      {currency && (
        <div className="w-24 shrink-0">
          <label htmlFor={`${id}-currency`} className={labelClass}>{currency.label}</label>
          {/* The compact code button IS a Select (mono, one pinned width) - it
              opens the existing picker, no new picker component. Locked while
              an account is set: disabled, still showing the code. aria-label
              gives the accessible name beyond the visible code. */}
          <Select
            id={`${id}-currency`}
            value={currency.code}
            onChange={currency.onChange}
            options={currency.options}
            placeholder={currency.placeholder}
            aria-label={currency.ariaLabel}
            disabled={currency.locked}
            mono
            error={currency.error}
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
