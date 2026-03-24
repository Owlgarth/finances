import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { currencyExchangesApi } from '../api/client'
import { useLayout } from '../contexts/LayoutContext'
import { usePermissions } from '../hooks/usePermissions'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import type { CurrencyExchange } from '../types'
import CurrencyExchangeFormModal from '../components/modals/currency/CurrencyExchangeFormModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'

export default function CurrencyExchangesPage() {
  const queryClient = useQueryClient()
  const { isCardsView } = useLayout()
  const { canManageBudgetData } = usePermissions()
  const { selectedPeriodId } = useBudgetPeriod()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedExchange, setSelectedExchange] = useState<CurrencyExchange | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: exchanges, isLoading, error } = useQuery({
    queryKey: ['currency-exchanges', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await currencyExchangesApi.getAll({ budget_period_id: selectedPeriodId })
      return response.data as CurrencyExchange[]
    },
    enabled: !!selectedPeriodId
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => currencyExchangesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges'] })
      // Force refetch of period-balances to ensure UI updates immediately
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Exchange deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete exchange')
    }
  })

  const importMutation = useMutation({
    mutationFn: (formData: FormData) => currencyExchangesApi.import(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges'] })
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Currency exchanges imported successfully!')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to import currency exchanges')
    }
  })

  const handleExport = async () => {
    if (!selectedPeriodId) return

    try {
      const response = await currencyExchangesApi.export({ budget_period_id: selectedPeriodId })
      const jsonData = JSON.stringify(response.data, null, 2)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `currency_exchanges_export_${selectedPeriodId}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success('Currency exchanges exported successfully!')
    } catch {
      toast.error('Failed to export currency exchanges')
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && selectedPeriodId) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('budget_period_id', selectedPeriodId.toString())
      importMutation.mutate(formData)
    }
  }

  const handleEdit = (exchange: CurrencyExchange) => {
    setSelectedExchange(exchange)
    setIsModalOpen(true)
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this exchange?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleAddNew = () => {
    setSelectedExchange(null)
    setIsModalOpen(true)
  }

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage message="Failed to load currency exchanges" />

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <h1 className="font-headline font-extrabold tracking-tight text-3xl text-on-surface">Currency Exchanges</h1>
        {canManageBudgetData && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="bg-surface-container-high text-on-surface px-6 py-2.5 rounded-lg hover:bg-surface-container transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId}
            >
              Export
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-surface-container-high text-on-surface px-6 py-2.5 rounded-lg hover:bg-surface-container transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId || importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </button>
            <button
              onClick={handleAddNew}
              className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 py-2.5 rounded-lg hover:opacity-90 transition-all font-medium"
            >
              Add Exchange
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
          <table className="w-full">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-6 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-outline">Date</th>
                <th className="px-6 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-outline">Description</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-outline">From</th>
                <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-outline">→</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-outline">To</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-outline">Rate</th>
                {canManageBudgetData && (
                  <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-outline">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {exchanges?.map(exchange => (
                <tr
                  key={exchange.id}
                  className="hover:bg-surface-container-low transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-on-surface-variant font-mono">{exchange.date}</td>
                  <td className="px-6 py-4 text-sm text-on-surface">{exchange.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-mono font-bold text-negative">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-outline">→</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-mono font-bold text-positive">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-on-surface-variant font-mono">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </td>
                  {canManageBudgetData && (
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleEdit(exchange)}
                        className="text-on-surface-variant hover:text-on-surface mr-4 text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(exchange.id)}
                        className="text-negative hover:opacity-80 text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={isCardsView ? '' : 'md:hidden'}>
          {exchanges?.map(exchange => (
              <div
                key={exchange.id}
                className="p-4 hover:bg-surface-container-low transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-on-surface">{exchange.description || 'Currency Exchange'}</h4>
                    <p className="text-sm text-on-surface-variant mt-1 font-mono">{exchange.date}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3 py-2">
                  <div className="flex-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-outline block mb-1">From</span>
                    <span className="text-sm font-mono font-bold text-negative">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </div>
                  <div className="px-3 text-outline">→</div>
                  <div className="flex-1 text-right">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-outline block mb-1">To</span>
                    <span className="text-sm font-mono font-bold text-positive">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Exchange Rate: </span>
                  <span className="text-sm font-medium text-on-surface font-mono">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </span>
                </div>

                {canManageBudgetData && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(exchange)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-on-surface bg-surface-container-high rounded-lg hover:bg-surface-container transition-all"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(exchange.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-negative rounded-lg hover:opacity-80 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
          ))}
        </div>

        {exchanges?.length === 0 && (
          <p className="text-center py-8 text-on-surface-variant">No currency exchanges yet</p>
        )}
      </div>

      <CurrencyExchangeFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedExchange(null)
        }}
        exchange={selectedExchange}
      />
    </div>
  )
}
