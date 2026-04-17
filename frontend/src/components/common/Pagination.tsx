import { ChevronLeft, ChevronRight } from 'lucide-react'

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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border">
      <div className="flex items-center gap-3 text-sm text-text-muted">
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">Rows per page</span>
        <select
          value={page_size}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-surface-hover text-text rounded-none px-2 py-1 text-sm font-mono border border-border focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {getPageNumbers(page, total_pages).map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-text-muted text-sm">
              &hellip;
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-sm text-sm font-mono font-medium transition-colors ${
                p === page
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-surface-hover'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= total_pages}
          className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
