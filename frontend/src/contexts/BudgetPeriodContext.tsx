import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { budgetPeriodsApi } from '../api/client'
import { useBudgetAccount } from './BudgetAccountContext'
import type { BudgetPeriod } from '../types'

interface BudgetPeriodContextType {
  selectedPeriod: BudgetPeriod | null
  selectedPeriodId: number | null
  setSelectedPeriodId: (id: number | null) => void
  periods: BudgetPeriod[]
  isLoading: boolean
}

const BudgetPeriodContext = createContext<BudgetPeriodContextType | undefined>(undefined)

export function BudgetPeriodProvider({ children }: { children: ReactNode }) {
  const { selectedAccountId } = useBudgetAccount()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const previousAccountIdRef = useRef<number | null>(null)

  // Fetch all periods (optionally filtered by selected budget account)
  const { data: periods = [], isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['budget-periods', selectedAccountId],
    queryFn: async () => {
      const response = await budgetPeriodsApi.getAll(selectedAccountId ?? undefined)
      return response.data as BudgetPeriod[]
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  // Get the latest period for this account (first in the array, sorted by start_date desc)
  const latestPeriod = periods[0] || null

  // Fetch selected period details
  const { data: selectedPeriodData, isLoading: isLoadingSelected } = useQuery({
    queryKey: ['budget-period', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await budgetPeriodsApi.getOne(selectedPeriodId)
      return response.data as BudgetPeriod
    },
    enabled: selectedPeriodId !== null,
  })

  // Reset period selection when account changes
  useEffect(() => {
    if (previousAccountIdRef.current !== null && previousAccountIdRef.current !== selectedAccountId) {
      // Account changed, reset period selection
      setSelectedPeriodId(null)
    }
    previousAccountIdRef.current = selectedAccountId
  }, [selectedAccountId])

  // Auto-select latest period when no period is selected or when periods change
  useEffect(() => {
    if (!selectedPeriodId && latestPeriod) {
      setSelectedPeriodId(latestPeriod.id)
    } else if (selectedPeriodId && periods.length > 0) {
      // Check if selected period still exists in filtered periods
      const periodExists = periods.some(p => p.id === selectedPeriodId)
      if (!periodExists) {
        setSelectedPeriodId(latestPeriod?.id || null)
      }
    }
  }, [periods, selectedPeriodId, latestPeriod])

  // Determine the actual selected period
  const selectedPeriod = selectedPeriodId
    ? (selectedPeriodData || periods.find(p => p.id === selectedPeriodId) || null)
    : latestPeriod

  return (
    <BudgetPeriodContext.Provider
      value={{
        selectedPeriod,
        selectedPeriodId,
        setSelectedPeriodId,
        periods,
        isLoading: isLoadingPeriods || isLoadingSelected,
      }}
    >
      {children}
    </BudgetPeriodContext.Provider>
  )
}

export function useBudgetPeriod() {
  const context = useContext(BudgetPeriodContext)
  if (context === undefined) {
    throw new Error('useBudgetPeriod must be used within a BudgetPeriodProvider')
  }
  return context
}
