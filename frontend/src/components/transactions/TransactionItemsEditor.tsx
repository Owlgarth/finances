import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi } from '../../api/client'
import type { Transaction } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { rowsToItems } from '../../utils/transactionItems'
import { primaryButtonClass } from '../common/formStyles'
import TransactionItemsList from './TransactionItemsList'
import type { Row } from './TransactionItemsList'

interface Props {
  transaction: Transaction
}

export default function TransactionItemsEditor({ transaction }: Props) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-items', transaction.id],
    queryFn: () => transactionsApi.listItems(transaction.id),
  })

  useEffect(() => {
    if (data) {
      setRows(
        data.items.map((i) => ({
          id: crypto.randomUUID(),
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price ?? '',
          line_total: i.line_total ?? '',
        })),
      )
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => transactionsApi.replaceItems(transaction.id, rowsToItems(rows)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-items', transaction.id] })
      toast.success('Items saved')
      setRows(
        res.items.map((i) => ({
          id: crypto.randomUUID(),
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price ?? '',
          line_total: i.line_total ?? '',
        })),
      )
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save items')),
  })

  if (isLoading) return <div className="h-16 bg-surface-muted rounded-sm animate-pulse" />

  return (
    <div className="space-y-2">
      <TransactionItemsList
        rows={rows}
        onChange={setRows}
        amount={transaction.amount}
        currencyCode={transaction.currency_code}
      />
      <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className={primaryButtonClass}>
        {save.isPending ? 'Saving…' : 'Save items'}
      </button>
    </div>
  )
}
