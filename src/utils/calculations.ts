import {
  AppData,
  BalanceEntry,
  Period,
  PeriodMetrics,
  Transaction,
  AccountCategory,
  ALL_CATEGORIES,
} from '../types';

function sumEntries(entries: BalanceEntry[], accountIds: Set<string>): number {
  return entries
    .filter((e) => accountIds.has(e.accountId))
    .reduce((acc, e) => acc + e.valueInBase, 0);
}

function sumTx(
  txs: Transaction[],
  types: Transaction['type'][],
): number {
  return txs
    .filter((t) => types.includes(t.type))
    .reduce((acc, t) => acc + t.amountInBase, 0);
}

// Handles both legacy split types and new signed unified types.
// Returns bought and sold as positive numbers.
function getInvestFlows(txs: Transaction[]): { bought: number; sold: number } {
  let bought = 0, sold = 0;
  for (const t of txs) {
    const type = t.type as string;
    if (type === 'investment_bought') bought += t.amountInBase;
    else if (type === 'investment_sold') sold += t.amountInBase;
    else if (type === 'investment') {
      if (t.amountInBase >= 0) bought += t.amountInBase;
      else sold -= t.amountInBase;
    }
  }
  return { bought, sold };
}

function getPensionFlows(txs: Transaction[]): { contrib: number; withdraw: number } {
  let contrib = 0, withdraw = 0;
  for (const t of txs) {
    const type = t.type as string;
    if (type === 'pension_contribution') contrib += t.amountInBase;
    else if (type === 'pension_withdrawal') withdraw += t.amountInBase;
    else if (type === 'pension_activity') {
      if (t.amountInBase >= 0) contrib += t.amountInBase;
      else withdraw -= t.amountInBase;
    }
  }
  return { contrib, withdraw };
}

export function computeMetrics(
  data: AppData,
  period: Period,
): PeriodMetrics {
  const periodEntries = data.balanceEntries.filter((e) => e.periodId === period.id);

  // Find surrounding periods first so we can do date-range transaction filtering
  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const currentIdx = sortedPeriods.findIndex((p) => p.id === period.id);
  const prevPeriod = currentIdx > 0 ? sortedPeriods[currentIdx - 1] : null;

  // Transactions whose date falls in this period's window (standalone or legacy period-linked)
  const periodTxs = data.transactions.filter((t) => {
    if (t.date > period.date) return false;
    if (prevPeriod && t.date <= prevPeriod.date) return false;
    return true;
  });

  // Net worth by category
  const netWorthByCategory: Partial<Record<AccountCategory, number>> = {};
  for (const cat of ALL_CATEGORIES) {
    const accountIds = new Set(
      data.accounts
        .filter((a) => a.category === cat)
        .map((a) => a.id),
    );
    const total = sumEntries(periodEntries, accountIds);
    if (total !== 0 || periodEntries.some((e) => accountIds.has(e.accountId))) {
      netWorthByCategory[cat] = total;
    }
  }

  const totalNetWorth = Object.values(netWorthByCategory).reduce((a, b) => a + (b ?? 0), 0);

  if (!prevPeriod) {
    return { totalNetWorth, netWorthByCategory, expenses: null, unrealizedPL: null, pensionPL: null };
  }

  const prevEntries = data.balanceEntries.filter((e) => e.periodId === prevPeriod.id);

  // --- Expenses ---
  const cashAccountIds = new Set(
    data.accounts.filter((a) => a.category === 'cash').map((a) => a.id),
  );
  const startCash = sumEntries(prevEntries, cashAccountIds);
  const endCash = sumEntries(periodEntries, cashAccountIds);
  const income = sumTx(periodTxs, ['income_salary', 'income_dividend']);
  const { bought: investBought, sold: investSold } = getInvestFlows(periodTxs);
  const netInvested = investBought - investSold;
  const taxesPaid = sumTx(periodTxs, ['tax_paid']);
  const { contrib: pensionContrib, withdraw: pensionWithdraw } = getPensionFlows(periodTxs);
  const expenses = startCash + income - investBought + investSold - taxesPaid - pensionContrib + pensionWithdraw - endCash;

  // --- Unrealized P&L (stocks) ---
  const investmentAccountIds = new Set(
    data.accounts
      .filter((a) => a.category === 'stocks')
      .map((a) => a.id),
  );
  const startStocks = sumEntries(prevEntries, investmentAccountIds);
  const endStocks = sumEntries(periodEntries, investmentAccountIds);
  const unrealizedPL = endStocks - startStocks - netInvested;

  // --- Pension P&L ---
  const pensionAccountIds = new Set(
    data.accounts.filter((a) => a.category === 'pension').map((a) => a.id),
  );
  const startPension = sumEntries(prevEntries, pensionAccountIds);
  const endPension = sumEntries(periodEntries, pensionAccountIds);
  const netPensionInput = pensionContrib - pensionWithdraw;
  const pensionPL = endPension - startPension - netPensionInput;

  return { totalNetWorth, netWorthByCategory, expenses, unrealizedPL, pensionPL };
}

export function recalculateAllMetrics(data: AppData): AppData {
  const sorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const updatedPeriods = sorted.map((period) => ({
    ...period,
    metrics: computeMetrics(data, period),
  }));

  return { ...data, periods: updatedPeriods };
}

export interface WaterfallStep {
  name: string;
  value: number;
  base: number;
  isTotal: boolean;
  isNegative: boolean;
}

export function buildWaterfallSteps(
  data: AppData,
  period: Period,
  prevPeriod: Period | null,
): WaterfallStep[] {
  const periodEntries = data.balanceEntries.filter((e) => e.periodId === period.id);
  const prevEntries = prevPeriod
    ? data.balanceEntries.filter((e) => e.periodId === prevPeriod.id)
    : [];
  const periodTxs = data.transactions.filter((t) => {
    if (t.date > period.date) return false;
    if (prevPeriod && t.date <= prevPeriod.date) return false;
    return true;
  });

  const cashIds = new Set(
    data.accounts.filter((a) => a.category === 'cash').map((a) => a.id),
  );

  const startCash = sumEntries(prevEntries, cashIds);
  const endCash = sumEntries(periodEntries, cashIds);
  const income = sumTx(periodTxs, ['income_salary', 'income_dividend']);
  const { bought: investBought, sold: investSold } = getInvestFlows(periodTxs);
  const taxesPaid = sumTx(periodTxs, ['tax_paid']);
  const { contrib: pensionContrib, withdraw: pensionWithdraw } = getPensionFlows(periodTxs);

  // Expenses is the residual
  const expenses =
    startCash + income - investBought + investSold - taxesPaid - pensionContrib + pensionWithdraw - endCash;

  const steps: Array<{ name: string; delta: number }> = [
    { name: 'Start Cash', delta: startCash },
    { name: 'Income', delta: income },
    { name: 'Invest. Bought', delta: -investBought },
    { name: 'Invest. Sold', delta: investSold },
    { name: 'Taxes Paid', delta: -taxesPaid },
    { name: 'Pension Out', delta: -pensionContrib },
    { name: 'Pension In', delta: pensionWithdraw },
    { name: 'Living Expenses', delta: -expenses },
  ];

  const result: WaterfallStep[] = [];
  let running = 0;

  for (const step of steps) {
    if (step.name === 'Start Cash') {
      result.push({ name: step.name, value: step.delta, base: 0, isTotal: true, isNegative: false });
      running = step.delta;
    } else {
      const base = step.delta >= 0 ? running : running + step.delta;
      result.push({
        name: step.name,
        value: Math.abs(step.delta),
        base,
        isTotal: false,
        isNegative: step.delta < 0,
      });
      running += step.delta;
    }
  }

  result.push({ name: 'End Cash', value: endCash, base: 0, isTotal: true, isNegative: false });

  return result;
}
