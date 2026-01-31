import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi, categoriesApi } from '../api/client'
import type { Transaction, Category } from '../types'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import { usePermissions } from '../hooks/usePermissions'
import TransactionList from '../components/transactions/TransactionList'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import { OfflineDisplayCache } from '../utils/offlineDisplayCache'

export default function Transactions() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateOrdering, setDateOrdering] = useState<'date' | '-date'>('-date')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Applied filters (used in actual query)
  const [appliedTypes, setAppliedTypes] = useState<string[]>([])
  const [appliedCategories, setAppliedCategories] = useState<number[]>([])
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')
  const [appliedAmountMin, setAppliedAmountMin] = useState('')
  const [appliedAmountMax, setAppliedAmountMax] = useState('')

  // Temporary filters (edited in panel before applying)
  const [tempTypes, setTempTypes] = useState<string[]>([])
  const [tempCategories, setTempCategories] = useState<number[]>([])
  const [tempStartDate, setTempStartDate] = useState('')
  const [tempEndDate, setTempEndDate] = useState('')
  const [tempAmountMin, setTempAmountMin] = useState('')
  const [tempAmountMax, setTempAmountMax] = useState('')

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const queryClient = useQueryClient()
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  const transactionTypes = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' }
  ]

  const toggleType = (type: string) => {
    setTempTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const toggleCategory = (categoryId: number) => {
    setTempCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (appliedTypes.length > 0) count++
    if (appliedCategories.length > 0) count++
    if (appliedStartDate || appliedEndDate) count++
    if (appliedAmountMin || appliedAmountMax) count++
    return count
  }

  const applyFilters = () => {
    setAppliedTypes(tempTypes)
    setAppliedCategories(tempCategories)
    setAppliedStartDate(tempStartDate)
    setAppliedEndDate(tempEndDate)
    setAppliedAmountMin(tempAmountMin)
    setAppliedAmountMax(tempAmountMax)
  }

  const clearAllFilters = () => {
    setTempTypes([])
    setTempCategories([])
    setTempStartDate('')
    setTempEndDate('')
    setTempAmountMin('')
    setTempAmountMax('')
    setAppliedTypes([])
    setAppliedCategories([])
    setAppliedStartDate('')
    setAppliedEndDate('')
    setAppliedAmountMin('')
    setAppliedAmountMax('')
  }

  const openFilterPanel = () => {
    // Initialize temp values with current applied values when opening panel
    setTempTypes(appliedTypes)
    setTempCategories(appliedCategories)
    setTempStartDate(appliedStartDate)
    setTempEndDate(appliedEndDate)
    setTempAmountMin(appliedAmountMin)
    setTempAmountMax(appliedAmountMax)
    setIsFilterPanelOpen(true)
  }

  const { selectedPeriodId } = useBudgetPeriod()
  const { canManageBudgetData } = usePermissions()

  // Fetch categories for the selected budget period
  const { data: categories } = useQuery({
    queryKey: ['categories', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId })
      return response.data as Category[]
    },
    enabled: !!selectedPeriodId
  })

  // Reset filters when budget period changes
  useEffect(() => {
    setTempCategories([])
    setAppliedCategories([])
  }, [selectedPeriodId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false)
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: apiTransactions, isLoading, error } = useQuery({
    queryKey: ['transactions', selectedPeriodId, searchQuery, appliedStartDate, appliedEndDate, appliedTypes, appliedCategories, appliedAmountMin, appliedAmountMax, dateOrdering],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await transactionsApi.getAll({
        budget_period_id: selectedPeriodId,
        search: searchQuery || undefined,
        start_date: appliedStartDate || undefined,
        end_date: appliedEndDate || undefined,
        type: appliedTypes.length > 0 ? appliedTypes : undefined,
        category_id: appliedCategories.length > 0 ? appliedCategories : undefined,
        amount_gte: appliedAmountMin ? parseFloat(appliedAmountMin) : undefined,
        amount_lte: appliedAmountMax ? parseFloat(appliedAmountMax) : undefined,
        ordering: dateOrdering
      })
      return response.data as Transaction[]
    },
    enabled: !!selectedPeriodId,
    staleTime: 0 // Force refetch when query key changes
  })

  // Explicitly refetch when date ordering changes
  useEffect(() => {
    if (selectedPeriodId) {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  }, [dateOrdering, selectedPeriodId, queryClient])

  // Merge API transactions with offline transactions from display cache
  const transactions = useMemo(() => {
    const apiData = apiTransactions || []

    // Get offline transactions for the current budget period
    const offlineTransactions = OfflineDisplayCache.getItemsByType('transaction', selectedPeriodId)

    // For offline transactions, look up category from categories cache if needed
    const offlineWithCategories = offlineTransactions.map(item => {
      // If category is missing but category_id exists, try to find it
      if (!item.category && item.category_id && categories) {
        const category = categories.find(c => c.id === item.category_id)
        return { ...item, category: category || null }
      }
      return item
    })

    // Deduplicate: remove items from apiData that are already in offlineWithCategories
    // (identified by _tempId - these are optimistic updates that exist in both caches)
    const offlineTempIds = new Set(offlineWithCategories.map(item => item._tempId).filter(Boolean))
    const dedupedApiData = apiData.filter((item: any) => !item._tempId || !offlineTempIds.has(item._tempId))

    console.log('[Transactions Page] Merging data - API:', apiData.length, 'Offline:', offlineWithCategories.length, 'Deduped API:', dedupedApiData.length)

    // Merge: offline transactions first (most recent), then deduplicated API transactions
    return [...offlineWithCategories, ...dedupedApiData]
  }, [apiTransactions, selectedPeriodId, categories])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] })
      // Force refetch of period-balances to ensure UI updates immediately
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Transaction deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete transaction')
    }
  })

  const importMutation = useMutation({
    mutationFn: (formData: FormData) => transactionsApi.import(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] })
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Transactions imported successfully!')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to import transactions')
    }
  })

  const handleExport = async () => {
    if (!selectedPeriodId) return

    try {
      const params: { budget_period_id: number; type?: string } = {
        budget_period_id: selectedPeriodId
      }
      if (appliedTypes.length > 0) {
        params.type = appliedTypes[0]
      }

      const response = await transactionsApi.export(params)
      const jsonData = JSON.stringify(response.data, null, 2)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `transactions_export_${selectedPeriodId}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success('Transactions exported successfully!')
    } catch {
      toast.error('Failed to export transactions')
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

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setIsModalOpen(true)
  }

  const handleDelete = (id: number) => {
    if (confirm('Delete this transaction?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingTransaction(null)
  }

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 sm:mb-12">
        <h1 className="text-3xl font-semibold text-gray-900">Transactions</h1>
        <div className="flex flex-wrap gap-3">
          {canManageBudgetData && (
            <>
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
                onClick={() => {
                  setEditingTransaction(null)
                  setIsModalOpen(true)
                }}
                className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedPeriodId}
              >
                Add Transaction
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-8">
        {/* Search Bar and Filter Toggle */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                aria-label="Clear search"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={() => isFilterPanelOpen ? setIsFilterPanelOpen(false) : openFilterPanel()}
            className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out flex items-center justify-center gap-2 sm:w-auto"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-gray-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium text-gray-700">Filters</span>
            {getActiveFilterCount() > 0 && (
              <span className="bg-gray-900 text-white text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center">
                {getActiveFilterCount()}
              </span>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isFilterPanelOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Active Filters Chips */}
        {getActiveFilterCount() > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {appliedTypes.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                <span className="font-medium">Type:</span>
                <span>{appliedTypes.map(t => transactionTypes.find(type => type.value === t)?.label).join(', ')}</span>
                <button
                  onClick={() => {
                    setAppliedTypes([])
                    setTempTypes([])
                  }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Clear type filter"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}
            {appliedCategories.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                <span className="font-medium">Categories:</span>
                <span>
                  {appliedCategories.length === 1
                    ? categories?.find(c => c.id === appliedCategories[0])?.name
                    : `${appliedCategories.length} selected`}
                </span>
                <button
                  onClick={() => {
                    setAppliedCategories([])
                    setTempCategories([])
                  }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Clear category filter"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}
            {(appliedStartDate || appliedEndDate) && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                <span className="font-medium">Date:</span>
                <span>
                  {appliedStartDate && appliedEndDate ? `${appliedStartDate} to ${appliedEndDate}` : appliedStartDate ? `From ${appliedStartDate}` : `Until ${appliedEndDate}`}
                </span>
                <button
                  onClick={() => {
                    setAppliedStartDate('')
                    setAppliedEndDate('')
                    setTempStartDate('')
                    setTempEndDate('')
                  }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Clear date filter"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}
            {(appliedAmountMin || appliedAmountMax) && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                <span className="font-medium">Amount:</span>
                <span>
                  {appliedAmountMin && appliedAmountMax ? `${appliedAmountMin} - ${appliedAmountMax}` : appliedAmountMin ? `Min ${appliedAmountMin}` : `Max ${appliedAmountMax}`}
                </span>
                <button
                  onClick={() => {
                    setAppliedAmountMin('')
                    setAppliedAmountMax('')
                    setTempAmountMin('')
                    setTempAmountMax('')
                  }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Clear amount filter"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Collapsible Filter Panel */}
        {isFilterPanelOpen && (
          <div className="bg-white border border-gray-300 rounded-lg p-6 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Transaction Type Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Transaction Type</label>
                <div className="relative" ref={typeDropdownRef}>
                  <button
                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out flex items-center justify-between"
                  >
                    <span className="text-gray-700">
                      {tempTypes.length === 0
                        ? 'All Types'
                        : tempTypes.length === transactionTypes.length
                        ? 'All Types'
                        : tempTypes.map(t => transactionTypes.find(type => type.value === t)?.label).join(', ')}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {isTypeDropdownOpen && (
                    <div className="absolute top-full mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 overflow-hidden animate-in fade-in duration-200">
                      {transactionTypes.map((type) => (
                        <label
                          key={type.value}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                        >
                          <input
                            type="checkbox"
                            checked={tempTypes.includes(type.value)}
                            onChange={() => toggleType(type.value)}
                            className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-2 focus:ring-gray-900"
                          />
                          <span className="text-gray-700">{type.label}</span>
                        </label>
                      ))}
                      {tempTypes.length > 0 && (
                        <button
                          onClick={() => setTempTypes([])}
                          className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-t border-gray-200 transition-colors duration-150"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Category</label>
                <div className="relative" ref={categoryDropdownRef}>
                  <button
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out flex items-center justify-between"
                    disabled={!categories || categories.length === 0}
                  >
                    <span className="text-gray-700 truncate">
                      {!categories || categories.length === 0
                        ? 'No Categories'
                        : tempCategories.length === 0
                        ? 'All Categories'
                        : tempCategories.length === categories.length
                        ? 'All Categories'
                        : tempCategories.length === 1
                        ? categories.find(c => c.id === tempCategories[0])?.name
                        : `${tempCategories.length} selected`}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {isCategoryDropdownOpen && categories && categories.length > 0 && (
                    <div className="absolute top-full mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 overflow-hidden animate-in fade-in duration-200 max-h-64 overflow-y-auto">
                      {categories.map((category) => (
                        <label
                          key={category.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                        >
                          <input
                            type="checkbox"
                            checked={tempCategories.includes(category.id)}
                            onChange={() => toggleCategory(category.id)}
                            className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-2 focus:ring-gray-900"
                          />
                          <span className="text-gray-700 truncate">{category.name}</span>
                        </label>
                      ))}
                      {tempCategories.length > 0 && (
                        <button
                          onClick={() => setTempCategories([])}
                          className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-t border-gray-200 transition-colors duration-150"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Date Range</label>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="start-date" className="block text-xs text-gray-600 mb-1">From</label>
                    <input
                      id="start-date"
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      max={tempEndDate || undefined}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out"
                    />
                  </div>
                  <div>
                    <label htmlFor="end-date" className="block text-xs text-gray-600 mb-1">To</label>
                    <input
                      id="end-date"
                      type="date"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      min={tempStartDate || undefined}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out"
                    />
                  </div>
                </div>
              </div>

              {/* Amount Range Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Amount Range</label>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="amount-min" className="block text-xs text-gray-600 mb-1">Minimum</label>
                    <input
                      id="amount-min"
                      type="number"
                      value={tempAmountMin}
                      onChange={(e) => setTempAmountMin(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      max={tempAmountMax || undefined}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out"
                    />
                  </div>
                  <div>
                    <label htmlFor="amount-max" className="block text-xs text-gray-600 mb-1">Maximum</label>
                    <input
                      id="amount-max"
                      type="number"
                      value={tempAmountMax}
                      onChange={(e) => setTempAmountMax(e.target.value)}
                      placeholder="0.00"
                      min={tempAmountMin || "0"}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={clearAllFilters}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={applyFilters}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message="Failed to load transactions" />
      ) : transactions && transactions.length === 0 ? (
        <EmptyState
          message={searchQuery || appliedStartDate || appliedEndDate || appliedTypes.length > 0 || appliedCategories.length > 0 || appliedAmountMin || appliedAmountMax ? "No transactions found matching your filters." : "No transactions yet for this period."}
          action={canManageBudgetData && !searchQuery && !appliedStartDate && !appliedEndDate && appliedTypes.length === 0 && appliedCategories.length === 0 && !appliedAmountMin && !appliedAmountMax ? { label: "Add Transaction", onClick: () => setIsModalOpen(true) } : undefined}
        />
      ) : (
        <TransactionList
          transactions={transactions || []}
          dateOrdering={dateOrdering}
          onToggleDateSort={() => setDateOrdering(prev => prev === '-date' ? 'date' : '-date')}
          onEdit={canManageBudgetData ? handleEdit : undefined}
          onDelete={canManageBudgetData ? handleDelete : undefined}
        />
      )}

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        transaction={editingTransaction}
      />
    </div>
  )
}