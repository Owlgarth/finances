import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, CircleHelp } from 'lucide-react'
import { currencyExchangesApi, transactionsApi } from '../../../api/client'
import type { CurrencyExchange } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'
import DatePicker from '../../DatePicker'

interface Props {
  isOpen: boolean
  onClose: () => void
  exchange?: CurrencyExchange | null
  preselectedFrom?: string
  preselectedTo?: string
  onLinkedTransactions?: (exchange: CurrencyExchange) => void
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

export default function CurrencyExchangeFormModal({ isOpen, onClose, exchange, preselectedFrom, preselectedTo, onLinkedTransactions }: Props) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [fromCurrency, setFromCurrency] = useState('PLN')
  const [fromAmount, setFromAmount] = useState('')
  const [toCurrency, setToCurrency] = useState('USD')
  const [toAmount, setToAmount] = useState('')
  const [autoCreateTransactions, setAutoCreateTransactions] = useState(false)
  const [openTransactionForm, setOpenTransactionForm] = useState(false)
  const queryClient = useQueryClient()
  const { selectedPeriodId } = useBudgetPeriod()

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    setAutoCreateTransactions(false)
    setOpenTransactionForm(false)
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
      setFromCurrency(preselectedFrom || 'PLN')
      setFromAmount('')
      setToCurrency(preselectedTo || 'USD')
      setToAmount('')
    }
  }, [exchange, isOpen, today, preselectedFrom, preselectedTo])

  const mutation = useMutation({
    mutationFn: (data: any) =>
      exchange
        ? currencyExchangesApi.update(exchange.id, data)
        : currencyExchangesApi.create(data),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges-totals'] })
      // Force refetch of period-balances to ensure UI updates immediately
      // This is needed because the app uses persistent cache with staleTime
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success(exchange ? 'Exchange updated successfully!' : 'Exchange created successfully!')

      const createdExchange: CurrencyExchange | null = !exchange ? response.data : null

      if (createdExchange && autoCreateTransactions && selectedPeriodId) {
        const exchangeDesc = createdExchange.description || `Currency exchange: ${createdExchange.from_currency} → ${createdExchange.to_currency}`

        // Auto-create from-side expense (fire and forget)
        transactionsApi.create({
          date: createdExchange.date,
          description: exchangeDesc,
          category_id: null,
          amount: createdExchange.from_amount,
          currency: createdExchange.from_currency,
          type: 'expense',
          budget_period_id: selectedPeriodId,
        } as any).catch(() => {
          toast.error('Failed to create linked expense transaction')
        })

        // Auto-create to-side income (fire and forget)
        transactionsApi.create({
          date: createdExchange.date,
          description: exchangeDesc,
          category_id: null,
          amount: createdExchange.to_amount,
          currency: createdExchange.to_currency,
          type: 'income',
          budget_period_id: selectedPeriodId,
        } as any).catch(() => {
          toast.error('Failed to create linked income transaction')
        })

        queryClient.invalidateQueries({ queryKey: ['transactions'] })
        queryClient.invalidateQueries({ queryKey: ['transactions-totals'] })
      }

      if (createdExchange && openTransactionForm && onLinkedTransactions) {
        onLinkedTransactions(createdExchange)
      }

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
        className="bg-surface border border-border rounded-sm p-6 w-full max-w-md relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-sans font-semibold text-text text-sm mb-6">
          {exchange ? 'Edit Currency Exchange' : 'New Currency Exchange'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Date *</label>
            <DatePicker
              value={date}
              onChange={(value) => setDate(value)}
              className="w-full"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">From Currency *</label>
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">From Amount *</label>
              <input
                type="number"
                step="0.01"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                placeholder="100.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">To Currency *</label>
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">To Amount *</label>
              <input
                type="number"
                step="0.01"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                placeholder="25.00"
                required
              />
            </div>
          </div>

          {fromAmount && toAmount && (
            <div className="mb-6 p-3 bg-surface-hover rounded-sm">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Exchange Rate: <span className="font-semibold text-text">{calculateRate()}</span>
              </p>
            </div>
          )}

          {!exchange && (
            <div className="mb-6 space-y-3">
              {/* Toggle 1: Auto-create transactions */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCreateTransactions}
                  aria-label="Auto-create transactions"
                  onClick={() => setAutoCreateTransactions(!autoCreateTransactions)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                    autoCreateTransactions
                      ? 'bg-primary'
                      : 'bg-surface-muted border border-border'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 bg-white rounded-full transition-transform duration-150 ${
                    autoCreateTransactions
                      ? 'translate-x-[19px]'
                      : 'translate-x-[3px] border border-border'
                  }`} />
                </button>
                <span className="text-xs text-text flex items-center gap-1.5">
                  Auto-create transactions
                  <span className="relative group/help">
                    <CircleHelp size={13} className="text-text-muted hover:text-text transition-colors" />
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 bg-surface border border-border rounded-sm text-[11px] text-text leading-relaxed opacity-0 invisible group-hover/help:opacity-100 group-hover/help:visible transition-opacity z-50 pointer-events-none shadow-sm">
                      Automatically creates two background transactions: an expense for the &quot;from&quot; side and an income for the &quot;to&quot; side. Both without a category.
                    </span>
                  </span>
                </span>
              </label>

              {/* Toggle 2: Open transaction form */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  role="switch"
                  aria-checked={openTransactionForm}
                  aria-label="Open transaction form"
                  onClick={() => setOpenTransactionForm(!openTransactionForm)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                    openTransactionForm
                      ? 'bg-primary'
                      : 'bg-surface-muted border border-border'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 bg-white rounded-full transition-transform duration-150 ${
                    openTransactionForm
                      ? 'translate-x-[19px]'
                      : 'translate-x-[3px] border border-border'
                  }`} />
                </button>
                <span className="text-xs text-text flex items-center gap-1.5">
                  Open transaction form
                  <span className="relative group/help">
                    <CircleHelp size={13} className="text-text-muted hover:text-text transition-colors" />
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 bg-surface border border-border rounded-sm text-[11px] text-text leading-relaxed opacity-0 invisible group-hover/help:opacity-100 group-hover/help:visible transition-opacity z-50 pointer-events-none shadow-sm">
                      Opens a pre-filled transaction form after creating the exchange, so you can add a category to the &quot;to&quot; side expense.
                    </span>
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
