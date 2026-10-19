import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { budgetsApi, transactionsApi } from '../../api/client'
import type { Transaction, TransactionItem } from '../../types'
import { parseAmountNumber } from '../../utils/amountInput'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount } from '../../utils/format'
import { rowsToItems } from '../../utils/transactionItems'
import { primaryButtonClass } from '../common/formStyles'
import TransactionItemsList from './TransactionItemsList'
import type { Row } from './TransactionItemsList'

/** TransactionItem (API row) -> Row (table editing shape), fresh row id. */
const toRow = (i: TransactionItem): Row => ({
  id: crypto.randomUUID(),
  name: i.name,
  quantity: i.quantity,
  unit_price: i.unit_price ?? '',
  line_total: i.line_total ?? '',
  categoryId: i.category_id ?? null,
})

/** Editable rows exclude the system remainder row: it is never a Row, so the
 * replace payload can never carry a client-authored remainder. The remainder
 * travels only through the dedicated remainder_category_id / remainder_name
 * payload fields; re-sending its amount as a user row would double-count it
 * (the server re-materializes a fresh remainder against the sent rows). */
const toUserRows = (items: TransactionItem[]): Row[] =>
  items.filter((i) => !i.is_remainder).map(toRow)

/** The system remainder row, when coverage leaves one (user items under the amount). */
const remainderOf = (items: TransactionItem[]): TransactionItem | undefined =>
  items.find((i) => i.is_remainder)

/** Sum of line totals, falling back to quantity x unit price - mirrors the backend.
 * KEEP IN SYNC with computeTotal in TransactionItemsList.tsx (same math, two
 * private copies; a third consumer is the extraction trigger). */
function computeTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => {
    if (r.line_total !== '') return sum + (parseAmountNumber(r.line_total) ?? 0)
    if (r.unit_price !== '') {
      // Display-only tolerance: an empty or mid-edit quantity reads as 1
      // (the row's own default) so the live preview total never errors
      // while the user is still typing.
      const qty = parseAmountNumber(r.quantity) ?? 1
      return sum + qty * (parseAmountNumber(r.unit_price) ?? 0)
    }
    return sum
  }, 0)
}

interface Props {
  transaction: Transaction
}

export default function TransactionItemsEditor({ transaction }: Props) {
  const { t } = useTranslation('transactions')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-items', transaction.id],
    queryFn: () => transactionsApi.listItems(transaction.id),
  })

  // Categories of the transaction category's budget - the same cache family
  // as TransactionFormModal's query, so warm entries are shared. A null
  // budget id (uncategorized transaction, or an adjustment - adjustments
  // never carry a category) disables the query: item categories are legal
  // only within the transaction category's budget, and the List renders its
  // category selects disabled in that state.
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', transaction.category_budget_id],
    queryFn: () => budgetsApi.listCategories(transaction.category_budget_id!),
    enabled: transaction.category_budget_id != null,
  })
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  const [rows, setRows] = useState<Row[]>(() => (data ? toUserRows(data.items) : []))
  // Identity of the query data the rows were last seeded from, and a dirty
  // flag that flips on the first user edit: refetches re-seed only a
  // pristine table, never one with unsaved edits.
  const [lastSeededData, setLastSeededData] = useState(data)
  const [dirty, setDirty] = useState(false)
  // Remainder category/name are parent-owned state seeded from the system row.
  // Lazy initializers matter: on a warm-cache remount (tab re-select),
  // lastSeededData === data so the render-adjust below never fires, and the
  // initializers are the only seeding that runs.
  const [remainderCategoryId, setRemainderCategoryId] = useState<number | null>(() =>
    remainderOf(data?.items ?? [])?.category_id ?? null,
  )
  const [remainderName, setRemainderName] = useState(() =>
    remainderOf(data?.items ?? [])?.name ?? '',
  )

  const save = useMutation({
    // Full-replace PUT: both remainder keys ride every save - the positional
    // params below map onto the remainder_category_id / remainder_name body
    // keys. remainderCategoryId carries inherit-null or an explicit id.
    mutationFn: () =>
      transactionsApi.replaceItems(
        transaction.id,
        rowsToItems(rows),
        remainderCategoryId,
        // '' (empty string) is the reset-to-default value: the backend treats
        // null and omitted identically (leave unchanged) and honors '' as
        // "clear the custom name back to the server default".
        remainderName.trim(),
      ),
    onSuccess: (res) => {
      // Server truth straight into the cache: the data-identity adjust
      // below re-seeds the rows from it (dirty is reset first), and no
      // refetch loop fires. Remounts (tab re-select) read the same cache.
      setDirty(false)
      queryClient.setQueryData(['transaction-items', transaction.id], res)
      toast.success(t('editor.saved'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('editor.saveFailed'))),
  })

  const handleSave = () => {
    // Client-side mirror of the server's over-sum rejection: user rows that
    // already exceed the amount skip the round-trip. Only named rows count -
    // rowsToItems drops unnamed ones, so a stray unnamed total must not block
    // a save the payload itself would pass. Tolerance matches the List's
    // mismatch warning (0.01).
    const namedRows = rows.filter((r) => r.name.trim())
    const parsedAmount = parseAmountNumber(transaction.amount)
    const absAmount = parsedAmount === null ? 0 : Math.abs(parsedAmount)
    const namedTotal = computeTotal(namedRows)
    if (parsedAmount !== null && namedTotal > absAmount + 0.01) {
      toast.error(t('items.mismatch', { items: formatAmount(namedTotal), amount: formatAmount(absAmount) }))
      return
    }
    save.mutate()
  }

  // Data-identity render-adjust: seed the editable rows and the remainder
  // controls when a new query-data identity arrives (initial resolution,
  // remount with cache, post-save cache write) - guarded by !dirty so a
  // background refetch never clobbers edits, including remainder edits.
  // React discards this pass and re-runs with the seeded state before
  // anything commits.
  if (data && data !== lastSeededData) {
    setLastSeededData(data)
    if (!dirty) {
      setRows(toUserRows(data.items))
      const remainder = remainderOf(data.items)
      setRemainderCategoryId(remainder?.category_id ?? null)
      setRemainderName(remainder?.name ?? '')
    }
    return null
  }

  if (isLoading) return <div className="h-16 bg-surface-muted rounded-sm animate-pulse" />

  return (
    <div className="space-y-2">
      <TransactionItemsList
        rows={rows}
        onChange={(next) => {
          setDirty(true)
          setRows(next)
        }}
        amount={transaction.amount}
        currencyCode={transaction.currency_code}
        categoryOptions={categoryOptions}
        transactionCategoryId={transaction.category_id}
        remainderCategoryId={remainderCategoryId}
        remainderName={remainderName}
        onRemainderCategoryIdChange={(next) => {
          setDirty(true)
          // Defensive: the List already maps its Inherit sentinel back to
          // null, and category ids are positive - a non-positive value must
          // never reach the payload as a category id. null stays null, the
          // 0 sentinel maps to null, positives pass through.
          setRemainderCategoryId(next == null || next <= 0 ? null : next)
        }}
        onRemainderNameChange={(next) => {
          setDirty(true)
          setRemainderName(next)
        }}
      />
      <button type="button" onClick={handleSave} disabled={save.isPending} className={primaryButtonClass}>
        {save.isPending ? t('editor.saving') : t('editor.save')}
      </button>
    </div>
  )
}
