import { useTranslation } from 'react-i18next'
import AmountInput from '../common/AmountInput'

interface AmountRangeEditorProps {
  /** Raw amount_min/amount_max param strings; '' means unset. */
  value: { min: string; max: string }
  onChange: (next: { min: string | null; max: string | null }) => void
}

/** Container-agnostic min/max amount pair. AmountInput commits debounced;
 *  empty passes through as null (param delete), unparseable text travels
 *  raw for the API validator to reject, exactly as the panel row did. */
export default function AmountRangeEditor({ value, onChange }: AmountRangeEditorProps) {
  const { t } = useTranslation('transactions')
  return (
    // Same paired-input wrap recipe as the date editor: below sm each
    // w-full input claims its own full line and the separator hides;
    // at >=sm the pair shares one line.
    <div className="flex max-sm:flex-wrap items-center gap-1.5">
      <AmountInput
        value={value.min}
        onCommit={(v) => onChange({ min: v || null, max: value.max || null })}
        placeholder={t('listFilters.min')}
        aria-label={t('listFilters.minAmountAria')}
      />
          <span className="text-text-muted text-xs max-sm:hidden">–</span>
      <AmountInput
        value={value.max}
        onCommit={(v) => onChange({ min: value.min || null, max: v || null })}
        placeholder={t('listFilters.max')}
        aria-label={t('listFilters.maxAmountAria')}
      />
    </div>
  )
}
