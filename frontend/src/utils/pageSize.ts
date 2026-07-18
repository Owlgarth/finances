// Rows-per-page is a local (per-browser) preference, like utils/zoomLock —
// one shared value for every paginated table.

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200]

const STORAGE_KEY = 'denarly_page_size'
const DEFAULT_PAGE_SIZE = 25

export function getStoredPageSize(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY))
  return PAGE_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_PAGE_SIZE
}

export function setStoredPageSize(size: number): void {
  if (PAGE_SIZE_OPTIONS.includes(size)) {
    localStorage.setItem(STORAGE_KEY, String(size))
  }
}
