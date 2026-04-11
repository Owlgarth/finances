export interface BudgetPeriod {
  id: number;
  budget_account_id: number;
  name: string;
  start_date: string;
  end_date: string;
  weeks?: number;
  created_at: string;
}

export interface Currency {
  id: number;
  name: string;
  symbol: string;
  created_at: string;
}

export interface Category {
  id: number;
  budget_period_id: number;
  name: string;
  created_at: string;
}

export interface Budget {
  id: number;
  budget_period_id: number;
  category: Category;
  currency: string;
  amount: number;
  created_at: string;
}

export interface Transaction {
  id: number;
  budget_period_id: number | null;
  date: string;
  description: string;
  category: Category | null;
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  created_at: string;
}

export interface PeriodBalance {
  id: number;
  budget_period_id: number;
  currency: string;
  opening_balance: number;
  total_income: number;
  total_expenses: number;
  exchanges_in: number;
  exchanges_out: number;
  closing_balance: number;
  last_calculated_at: string | null;
}

export interface CurrencyExchange {
  id: number;
  budget_period_id: number | null;
  date: string;
  description: string | null;
  from_currency: string;
  from_amount: number;
  to_currency: string;
  to_amount: number;
  exchange_rate: number | null;
  created_at: string;
}

export interface ExchangeShortcut {
  id: number;
  from_currency: string;
  to_currency: string;
  created_at: string;
}

export interface PlannedTransaction {
  id: number;
  budget_period_id: number | null;
  name: string;
  amount: number;
  currency: string;
  category: Category | null;
  planned_date: string;
  payment_date: string | null;
  status: 'pending' | 'done' | 'cancelled';
  transaction_id: number | null;
  created_at: string;
}

// ============= Auth Types =============
export interface User {
  id: number;
  email: string;
  full_name?: string;
  current_workspace_id?: number;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface UserPreferences {
  calendar_start_day: number;
  font_family: string;
}

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  id: number;
  name: string;
  owner_id?: number;
  created_at: string;
  user_role?: Role;
}

export interface BudgetAccount {
  id: number;
  workspace_id: number;
  name: string;
  description?: string;
  default_currency: string;
  color?: string;
  icon?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
  workspace_name: string;
  accepted_terms_version: string;
  accepted_privacy_version: string;
}

export interface LegalDoc {
  version: string;
  effective_date: string;
  content: string;
}

export interface ConsentStatus {
  terms_current: boolean;
  privacy_current: boolean;
  terms_version_required: string;
  privacy_version_required: string;
  needs_reconsent: boolean;
}

export interface AccountDeleteCheck {
  can_delete: boolean;
  blocking_workspaces: Array<{ id: number; name: string; member_count: number }> | null;
  solo_workspaces: string[];
  shared_workspace_memberships: number;
  total_transactions: number;
  total_planned_transactions: number;
  total_currency_exchanges: number;
}

export interface Token {
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  requires_2fa?: boolean;
  temp_token?: string;
}

export interface TwoFAStatus {
  enabled: boolean;
  remaining_recovery_codes: number;
  last_used_at: string | null;
}

export interface TwoFASetupResponse {
  qr_code_svg: string;
  secret_key: string;
}

export interface TwoFAVerifySetupResponse {
  recovery_codes: string[];
}

export interface TwoFARegenerateResponse {
  recovery_codes: string[];
}

// ============= Workspace Member Types =============
export interface WorkspaceMember {
  id: number;
  workspace_id: number;
  user_id: number;
  email: string;
  full_name?: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface AddMemberRequest {
  email: string;
  password: string;
  role: 'admin' | 'member' | 'viewer';
  full_name?: string;
}

export interface AddMemberResponse {
  message: string;
  user_id: number;
  member_id: number;
  is_new_user: boolean;
}

// ============= Pagination Types =============
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}