import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Settings } from 'lucide-react'
import { currencyExchangesApi, exchangeShortcutsApi } from '../api/client'
import { usePermissions } from '../hooks/usePermissions'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import type { CurrencyExchange, ExchangeShortcut, PaginatedResponse } from '../types'
import CurrencyExchangeFormModal from '../components/modals/currency/CurrencyExchangeFormModal'
import ManageShortcutsModal from '../components/modals/currency/ManageShortcutsModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import Pagination from '../components/common/Pagination'

export default function CurrencyExchangesPage() {
  const queryClient = useQueryClient()
  const { canManageBudgetData } = usePermissions()
  const { selectedPeriodId } = useBudgetPeriod()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedExchange, setSelectedExchange] = useState<CurrencyExchange | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [preselectedFrom, setPreselectedFrom] = useState<string | undefined>(undefined)
  const [preselectedTo, setPreselectedTo] = useState<string | undefined>(undefined)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPage(1)
  }, [selectedPeriodId])

  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ['currency-exchanges', selectedPeriodId, page, pageSize],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await currencyExchangesApi.getAll({ budget_period_id: selectedPeriodId, page, page_size: pageSize })
      return response.data as PaginatedResponse<CurrencyExchange>
    },
    enabled: !!selectedPeriodId
  })

  const exchanges = apiResponse?.items || []
  const totalItems = apiResponse?.total || 0
  const totalPages = apiResponse?.total_pages || 0
  const { data: shortcuts } = useQuery({
    queryKey: ['exchange-shortcuts'],
    queryFn: async () => {
      const response = await exchangeShortcutsApi.getAll()
      return response.data as ExchangeShortcut[]
    },
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
    setPreselectedFrom(undefined)
    setPreselectedTo(undefined)
    setIsModalOpen(true)
  }

  const handleShortcutClick = (shortcut: ExchangeShortcut) => {
    setSelectedExchange(null)
    setPreselectedFrom(shortcut.from_currency)
    setPreselectedTo(shortcut.to_currency)
    setIsModalOpen(true)
  }

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage message="Failed to load currency exchanges" />

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <h1 className="text-base font-semibold text-text">Currency Exchanges</h1>
        {canManageBudgetData && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId || importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing...' : 'Import'}
            </button>
            <button
              onClick={handleAddNew}
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
            >
              Add Exchange
            </button>
          </div>
        )}
      </div>

      {/* Shortcut panel */}
      {shortcuts && shortcuts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {shortcuts.map(shortcut => (
            <button
              key={shortcut.id}
              onClick={() => handleShortcutClick(shortcut)}
              className="px-3 py-1.5 rounded-sm bg-surface border border-border text-text text-xs font-mono font-medium hover:bg-surface-hover transition-colors"
            >
              {shortcut.from_currency} → {shortcut.to_currency}
            </button>
          ))}
          {canManageBudgetData && (
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="px-2 py-1.5 rounded-sm text-text-muted hover:text-text transition-colors"
              title="Manage shortcuts"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      )}
      {canManageBudgetData && (!shortcuts || shortcuts.length === 0) && (
        <div className="mb-4">
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-text-muted hover:text-text bg-surface border border-border hover:bg-surface-hover transition-colors text-xs font-medium"
          >
            <Settings size={14} />
            Add Shortcuts
          </button>
        </div>
      )}

      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-6 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-text-muted">Date</th>
                <th className="px-6 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-text-muted">Description</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-text-muted">From</th>
                <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-text-muted">→</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-text-muted">To</th>
                <th className="px-6 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-text-muted">Rate</th>
                {canManageBudgetData && (
                  <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-text-muted">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {exchanges.map(exchange => (
                <tr
                  key={exchange.id}
                  className="hover:bg-surface-hover transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-text-muted font-mono">{exchange.date}</td>
                  <td className="px-6 py-4 text-sm text-text">{exchange.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-mono font-bold text-negative">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-text-muted">→</td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-mono font-bold text-positive">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-text-muted font-mono">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </td>
                  {canManageBudgetData && (
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleEdit(exchange)}
                        className="text-text-muted hover:text-text mr-4 text-sm font-medium transition-colors"
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

        <div className="md:hidden">
          {exchanges.map(exchange => (
              <div
                key={exchange.id}
                className="p-4 hover:bg-surface-hover transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-text">{exchange.description || 'Currency Exchange'}</h4>
                    <p className="text-sm text-text-muted mt-1 font-mono">{exchange.date}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3 py-2">
                  <div className="flex-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted block mb-1">From</span>
                    <span className="text-sm font-mono font-bold text-negative">
                      -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                    </span>
                  </div>
                  <div className="px-3 text-text-muted">→</div>
                  <div className="flex-1 text-right">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted block mb-1">To</span>
                    <span className="text-sm font-mono font-bold text-positive">
                      +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">Exchange Rate: </span>
                  <span className="text-sm font-medium text-text font-mono">
                    {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                  </span>
                </div>

                {canManageBudgetData && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(exchange)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-text bg-surface border border-border rounded-sm hover:bg-surface-hover transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(exchange.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-negative rounded-sm hover:opacity-80 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
          ))}
        </div>

        {totalItems === 0 && (
          <p className="text-center py-8 text-text-muted">No currency exchanges yet</p>
        )}

        {totalItems > 0 && (
          <Pagination
            page={page}
            total_pages={totalPages}
            total={totalItems}
            page_size={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </div>

      <CurrencyExchangeFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedExchange(null)
          setPreselectedFrom(undefined)
          setPreselectedTo(undefined)
        }}
        exchange={selectedExchange}
        preselectedFrom={preselectedFrom}
        preselectedTo={preselectedTo}
      />

      <ManageShortcutsModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        shortcuts={shortcuts || []}
      />
    </div>
  )
}
