import type { ReactNode } from 'react'

interface SplitViewProps {
  /** The list (table, cards). Always rendered; owns the full width when panel is null. */
  list: ReactNode
  /** The side panel content (a DetailPanel, or create-mode content), or null when nothing is open. */
  panel: ReactNode | null
}

/**
 * List + side-panel split for the desktop record views. The LIST wrapper
 * is the container-query container (`@container`, container-type:
 * inline-size) so column sets can key on the list's own available width
 * rather than the viewport - available width is what determines how many
 * columns fit once the panel is open. First container in the tree;
 * Tailwind 4 ships `@container` natively, no index.css registration.
 *
 * The panel slot carries the panel's width ONCE - 400px at both desktop
 * tiers, no clamp() - and DetailPanel deliberately carries NO width
 * utility of its own (one-width-class rule: no two width rules can fight
 * on the same element; the block-level panel fills the slot naturally).
 *
 * With panel === null the single list child gets the row to itself: flex
 * gap applies BETWEEN children only, and these wrappers add no
 * padding/border, so the rendered list is pixel-identical to the bare one
 * (inline-size containment is a no-op for in-flow content; verified by
 * measurement, not assumed).
 *
 * The 24px gutter (gap-6) matches the main-content padding rhythm and
 * applies only when both children render.
 */
export default function SplitView({ list, panel }: SplitViewProps) {
  return (
    <div className="flex gap-6">
      <div className="@container flex-1 min-w-0">{list}</div>
      {panel !== null && <div className="w-[400px] shrink-0">{panel}</div>}
    </div>
  )
}
