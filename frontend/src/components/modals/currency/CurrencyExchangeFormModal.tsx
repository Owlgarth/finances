import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { currencyExchangesApi } from '../../../api/client'
import type { CurrencyExchange } from '../../../types'
import { format } from 'date-fns'

interface Props {
  isOpen: boolean
  onClose: () => void
  exchange?: CurrencyExchange | null
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

export default function CurrencyExchangeFormModal({ isOpen, onClose, exchange }: Props) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [fromCurrency, setFromCurrency] = useState('PLN')
  const [fromAmount, setFromAmount] = useState('')
  const [toCurrency, setToCurrency] = useState('USD')
  const [toAmount, setToAmount] = useState('')
  const queryClient = useQueryClient()

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (exchange) {
      setDate(exchange.date)
      setDescription(exchange.description || '')
      setFromCurrency(exchange.from_currency)
      setFromAmount(exchange.from_amount.toString())
      setToCurrency(exchange.to_currency)
      setToAmount(exchange.to_amount.toString())
    } else {
      setDate(today)
      setDescription('')
      setFromCurrency('PLN')
      setFromAmount('')
      setToCurrency('USD')
      setToAmount('')
    }
  }, [exchange, isOpen, today])

  const mutation = useMutation({
    mutationFn: (data: any) =>
      exchange
        ? currencyExchangesApi.update(exchange.id, data)
        : currencyExchangesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges'] })
      // Force refetch of period-balances to ensure UI updates immediately
      // This is needed because the app uses persistent cache with staleTime
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success(exchange ? 'Exchange updated successfully!' : 'Exchange created successfully!')
      onClose()
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose()
        return
      }
      toast.error(exchange ? 'Failed to update exchange' : 'Failed to create exchange')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (fromCurrency === toCurrency) {
      toast.error('From currency and to currency must be different')
      return
    }

    mutation.mutate({
      date,
      description: description || undefined,
      from_currency: fromCurrency,
      from_amount: parseFloat(fromAmount),
      to_currency: toCurrency,
      to_amount: parseFloat(toAmount)
    })
  }

  const calculateRate = () => {
    const from = parseFloat(fromAmount)
    const to = parseFloat(toAmount)
    if (from > 0 && to > 0) {
      return (to / from).toFixed(6)
    }
    return null
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {exchange ? 'Edit Currency Exchange' : 'New Currency Exchange'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">From Currency *</label>
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">From Amount *</label>
              <input
                type="number"
                step="0.01"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="100.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">To Currency *</label>
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">To Amount *</label>
              <input
                type="number"
                step="0.01"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="25.00"
                required
              />
            </div>
          </div>

          {fromAmount && toAmount && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm text-gray-600">
                Exchange Rate: <span className="font-semibold">{calculateRate()}</span>
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
