import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Pencil, RefreshCw } from 'lucide-react'
import { periodBalancesApi } from '../api/client'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import { usePermissions } from '../hooks/usePermissions'
import EditPeriodBalanceModal from '../components/modals/balance/EditPeriodBalanceModal'
import type { PeriodBalance } from '../types'

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function closingColorClass(value: number): string {
  if (value > 0) return 'text-positive'
  if (value < 0) return 'text-negative'
  return 'text-text-muted'
}

export default function BalancesPage() {
  const { selectedPeriodId } = useBudgetPeriod()
  const { canManageBudgetData } = usePermissions()
  const queryClient = useQueryClient()
  const [editingBalance, setEditingBalance] = useState<PeriodBalance | null>(null)

  const { data: balances = [], isLoading } = useQuery({
    queryKey: ['period-balances', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await periodBalancesApi.getAll(selectedPeriodId)
      return response.data as PeriodBalance[]
    },
    enabled: !!selectedPeriodId,
  })

  const recalculateMutation = useMutation({
    mutationFn: ({ periodId, currency }: { periodId: number; currency: string }) =>
      periodBalancesApi.recalculate(periodId, currency),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Balance recalculated')
    },
    onError: () => {
      toast.error('Failed to recalculate balance')
    },
  })

  if (!selectedPeriodId) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-text mb-4">Balances</h1>
        <p className="text-sm text-text-muted">Select a budget period to view balances.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-text mb-4">Balances</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="border border-border rounded-sm bg-surface p-4">
              <div className="space-y-3">
                <div className="h-5 bg-surface-muted rounded-sm animate-pulse w-1/3" />
                <div className="h-4 bg-surface-muted rounded-sm animate-pulse w-2/3" />
                <div className="h-4 bg-surface-muted rounded-sm animate-pulse w-1/2" />
                <div className="h-4 bg-surface-muted rounded-sm animate-pulse w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (balances.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-text mb-4">Balances</h1>
        <p className="text-sm text-text-muted">No balances found for this period.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-text mb-4">Balances</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {balances.map((balance) => {
          const opening = Number(balance.opening_balance) || 0
          const income = Number(balance.total_income) || 0
          const expenses = Number(balance.total_expenses) || 0
          const exchIn = Number(balance.exchanges_in) || 0
          const exchOut = Number(balance.exchanges_out) || 0
          const closing = Number(balance.closing_balance) || 0
          const isRecalculating = recalculateMutation.isPending

          return (
            <div key={balance.id} className="border border-border rounded-sm bg-surface p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text text-sm">{balance.currency} Balance</h3>
                {canManageBudgetData && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        recalculateMutation.mutate({
                          periodId: balance.budget_period_id,
                          currency: balance.currency,
                        })
                      }
                      disabled={isRecalculating}
                      className="bg-surface border border-border text-text-muted px-2.5 py-1 rounded-sm hover:bg-surface-hover hover:text-text transition-colors text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={isRecalculating ? 'animate-spin' : ''} />
                      Recalculate
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBalance(balance)}
                      className="bg-surface border border-border text-text-muted px-2.5 py-1 rounded-sm hover:bg-surface-hover hover:text-text transition-colors text-xs font-medium flex items-center gap-1"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Opening</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${opening === 0 ? 'text-text-muted' : 'text-text'}`}>
                    {formatAmount(opening)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Income</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${income === 0 ? 'text-text-muted' : 'text-positive'}`}>
                    +{formatAmount(income)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Expenses</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${expenses === 0 ? 'text-text-muted' : 'text-negative'}`}>
                    -{formatAmount(expenses)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Exchange In</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${exchIn === 0 ? 'text-text-muted' : 'text-text'}`}>
                    {exchIn === 0 ? formatAmount(0) : `+${formatAmount(exchIn)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Exchange Out</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${exchOut === 0 ? 'text-text-muted' : 'text-text'}`}>
                    {exchOut === 0 ? formatAmount(0) : `-${formatAmount(exchOut)}`}
                  </span>
                </div>
              </div>

              <div className="h-px bg-border my-3" />

              <div className="flex justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted font-medium">Closing</span>
                <span className={`font-mono text-base font-medium tabular-nums ${closingColorClass(closing)}`}>
                  {formatAmount(closing)}
                </span>
              </div>

              {balance.note && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-text-muted">{balance.note}</p>
                </div>
              )}

              {balance.last_calculated_at && (
                <div className="mt-2">
                  <span className="font-mono text-[10px] text-text-muted">
                    Last calculated: {new Date(balance.last_calculated_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <EditPeriodBalanceModal
        isOpen={!!editingBalance}
        onClose={() => setEditingBalance(null)}
        balance={editingBalance}
      />
    </div>
  )
}
