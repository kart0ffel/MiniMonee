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

export function computeMetrics(
  data: AppData,
  period: Period,
): PeriodMetrics {
  const periodEntries = data.balanceEntries.filter((e) => e.periodId === period.id);
  const periodTxs = data.transactions.filter((t) => t.periodId === period.id);

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

  // Find previous period
  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const currentIdx = sortedPeriods.findIndex((p) => p.id === period.id);
  const prevPeriod = currentIdx > 0 ? sortedPeriods[currentIdx - 1] : null;

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
  const investBought = sumTx(periodTxs, ['investment_bought']);
  const investSold = sumTx(periodTxs, ['investment_sold']);
  const netInvested = investBought - investSold;
  const taxesPaid = sumTx(periodTxs, ['tax_paid']);
  const expenses = startCash + income - netInvested - taxesPaid - endCash;

  // --- Unrealized P&L (stocks + brokerage) ---
  const investmentAccountIds = new Set(
    data.accounts
      .filter((a) => a.category === 'stocks' || a.category === 'brokerage')
      .map((a) => a.id),
  );
  const startStocks = sumEntries(prevEntries, investmentAccountIds);
  const endStocks = sumEntries(periodEntries, investmentAccountIds);
  // Market gain only: end - start - net new money put in
  const unrealizedPL = endStocks - startStocks - netInvested;

  // --- Pension P&L ---
  const pensionAccountIds = new Set(
    data.accounts.filter((a) => a.category === 'pension').map((a) => a.id),
  );
  const startPension = sumEntries(prevEntries, pensionAccountIds);
  const endPension = sumEntries(periodEntries, pensionAccountIds);
  const pensionContrib = sumTx(periodTxs, ['pension_contribution']);
  const pensionWithdraw = sumTx(periodTxs, ['pension_withdrawal']);
  const netPensionInput = pensionContrib - pensionWithdraw;
  // Growth only: end - start - net contributions
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
  const periodTxs = data.transactions.filter((t) => t.periodId === period.id);

  const cashIds = new Set(
    data.accounts.filter((a) => a.category === 'cash').map((a) => a.id),
  );

  const startCash = sumEntries(prevEntries, cashIds);
  const endCash = sumEntries(periodEntries, cashIds);
  const income = sumTx(periodTxs, ['income_salary', 'income_dividend']);
  const investBought = sumTx(periodTxs, ['investment_bought']);
  const investSold = sumTx(periodTxs, ['investment_sold']);
  const taxesPaid = sumTx(periodTxs, ['tax_paid']);
  const pensionContrib = sumTx(periodTxs, ['pension_contribution']);
  const pensionWithdraw = sumTx(periodTxs, ['pension_withdrawal']);

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
