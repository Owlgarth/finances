import { useRef } from 'react'
import type { ReactNode } from 'react'
import type { EditorBag } from '../common/EditableField'

/**
 * Blur/keyboard shell for non-input editors (DateQuickPick, Select,
 * AmountField). React's onBlur is the bubbling focusout, so a bare
 * wrapper would commit when focus moves BETWEEN the editor's own
 * children - guard on relatedTarget containment. The bag's own blur
 * handler still carries the mobile-sheet guard (inside the sheet, the
 * Save button owns commit) and the detached-DOM guard, so this shell
 * only widens where the blur is observed from, never re-implements its
 * semantics. Shared by every record component; wrap an editor's controls in
 * it rather than re-deriving these guards per record.
 */
export function FieldEditorShell<T>({ bag, children, escapeOnly = false }: {
  bag: EditorBag<T>
  children: ReactNode
  /** Select/DateQuickPick editors pass true: Enter belongs to the control
   *  (Select opens its panel, segments activate), only Escape cancels. The
   *  amount editor passes false and gets the bag's full Enter/Escape. */
  escapeOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className="w-full max-w-[320px]"
      onBlur={(e) => {
        if (ref.current?.contains(e.relatedTarget)) return // stayed inside the editor
        bag.inputProps.onBlur(e)
      }}
      onKeyDown={(e) => {
        if (escapeOnly) {
          if (e.key === 'Escape') {
            e.preventDefault()
            bag.cancel()
          }
          return
        }
        bag.inputProps.onKeyDown(e)
      }}
    >
      {children}
    </div>
  )
}

/** One titled block of divide-y rows. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}
