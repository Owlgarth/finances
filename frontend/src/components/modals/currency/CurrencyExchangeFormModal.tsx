import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { currencyExchangesApi } from '../../../api/client'
import type { CurrencyExchange } from '../../../types'
import { format } from 'date-fns'
import DatePicker from '../../DatePicker'

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
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div 
        className="bg-surface-container-lowest rounded-xl p-6 w-full max-w-md relative"
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">
          {exchange ? 'Edit Currency Exchange' : 'New Currency Exchange'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Date *</label>
            <DatePicker
              value={date}
              onChange={(value) => setDate(value)}
              className="w-full"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">From Currency *</label>
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">From Amount *</label>
              <input
                type="number"
                step="0.01"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
                placeholder="100.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">To Currency *</label>
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">To Amount *</label>
              <input
                type="number"
                step="0.01"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
                placeholder="25.00"
                required
              />
            </div>
          </div>

          {fromAmount && toAmount && (
            <div className="mb-6 p-3 bg-surface-container-low rounded-lg">
              <p className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Exchange Rate: <span className="font-bold text-on-surface">{calculateRate()}</span>
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg hover:bg-surface-container transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-sm"
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
