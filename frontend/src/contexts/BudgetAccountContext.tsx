import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { budgetAccountsApi } from '../api/client'
import type { BudgetAccount } from '../types'

const SELECTED_ACCOUNT_KEY = 'monie_selected_account'

interface BudgetAccountContextType {
  selectedAccount: BudgetAccount | null
  selectedAccountId: number | null
  setSelectedAccountId: (id: number | null) => void
  accounts: BudgetAccount[]
  isLoading: boolean
  refetchAccounts: () => void
}

const BudgetAccountContext = createContext<BudgetAccountContextType | undefined>(undefined)

export function BudgetAccountProvider({ children }: { children: ReactNode }) {
  const [selectedAccountId, setSelectedAccountIdState] = useState<number | null>(() => {
    // Try to load from localStorage on initial render
    const saved = localStorage.getItem(SELECTED_ACCOUNT_KEY)
    return saved ? Number(saved) : null
  })

  // Fetch active budget accounts
  const { data: accounts = [], isLoading, refetch } = useQuery({
    queryKey: ['budget-accounts'],
    queryFn: () => budgetAccountsApi.list(false), // Only active accounts
    staleTime: 0,
    refetchOnMount: true,
  })

  // Persist selection to localStorage
  const setSelectedAccountId = (id: number | null) => {
    setSelectedAccountIdState(id)
    if (id) {
      localStorage.setItem(SELECTED_ACCOUNT_KEY, String(id))
    } else {
      localStorage.removeItem(SELECTED_ACCOUNT_KEY)
    }
  }

  // Auto-select first account if none selected or selected account no longer exists
  useEffect(() => {
    if (accounts.length > 0) {
      const currentExists = accounts.some(acc => acc.id === selectedAccountId)
      if (!selectedAccountId || !currentExists) {
        setSelectedAccountId(accounts[0].id)
      }
    }
  }, [accounts, selectedAccountId])

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId) || null

  return (
    <BudgetAccountContext.Provider
      value={{
        selectedAccount,
        selectedAccountId,
        setSelectedAccountId,
        accounts,
        isLoading,
        refetchAccounts: refetch,
      }}
    >
      {children}
    </BudgetAccountContext.Provider>
  )
}

export function useBudgetAccount() {
  const context = useContext(BudgetAccountContext)
  if (context === undefined) {
    throw new Error('useBudgetAccount must be used within a BudgetAccountProvider')
  }
  return context
}
