export type AccountCategory =
  | 'cash'
  | 'pension'
  | 'real_estate'
  | 'liabilities'
  | 'investments'
  | 'others';

export type TransactionType =
  | 'income_employment'
  | 'income_dividend'
  | 'income_interest'
  | 'income_rental'
  | 'income_other'
  | 'tax_paid'
  | 'investment'
  | 'pension_activity';

export interface Account {
  id: string;
  name: string;
  category: AccountCategory;
  currency: string;
  isActive: boolean;
  createdAt: string;
  closedAt: string | null;
  notes?: string;
}

export interface BalanceEntry {
  id: string;
  periodId: string;
  accountId: string;
  value: number;
}

export interface Transaction {
  id: string;
  periodId: string | null;
  date: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string;
}

export interface ExchangeRateEntry {
  date: string;
  from: string;
  to: string;
  rate: number;
}

export interface PeriodMetrics {
  totalNetWorth: number;
  netWorthByCategory: Partial<Record<AccountCategory, number>>;
  expenses: number | null;
  unrealizedPL: number | null;
  pensionPL: number | null;
}

export interface Period {
  id: string;
  date: string;
  note: string;
}

export interface AppMeta {
  version: string;
  baseCurrency: string;
  userName?: string;
  createdAt: string;
  lastUpdated: string;
}

export interface AppData {
  meta: AppMeta;
  accounts: Account[];
  periods: Period[];
  balanceEntries: BalanceEntry[];
  transactions: Transaction[];
  exchangeRates: ExchangeRateEntry[];
}

export interface ComputedData {
  generatedAt: string;
  periodMetrics: Record<string, PeriodMetrics>;
}

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  cash: 'Cash Accounts',
  pension: 'Pension',
  real_estate: 'Real Estate',
  liabilities: 'Liabilities',
  investments: 'Investments',
  others: 'Others',
};

export const CATEGORY_COLORS: Record<AccountCategory, string> = {
  cash:        '#059669', // emerald-600  — was #10b981, contrast too low vs white
  pension:     '#6366f1', // indigo-500
  real_estate: '#b45309', // amber-700    — was #f59e0b, contrast too low vs white
  liabilities: '#ef4444', // red-500
  investments: '#8b5cf6', // violet-500
  others:      '#0891b2', // sky-600      — was #6b7280, below chroma floor (read as gray)
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  income_employment: 'Employment',
  income_dividend:   'Dividend',
  income_interest:   'Interest',
  income_rental:     'Rental',
  income_other:      'Other Income',
  tax_paid:          'Taxes Paid',
  investment:        'Investment',
  pension_activity:  'Pension',
};

export const ALL_CATEGORIES: AccountCategory[] = [
  'cash',
  'pension',
  'real_estate',
  'liabilities',
  'investments',
  'others',
];
