import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Settings } from 'lucide-react'
import { currencyExchangesApi, exchangeShortcutsApi } from '../api/client'
import type { CurrencyExchangeOrdering } from '../api/client'
import { usePermissions } from '../hooks/usePermissions'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import type { CurrencyExchange, ExchangeShortcut, PaginatedResponse } from '../types'
import CurrencyExchangeFormModal from '../components/modals/currency/CurrencyExchangeFormModal'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import ManageShortcutsModal from '../components/modals/currency/ManageShortcutsModal'
import Skeleton, { SkeletonRows } from '../components/common/Skeleton'
import ErrorMessage from '../components/common/ErrorMessage'
import Pagination from '../components/common/Pagination'
import TotalsSummary from '../components/common/TotalsSummary'
import CurrencyExchangeList from '../components/currencyExchanges/CurrencyExchangeList'
import ConfirmDialog from '../components/common/ConfirmDialog'

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
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false)
  const [prefilledTransactionData, setPrefilledTransactionData] = useState<{
    date?: string; description?: string; amount?: string; currency?: string; type?: 'expense' | 'income'
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [ordering, setOrdering] = useState<string>('-date')
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)

  const handleSort = (field: string) => {
    setOrdering(prev => {
      const current = prev.replace(/^-/, '')
      if (current === field) return prev.startsWith('-') ? field : '-' + field
      const defaultDesc = field === 'date'
      return defaultDesc ? '-' + field : field
    })
  }

  useEffect(() => {
    setPage(1)
  }, [selectedPeriodId, ordering])

  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ['currency-exchanges', selectedPeriodId, page, pageSize, ordering],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await currencyExchangesApi.getAll({
        budget_period_id: selectedPeriodId,
        page,
        page_size: pageSize,
        ordering: ordering as CurrencyExchangeOrdering,
      })
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

  const { data: totalsData } = useQuery({
    queryKey: ['currency-exchanges-totals', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      return currencyExchangesApi.getTotals({ budget_period_id: selectedPeriodId })
    },
    enabled: !!selectedPeriodId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => currencyExchangesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges-totals'] })
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
      queryClient.invalidateQueries({ queryKey: ['currency-exchanges-totals'] })
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
    setDeleteTargetId(id)
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

  const handleLinkedTransactions = (exchange: CurrencyExchange) => {
    setPrefilledTransactionData({
      date: exchange.date,
      description: exchange.description || `Currency exchange: ${exchange.from_currency} → ${exchange.to_currency}`,
      amount: exchange.to_amount.toString(),
      currency: exchange.to_currency,
      type: 'expense',
    })
    setIsTransactionModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-3">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-32" />
          </div>
        </div>
        <div className="bg-surface border border-border rounded-sm">
          <SkeletonRows count={8} className="divide-y divide-border" rowClassName="h-12 w-full" />
        </div>
      </div>
    )
  }
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

      <CurrencyExchangeList
        exchanges={exchanges}
        ordering={ordering}
        onSort={handleSort}
        canManageBudgetData={canManageBudgetData}
        onEdit={canManageBudgetData ? handleEdit : undefined}
        onDelete={canManageBudgetData ? handleDelete : undefined}
      />

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

      {totalItems > 0 && totalsData?.totals && totalsData.totals.length > 0 && (
        <TotalsSummary mode="exchanges" totals={totalsData.totals} />
      )}

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
        onLinkedTransactions={handleLinkedTransactions}
      />

      <ManageShortcutsModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        shortcuts={shortcuts || []}
      />

      <TransactionFormModal
        isOpen={isTransactionModalOpen}
        onClose={() => {
          setIsTransactionModalOpen(false)
          setPrefilledTransactionData(null)
        }}
        prefilledData={prefilledTransactionData || undefined}
      />

      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        title="Delete exchange"
        message="Are you sure you want to delete this exchange?"
        onConfirm={() => { if (deleteTargetId !== null) { deleteMutation.mutate(deleteTargetId) } setDeleteTargetId(null) }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
