import { Check } from 'lucide-react'
// ChoiceOption lives beside its first consumer (MultiChoiceEditor) - both
// editor flavors share the one option shape.
import type { ChoiceOption } from './MultiChoiceEditor'
import { controlHeightClass } from '../common/formStyles'

interface SingleChoiceEditorProps<T extends string | number> {
  /** Current value or null when the param is unset (a single account id via
   *  intParam; sort via the raw string). */
  value: T | null
  onChange: (next: T | null) => void
  options: ChoiceOption<T>[]
  'aria-label': string
}

/** Container-agnostic single-choice body (sort options, a single account).
 *  One active row; clicking a selected row keeps it selected (there is no
 *  "none" state unless the host offers one through its options). */
export default function SingleChoiceEditor<T extends string | number>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: SingleChoiceEditorProps<T>) {
  return (
    <div role="listbox" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            // Row markup kept in sync with MultiChoiceEditor's rows (second
            // consumer; extract into a shared row at a third).
            className={
              'w-full flex items-center gap-2 px-2 text-left text-xs transition-colors ' +
              `${controlHeightClass} ` +
              (active
                ? 'text-text font-medium bg-surface-muted '
                : 'text-text hover:bg-surface-hover ')
            }
          >
            {active ? (
              <Check size={12} className="text-primary shrink-0" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
