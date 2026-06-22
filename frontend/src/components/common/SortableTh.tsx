import { ChevronDown } from 'lucide-react'

interface SortableThProps {
  label: string
  field: string
  activeField: string | null
  isDescending: boolean
  onSort: (field: string) => void
  align?: 'left' | 'right' | 'center'
}

export default function SortableTh({
  label,
  field,
  activeField,
  isDescending,
  onSort,
  align = 'left',
}: SortableThProps) {
  const isActive = activeField === field
  const rotation = isDescending ? '' : 'rotate-180'

  const thAlign =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  const buttonAlign =
    align === 'right'
      ? 'flex justify-end'
      : align === 'center'
        ? 'flex justify-center'
        : 'flex'

  return (
    <th
      className={`px-6 py-2 ${thAlign} font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest`}
    >
      <button
        onClick={() => onSort(field)}
        className={`${buttonAlign} items-center gap-1 hover:text-primary transition-colors cursor-pointer group uppercase`}
      >
        {label}
        <ChevronDown
          size={12}
          className={`transition-transform ${rotation} select-none ${isActive ? '' : 'opacity-0'}`}
        />
      </button>
    </th>
  )
}
