import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { currencyExchangesApi } from '../api/client'
import { isOfflineItem } from '../utils/optimisticUpdates'
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
        <h1 className="text-3xl font-semibold text-gray-900">Currency Exchanges</h1>
        {canManageBudgetData && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="bg-white text-gray-900 px-6 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="bg-white text-gray-900 px-6 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId || importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </button>
            <button
              onClick={handleAddNew}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Add Exchange
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Desktop Table */}
        <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">From</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">→</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">To</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Rate</th>
                {canManageBudgetData && (
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {exchanges?.map(exchange => {
                const offline = isOfflineItem(exchange);
                return (
                <tr
                  key={exchange.id}
                  className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${
                    offline ? 'bg-gray-50 opacity-60' : ''
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-gray-600">{exchange.date}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{exchange.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-red-600">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-400">→</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-green-600">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </td>
                  {canManageBudgetData && (
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleEdit(exchange)}
                        className="text-gray-600 hover:text-gray-900 mr-4 text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(exchange.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className={isCardsView ? 'divide-y divide-gray-100' : 'md:hidden divide-y divide-gray-100'}>
          {exchanges?.map(exchange => {
            const offline = isOfflineItem(exchange);
            return (
              <div
                key={exchange.id}
                className={`p-4 ${offline ? 'bg-gray-50 opacity-60' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{exchange.description || 'Currency Exchange'}</h4>
                    <p className="text-sm text-gray-500 mt-1">{exchange.date}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3 py-2 border-t border-b border-gray-100">
                  <div className="flex-1">
                    <span className="text-xs text-gray-500 block mb-1">From</span>
                    <span className="text-sm font-semibold text-red-600">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </div>
                  <div className="px-3 text-gray-400">→</div>
                  <div className="flex-1 text-right">
                    <span className="text-xs text-gray-500 block mb-1">To</span>
                    <span className="text-sm font-semibold text-green-600">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="text-xs text-gray-500">Exchange Rate: </span>
                  <span className="text-sm font-medium text-gray-900">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </span>
                </div>

                {canManageBudgetData && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(exchange)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(exchange.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {exchanges?.length === 0 && (
          <p className="text-center py-8 text-gray-500">No currency exchanges yet</p>
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
