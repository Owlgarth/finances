interface Props {
  page: number
  total_pages: number
  total: number
  page_size: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200]

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = [1]

  if (current > 3) {
    pages.push('ellipsis')
  }

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push('ellipsis')
  }

  if (total > 1) {
    pages.push(total)
  }

  return pages
}

export default function Pagination({ page, total_pages, total, page_size, onPageChange, onPageSizeChange }: Props) {
  const firstItem = total === 0 ? 0 : (page - 1) * page_size + 1
  const lastItem = Math.min(page * page_size, total)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-outline-variant">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Rows per page</span>
        <select
          value={page_size}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-surface-container-high text-on-surface rounded-lg px-2 py-1 text-sm font-mono border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="font-mono">
          {firstItem}&ndash;{lastItem} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>

        {getPageNumbers(page, total_pages).map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-on-surface-variant text-sm">
              &hellip;
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-mono font-medium transition-colors ${
                p === page
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= total_pages}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  )
}
