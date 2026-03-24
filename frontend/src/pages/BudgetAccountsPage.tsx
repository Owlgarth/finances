import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { budgetAccountsApi } from '../api/client'
import { useBudgetAccount } from '../contexts/BudgetAccountContext'
import { usePermissions } from '../hooks/usePermissions'
import toast from 'react-hot-toast'
import Loading from '../components/common/Loading'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/common/ConfirmDialog'
import type { BudgetAccount } from '../types'

export default function BudgetAccountsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BudgetAccount | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<BudgetAccount | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const queryClient = useQueryClient()
  const { selectedAccountId, setSelectedAccountId } = useBudgetAccount()
  const { canManageBudgetAccounts } = usePermissions()

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['budget-accounts', showInactive],
    queryFn: () => budgetAccountsApi.list(showInactive),
  })

  const createMutation = useMutation({
    mutationFn: budgetAccountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-accounts'] })
      toast.success('Budget account created')
      setIsCreateModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create budget account')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetAccount> }) =>
      budgetAccountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-accounts'] })
      toast.success('Budget account updated')
      setEditingAccount(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update budget account')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: budgetAccountsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-accounts'] })
      toast.success('Budget account deleted')
      setDeletingAccount(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete budget account')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: budgetAccountsApi.toggleArchive,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budget-accounts'] })
      toast.success(data.is_active ? 'Budget account restored' : 'Budget account archived')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to archive budget account')
    },
  })

  if (isLoading) return <Loading />
  if (error) return <div className="text-negative p-4">Failed to load budget accounts</div>

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="font-headline font-extrabold tracking-tight text-2xl sm:text-3xl text-on-surface">Budget Accounts</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-outline focus:ring-primary-container"
            />
            Show archived
          </label>
          {canManageBudgetAccounts && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-lg hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span className="hidden sm:inline">New Account</span>
            </button>
          )}
        </div>
      </div>

      {accounts && accounts.length === 0 ? (
        <EmptyState
          message="No budget accounts yet. Create your first account to start tracking budgets."
          action={canManageBudgetAccounts ? {
            label: 'Create Account',
            onClick: () => setIsCreateModalOpen(true),
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts?.map((account) => (
            <BudgetAccountCard
              key={account.id}
              account={account}
              isSelected={account.id === selectedAccountId}
              canManage={canManageBudgetAccounts}
              onSelect={() => setSelectedAccountId(account.id)}
              onEdit={() => setEditingAccount(account)}
              onDelete={() => setDeletingAccount(account)}
              onArchive={() => archiveMutation.mutate(account.id)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <BudgetAccountFormModal
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {editingAccount && (
        <BudgetAccountFormModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingAccount.id, data })}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingAccount}
        title="Delete Budget Account"
        message={deletingAccount ? `Are you sure you want to delete "${deletingAccount.name}"? This will delete all budget periods, categories, budgets, and transactions associated with this account. This action cannot be undone.` : ''}
        onConfirm={() => deletingAccount && deleteMutation.mutate(deletingAccount.id)}
        onCancel={() => setDeletingAccount(null)}
      />
    </div>
  )
}

interface BudgetAccountCardProps {
  account: BudgetAccount
  isSelected: boolean
  canManage: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onArchive: () => void
}

function BudgetAccountCard({
  account,
  isSelected,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  onArchive,
}: BudgetAccountCardProps) {
  return (
    <div
      className={`bg-surface-container-lowest p-6 rounded-lg transition-all ${
        !account.is_active ? 'opacity-60' : ''
      } ${isSelected ? 'ring-2 ring-primary' : ''}`}
      style={{ boxShadow: 'var(--shadow-card)', borderLeftColor: account.color || '#3B82F6', borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {account.icon && <span className="text-2xl">{account.icon}</span>}
          <div>
            <h3 className="text-lg font-semibold text-on-surface flex items-center gap-2">
              {account.name}
              {isSelected && (
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">Active</span>
              )}
            </h3>
            {!account.is_active && (
              <span className="text-xs text-on-surface-variant">Archived</span>
            )}
          </div>
        </div>
      </div>

      {account.description && (
        <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">{account.description}</p>
      )}

      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-1 bg-surface-container-low rounded text-sm font-medium font-mono text-on-surface">
          {account.default_currency}
        </span>
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onSelect}
          disabled={isSelected || !account.is_active}
          className={`flex items-center gap-1 text-sm ${
            isSelected
              ? 'text-primary cursor-default'
              : account.is_active
              ? 'text-on-surface-variant hover:text-primary'
              : 'text-outline cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-base">check</span>
          {isSelected ? 'Selected' : 'Select'}
        </button>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={onArchive}
              className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
              title={account.is_active ? 'Archive' : 'Restore'}
            >
              <span className="material-symbols-outlined text-base">archive</span>
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
              title="Edit"
            >
              <span className="material-symbols-outlined text-base">edit</span>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-on-surface-variant hover:text-negative transition-colors"
              title="Delete"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface BudgetAccountFormModalProps {
  account?: BudgetAccount
  onClose: () => void
  onSubmit: (data: any) => void
  isSubmitting: boolean
}

function BudgetAccountFormModal({
  account,
  onClose,
  onSubmit,
  isSubmitting,
}: BudgetAccountFormModalProps) {
  const [name, setName] = useState(account?.name || '')
  const [description, setDescription] = useState(account?.description || '')
  const [currency, setCurrency] = useState(account?.default_currency || 'PLN')
  const [color, setColor] = useState(account?.color || '#3B82F6')
  const [icon, setIcon] = useState(account?.icon || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name,
      description: description || undefined,
      default_currency: currency,
      color,
      icon: icon || undefined,
      is_active: account?.is_active ?? true,
      display_order: account?.display_order ?? 0,
    })
  }

  const iconOptions = ['', '💰', '💳', '🏠', '🚗', '💼', '🎯', '🛒', '✈️', '📱', '🎓', '📊']

  return (
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container-lowest rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-float)' }}>
        <h2 className="font-headline font-bold text-on-surface text-xl mb-4">
          {account ? 'Edit Budget Account' : 'Create Budget Account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
              Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-highest border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-container font-mono text-sm text-on-surface"
              placeholder="Personal, Business, etc."
            />
          </div>

          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-highest border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-container font-mono text-sm text-on-surface"
              rows={2}
              placeholder="Optional description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
                Icon
              </label>
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-highest border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-container font-mono text-sm text-on-surface"
              >
                {iconOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt || 'None'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
                Color
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 border-none rounded-lg cursor-pointer bg-surface-container-highest"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
              Default Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-highest border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-container font-mono text-sm text-on-surface"
            >
              <option value="PLN">PLN - Polish Zloty</option>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="UAH">UAH - Ukrainian Hryvnia</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : account ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
