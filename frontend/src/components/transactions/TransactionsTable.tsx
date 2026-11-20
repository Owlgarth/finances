import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatAmount, formatQuickPickDate } from '../../utils/format'
import type { Transaction } from '../../types'

// Same semantic color mapping as TYPE_STYLE in pages/Transactions.tsx and
// transactions/TransactionRecord.tsx (keep in sync; with a third consumer
// the copy belongs in a shared module at the next touch of all three).
const TYPE_STYLE: Record<string, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  adjustment: 'text-warning',
}

// The short-date variant label, hoisted so the literal-string lint sees a
// binding, not a rendered string (the variant itself is never UI text).
const SHORT_DATE_VARIANT = 'date' as const

// Row height floors use HEIGHT, not min-height: Chrome's automatic table
// layout ignores min-height on both table-row and table-cell (measured - a
// computed 44px min-height left the row at its 33px content height), while
// height on a row/cell is treated as a MINIMUM (CSS table sizing), so
// taller content still grows the row. 32px fine pointer, 44px coarse,
// 52px coarse on the two-line A set.
const ROW_FLOOR = 'h-8 pointer-coarse:h-[44px] pointer-coarse:@max-[559.98px]:h-[52px]'

interface TransactionsTableProps {
  items: Transaction[]
  /** The open record's id (the route's :id param), or null when nothing is open. */
  selectedId: number | null
  /** True when the workspace has more than one account (page derivation). */
  showAccountColumn: boolean
  /** True in multi-currency workspaces (page derivation). */
  multiCurrency: boolean
  /** Opens a record. The page branches on tier inside this handler: at
      1024+ it opens the side panel (replacing when one is already open),
      below 1024 it pushes the full record page. */
  onOpen: (tx: Transaction) => void
  /** Create-row seam: rendered as the first tbody row. The row's own form
      inputs own their arrow/Enter keys (see the keyboard handler guard). */
  leadRow?: ReactNode
}

/**
 * The transactions ledger table for 640px and up (the phone list stays div
 * rows). Column sets switch on the TABLE's own width via container queries
 * that resolve against the nearest @container ancestor - SplitView's list
 * wrapper, whose inline-size IS the table width:
 *
 *   under 560   Date (short) + Description with an "account · category"
 *               second line + Amount
 *   560 - 759   + Category column; the second line drops its category part
 *   760 and up  Date (full) + Description + Account + Category + Amount,
 *               no second line
 *
 * Boundary pairs are complementary (@min-[560px] against a base state, the
 * same base hidden again by @min-[760px] where a wider element takes over),
 * never @max/@min twins at adjacent pixels - a fractional container width
 * would match neither of those.
 *
 * Keyboard: rows are a roving-tabindex listbox-style grid. Exactly one row
 * carries tabIndex 0 (the selected row when it is on this page, else the
 * first non-auto row); Up/Down move focus and - once a record is open -
 * selection with it; Enter/Space open the focused row. The key handler sits
 * on the tbody so keys pressed in the side panel, the search box, or page
 * chrome never reach it (a React onKeyDown only fires for descendants).
 * Auto-created facet adjustments are skipped by navigation but can still be
 * the deep-linked selected row - the record renders them read-only.
 */
export default function TransactionsTable({ items, selectedId, showAccountColumn, multiCurrency, onOpen, leadRow }: TransactionsTableProps) {
  const { t } = useTranslation('transactions')
  const tableRef = useRef<HTMLTableSectionElement>(null)

  // Navigating between the list URL and the record URL swaps the matched
  // route element, which remounts this table and drops focus to <body> -
  // after opening a record, keyboard users would have to Tab back in
  // before arrows work. Refocus the SELECTED row once per mount so the
  // walk continues (a bare list mount focuses nothing). DOM-only, and
  // programmatic focus after a mouse interaction shows no focus ring.
  useEffect(() => {
    tableRef.current?.querySelector<HTMLElement>('tr[data-id][aria-current="true"]')?.focus()
  }, [])

  // Exactly one row gets the tab stop: the selected row when it is rendered
  // on this page, else the first non-auto row.
  const selectedOnPage = selectedId != null && items.some((tx) => tx.id === selectedId)
  const firstNonAutoId = items.find((tx) => tx.source_transaction_id == null)?.id ?? null

  function handleTableKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    // The lead row puts inputs inside the first body row: arrow keys and
    // Enter in a form control belong to the control (caret move, submit),
    // never to row selection.
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, [contenteditable]')) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return
    const row = (e.target instanceof HTMLElement ? e.target.closest('tr') : null) as HTMLElement | null
    if (!row || !tableRef.current?.contains(row)) return
    const rows = Array.from(tableRef.current.querySelectorAll<HTMLElement>('tr[data-id]'))
    const navigable = rows.filter((r) => r.dataset.auto === undefined)
    const idx = navigable.indexOf(row)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const tx = items.find((it) => String(it.id) === row.dataset.id)
      if (tx && tx.source_transaction_id == null) onOpen(tx)
      return
    }
    const next = navigable[e.key === 'ArrowDown' ? idx + 1 : idx - 1]
    if (!next) return
    e.preventDefault()
    next.focus()
    // Selection follows focus only when a record is already open: with the
    // panel closed, arrows move focus alone (Enter/Space/click open).
    if (selectedId != null) {
      const tx = items.find((it) => String(it.id) === next.dataset.id)
      if (tx) onOpen(tx)
    }
  }

  return (
    // The container drops the ledger system's overflow-hidden on purpose:
    // position:sticky never engages inside an overflow:hidden ancestor (the
    // hidden box becomes the sticky's scrollport and itself never scrolls),
    // and the sticky thead is the functional requirement (640-1023 scrolls
    // long lists inside <main>). The header's top corners stay
    // color-invisible (bg-background header on the bg-background page); the
    // tbody corner rounding below patches the bottom zebra corners. min-w-0
    // is defense-in-depth: the card can never push past its list slot.
    <div className="w-full min-w-0 border border-border rounded-sm">
      <table className="w-full border-collapse" aria-label={t('table.ariaLabel')}>
        <thead className="sticky top-0 z-sticky">
          <tr className="bg-background border-b border-border h-8">
            <th scope="col" className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left">{t('table.date')}</th>
            <th scope="col" className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left">{t('table.description')}</th>
            <th scope="col" className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left hidden @min-[760px]:table-cell">{t('table.account')}</th>
            <th scope="col" className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-left hidden @min-[560px]:table-cell">{t('table.category')}</th>
            <th scope="col" className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-3 py-1 text-right">{t('table.amount')}</th>
          </tr>
        </thead>
        <tbody ref={tableRef} onKeyDown={handleTableKeyDown} className="[&_tr:last-child>td:first-child]:rounded-bl-sm [&_tr:last-child>td:last-child]:rounded-br-sm">
          {leadRow}
          {items.map((tx) => {
            // Auto-created facet adjustments are managed by their source
            // transaction: no click, no cursor, skipped by keyboard
            // navigation (they can still be the deep-linked selected row -
            // the record renders them read-only).
            const auto = tx.source_transaction_id != null
            const selected = tx.id === selectedId
            // Account segment of the A/B second line - the div-row idiom:
            // single-account workspaces keep lean rows and show the segment
            // only for account-less rows.
            const accountSegment = showAccountColumn || !tx.account_name ? tx.account_name ?? t('noAccount') : null
            return (
              // Selected and unselected are mutually exclusive class sets:
              // zebra (odd:/even:) sits at higher specificity than a plain
              // bg utility, so the selected branch carries bg-surface-hover
              // ALONE and swaps the whole string. Every row reserves the
              // 2px left border (transparent when unselected) so selection
              // never shifts content by 2px.
              <tr
                key={tx.id}
                data-id={tx.id}
                data-auto={auto ? '' : undefined}
                tabIndex={selected || (!selectedOnPage && firstNonAutoId === tx.id) ? 0 : -1}
                aria-current={selected ? 'true' : undefined}
                onClick={auto ? undefined : () => onOpen(tx)}
                className={selected
                  ? `${ROW_FLOOR} border-b border-border border-l-2 border-l-primary bg-surface-hover transition-colors`
                  : `${ROW_FLOOR} border-b border-border border-l-2 border-l-transparent transition-colors ${auto ? '' : 'cursor-pointer odd:bg-surface even:bg-background hover:bg-surface-hover'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus`}
              >
                <td className="px-3 py-1 font-mono text-xs text-text-muted whitespace-nowrap">
                  {/* Short form (locale-aware, auto-year for far dates) in
                      A/B; the raw ISO in C - the header labels both. */}
                  <span className="@min-[760px]:hidden">{formatQuickPickDate(tx.date, SHORT_DATE_VARIANT)}</span>
                  <span className="hidden @min-[760px]:inline">{tx.date}</span>
                </td>
                <td className="px-3 py-1 text-[13px] text-text min-w-0">
                  {/* The description column must not feed the table's
                      minimum width: a nowrap truncate span still counts its
                      full text into the column floor, so with the record
                      panel open the whole table used to escape its slot
                      (measured: one 50-char description pinned the column
                      at 412px). width 0 plus min-width 100% removes the
                      div from the floor computation (a definite width wins
                      over content) while its used width still fills the
                      cell, so rendering is unchanged wherever the column
                      fits. Scoped to the squeezed column sets: at 760 and
                      up the table has room and the div goes back to a
                      plain filling block (w-auto), byte-identical to the
                      old proportions. */}
                  <div className="flex items-center gap-2 min-w-0 w-0 min-w-full @min-[760px]:w-auto @min-[760px]:min-w-0">
                    <span className="truncate">{tx.description}</span>
                    {tx.type === 'adjustment' && (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-warning border border-warning/40 rounded-sm px-1">{t('adjBadge')}</span>
                    )}
                    {auto && (
                      <span title={t('autoBadgeTitle')} className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1">{t('autoBadge')}</span>
                    )}
                  </div>
                  {/* Second line (A/B): account stays until the whole line
                      vanishes at 760; the category part and its separator
                      leave the moment the Category column appears at 560.
                      Same floor-removal pair as the first line, base-only:
                      this line is display:none at 760 and up, so no
                      restore variant is needed. */}
                  <div className="block @min-[760px]:hidden text-[10px] font-mono text-text-muted truncate w-0 min-w-full">
                    {accountSegment != null && <span>{accountSegment}</span>}
                    {accountSegment != null && tx.category_name != null && <span className="@min-[560px]:hidden">{' · '}</span>}
                    {tx.category_name != null && <span className="@min-[560px]:hidden">{tx.category_name}</span>}
                  </div>
                </td>
                <td className="px-3 py-1 text-[13px] text-text truncate hidden @min-[760px]:table-cell">
                  {tx.account_name ?? t('noAccount')}
                </td>
                <td className="px-3 py-1 text-[13px] text-text truncate hidden @min-[560px]:table-cell">
                  {tx.category_name ?? ''}
                </td>
                <td className="px-3 py-1 text-right">
                  <span className={`font-mono text-xs tabular-nums whitespace-nowrap ${TYPE_STYLE[tx.type]}`}>
                    {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}
                    {formatAmount(tx.amount)}{multiCurrency ? ' ' + tx.currency_code : ''}
                  </span>
                  {tx.original_amount && tx.original_currency_code && (
                    <div className="text-[10px] font-mono text-text-muted">
                      {formatAmount(tx.original_amount)} {tx.original_currency_code}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
