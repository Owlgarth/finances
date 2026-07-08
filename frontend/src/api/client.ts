import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  User, Token, LoginRequest, RegisterRequest, Workspace, WorkspaceMember, AddMemberRequest,
  AddMemberResponse, UserPreferences, AccountDeleteCheck, ConsentStatus, LegalDoc, TwoFAStatus,
  TwoFASetupResponse, TwoFAVerifySetupResponse, TwoFARegenerateResponse, TransactionTotalsResponse,
  PlannedTransactionTotalsResponse, FrequentDescriptionsResponse, CurrentBalancesResponse,
  ImportResult, LegacyImportResult, Account, AccountBalance, AccountType, CatalogCurrency, Budget,
  Period, Category, CategoryBudget, Transaction, TransactionType, Transfer, PlannedTransaction,
  BudgetSummaryResponse, PaginatedResponse,
} from '../types';

// ============= Ordering types (shared with page call sites) =============
export type TransactionOrdering =
  | '-date' | 'date' | '-description' | 'description'
  | '-amount' | 'amount' | '-type' | 'type'
  | '-category__name' | 'category__name' | '-account__name' | 'account__name'
  | '-account__currency__code' | 'account__currency__code';

export type PlannedTransactionOrdering =
  | '-name' | 'name' | '-amount' | 'amount'
  | '-status' | 'status' | '-planned_date' | 'planned_date'
  | '-category__name' | 'category__name'
  | '-account__name' | 'account__name' | '-account__currency__code' | 'account__currency__code';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  withCredentials: true,
  paramsSerializer: {
    indexes: null, // This removes the brackets from array parameters
  },
});

// ============= Token Management =============
const TOKEN_KEY = 'denarly_token';
const REFRESH_TOKEN_KEY = 'denarly_refresh_token';

export const setAuthToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setRefreshToken = (token: string): void => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const clearAuthToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  delete api.defaults.headers.common['Authorization'];
};

// Set token from localStorage on app start
const savedToken = getAuthToken();
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// Response interceptor - handle 401 with token refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(undefined);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest) {
      // Prevent deadlock: if the refresh request itself returns 401,
      // reject immediately so the outer catch handles cleanup.
      if ((originalRequest as any)._skipAuthRefresh) {
        return Promise.reject(error);
      }

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearAuthToken();
        const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
        if (!isAuthRoute) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          originalRequest.headers.Authorization = `Bearer ${getAuthToken()}`;
          return api(originalRequest);
        });
      }

      isRefreshing = true;
      try {
        const response = await authApi.refresh(refreshToken);
        if (response.access_token) {
          setAuthToken(response.access_token);
          if (response.refresh_token) {
            setRefreshToken(response.refresh_token);
          }
          originalRequest.headers.Authorization = `Bearer ${response.access_token}`;
          processQueue(null);
          return api(originalRequest);
        } else {
          clearAuthToken();
          processQueue(error);
          const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
          if (!isAuthRoute) {
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }
      } catch (refreshError) {
        clearAuthToken();
        processQueue(refreshError);
        const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
        if (!isAuthRoute) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ============= Legal API =============
export const legalApi = {
  getTerms: (): Promise<LegalDoc> =>
    api.get<LegalDoc>('/legal/terms').then(res => res.data),

  getPrivacy: (): Promise<LegalDoc> =>
    api.get<LegalDoc>('/legal/privacy').then(res => res.data),
};

// ============= Currencies API =============
export const currenciesApi = {
  catalog: (): Promise<CatalogCurrency[]> =>
    api.get<CatalogCurrency[]>('/currencies').then(res => res.data),
  enabled: (): Promise<CatalogCurrency[]> =>
    api.get<CatalogCurrency[]>('/workspaces/enabled-currencies').then(res => res.data),
  enable: (code: string): Promise<CatalogCurrency> =>
    api.post<CatalogCurrency>('/workspaces/enabled-currencies', { code }).then(res => res.data),
  createCustom: (data: { code: string; name: string; symbol: string; decimals?: number }): Promise<CatalogCurrency> =>
    api.post<CatalogCurrency>('/workspaces/enabled-currencies', { ...data, custom: true }).then(res => res.data),
  disable: (code: string): Promise<void> =>
    api.delete(`/workspaces/enabled-currencies/${code}`).then(() => undefined),
};

// ============= Accounts API =============
export const accountsApi = {
  list: (includeArchived = false): Promise<Account[]> =>
    api.get<Account[]>('/accounts', { params: { include_archived: includeArchived } }).then(res => res.data),
  get: (id: number): Promise<Account> =>
    api.get<Account>(`/accounts/${id}`).then(res => res.data),
  create: (data: { name: string; type: AccountType; currency_code: string; opening_balance?: string; display_order?: number }): Promise<Account> =>
    api.post<Account>('/accounts', data).then(res => res.data),
  update: (id: number, data: { name?: string; type?: AccountType; opening_balance?: string; display_order?: number }): Promise<Account> =>
    api.put<Account>(`/accounts/${id}`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
  setArchive: (id: number, isArchived: boolean): Promise<Account> =>
    api.patch<Account>(`/accounts/${id}/archive`, { is_archived: isArchived }).then(res => res.data),
  balance: (id: number): Promise<AccountBalance> =>
    api.get<AccountBalance>(`/accounts/${id}/balance`).then(res => res.data),
};

// ============= Budgets & Periods API =============
export const budgetsApi = {
  list: (includeInactive = false): Promise<Budget[]> =>
    api.get<Budget[]>('/budgets', { params: { include_inactive: includeInactive } }).then(res => res.data),
  get: (id: number): Promise<Budget> =>
    api.get<Budget>(`/budgets/${id}`).then(res => res.data),
  create: (data: Partial<Budget>): Promise<Budget> =>
    api.post<Budget>('/budgets', data).then(res => res.data),
  update: (id: number, data: Partial<Budget>): Promise<Budget> =>
    api.put<Budget>(`/budgets/${id}`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/budgets/${id}`),
  setArchive: (id: number, isActive: boolean): Promise<Budget> =>
    api.patch<Budget>(`/budgets/${id}/archive`, { is_active: isActive }).then(res => res.data),

  listPeriods: (budgetId: number): Promise<Period[]> =>
    api.get<Period[]>(`/budgets/${budgetId}/periods`).then(res => res.data),
  currentPeriod: (budgetId: number, date?: string): Promise<Period> =>
    api.get<Period>(`/budgets/${budgetId}/periods/current`, { params: date ? { date } : undefined }).then(res => res.data),
  createPeriod: (budgetId: number, data: { name: string; start_date: string; end_date: string }): Promise<Period> =>
    api.post<Period>(`/budgets/${budgetId}/periods`, data).then(res => res.data),
  updatePeriod: (budgetId: number, periodId: number, data: { name?: string; start_date?: string; end_date?: string }): Promise<Period> =>
    api.put<Period>(`/budgets/${budgetId}/periods/${periodId}`, data).then(res => res.data),
  deletePeriod: (budgetId: number, periodId: number) =>
    api.delete(`/budgets/${budgetId}/periods/${periodId}`),

  listCategories: (budgetId: number, includeArchived = false): Promise<Category[]> =>
    api.get<Category[]>(`/budgets/${budgetId}/categories`, { params: { include_archived: includeArchived } }).then(res => res.data),
  createCategory: (budgetId: number, data: { name: string }): Promise<Category> =>
    api.post<Category>(`/budgets/${budgetId}/categories`, data).then(res => res.data),
  updateCategory: (budgetId: number, categoryId: number, data: { name: string }): Promise<Category> =>
    api.put<Category>(`/budgets/${budgetId}/categories/${categoryId}`, data).then(res => res.data),
  setCategoryArchive: (budgetId: number, categoryId: number, isArchived: boolean): Promise<Category> =>
    api.patch<Category>(`/budgets/${budgetId}/categories/${categoryId}/archive`, { is_archived: isArchived }).then(res => res.data),
  deleteCategory: (budgetId: number, categoryId: number) =>
    api.delete(`/budgets/${budgetId}/categories/${categoryId}`),

  listCategoryBudgets: (budgetId: number, periodId: number): Promise<CategoryBudget[]> =>
    api.get<CategoryBudget[]>(`/budgets/${budgetId}/periods/${periodId}/category-budgets`).then(res => res.data),
  setCategoryBudget: (budgetId: number, periodId: number, data: { category_id: number; currency_code: string; amount: string }): Promise<CategoryBudget> =>
    api.put<CategoryBudget>(`/budgets/${budgetId}/periods/${periodId}/category-budgets`, data).then(res => res.data),
  deleteCategoryBudget: (budgetId: number, periodId: number, categoryBudgetId: number) =>
    api.delete(`/budgets/${budgetId}/periods/${periodId}/category-budgets/${categoryBudgetId}`),
};

// ============= Transactions API =============
export interface TransactionInput {
  date: string;
  description: string;
  type: TransactionType;
  amount: string;
  account_id?: number | null;
  category_id?: number | null;
  original_amount?: string | null;
  original_currency_code?: string | null;
}

export const transactionsApi = {
  getAll: (params?: { date_from?: string; date_to?: string; account_id?: number; category_id?: number[]; budget_id?: number; transaction_type?: string[]; search?: string; amount_gte?: number; amount_lte?: number; ordering?: TransactionOrdering; page?: number; page_size?: number }): Promise<PaginatedResponse<Transaction>> =>
    api.get<PaginatedResponse<Transaction>>('/transactions', { params }).then(res => res.data),
  getTotals: (params?: { date_from?: string; date_to?: string; account_id?: number; category_id?: number[]; budget_id?: number; transaction_type?: string[]; search?: string; group_by?: 'type' | 'category' | 'type,category' }): Promise<TransactionTotalsResponse> =>
    api.get<TransactionTotalsResponse>('/transactions/totals', { params }).then(res => res.data),
  create: (data: TransactionInput): Promise<Transaction> =>
    api.post<Transaction>('/transactions', data).then(res => res.data),
  update: (id: number, data: TransactionInput): Promise<Transaction> =>
    api.put<Transaction>(`/transactions/${id}`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/transactions/${id}`),
  bulkSetAccount: (transactionIds: number[], accountId: number): Promise<{ updated: number }> =>
    api.post<{ updated: number }>('/transactions/bulk-account', { transaction_ids: transactionIds, account_id: accountId }).then(res => res.data),
  getFrequentDescriptions: (params?: { transaction_type?: string[]; limit?: number }): Promise<FrequentDescriptionsResponse> =>
    api.get<FrequentDescriptionsResponse>('/transactions/frequent-descriptions', { params }).then(res => res.data),
};

// ============= Transfers API =============
export interface TransferInput {
  from_account_id: number;
  to_account_id: number;
  from_amount: string;
  to_amount?: string | null;
  date: string;
  description?: string;
}

export const transfersApi = {
  getAll: (params?: { date_from?: string; date_to?: string; account_id?: number; page?: number; page_size?: number }): Promise<PaginatedResponse<Transfer>> =>
    api.get<PaginatedResponse<Transfer>>('/transfers', { params }).then(res => res.data),
  get: (id: number): Promise<Transfer> =>
    api.get<Transfer>(`/transfers/${id}`).then(res => res.data),
  create: (data: TransferInput): Promise<Transfer> =>
    api.post<Transfer>('/transfers', data).then(res => res.data),
  update: (id: number, data: TransferInput): Promise<Transfer> =>
    api.put<Transfer>(`/transfers/${id}`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/transfers/${id}`),
};

// ============= Reports API =============
export const reportsApi = {
  budgetSummary: (budgetId: number, periodId: number): Promise<BudgetSummaryResponse> =>
    api.get<BudgetSummaryResponse>('/reports/budget-summary', { params: { budget_id: budgetId, period_id: periodId } }).then(res => res.data),
  currentBalances: (includeArchived = false): Promise<CurrentBalancesResponse> =>
    api.get<CurrentBalancesResponse>('/reports/current-balances', { params: { include_archived: includeArchived } }).then(res => res.data),
};

// ============= Planned Transactions API =============
export interface PlannedInput {
  name: string;
  amount: string;
  account_id?: number | null;
  category_id?: number | null;
  planned_date: string;
  status?: 'pending' | 'done' | 'cancelled';
}

export const plannedTransactionsApi = {
  getAll: (params?: { status?: string; account_id?: number; start_date?: string; end_date?: string; page?: number; page_size?: number; ordering?: PlannedTransactionOrdering }): Promise<PaginatedResponse<PlannedTransaction>> =>
    api.get<PaginatedResponse<PlannedTransaction>>('/planned-transactions', { params }).then(res => res.data),
  getTotals: (params?: { status?: string; account_id?: number; group_by?: 'currency' | 'category' }): Promise<PlannedTransactionTotalsResponse> =>
    api.get<PlannedTransactionTotalsResponse>('/planned-transactions/totals', { params }).then(res => res.data),
  create: (data: PlannedInput): Promise<PlannedTransaction> =>
    api.post<PlannedTransaction>('/planned-transactions', data).then(res => res.data),
  update: (id: number, data: PlannedInput): Promise<PlannedTransaction> =>
    api.put<PlannedTransaction>(`/planned-transactions/${id}`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/planned-transactions/${id}`),
  execute: (id: number, paymentDate: string): Promise<PlannedTransaction> =>
    api.post<PlannedTransaction>(`/planned-transactions/${id}/execute`, null, { params: { payment_date: paymentDate } }).then(res => res.data),
};

// ============= Auth API =============
export const authApi = {
  register: (data: RegisterRequest): Promise<Token> =>
    api.post<Token>('/auth/register', data, { headers: { Authorization: '' } }).then(res => res.data),

  login: (data: LoginRequest): Promise<Token> =>
    api.post<Token>('/auth/login', data, { headers: { Authorization: '' } }).then(res => res.data),

  getCurrentUser: (): Promise<User> =>
    api.get<User>('/users/me').then(res => res.data),

  updateProfile: (data: { full_name?: string; email?: string }): Promise<User> =>
    api.patch<User>('/users/me', data).then(res => res.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/users/me/password', { current_password: currentPassword, new_password: newPassword }),

  getPreferences: (): Promise<UserPreferences> =>
    api.get<UserPreferences>('/users/me/preferences').then(res => res.data),

  updatePreferences: (data: { calendar_start_day?: number; font_family?: string }): Promise<UserPreferences> =>
    api.patch<UserPreferences>('/users/me/preferences', data).then(res => res.data),

  checkDeletion: (): Promise<AccountDeleteCheck> =>
    api.get<AccountDeleteCheck>('/users/me/deletion-check').then(res => res.data),

  deleteAccount: (password: string): Promise<{ message: string; deleted_workspaces: string[] }> =>
    api.delete('/users/me', { data: { password } }).then(res => res.data),

  exportData: (): Promise<Blob> =>
    api.get('/users/me/export', { responseType: 'blob' }).then(res => res.data),

  importData: (data: Record<string, unknown>, conflictStrategy: string = 'rename', workspaces?: string[]): Promise<ImportResult> =>
    api.post<ImportResult>('/users/me/import', {
      data,
      workspaces: workspaces ?? null,
      conflict_strategy: conflictStrategy,
    }).then(res => res.data),

  importLegacy: (data: Record<string, unknown>, conflictStrategy: string = 'rename'): Promise<LegacyImportResult> =>
    api.post<LegacyImportResult>('/users/import-legacy', {
      data,
      conflict_strategy: conflictStrategy,
    }).then(res => res.data),

  getConsentStatus: (): Promise<ConsentStatus> =>
    api.get<ConsentStatus>('/users/me/consent-status').then(res => res.data),

  grantConsent: (consentType: string, version: string) =>
    api.post('/users/me/consents', { consent_type: consentType, version }).then(res => res.data),

  verify2FA: (tempToken: string, code: string): Promise<Token> =>
    api.post<Token>('/auth/verify-2fa', { temp_token: tempToken, code }, { headers: { Authorization: '' } }).then(res => res.data),

  refresh: (refreshToken: string): Promise<Token> =>
    api.post<Token>('/auth/refresh', { refresh_token: refreshToken }, { headers: { Authorization: '' }, _skipAuthRefresh: true } as any).then(res => res.data),

  get2FAStatus: (): Promise<TwoFAStatus> =>
    api.get<TwoFAStatus>('/users/me/2fa').then(res => res.data),

  setup2FA: (): Promise<TwoFASetupResponse> =>
    api.post<TwoFASetupResponse>('/users/me/2fa/setup').then(res => res.data),

  verifySetup2FA: (code: string): Promise<TwoFAVerifySetupResponse> =>
    api.post<TwoFAVerifySetupResponse>('/users/me/2fa/verify-setup', { code }).then(res => res.data),

  disable2FA: (password: string): Promise<{ message: string }> =>
    api.post('/users/me/2fa/disable', { password }).then(res => res.data),

  regenerateRecoveryCodes: (password: string): Promise<TwoFARegenerateResponse> =>
    api.post<TwoFARegenerateResponse>('/users/me/2fa/regenerate-codes', { password }).then(res => res.data),

  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }),

  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),

  requestEmailChange: (password: string, newEmail: string) =>
    api.post('/auth/request-email-change', { password, new_email: newEmail }),

  confirmEmailChange: (token: string) =>
    api.post('/auth/confirm-email-change', { token }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { uidb64: string; token: string; new_password: string }) =>
    api.post('/auth/reset-password', data),
};

// ============= Workspaces API =============
export const workspacesApi = {
  list: (): Promise<Workspace[]> =>
    api.get<Workspace[]>('/workspaces').then(res => res.data),

  getCurrent: (): Promise<Workspace> =>
    api.get<Workspace>('/workspaces/current').then(res => res.data),

  update: (data: { name: string }): Promise<Workspace> =>
    api.put<Workspace>('/workspaces/current', data).then(res => res.data),

  switch: (workspaceId: number) =>
    api.post(`/workspaces/${workspaceId}/switch`).then(res => res.data),

  create: (data: { name: string; currency_code?: string }): Promise<Workspace> =>
    api.post<Workspace>('/workspaces/', data).then(res => res.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/workspaces/${id}`).then(() => undefined),
};

// ============= Workspace Members API =============
export const workspaceMembersApi = {
  list: (workspaceId: number): Promise<WorkspaceMember[]> =>
    api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`).then(res => res.data),

  add: (workspaceId: number, data: AddMemberRequest): Promise<AddMemberResponse> =>
    api.post<AddMemberResponse>(`/workspaces/${workspaceId}/members/add`, data).then(res => res.data),

  updateRole: (workspaceId: number, userId: number, role: string): Promise<{ message: string; user_id: number; old_role: string; new_role: string }> =>
    api.put(`/workspaces/${workspaceId}/members/${userId}/role`, { role }).then(res => res.data),

  remove: (workspaceId: number, userId: number): Promise<void> =>
    api.delete(`/workspaces/${workspaceId}/members/${userId}`).then(() => undefined),

  leave: (workspaceId: number): Promise<{ message: string }> =>
    api.post(`/workspaces/${workspaceId}/members/leave`).then(res => res.data),

  resetPassword: (workspaceId: number, userId: number, newPassword: string): Promise<{ message: string; user_id: number; email: string }> =>
    api.put(`/workspaces/${workspaceId}/members/${userId}/reset-password`, { new_password: newPassword }).then(res => res.data),
};
