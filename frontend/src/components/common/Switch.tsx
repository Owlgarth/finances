interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label': string
  id?: string
}

export default function Switch({ checked, onChange, 'aria-label': ariaLabel, id }: Props) {
  const trackClass = checked
    ? 'relative inline-flex h-5 w-9 items-center rounded-none bg-primary transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
    : 'relative inline-flex h-5 w-9 items-center rounded-none bg-surface-muted border border-border transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

  const thumbClass = checked
    ? 'inline-block h-3.5 w-3.5 bg-white rounded-full translate-x-[19px] transition-transform duration-150 dark:bg-background'
    : 'inline-block h-3.5 w-3.5 bg-white border border-border rounded-full translate-x-[3px] transition-transform duration-150'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      id={id}
      onClick={() => onChange(!checked)}
      className={trackClass}
    >
      <span className={thumbClass} />
    </button>
  )
}
