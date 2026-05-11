import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, ChevronDown, Filter } from 'lucide-react'
import { transactionsApi, categoriesApi, currenciesApi } from '../api/client'
import type { Transaction, Category, Currency, PaginatedResponse } from '../types'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import { usePermissions } from '../hooks/usePermissions'
import TransactionList from '../components/transactions/TransactionList'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import TotalsSummary from '../components/common/TotalsSummary'
import DatePicker from '../components/DatePicker'

export default function Transactions() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateOrdering, setDateOrdering] = useState<'date' | '-date'>('-date')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Applied filters (used in actual query)
  const [appliedTypes, setAppliedTypes] = useState<string[]>([])
  const [appliedCategories, setAppliedCategories] = useState<number[]>([])
  const [appliedCurrencies, setAppliedCurrencies] = useState<string[]>([])
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')
  const [appliedAmountMin, setAppliedAmountMin] = useState('')
  const [appliedAmountMax, setAppliedAmountMax] = useState('')

  // Temporary filters (edited in panel before applying)
  const [tempTypes, setTempTypes] = useState<string[]>([])
  const [tempCategories, setTempCategories] = useState<number[]>([])
  const [tempCurrencies, setTempCurrencies] = useState<string[]>([])
  const [tempStartDate, setTempStartDate] = useState('')
  const [tempEndDate, setTempEndDate] = useState('')
  const [tempAmountMin, setTempAmountMin] = useState('')
  const [tempAmountMax, setTempAmountMax] = useState('')

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const queryClient = useQueryClient()
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const currencyDropdownRef = useRef<HTMLDivElement>(null)

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

  const toggleCurrency = (symbol: string) => {
    setTempCurrencies(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    )
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (appliedTypes.length > 0) count++
    if (appliedCategories.length > 0) count++
    if (appliedCurrencies.length > 0) count++
    if (appliedStartDate || appliedEndDate) count++
    if (appliedAmountMin || appliedAmountMax) count++
    return count
  }

  const applyFilters = () => {
    setAppliedTypes(tempTypes)
    setAppliedCategories(tempCategories)
    setAppliedCurrencies(tempCurrencies)
    setAppliedStartDate(tempStartDate)
    setAppliedEndDate(tempEndDate)
    setAppliedAmountMin(tempAmountMin)
    setAppliedAmountMax(tempAmountMax)
    setPage(1)
  }

  const clearAllFilters = () => {
    setTempTypes([])
    setTempCategories([])
    setTempCurrencies([])
    setTempStartDate('')
    setTempEndDate('')
    setTempAmountMin('')
    setTempAmountMax('')
    setAppliedTypes([])
    setAppliedCategories([])
    setAppliedCurrencies([])
    setAppliedStartDate('')
    setAppliedEndDate('')
    setAppliedAmountMin('')
    setAppliedAmountMax('')
    setPage(1)
  }

  const openFilterPanel = () => {
    // Initialize temp values with current applied values when opening panel
    setTempTypes(appliedTypes)
    setTempCategories(appliedCategories)
    setTempCurrencies(appliedCurrencies)
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
      const data = response.data as PaginatedResponse<Category>
      return data.items
    },
    enabled: !!selectedPeriodId
  })

  // Fetch workspace currencies
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await currenciesApi.getAll()
      return response as Currency[]
    },
  })

  // Reset filters when budget period changes
  useEffect(() => {
    setTempCategories([])
    setAppliedCategories([])
    setPage(1)
  }, [selectedPeriodId])

  // Reset page when search or ordering changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery, dateOrdering])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false)
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false)
      }
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(event.target as Node)) {
        setIsCurrencyDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: ['transactions', selectedPeriodId, searchQuery, appliedStartDate, appliedEndDate, appliedTypes, appliedCategories, appliedCurrencies, appliedAmountMin, appliedAmountMax, dateOrdering, page, pageSize],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await transactionsApi.getAll({
        budget_period_id: selectedPeriodId,
        search: searchQuery || undefined,
        start_date: appliedStartDate || undefined,
        end_date: appliedEndDate || undefined,
        transaction_type: appliedTypes.length > 0 ? appliedTypes : undefined,
        category_id: appliedCategories.length > 0 ? appliedCategories : undefined,
        currency: appliedCurrencies.length > 0 ? appliedCurrencies : undefined,
        amount_gte: appliedAmountMin ? parseFloat(appliedAmountMin) : undefined,
        amount_lte: appliedAmountMax ? parseFloat(appliedAmountMax) : undefined,
        ordering: dateOrdering,
        page,
        page_size: pageSize,
      })
      return response.data as PaginatedResponse<Transaction>
    },
    enabled: !!selectedPeriodId,
    staleTime: 0 // Force refetch when query key changes
  })

  const transactions = apiResponse?.items || []
  const totalItems = apiResponse?.total || 0
  const totalPages = apiResponse?.total_pages || 0

  // Fetch type+category totals in a single request
  const totalsFilterKey = useMemo(
    () => [selectedPeriodId, searchQuery, appliedStartDate, appliedEndDate, appliedTypes, appliedCategories, appliedCurrencies, appliedAmountMin, appliedAmountMax],
    [selectedPeriodId, searchQuery, appliedStartDate, appliedEndDate, appliedTypes, appliedCategories, appliedCurrencies, appliedAmountMin, appliedAmountMax],
  )
  const { data: combinedTotalsData } = useQuery({
    queryKey: ['transactions-totals', ...totalsFilterKey],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      return transactionsApi.getTotals({
        group_by: 'type,category',
        budget_period_id: selectedPeriodId,
        search: searchQuery || undefined,
        start_date: appliedStartDate || undefined,
        end_date: appliedEndDate || undefined,
        transaction_type: appliedTypes.length > 0 ? appliedTypes : undefined,
        category_id: appliedCategories.length > 0 ? appliedCategories : undefined,
        currency: appliedCurrencies.length > 0 ? appliedCurrencies : undefined,
        amount_gte: appliedAmountMin ? parseFloat(appliedAmountMin) : undefined,
        amount_lte: appliedAmountMax ? parseFloat(appliedAmountMax) : undefined,
      })
    },
    enabled: !!selectedPeriodId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-totals'] })
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
      queryClient.invalidateQueries({ queryKey: ['transactions-totals'] })
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
      const params: { budget_period_id: number; transaction_type?: string } = {
        budget_period_id: selectedPeriodId
      }
      if (appliedTypes.length > 0) {
        params.transaction_type = appliedTypes[0]
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
        <h1 className="text-base font-semibold text-text">Transactions</h1>
        <div className="flex flex-wrap gap-3">
          {canManageBudgetData && (
            <>
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
                onClick={() => {
                  setEditingTransaction(null)
                  setIsModalOpen(true)
                }}
                className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedPeriodId}
              >
                Add Transaction
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="w-full px-4 py-2.5 pr-10 bg-surface-muted border border-border rounded-none focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => isFilterPanelOpen ? setIsFilterPanelOpen(false) : openFilterPanel()}
            className="px-3 py-1.5 bg-surface-muted border border-border rounded-sm hover:bg-surface-hover focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors flex items-center justify-center gap-2 sm:w-auto text-xs font-medium"
          >
            <Filter size={14} className="text-text-muted" />
            <span className="text-text">Filters</span>
            {getActiveFilterCount() > 0 && (
              <span className="bg-primary text-white text-xs font-semibold rounded-sm h-5 w-5 flex items-center justify-center">
                {getActiveFilterCount()}
              </span>
            )}
            <ChevronDown size={12} className={`text-text-muted transition-transform duration-200 ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {getActiveFilterCount() > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {appliedTypes.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface text-text rounded-sm border border-border text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Type:</span>
                <span>{appliedTypes.map(t => transactionTypes.find(type => type.value === t)?.label).join(', ')}</span>
                <button
                  onClick={() => {
                    setAppliedTypes([])
                    setTempTypes([])
                  }}
                  className="text-text-muted hover:text-text transition-colors"
                  aria-label="Clear type filter"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {appliedCategories.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface text-text rounded-sm border border-border text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Categories:</span>
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
                  className="text-text-muted hover:text-text transition-colors"
                  aria-label="Clear category filter"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {(appliedStartDate || appliedEndDate) && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface text-text rounded-sm border border-border text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Date:</span>
                <span className="font-mono">
                  {appliedStartDate && appliedEndDate ? `${appliedStartDate} to ${appliedEndDate}` : appliedStartDate ? `From ${appliedStartDate}` : `Until ${appliedEndDate}`}
                </span>
                <button
                  onClick={() => {
                    setAppliedStartDate('')
                    setAppliedEndDate('')
                    setTempStartDate('')
                    setTempEndDate('')
                  }}
                  className="text-text-muted hover:text-text transition-colors"
                  aria-label="Clear date filter"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {(appliedAmountMin || appliedAmountMax) && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface text-text rounded-sm border border-border text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Amount:</span>
                <span className="font-mono">
                  {appliedAmountMin && appliedAmountMax ? `${appliedAmountMin} - ${appliedAmountMax}` : appliedAmountMin ? `Min ${appliedAmountMin}` : `Max ${appliedAmountMax}`}
                </span>
                <button
                  onClick={() => {
                    setAppliedAmountMin('')
                    setAppliedAmountMax('')
                    setTempAmountMin('')
                    setTempAmountMax('')
                  }}
                  className="text-text-muted hover:text-text transition-colors"
                  aria-label="Clear amount filter"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {appliedCurrencies.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface text-text rounded-sm border border-border text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Currency:</span>
                <span>{appliedCurrencies.length === 1 ? appliedCurrencies[0] : `${appliedCurrencies.length} selected`}</span>
                <button
                  onClick={() => {
                    setAppliedCurrencies([])
                    setTempCurrencies([])
                  }}
                  className="text-text-muted hover:text-text transition-colors"
                  aria-label="Clear currency filter"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-text-muted hover:text-text text-sm font-medium transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {isFilterPanelOpen && (
          <div className="bg-surface border border-border rounded-sm p-6 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-3">Transaction Type</label>
                <div className="relative" ref={typeDropdownRef}>
                  <button
                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                    className="w-full px-3 py-1.5 bg-surface-muted border border-border rounded-none hover:bg-surface-hover focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors flex items-center justify-between text-xs"
                  >
                    <span className="text-text">
                      {tempTypes.length === 0
                        ? 'All Types'
                        : tempTypes.length === transactionTypes.length
                        ? 'All Types'
                        : tempTypes.map(t => transactionTypes.find(type => type.value === t)?.label).join(', ')}
                    </span>
                    <ChevronDown size={14} className={`text-text-muted transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isTypeDropdownOpen && (
                    <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-sm z-dropdown overflow-hidden animate-in fade-in duration-200">
                      {transactionTypes.map((type) => (
                        <label
                          key={type.value}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={tempTypes.includes(type.value)}
                            onChange={() => toggleType(type.value)}
                            className="w-4 h-4 text-primary border-border rounded focus:ring-2 focus:ring-border-focus"
                          />
                          <span className="text-text">{type.label}</span>
                        </label>
                      ))}
                      {tempTypes.length > 0 && (
                        <button
                          onClick={() => setTempTypes([])}
                          className="w-full px-4 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-3">Category</label>
                <div className="relative" ref={categoryDropdownRef}>
                  <button
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full px-3 py-1.5 bg-surface-muted border border-border rounded-none hover:bg-surface-hover focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors flex items-center justify-between text-xs"
                    disabled={!categories || categories.length === 0}
                  >
                    <span className="text-text truncate">
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
                    <ChevronDown size={14} className={`text-text-muted transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCategoryDropdownOpen && categories && categories.length > 0 && (
                    <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-sm z-dropdown overflow-hidden animate-in fade-in duration-200 max-h-64 overflow-y-auto">
                      {categories.map((category) => (
                        <label
                          key={category.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={tempCategories.includes(category.id)}
                            onChange={() => toggleCategory(category.id)}
                            className="w-4 h-4 text-primary border-border rounded focus:ring-2 focus:ring-border-focus"
                          />
                          <span className="text-text truncate">{category.name}</span>
                        </label>
                      ))}
                      {tempCategories.length > 0 && (
                        <button
                          onClick={() => setTempCategories([])}
                          className="w-full px-4 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-3">Currency</label>
                <div className="relative" ref={currencyDropdownRef}>
                  <button
                    onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                    className="w-full px-3 py-1.5 bg-surface-muted border border-border rounded-none hover:bg-surface-hover focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors flex items-center justify-between text-xs"
                    disabled={!currencies || currencies.length === 0}
                  >
                    <span className="text-text truncate">
                      {!currencies || currencies.length === 0
                        ? 'No Currencies'
                        : tempCurrencies.length === 0
                        ? 'All Currencies'
                        : tempCurrencies.length === currencies.length
                        ? 'All Currencies'
                        : tempCurrencies.length === 1
                        ? currencies.find(c => c.symbol === tempCurrencies[0])?.symbol
                        : `${tempCurrencies.length} selected`}
                    </span>
                    <ChevronDown size={14} className={`text-text-muted transition-transform duration-200 ${isCurrencyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCurrencyDropdownOpen && currencies && currencies.length > 0 && (
                    <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-sm z-dropdown overflow-hidden animate-in fade-in duration-200">
                      {currencies.map((currency) => (
                        <label
                          key={currency.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={tempCurrencies.includes(currency.symbol)}
                            onChange={() => toggleCurrency(currency.symbol)}
                            className="w-4 h-4 text-primary border-border rounded focus:ring-2 focus:ring-border-focus"
                          />
                          <span className="text-text">{currency.symbol}</span>
                        </label>
                      ))}
                      {tempCurrencies.length > 0 && (
                        <button
                          onClick={() => setTempCurrencies([])}
                          className="w-full px-4 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-3">Date Range</label>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="start-date" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">From</label>
                    <DatePicker
                      id="start-date"
                      value={tempStartDate}
                      onChange={(value) => setTempStartDate(value)}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-none focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="end-date" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">To</label>
                    <DatePicker
                      id="end-date"
                      value={tempEndDate}
                      onChange={(value) => setTempEndDate(value)}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-none focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-3">Amount Range</label>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="amount-min" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Minimum</label>
                    <input
                      id="amount-min"
                      type="number"
                      value={tempAmountMin}
                      onChange={(e) => setTempAmountMin(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      max={tempAmountMax || undefined}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-none focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="amount-max" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Maximum</label>
                    <input
                      id="amount-max"
                      type="number"
                      value={tempAmountMax}
                      onChange={(e) => setTempAmountMax(e.target.value)}
                      placeholder="0.00"
                      min={tempAmountMin || "0"}
                      step="0.01"
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-none focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6">
              <button
                onClick={clearAllFilters}
                className="px-3 py-1.5 text-text-muted hover:text-text font-medium text-xs transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={applyFilters}
                className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
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
      ) : totalItems === 0 ? (
        <EmptyState
          message={searchQuery || appliedStartDate || appliedEndDate || appliedTypes.length > 0 || appliedCategories.length > 0 || appliedCurrencies.length > 0 || appliedAmountMin || appliedAmountMax ? "No transactions found matching your filters." : "No transactions yet for this period."}
          action={canManageBudgetData && !searchQuery && !appliedStartDate && !appliedEndDate && appliedTypes.length === 0 && appliedCategories.length === 0 && appliedCurrencies.length === 0 && !appliedAmountMin && !appliedAmountMax ? { label: "Add Transaction", onClick: () => setIsModalOpen(true) } : undefined}
        />
      ) : (
        <>
          <TransactionList
            transactions={transactions}
            dateOrdering={dateOrdering}
            onToggleDateSort={() => setDateOrdering(prev => prev === '-date' ? 'date' : '-date')}
            onEdit={canManageBudgetData ? handleEdit : undefined}
            onDelete={canManageBudgetData ? handleDelete : undefined}
          />
          {totalItems > 0 && combinedTotalsData?.by_type && combinedTotalsData.by_type.length > 0 && (
            <TotalsSummary
              mode="transactions"
              typeTotals={combinedTotalsData.by_type}
              categoryTotals={combinedTotalsData.by_category}
            />
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
        </>
      )}

      <TransactionFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        transaction={editingTransaction}
      />
    </div>
  )
}
