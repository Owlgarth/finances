import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import EditableField from './EditableField'
import type { EditableFieldProps } from './EditableField'

interface LinkedRowProps<T> extends EditableFieldProps<T> {
  /** Router destination of the trailing link. */
  to: string
  /** Accessible name for the link; names the TARGET ("Open Checking account"),
   *  never a generic "Open", so tabbing row-to-arrow reads as two distinct
   *  stops. Caller composes it translated, e.g. t('openAccount', { name }). */
  linkLabel: string
}

export default function LinkedRow<T>({ to, linkLabel, ...field }: LinkedRowProps<T>) {
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1">
        <EditableField {...field} />
      </div>
      {/* Trailing link as a REAL cell with its own coarse-pointer floor -
          deliberately NOT the expanded-hit-area utility: its 8px ::after
          expansion would overlap the row's own tap target, and it force-sets
          position: relative. */}
      <Link
        to={to}
        aria-label={linkLabel}
        className="inline-flex items-center justify-center border-l border-border px-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
      >
        <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </div>
  )
}
