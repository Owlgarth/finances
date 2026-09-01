import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Calendar, CornerDownLeft, Home, PieChart, Receipt, Search, Settings, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { plannedTransactionsApi, transactionsApi } from '../../api/client'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useAccounts, useBudgets } from '../../hooks/useDomain'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useDebouncedField } from '../../hooks/useDebouncedField'
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

/** Page labels the sidebar also renders, keyed into the nav catalog (read-only
 *  here - keyed, not inlined, so palette and sidebar can never drift). */
type NavPageKey =
  | 'dashboard'
  | 'accounts'
  | 'budgets'
  | 'transactions'
  | 'planned'
  | 'members'
  | 'settings'

interface StaticPageBase {
  to: string
  icon: LucideIcon
  keywords?: string[]
}

// The `ns` discriminant keeps each labelKey checked against its own catalog:
// nav keys resolve through tNav, the common one through t.
type StaticPageEntry =
  | ({ ns: 'nav'; labelKey: NavPageKey } & StaticPageBase)
  | ({ ns: 'common'; labelKey: 'palette.transfers' } & StaticPageBase)

// Keys only: t() is resolved at render time inside the component (a
// module-level t() call would freeze the language at load time).
const STATIC_PAGES: StaticPageEntry[] = [
  { ns: 'nav', labelKey: 'dashboard', to: '/', icon: Home, keywords: ['home'] },
  { ns: 'nav', labelKey: 'accounts', to: '/accounts', icon: Wallet },
  { ns: 'nav', labelKey: 'budgets', to: '/budgets', icon: PieChart },
  { ns: 'nav', labelKey: 'transactions', to: '/transactions', icon: Receipt, keywords: ['txns'] },
  { ns: 'nav', labelKey: 'planned', to: '/planned', icon: Calendar, keywords: ['scheduled', 'recurring'] },
  // The nav catalog has no page label for Transfers (the sidebar doesn't link
  // there), so this one label ships in the palette's own namespace.
  { ns: 'common', labelKey: 'palette.transfers', to: '/transfers', icon: ArrowLeftRight, keywords: ['move money'] },
  { ns: 'nav', labelKey: 'members', to: '/members', icon: Users },
  { ns: 'nav', labelKey: 'settings', to: '/settings', icon: Settings, keywords: ['profile', 'preferences'] },
]

function matches(entry: PageEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    entry.label.toLowerCase().includes(q) ||
    (entry.keywords ?? []).some((k) => k.includes(q))
  )
}

/** Minimum committed-query length before the server-backed sections kick in. */
const MIN_ASYNC_QUERY = 2

type PaletteGroup = 'Pages' | 'Budgets' | 'Accounts' | 'Transactions' | 'Planned'

// Group headers are translated chrome; the union values themselves are
// internal identifiers, never rendered raw. Keys only - resolved with t().
const PALETTE_GROUP_KEYS = {
  Pages: 'palette.groupPages',
  Budgets: 'palette.groupBudgets',
  Accounts: 'palette.groupAccounts',
  Transactions: 'palette.groupTransactions',
  Planned: 'palette.groupPlanned',
} as const

interface PaletteRow {
  kind: 'row'
  key: string
  group: PaletteGroup
  label: string
  to: string
  icon: LucideIcon
  /** Small muted right-aligned hint (currency code, date). */
  meta?: string
  /** "See all results" section footer - link-styled instead of data-styled. */
  isFooter?: boolean
}

interface PaletteSkeleton {
  kind: 'skeleton'
  key: string
  group: PaletteGroup
}

type PaletteItem = PaletteRow | PaletteSkeleton

/**
 * Global search (⌘K / Ctrl+K): jump to any app page or budget detail page by
 * name, and once the query reaches two characters also surface matching
 * accounts (client-side) and transactions/planned items (server search).
 * Desktop = top-centered dialog; mobile = bottom sheet.
 */
export default function CommandPalette() {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  const { t: tNav } = useTranslation('nav')
  const { isMobile } = useBreakpoint()
  const { workspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  // Keystrokes update the draft instantly (static page matching runs on it,
  // so it never waits on the network); server-backed sections key off the
  // committed value so typing stays cheap.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [query, setQuery] = useDebouncedField('', setDebouncedQuery, 300)

  // Budgets appear as their own jump targets (/budgets/:id). Accounts back
  // the client-side Accounts section - the shared list cache serves it, so
  // filtering by name costs no request.
  const { data: budgets = [] } = useBudgets(false)
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(false)

  const q = debouncedQuery.trim()
  const asyncEnabled = q.length >= MIN_ASYNC_QUERY

  // Palette-local keys, deliberately outside the ['transactions']/['planned']
  // list families: every distinct keystroke creates a new cache entry, and
  // family invalidation (any transaction mutation) would otherwise replay a
  // request per query string ever typed here.
  const txSearch = useQuery({
    queryKey: ['palette-transactions', q],
    queryFn: () => transactionsApi.getAll({ search: q, page_size: 5 }),
    enabled: asyncEnabled,
  })
  const plannedSearch = useQuery({
    queryKey: ['palette-planned', q],
    queryFn: () => plannedTransactionsApi.getAll({ search: q, page_size: 5 }),
    enabled: asyncEnabled,
  })

  const panelRef = useOverlay(open && !isMobile, () => setOpen(false))
  const inputRef = useRef<HTMLInputElement>(null)

  // Declared after useOverlay, so this runs after its panel-focus - the input wins.
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

  // Fresh query each open; also drops stale highlight. The committed value is
  // cleared here too so a fast close/reopen (inside the debounce window)
  // cannot flash the previous session's async sections. setQuery is the
  // debounce hook's draft setter - stable like any useState setter.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      setHighlighted(0)
    }
  }, [open, setQuery])

  const entries = useMemo<PageEntry[]>(
    () => [
      ...STATIC_PAGES.map((p) => ({
        to: p.to,
        icon: p.icon,
        keywords: p.keywords,
        label: p.ns === 'nav' ? tNav(p.labelKey) : t(p.labelKey),
        group: 'Pages' as const,
      })),
      ...budgets.map<PageEntry>((b) => ({
        label: b.name,
        to: `/budgets/${b.id}`,
        icon: PieChart,
        group: 'Budgets',
      })),
    ],
    [budgets, t, tNav],
  )

  const staticResults = useMemo(() => entries.filter((e) => matches(e, query)), [entries, query])

  const accountMatches = useMemo(() => {
    if (!asyncEnabled) return []
    const needle = q.toLowerCase()
    return accounts.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 5)
  }, [accounts, asyncEnabled, q])

  // One flat render model in visual order: interactive rows plus skeleton
  // blocks. Keyboard traversal (below) walks the row subset only, so arrows
  // land exclusively on entries the user can activate. Rows exist only once
  // a section's data has settled; a loading section contributes a skeleton
  // block instead, and a settled-empty one nothing at all (an empty block
  // reads as "broken", not "no match"). A failed search request also lands
  // there - data stays undefined, the section is simply omitted and the
  // static results keep working.
  const items = useMemo<PaletteItem[]>(() => {
    const txRows = !txSearch.isLoading ? (txSearch.data?.items ?? []) : []
    const plannedRows = !plannedSearch.isLoading ? (plannedSearch.data?.items ?? []) : []
    // Data rows and footers navigate to the filtered list page, never an
    // edit modal - a palette pick should land on something addressable.
    const txResultsTo = `/transactions?search=${encodeURIComponent(q)}`
    const plannedResultsTo = `/planned?search=${encodeURIComponent(q)}`
    const items: PaletteItem[] = staticResults.map((e) => ({
      kind: 'row',
      key: `page-${e.to}`,
      group: e.group,
      label: e.label,
      to: e.to,
      icon: e.icon,
    }))
    if (asyncEnabled) {
      if (accountsLoading) {
        items.push({ kind: 'skeleton', key: 'skeleton-accounts', group: 'Accounts' })
      } else if (accountMatches.length > 0) {
        for (const a of accountMatches) {
          items.push({
            kind: 'row',
            key: `account-${a.id}`,
            group: 'Accounts',
            label: a.name,
            to: '/accounts',
            icon: Wallet,
            meta: a.currency_code,
          })
        }
      }
      if (txSearch.isLoading) {
        items.push({ kind: 'skeleton', key: 'skeleton-transactions', group: 'Transactions' })
      } else if (txRows.length > 0) {
        for (const t of txRows) {
          items.push({
            kind: 'row',
            key: `transaction-${t.id}`,
            group: 'Transactions',
            label: t.description,
            to: txResultsTo,
            icon: Receipt,
            meta: t.date,
          })
        }
        items.push({
          kind: 'row',
          key: 'transactions-all',
          group: 'Transactions',
          label: t('palette.seeAllResults'),
          to: txResultsTo,
          icon: Search,
          isFooter: true,
        })
      }
      if (plannedSearch.isLoading) {
        items.push({ kind: 'skeleton', key: 'skeleton-planned', group: 'Planned' })
      } else if (plannedRows.length > 0) {
        for (const p of plannedRows) {
          items.push({
            kind: 'row',
            key: `planned-${p.id}`,
            group: 'Planned',
            label: p.name,
            to: plannedResultsTo,
            icon: Calendar,
            meta: p.planned_date,
          })
        }
        items.push({
          kind: 'row',
          key: 'planned-all',
          group: 'Planned',
          label: t('palette.seeAllResults'),
          to: plannedResultsTo,
          icon: Search,
          isFooter: true,
        })
      }
    }
    return items
  }, [
    staticResults,
    asyncEnabled,
    q,
    accountsLoading,
    accountMatches,
    txSearch.isLoading,
    txSearch.data,
    plannedSearch.isLoading,
    plannedSearch.data,
    t,
  ])

  const results = useMemo(
    () => items.filter((item): item is PaletteRow => item.kind === 'row'),
    [items],
  )

  // A section still fetching counts as "not empty yet" - the empty message
  // waits until the static results AND every async section have settled empty.
  const anySectionLoading =
    asyncEnabled && (accountsLoading || txSearch.isLoading || plannedSearch.isLoading)

  // Data rows and footers navigate to the filtered list page, never an edit
  // modal - a palette pick should land on something addressable.
  const go = (row: PaletteRow) => {
    setOpen(false)
    navigate(row.to)
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
      const row = results[Math.min(highlighted, results.length - 1)]
      if (row) go(row)
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
        placeholder={t('palette.searchPlaceholder')}
        aria-label={t('palette.searchLabel')}
        className="w-full bg-transparent border-0 border-b border-border pl-8 pr-3 py-3 font-mono text-xs max-sm:text-base text-text placeholder:text-text-muted focus:outline-none"
      />
    </div>
  )

  const groupHeader = (group: PaletteGroup) => (
    <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
      {t(PALETTE_GROUP_KEYS[group])}
    </div>
  )

  const list = (rowClass: string) => {
    if (results.length === 0 && !anySectionLoading) {
      return <div className="px-4 py-3 text-sm text-text-muted">{t('palette.noMatches')}</div>
    }
    let lastGroup: PaletteGroup | null = null
    let rowIndex = 0
    return items.map((item) => {
      if (item.kind === 'skeleton') {
        lastGroup = item.group
        return (
          <div key={item.key}>
            {groupHeader(item.group)}
            {[0, 1, 2].map((s) => (
              <div key={s} className="mx-3 my-2 h-3.5 rounded-sm bg-surface-muted animate-pulse" />
            ))}
          </div>
        )
      }
      const i = rowIndex++
      const header = item.group !== lastGroup ? item.group : null
      lastGroup = item.group
      return (
        <div key={item.key}>
          {header && groupHeader(header)}
          <button
            type="button"
            onClick={() => go(item)}
            onMouseEnter={() => setHighlighted(i)}
            className={`${rowClass} ${i === highlighted ? 'bg-surface-hover' : ''}`}
          >
            <item.icon size={14} strokeWidth={1.5} className="flex-shrink-0 text-text-muted" />
            <span className={`truncate flex-1 text-left ${item.isFooter ? 'text-primary' : ''}`}>
              {item.label}
            </span>
            {item.meta && (
              <span className="flex-shrink-0 text-[10px] font-mono text-text-muted">{item.meta}</span>
            )}
            {i === highlighted && !isMobile && (
              <CornerDownLeft size={12} className="flex-shrink-0 text-text-muted" />
            )}
          </button>
        </div>
      )
    })
  }

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={() => setOpen(false)} aria-label={t('palette.searchLabel')}>
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
          aria-label={t('palette.searchLabel')}
          tabIndex={-1}
          className="bg-surface border border-border rounded-sm w-full max-w-md outline-none overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {input}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {list('w-full h-8 px-3 flex items-center gap-2.5 text-xs text-text transition-colors hover:bg-surface-hover')}
          </div>
          <div className="px-3 py-1.5 border-t border-border text-[10px] font-mono text-text-muted flex items-center gap-3">
            <span>{t('palette.hintNavigate')}</span>
            <span>{t('palette.hintOpen')}</span>
            <span>{t('palette.hintClose')}</span>
          </div>
        </div>
      </div>
    </>
  )
}
