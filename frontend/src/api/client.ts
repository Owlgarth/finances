import axios from 'axios';
import type { AxiosError } from 'axios';
import type { User, Token, LoginRequest, RegisterRequest, Workspace, BudgetAccount, WorkspaceMember, AddMemberRequest, AddMemberResponse, UserPreferences, AccountDeleteCheck, ConsentStatus, LegalDoc, TwoFAStatus, TwoFASetupResponse, TwoFAVerifySetupResponse, TwoFARegenerateResponse } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  paramsSerializer: {
    indexes: null, // This removes the brackets from array parameters
  },
});

// ============= Token Management =============
const TOKEN_KEY = 'monie_token';
const REFRESH_TOKEN_KEY = 'monie_refresh_token';

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

export const exchangeShortcutsApi = {
  getAll: () => api.get('/exchange-shortcuts'),
  create: (data: { from_currency: string; to_currency: string }) =>
    api.post('/exchange-shortcuts', data),
  update: (id: number, data: { from_currency: string; to_currency: string }) =>
    api.put(`/exchange-shortcuts/${id}`, data),
  delete: (id: number) =>
    api.delete(`/exchange-shortcuts/${id}`),
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

  getConsentStatus: (): Promise<ConsentStatus> =>
    api.get<ConsentStatus>('/users/me/consent-status').then(res => res.data),

  grantConsent: (consentType: string, version: string) =>
    api.post('/users/me/consents', { consent_type: consentType, version }).then(res => res.data),

  verify2FA: (tempToken: string, code: string): Promise<Token> =>
    api.post<Token>('/auth/verify-2fa', { temp_token: tempToken, code }, { headers: { Authorization: '' } }).then(res => res.data),

  refresh: (refreshToken: string): Promise<Token> =>
    api.post<Token>('/auth/refresh', { refresh_token: refreshToken }, { headers: { Authorization: '' } }).then(res => res.data),

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

  create: (data: { name: string }): Promise<Workspace> =>
    api.post<Workspace>('/workspaces/', data).then(res => res.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/workspaces/${id}`).then(() => undefined),
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
