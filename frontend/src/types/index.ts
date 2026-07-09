// ============= Domain (account-based model) =============

export type AccountType = 'cash' | 'bank' | 'other';

export interface Account {
  id: number;
  workspace_id: number;
  name: string;
  type: AccountType;
  currency_code: string;
  opening_balance: string;
  is_archived: boolean;
  display_order: number;
  created_at: string;
}

export interface AccountBalance {
  account_id: number;
  currency_code: string;
  balance: string;
}

export interface CatalogCurrency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_custom: boolean;
}

export type Cadence = 'monthly' | 'weeks' | 'custom';

export interface Budget {
  id: number;
  workspace_id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  display_order: number;
  display_currency_code: string | null;
  cadence: Cadence;
  cadence_weeks: number | null;
  cadence_anchor: string | null;
  created_at: string;
}

export interface Period {
  id: number;
  budget_id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_custom: boolean;
}

export interface Category {
  id: number;
  budget_id: number;
  name: string;
  is_archived: boolean;
  created_at: string;
}

export interface CategoryBudget {
  id: number;
  period_id: number;
  category_id: number;
  currency_code: string;
  amount: string;
}

export type TransactionType = 'income' | 'expense' | 'adjustment';

export interface Transaction {
  id: number;
  workspace_id: number;
  account_id: number;
  account_name: string;
  currency_code: string;
  date: string;
  description: string;
  category_id: number | null;
  category_name: string | null;
  amount: string;
  type: TransactionType;
  original_amount: string | null;
  original_currency_code: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TransactionItem {
  id: number;
  position: number;
  name: string;
  quantity: string;
  unit_price: string | null;
  line_total: string | null;
}

export interface TransactionItemInput {
  name: string;
  quantity?: string;
  unit_price?: string | null;
  line_total?: string | null;
}

export interface TransactionItemsResponse {
  items: TransactionItem[];
  items_total: string;
}

export type ExtractionStatus = 'none' | 'pending' | 'done' | 'failed';

export interface TransactionAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
  download_url: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string;
}

export interface ParsedReceiptItem {
  name: string;
  quantity: string;
  unit_price: string | null;
  line_total: string | null;
  confidence: number;
}

export interface ParsedReceipt {
  schema_version: string;
  merchant: string | null;
  date: string | null;
  currency: string | null;
  total: string | null;
  items: ParsedReceiptItem[];
  confidence: {
    merchant: number;
    date: number;
    currency: number;
    total: number;
    items: number;
  };
  warnings: string[];
}

export interface ExtractionResult {
  status: ExtractionStatus;
  error: string;
  result: ParsedReceipt | null;
}

export interface Transfer {
  id: number;
  workspace_id: number;
  from_account_id: number;
  from_account_name: string;
  from_currency_code: string;
  from_amount: string;
  to_account_id: number;
  to_account_name: string;
  to_currency_code: string;
  to_amount: string;
  date: string;
  description: string;
  rate: string | null;
  created_at: string;
}

export interface PlannedTransaction {
  id: number;
  workspace_id: number;
  account_id: number;
  account_name: string;
  currency_code: string;
  name: string;
  amount: string;
  category_id: number | null;
  category: { id: number; budget_id: number; name: string } | null;
  planned_date: string;
  payment_date: string | null;
  status: 'pending' | 'done' | 'cancelled';
  transaction_id: number | null;
  created_at: string;
  updated_at: string | null;
}

// ============= Reports =============

export interface BudgetSummaryItem {
  category_id: number;
  category_name: string;
  currency_code: string;
  planned: string;
  actual: string;
  remaining: string;
}

export interface BudgetSummaryResponse {
  budget: { id: number; name: string };
  period: { id: number; name: string; start_date: string; end_date: string };
  items: BudgetSummaryItem[];
  totals: Record<string, { planned: string; actual: string; remaining: string }>;
}

export interface AccountBalanceRow {
  account_id: number;
  account_name: string;
  currency_code: string;
  is_archived: boolean;
  balance: string;
}

export interface CurrentBalancesResponse {
  accounts: AccountBalanceRow[];
  totals: Record<string, string>;
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
  workspace_name: string;
  currency_code?: string;
  start_with_sample_data?: boolean;
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

// ============= Totals Types =============
export interface TransactionTotalItem {
  group: string; // "income"/"expense" or category name
  currency: string;
  total: string;
}

export interface TransactionTotalsResponse {
  totals?: TransactionTotalItem[];
  by_type?: TransactionTotalItem[];
  by_category?: TransactionTotalItem[];
}

export interface PlannedTransactionTotalItem {
  group: string;
  currency: string;
  total: string;
}

export interface PlannedTransactionTotalsResponse {
  totals: PlannedTransactionTotalItem[];
}

// ============= Frequent Descriptions Types =============
export interface FrequentDescriptionItem {
  description: string;
  count: number;
  total: string;
  currency: string;
}

export interface FrequentDescriptionsResponse {
  items: FrequentDescriptionItem[];
}

// ============= Import Types =============
export interface ImportResult {
  imported_workspaces: number;
  imported_accounts: number;
  imported_budgets: number;
  imported_categories: number;
  imported_transactions: number;
  imported_transfers: number;
  imported_planned_transactions: number;
  skipped: Record<string, string[]>;
  renamed: Record<string, string>;
}

export interface LegacyImportResult {
  workspaces: Array<{
    workspace_name: string;
    created: Record<string, number>;
    deduped_transactions: Array<{
      date: string | null;
      description: string | null;
      amount: string;
      type: string;
      currency_code: string | null;
    }>;
    balances: Array<{
      currency_code: string;
      account_name: string;
      expected_closing_balance: string | null;
      computed_balance: string;
      matches: boolean;
    }>;
    warnings: string[];
  }>;
  renamed: Record<string, string>;
  skipped_workspaces: string[];
}

// ============= Enums =============

export const TotalsLabel = {
  /** Display label for records without a category. Synced with backend common.enums.TotalsLabel. */
  UNCATEGORIZED: 'Uncategorized',
} as const;
