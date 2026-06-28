export type AccountCategory =
  | 'cash'
  | 'pension'
  | 'real_estate'
  | 'liabilities'
  | 'brokerage'
  | 'stocks'
  | 'others';

export type TransactionType =
  | 'income_salary'
  | 'income_dividend'
  | 'tax_paid'
  | 'investment_bought'
  | 'investment_sold'
  | 'pension_contribution'
  | 'pension_withdrawal';

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
  valueInBase: number;
  exchangeRate: number;
}

export interface Transaction {
  id: string;
  periodId: string;
  date: string;
  type: TransactionType;
  amount: number;
  currency: string;
  amountInBase: number;
  exchangeRate: number;
  description: string;
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
  metrics: PeriodMetrics;
}

export interface ExchangeRateCache {
  [key: string]: number;
}

export interface AppMeta {
  version: string;
  baseCurrency: string;
  createdAt: string;
  lastUpdated: string;
}

export interface AppData {
  meta: AppMeta;
  accounts: Account[];
  periods: Period[];
  balanceEntries: BalanceEntry[];
  transactions: Transaction[];
  exchangeRateCache: ExchangeRateCache;
}

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  cash: 'Cash Accounts',
  pension: 'Pension',
  real_estate: 'Real Estate',
  liabilities: 'Liabilities',
  brokerage: 'Brokerage',
  stocks: 'Stocks',
  others: 'Others',
};

export const CATEGORY_COLORS: Record<AccountCategory, string> = {
  cash: '#10b981',
  pension: '#6366f1',
  real_estate: '#f59e0b',
  liabilities: '#ef4444',
  brokerage: '#3b82f6',
  stocks: '#8b5cf6',
  others: '#6b7280',
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  income_salary: 'Salary / Income',
  income_dividend: 'Dividends',
  tax_paid: 'Taxes Paid',
  investment_bought: 'Investment Bought',
  investment_sold: 'Investment Sold',
  pension_contribution: 'Pension Contribution',
  pension_withdrawal: 'Pension Withdrawal',
};

export const ALL_CATEGORIES: AccountCategory[] = [
  'cash',
  'pension',
  'real_estate',
  'liabilities',
  'brokerage',
  'stocks',
  'others',
];
