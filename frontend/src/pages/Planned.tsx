import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Filter } from 'lucide-react'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import { usePermissions } from '../hooks/usePermissions'
import { plannedTransactionsApi, currenciesApi } from '../api/client'
import type { PaginatedResponse, PlannedTransaction, Currency } from '../types'
import PlannedTransactionList from '../components/transactions/PlannedTransactionList'
import PlannedTransactionFormModal from '../components/modals/transactions/PlannedTransactionFormModal'
import ExecutePlannedModal from '../components/modals/transactions/ExecutePlannedModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'

export default function Planned() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [selectedPlanned, setSelectedPlanned] = useState<PlannedTransaction | null>(null)
  const [executePlanned, setExecutePlanned] = useState<PlannedTransaction | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([])
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false)
  const currencyDropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedPeriodId } = useBudgetPeriod()
  const { canManageBudgetData } = usePermissions()

  useEffect(() => {
    setPage(1)
  }, [statusFilter, selectedPeriodId, selectedCurrencies])

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await currenciesApi.getAll()
      return response as Currency[]
    },
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(event.target as Node)) {
        setIsCurrencyDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleCurrency = (symbol: string) => {
    setSelectedCurrencies(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    )
  }

  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ['planned-transactions', statusFilter, selectedPeriodId, selectedCurrencies, page, pageSize],
    queryFn: async () => {
      const response = await plannedTransactionsApi.getAll({
        status: statusFilter || undefined,
        budget_period_id: selectedPeriodId ?? undefined,
        currency: selectedCurrencies.length > 0 ? selectedCurrencies : undefined,
        page,
        page_size: pageSize,
      })
      return response.data as PaginatedResponse<PlannedTransaction>
    },
  })

  const planned = apiResponse?.items || []
  const totalItems = apiResponse?.total || 0
  const totalPages = apiResponse?.total_pages || 0

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannedTransactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] })
      toast.success('Planned transaction deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete planned transaction')
    }
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, transaction }: { id: number; transaction: PlannedTransaction }) =>
      plannedTransactionsApi.update(id, {
        budget_period_id: transaction.budget_period_id ?? undefined,
        name: transaction.name,
        amount: transaction.amount,
        currency: transaction.currency,
        category_id: transaction.category?.id ?? null,
        planned_date: transaction.planned_date,
        status: 'cancelled'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] })
      toast.success('Planned transaction cancelled successfully!')
    },
    onError: () => {
      toast.error('Failed to cancel planned transaction')
    }
  })

  const importMutation = useMutation({
    mutationFn: plannedTransactionsApi.import,
    onSuccess: () => {
      toast.success('Planned transactions imported successfully!');
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to import planned transactions.');
    },
  });

  const handleEdit = (planned: PlannedTransaction) => {
    setSelectedPlanned(planned)
    setIsFormModalOpen(true)
  }

  const handleAddNew = () => {
    setSelectedPlanned(null)
    setIsFormModalOpen(true)
  }

  const handleExecute = (planned: PlannedTransaction) => {
    setExecutePlanned(planned)
  }

  const handleCancel = (transaction: PlannedTransaction) => {
    if (confirm('Cancel this planned transaction?')) {
      cancelMutation.mutate({ id: transaction.id, transaction })
    }
  }

  const handleDelete = (id: number) => {
    if (confirm('Delete this planned transaction?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleExport = async () => {
    if (!selectedPeriodId) return;

    try {
      const params: { budget_period_id: number; status?: string } = {
        budget_period_id: selectedPeriodId
      };
      if (statusFilter) {
        params.status = statusFilter;
      }

      const response = await plannedTransactionsApi.export(params);
      const jsonData = JSON.stringify(response.data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planned_export_${selectedPeriodId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Planned transactions exported successfully!');
    } catch {
      toast.error('Failed to export planned transactions');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && selectedPeriodId) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('budget_period_id', selectedPeriodId.toString());
      importMutation.mutate(formData);
    }
    // Reset file input
    if(event.target) {
      event.target.value = '';
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 sm:mb-12">
        <h1 className="text-base font-semibold text-text">Planned Transactions</h1>
        {canManageBudgetData && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleImportClick}
              className="px-3 py-1.5 bg-surface border border-border text-text rounded-sm hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
              disabled={!selectedPeriodId}
            >
              Import
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".json"
            />
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-surface border border-border text-text rounded-sm hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
              disabled={!selectedPeriodId || totalItems === 0}
            >
              Export
            </button>
            <button
              onClick={handleAddNew}
              className="bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors text-xs font-medium"
            >
              Add Planned Transaction
            </button>
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
            statusFilter === 'pending'
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-text hover:bg-surface-hover'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setStatusFilter('done')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
            statusFilter === 'done'
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-text hover:bg-surface-hover'
          }`}
        >
          Done
        </button>
        <button
          onClick={() => setStatusFilter('cancelled')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
            statusFilter === 'cancelled'
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-text hover:bg-surface-hover'
          }`}
        >
          Cancelled
        </button>
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
            statusFilter === ''
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-text hover:bg-surface-hover'
          }`}
        >
          All
        </button>

        <div className="relative" ref={currencyDropdownRef}>
          <button
            onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-2 ${
              selectedCurrencies.length > 0
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-text hover:bg-surface-hover'
            }`}
          >
            <Filter size={14} />
            <span>Currency</span>
            {selectedCurrencies.length > 0 && (
              <span className="bg-white text-primary text-xs font-semibold rounded-sm h-5 w-5 flex items-center justify-center">
                {selectedCurrencies.length}
              </span>
            )}
          </button>

          {isCurrencyDropdownOpen && currencies && currencies.length > 0 && (
            <div className="absolute top-full mt-2 left-0 min-w-[180px] bg-surface border border-border rounded-sm z-dropdown overflow-hidden animate-in fade-in duration-200">
              {currencies.map((currency) => (
                <label key={currency.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors duration-150">
                  <input
                    type="checkbox"
                    checked={selectedCurrencies.includes(currency.symbol)}
                    onChange={() => toggleCurrency(currency.symbol)}
                    className="w-4 h-4 text-primary border-border rounded-none focus:ring-2 focus:ring-border-focus"
                  />
                  <span className="text-text font-mono font-bold">{currency.symbol}</span>
                  <span className="text-text-muted text-sm">{currency.name}</span>
                </label>
              ))}
              {selectedCurrencies.length > 0 && (
                <button
                  onClick={() => setSelectedCurrencies([])}
                  className="w-full px-4 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
                >
                  Clear Selection
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message="Failed to load planned transactions" />
      ) : totalItems === 0 ? (
        <EmptyState message={`No ${statusFilter === 'pending' ? 'pending' : statusFilter === 'done' ? 'completed' : statusFilter === 'cancelled' ? 'cancelled' : ''} planned transactions`} />
      ) : (
        <>
          <PlannedTransactionList
            transactions={planned}
            onEdit={canManageBudgetData ? handleEdit : undefined}
            onExecute={canManageBudgetData ? handleExecute : undefined}
            onCancel={canManageBudgetData ? handleCancel : undefined}
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
        </>
      )}

      <PlannedTransactionFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedPlanned(null)
        }}
        plannedTransaction={selectedPlanned}
      />

      {executePlanned && (
        <ExecutePlannedModal
          isOpen={!!executePlanned}
          onClose={() => setExecutePlanned(null)}
          plannedId={executePlanned.id}
          plannedDate={executePlanned.planned_date}
        />
      )}
    </div>
  )
}