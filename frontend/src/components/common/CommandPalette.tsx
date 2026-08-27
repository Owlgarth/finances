import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Calendar, CornerDownLeft, Home, PieChart, Receipt, Search, Settings, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useBudgets } from '../../hooks/useDomain'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useOverlay } from '../../hooks/useOverlay'
import BottomSheet from './BottomSheet'

// Module-level opener so any trigger (Sidebar, More sheet) can summon the
// palette without prop-drilling through the layout tree.
const OPEN_EVENT = 'owlgarth:open-page-search'
export function openPageSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

/** True on Apple platforms → show ⌘K instead of Ctrl K. */
export const isMacLike = /Mac|iPhone|iPad/.test(
  typeof navigator !== 'undefined' ? navigator.platform : '',
)

interface PageEntry {
  label: string
  to: string
  icon: LucideIcon
  group: 'Pages' | 'Budgets'
  /** Extra match terms beyond the label (e.g. "txns" → Transactions). */
  keywords?: string[]
}

const STATIC_PAGES: PageEntry[] = [
  { label: 'Dashboard', to: '/', icon: Home, group: 'Pages', keywords: ['home'] },
  { label: 'Accounts', to: '/accounts', icon: Wallet, group: 'Pages' },
  { label: 'Budgets', to: '/budgets', icon: PieChart, group: 'Pages' },
  { label: 'Transactions', to: '/transactions', icon: Receipt, group: 'Pages', keywords: ['txns'] },
  { label: 'Planned', to: '/planned', icon: Calendar, group: 'Pages', keywords: ['scheduled', 'recurring'] },
  { label: 'Transfers', to: '/transfers', icon: ArrowLeftRight, group: 'Pages', keywords: ['move money'] },
  { label: 'Members', to: '/members', icon: Users, group: 'Pages' },
  { label: 'Settings', to: '/settings', icon: Settings, group: 'Pages', keywords: ['profile', 'preferences'] },
]

function matches(entry: PageEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    entry.label.toLowerCase().includes(q) ||
    (entry.keywords ?? []).some((k) => k.includes(q))
  )
}

/**
 * Global page search (⌘K / Ctrl+K): jump to any app page or budget detail
 * page by name. Desktop = top-centered dialog; mobile = bottom sheet.
 */
export default function CommandPalette() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { workspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  // Budgets appear as their own jump targets (/budgets/:id).
  const { data: budgets = [] } = useBudgets(false)

  const panelRef = useOverlay(open && !isMobile, () => setOpen(false))
  const inputRef = useRef<HTMLInputElement>(null)

  // Declared after useOverlay, so this runs after its panel-focus — the input wins.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onShortcut)
    window.addEventListener(OPEN_EVENT, onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onShortcut)
      window.removeEventListener(OPEN_EVENT, onOpenEvent)
    }
  }, [])

  // Fresh query each open; also drops stale highlight.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setHighlighted(0)
    }
  }, [open])

  const entries = useMemo<PageEntry[]>(
    () => [
      ...STATIC_PAGES,
      ...budgets.map<PageEntry>((b) => ({
        label: b.name,
        to: `/budgets/${b.id}`,
        icon: PieChart,
        group: 'Budgets',
      })),
    ],
    [budgets],
  )

  const results = useMemo(() => entries.filter((e) => matches(e, query)), [entries, query])

  const go = (entry: PageEntry) => {
    setOpen(false)
    navigate(entry.to)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => (results.length === 0 ? 0 : (h + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => (results.length === 0 ? 0 : (h - 1 + results.length) % results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = results[Math.min(highlighted, results.length - 1)]
      if (entry) go(entry)
    }
  }

  if (!workspace) return null

  const input = (
    <div className="relative">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
        }}
        onKeyDown={handleKeyDown}
        placeholder="Go to page…"
        aria-label="Search pages"
        className="w-full bg-transparent border-0 border-b border-border pl-8 pr-3 py-3 font-mono text-xs max-sm:text-base text-text placeholder:text-text-muted focus:outline-none"
      />
    </div>
  )

  const list = (rowClass: string) => {
    let lastGroup: string | null = null
    return results.length === 0 ? (
      <div className="px-4 py-3 text-sm text-text-muted">No matching pages</div>
    ) : (
      results.map((entry, i) => {
        const header = entry.group !== lastGroup ? entry.group : null
        lastGroup = entry.group
        return (
          <div key={entry.to}>
            {header && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                {header}
              </div>
            )}
            <button
              type="button"
              onClick={() => go(entry)}
              onMouseEnter={() => setHighlighted(i)}
              className={`${rowClass} ${i === highlighted ? 'bg-surface-hover' : ''}`}
            >
              <entry.icon size={14} strokeWidth={1.5} className="flex-shrink-0 text-text-muted" />
              <span className="truncate flex-1 text-left">{entry.label}</span>
              {i === highlighted && !isMobile && (
                <CornerDownLeft size={12} className="flex-shrink-0 text-text-muted" />
              )}
            </button>
          </div>
        )
      })
    )
  }

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={() => setOpen(false)} aria-label="Search pages">
        <div className="sticky top-4 z-10 bg-surface">{input}</div>
        <div className="pb-2 pt-1">
          {list('w-full min-h-[44px] px-3 flex items-center gap-3 text-sm text-text transition-colors active:bg-surface-hover')}
        </div>
      </BottomSheet>
    )
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-modal-backdrop bg-scrim backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 z-modal flex items-start justify-center p-4 pt-[15vh]" onClick={() => setOpen(false)}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Search pages"
          tabIndex={-1}
          className="bg-surface border border-border rounded-sm w-full max-w-md outline-none overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {input}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {list('w-full h-8 px-3 flex items-center gap-2.5 text-xs text-text transition-colors hover:bg-surface-hover')}
          </div>
          <div className="px-3 py-1.5 border-t border-border text-[10px] font-mono text-text-muted flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </>
  )
}
