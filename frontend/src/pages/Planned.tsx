import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import { usePermissions } from '../hooks/usePermissions'
import { plannedTransactionsApi } from '../api/client'
import type { PlannedTransaction } from '../types'
import PlannedTransactionList from '../components/transactions/PlannedTransactionList'
import PlannedTransactionFormModal from '../components/modals/transactions/PlannedTransactionFormModal'
import ExecutePlannedModal from '../components/modals/transactions/ExecutePlannedModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'

export default function Planned() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [selectedPlanned, setSelectedPlanned] = useState<PlannedTransaction | null>(null)
  const [executePlanned, setExecutePlanned] = useState<PlannedTransaction | null>(null)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedPeriodId } = useBudgetPeriod()
  const { canManageBudgetData } = usePermissions()

  const { data: planned, isLoading, error } = useQuery({
    queryKey: ['planned-transactions', statusFilter, selectedPeriodId],
    queryFn: async () => {
      const response = await plannedTransactionsApi.getAll(statusFilter, selectedPeriodId ?? undefined)
      return response.data as PlannedTransaction[]
    },
  })

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
        <h1 className="font-headline font-extrabold tracking-tight text-3xl text-on-surface">Planned Transactions</h1>
        {canManageBudgetData && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleImportClick}
              className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId || !planned || planned.length === 0}
            >
              Export
            </button>
            <button
              onClick={handleAddNew}
              className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 py-2.5 rounded-lg hover:opacity-90 transition-all font-medium"
            >
              Add Planned Transaction
            </button>
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            statusFilter === 'pending'
              ? 'bg-gradient-to-br from-primary to-primary-dim text-on-primary'
              : 'bg-surface-container-highest border-none text-on-surface hover:bg-surface-container'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setStatusFilter('done')}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            statusFilter === 'done'
              ? 'bg-gradient-to-br from-primary to-primary-dim text-on-primary'
              : 'bg-surface-container-highest border-none text-on-surface hover:bg-surface-container'
          }`}
        >
          Done
        </button>
        <button
          onClick={() => setStatusFilter('cancelled')}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            statusFilter === 'cancelled'
              ? 'bg-gradient-to-br from-primary to-primary-dim text-on-primary'
              : 'bg-surface-container-highest border-none text-on-surface hover:bg-surface-container'
          }`}
        >
          Cancelled
        </button>
        <button
          onClick={() => setStatusFilter('')}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            statusFilter === ''
              ? 'bg-gradient-to-br from-primary to-primary-dim text-on-primary'
              : 'bg-surface-container-highest border-none text-on-surface hover:bg-surface-container'
          }`}
        >
          All
        </button>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message="Failed to load planned transactions" />
      ) : planned && planned.length === 0 ? (
        <EmptyState message={`No ${statusFilter === 'pending' ? 'pending' : statusFilter === 'done' ? 'completed' : statusFilter === 'cancelled' ? 'cancelled' : ''} planned transactions`} />
      ) : (
        <PlannedTransactionList
          transactions={planned || []}
          onEdit={canManageBudgetData ? handleEdit : undefined}
          onExecute={canManageBudgetData ? handleExecute : undefined}
          onCancel={canManageBudgetData ? handleCancel : undefined}
          onDelete={canManageBudgetData ? handleDelete : undefined}
        />
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