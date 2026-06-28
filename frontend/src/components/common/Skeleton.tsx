interface SkeletonProps {
  /** Sizing/spacing utilities (height, width, margin). Base classes (bg-surface-muted rounded-sm animate-pulse) always applied. */
  className?: string
}

/** A single wireframe skeleton bar. Use for initial-load placeholders. */
export default function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return <div className={`bg-surface-muted rounded-sm animate-pulse ${className}`} />
}

interface SkeletonRowsProps {
  /** Number of rows to render. */
  count?: number
  /** Classes for the wrapping container (e.g. 'space-y-3' or 'divide-y divide-border'). */
  className?: string
  /** Classes for each row (height/width). */
  rowClassName?: string
}

/** A vertical stack of N skeleton rows — the dashboard-widget loading pattern. */
export function SkeletonRows({
  count = 3,
  className = 'space-y-3',
  rowClassName = 'h-4 w-full',
}: SkeletonRowsProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  )
}
