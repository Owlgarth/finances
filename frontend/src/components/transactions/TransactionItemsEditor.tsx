import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi } from '../../api/client'
import type { Transaction, TransactionItemInput } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { primaryButtonClass } from '../common/formStyles'
import TransactionItemsTable from './TransactionItemsTable'
import type { Row } from './TransactionItemsTable'

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
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price ?? '',
          line_total: i.line_total ?? '',
        })),
      )
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const payload: TransactionItemInput[] = rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          quantity: r.quantity || '1',
          unit_price: r.unit_price === '' ? null : r.unit_price,
          line_total: r.line_total === '' ? null : r.line_total,
        }))
      return transactionsApi.replaceItems(transaction.id, payload)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-items', transaction.id] })
      toast.success('Items saved')
      setRows(
        res.items.map((i) => ({
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
      <TransactionItemsTable
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
