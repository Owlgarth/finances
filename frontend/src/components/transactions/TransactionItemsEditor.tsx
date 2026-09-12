import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { transactionsApi } from '../../api/client'
import type { Transaction, TransactionItem } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
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
})

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

  const [rows, setRows] = useState<Row[]>(() => (data ? data.items.map(toRow) : []))
  // Identity of the query data the rows were last seeded from, and a dirty
  // flag that flips on the first user edit: refetches re-seed only a
  // pristine table, never one with unsaved edits.
  const [lastSeededData, setLastSeededData] = useState(data)
  const [dirty, setDirty] = useState(false)

  const save = useMutation({
    mutationFn: () => transactionsApi.replaceItems(transaction.id, rowsToItems(rows)),
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

  // Data-identity render-adjust: seed the editable rows when a new
  // query-data identity arrives (initial resolution, remount with cache,
  // post-save cache write) - guarded by !dirty so a background refetch
  // never clobbers edits. React discards this pass and re-runs with the
  // seeded state before anything commits.
  if (data && data !== lastSeededData) {
    setLastSeededData(data)
    if (!dirty) setRows(data.items.map(toRow))
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
      />
      <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className={primaryButtonClass}>
        {save.isPending ? t('editor.saving') : t('editor.save')}
      </button>
    </div>
  )
}
