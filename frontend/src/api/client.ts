import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import { SyncQueueManager } from '../utils/syncQueue';
import { performOptimisticUpdate } from '../utils/optimisticUpdates';
import toast from 'react-hot-toast';
import type { User, Token, LoginRequest, RegisterRequest, Workspace, BudgetAccount, WorkspaceMember, AddMemberRequest, AddMemberResponse } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  paramsSerializer: {
    indexes: null, // This removes the brackets from array parameters
  },
});

// ============= Token Management =============
const TOKEN_KEY = 'monie_token';

export const setAuthToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const clearAuthToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  delete api.defaults.headers.common['Authorization'];
};

// Set token from localStorage on app start
const savedToken = getAuthToken();
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// Custom error class for offline requests
class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineError';
  }
}

// Keys for localStorage context
const SELECTED_ACCOUNT_KEY = 'monie_selected_account';

/**
 * Get current workspace/account context for offline queue
 * Uses localStorage since this runs outside React context
 */
function getOfflineContext(): { workspaceId?: number; accountId?: number } {
  // Get workspace ID from JWT token payload
  let workspaceId: number | undefined;
  const token = getAuthToken();
  if (token) {
    try {
      // Decode JWT payload (base64)
      const payload = JSON.parse(atob(token.split('.')[1]));
      workspaceId = payload.current_workspace_id;
    } catch (e) {
      console.warn('Failed to decode JWT for offline context:', e);
    }
  }

  // Get selected account ID from localStorage
  let accountId: number | undefined;
  const savedAccountId = localStorage.getItem(SELECTED_ACCOUNT_KEY);
  if (savedAccountId) {
    accountId = Number(savedAccountId);
  }

  return { workspaceId, accountId };
}

// Store QueryClient reference
let queryClientRef: QueryClient | null = null;

/**
 * Initialize offline interceptors with QueryClient
 * Must be called after QueryClient is created
 */
export function initializeOfflineInterceptors(queryClient: QueryClient): void {
  queryClientRef = queryClient;
}

// Request interceptor - queue requests when offline
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Check if we're offline and this is a mutation (POST, PUT, DELETE)
    const isMutation = ['post', 'put', 'delete'].includes(config.method?.toLowerCase() || '');

    if (!navigator.onLine && isMutation) {
      // Generate a description for the queued request
      const method = config.method?.toUpperCase();
      const path = config.url?.split('/').pop() || 'unknown';
      const description = `${method} ${path}`;

      // Perform optimistic update if QueryClient is available
      let optimisticData = null;
      if (queryClientRef) {
        optimisticData = performOptimisticUpdate(queryClientRef, config);
      }

      // Get current workspace/account context for validation during sync
      const context = getOfflineContext();

      // Add to sync queue with optimistic data and context
      SyncQueueManager.addToQueue(config, description, optimisticData || undefined, context);

      // Show notification
      toast.success('Change saved offline - will sync when online', {
        duration: 3000,
      });

      // Throw offline error to prevent the request from executing
      throw new OfflineError('Request queued for offline sync');
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle network errors and 401
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      // Don't redirect if already on login/register page
      const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
      if (!isAuthRoute) {
        clearAuthToken();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Check if it's a network error (offline)
    if (!error.response && error.message === 'Network Error') {
      // Queue the request if it was a mutation
      const config = error.config;
      if (config) {
        const isMutation = ['post', 'put', 'delete'].includes(config.method?.toLowerCase() || '');

        if (isMutation) {
          const method = config.method?.toUpperCase();
          const path = config.url?.split('/').pop() || 'unknown';
          const description = `${method} ${path}`;

          // Perform optimistic update if QueryClient is available
          let optimisticData = null;
          if (queryClientRef) {
            optimisticData = performOptimisticUpdate(queryClientRef, config);
          }

          // Get current workspace/account context for validation during sync
          const context = getOfflineContext();

          SyncQueueManager.addToQueue(config, description, optimisticData || undefined, context);

          toast.success('Change saved offline - will sync when online', {
            duration: 3000,
          });

          return Promise.reject(new OfflineError('Request queued for offline sync'));
        }
      }
    }

    return Promise.reject(error);
  }
);

export const budgetPeriodsApi = {
  getAll: (budgetAccountId?: number) => api.get('/budget-periods', { params: budgetAccountId ? { budget_account_id: budgetAccountId } : undefined }),
  getOne: (id: number) => api.get(`/budget-periods/${id}`),
  getCurrent: (date: string) => api.get('/budget-periods/current', { params: { current_date: date } }),
  create: (data: any) => api.post('/budget-periods', data),
  update: (id: number, data: any) => api.put(`/budget-periods/${id}`, data),
  delete: (id: number) => api.delete(`/budget-periods/${id}`),
  copy: (id: number, data: { name: string; start_date: string; end_date: string; weeks?: number }) =>
    api.post(`/budget-periods/${id}/copy`, data),
};

export const categoriesApi = {
  getAll: (params?: { budget_period_id?: number; current_date?: string }) => api.get('/categories', { params }),
  getOne: (id: number) => api.get(`/categories/${id}`),
  create: (data: { budget_period_id: number; name: string }) => api.post('/categories', data),
  update: (id: number, data: { budget_period_id: number; name: string }) => api.put(`/categories/${id}`, data),
  delete: (id: number) => api.delete(`/categories/${id}`),
  import: (data: FormData) => api.post('/categories/import', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  export: (params: { budget_period_id: number }) => api.get('/categories/export/', { params }),
};

export const budgetsApi = {
  getAll: (periodId?: number) => api.get('/budgets', { params: { budget_period_id: periodId } }),
  create: (data: { budget_period_id: number; category_id: number; currency: string; amount: number }) => api.post('/budgets', data),
  update: (id: number, data: { budget_period_id: number; category_id: number; currency: string; amount: number }) => api.put(`/budgets/${id}`, data),
  delete: (id: number) => api.delete(`/budgets/${id}`),
};

export const transactionsApi = {
  getAll: (params?: { budget_period_id?: number; current_date?: string; search?: string; start_date?: string; end_date?: string; type?: string[]; category_id?: number[]; amount_gte?: number; amount_lte?: number; ordering?: 'date' | '-date' }) => api.get('/transactions', { params }),
  create: (data: { date: string; description: string; category_id: number; amount: number; currency: string; type: 'expense' | 'income' }) => api.post('/transactions', data),
  update: (id: number, data: { date: string; description: string; category_id: number; amount: number; currency: string; type: 'expense' | 'income' }) => api.put(`/transactions/${id}`, data),
  delete: (id: number) => api.delete(`/transactions/${id}`),
  import: (data: FormData) => api.post('/transactions/import', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  export: (params: { budget_period_id: number; type?: string }) => api.get('/transactions/export/', { params }),
};

export const reportsApi = {
  budgetSummary: (periodId: number) => api.get('/reports/budget-summary', { params: { budget_period_id: periodId } }),
  currentBalances: () => api.get('/reports/current-balances'),
};

export const periodBalancesApi = {
  getAll: (periodId?: number) => api.get('/period-balances', { params: { budget_period_id: periodId } }),
  update: (id: number, data: { opening_balance: number }) => api.put(`/period-balances/${id}`, data),
  recalculate: (periodId: number, currency: string) =>
    api.post('/period-balances/recalculate', { budget_period_id: periodId, currency }),
};

export const currencyExchangesApi = {
  getAll: (params?: { budget_period_id?: number }) => api.get('/currency-exchanges', { params }),
  create: (data: { date: string; description?: string; from_currency: string; from_amount: number; to_currency: string; to_amount: number }) => api.post('/currency-exchanges', data),
  update: (id: number, data: { date: string; description?: string; from_currency: string; from_amount: number; to_currency: string; to_amount: number }) => api.put(`/currency-exchanges/${id}`, data),
  delete: (id: number) => api.delete(`/currency-exchanges/${id}`),
  import: (data: FormData) => api.post('/currency-exchanges/import', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  export: (params: { budget_period_id: number }) => api.get('/currency-exchanges/export/', { params }),
};

export const plannedTransactionsApi = {
  getAll: (status?: string, budget_period_id?: number) => api.get('/planned-transactions', { params: { status, budget_period_id } }),
  create: (data: { budget_period_id?: number; name: string; amount: number; currency: string; category_id?: number | null; planned_date: string; status?: 'pending' | 'done' | 'cancelled' }) => api.post('/planned-transactions', data),
  update: (id: number, data: { budget_period_id?: number; name: string; amount: number; currency: string; category_id?: number | null; planned_date: string; status?: 'pending' | 'done' | 'cancelled' }) => api.put(`/planned-transactions/${id}`, data),
  delete: (id: number) => api.delete(`/planned-transactions/${id}`),
  execute: (id: number, paymentDate: string) =>
    api.post(`/planned-transactions/${id}/execute`, null, { params: { payment_date: paymentDate } }),
  import: (data: FormData) => api.post('/planned-transactions/import', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  export: (params: { budget_period_id: number; status?: string }) => api.get('/planned-transactions/export/', { params }),
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
};

// ============= Budget Accounts API =============
export const budgetAccountsApi = {
  list: (includeInactive = false): Promise<BudgetAccount[]> =>
    api.get<BudgetAccount[]>('/budget-accounts', { params: { include_inactive: includeInactive } }).then(res => res.data),

  get: (id: number): Promise<BudgetAccount> =>
    api.get<BudgetAccount>(`/budget-accounts/${id}`).then(res => res.data),

  create: (data: Omit<BudgetAccount, 'id' | 'workspace_id' | 'created_at'>): Promise<BudgetAccount> =>
    api.post<BudgetAccount>('/budget-accounts', data).then(res => res.data),

  update: (id: number, data: Partial<BudgetAccount>): Promise<BudgetAccount> =>
    api.put<BudgetAccount>(`/budget-accounts/${id}`, data).then(res => res.data),

  delete: (id: number) =>
    api.delete(`/budget-accounts/${id}`),

  toggleArchive: (id: number): Promise<BudgetAccount> =>
    api.patch<BudgetAccount>(`/budget-accounts/${id}/archive`).then(res => res.data),
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
