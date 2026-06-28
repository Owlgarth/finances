import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type SegmentTone = 'primary' | 'positive'

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Active-state color. Defaults to 'primary'. Use 'positive' for Income. */
  tone?: SegmentTone
}

export interface SegmentedControlProps<T extends string | number> {
  /** Currently selected value (controlled only, matching Switch.tsx). */
  value: T
  onChange: (value: T) => void
  /** Two or more mutually exclusive options. */
  options: SegmentOption<T>[] | readonly SegmentOption<T>[]
  /** Accessible group label, e.g. "Transaction type". Required. */
  'aria-label': string
  /** Disable the whole control. */
  disabled?: boolean
  /** Layout pass-through (do not use to override tokens). */
  className?: string
}

export default function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])

  function selectAndFocus(i: number) {
    onChange(options[i].value)
    segRefs.current[i]?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        selectAndFocus(((index + 1) % count + count) % count)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        selectAndFocus(((index - 1) % count + count) % count)
        break
      case 'Home':
        e.preventDefault()
        selectAndFocus(0)
        break
      case 'End':
        e.preventDefault()
        selectAndFocus(count - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onChange(options[index].value)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={
        'flex border border-border rounded-none overflow-hidden ' +
        (disabled ? 'opacity-50 cursor-not-allowed ' : '') +
        (className ?? '')
      }
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        const tone = opt.tone ?? 'primary'
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              segRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={
              'flex-1 py-1.5 text-xs font-medium transition-colors ' +
              (selected
                ? tone === 'positive'
                  ? 'bg-positive text-white '
                  : 'bg-primary text-white '
                : 'bg-surface text-text-muted hover:text-text hover:bg-surface-hover ') +
              (i > 0 ? 'border-l border-border ' : '')
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
