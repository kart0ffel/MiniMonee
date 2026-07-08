import {
  AppData,
  Account,
  BalanceEntry,
  Period,
  PeriodMetrics,
  Transaction,
  AccountCategory,
  ALL_CATEGORIES,
  ExchangeRateEntry,
  ComputedData,
} from '../types';

// Exported so pages can do their own on-the-fly conversions.
export function getRate(rates: ExchangeRateEntry[], date: string, from: string, to: string): number {
  if (from === to) return 1;
  return rates.find((r) => r.from === from && r.to === to && r.date === date)?.rate ?? 0;
}

function sumEntries(
  entries: BalanceEntry[],
  accountIds: Set<string>,
  accounts: Account[],
  rates: ExchangeRateEntry[],
  baseCurrency: string,
  periodDate: string,
): number {
  return entries
    .filter((e) => accountIds.has(e.accountId))
    .reduce((acc, e) => {
      const account = accounts.find((a) => a.id === e.accountId);
      const currency = account?.currency ?? baseCurrency;
      const rate = currency === baseCurrency ? 1 : getRate(rates, periodDate, currency, baseCurrency);
      return acc + e.value * rate;
    }, 0);
}

function sumTx(
  txs: Transaction[],
  types: Transaction['type'][],
  baseCurrency: string,
  rates: ExchangeRateEntry[],
): number {
  return txs
    .filter((t) => types.includes(t.type))
    .reduce((acc, t) => {
      const rate = t.currency === baseCurrency ? 1 : getRate(rates, t.date, t.currency, baseCurrency);
      return acc + t.amount * rate;
    }, 0);
}

function getInvestFlows(
  txs: Transaction[],
  baseCurrency: string,
  rates: ExchangeRateEntry[],
): { bought: number; sold: number } {
  let bought = 0, sold = 0;
  for (const t of txs) {
    if (t.type === 'investment') {
      const rate = t.currency === baseCurrency ? 1 : getRate(rates, t.date, t.currency, baseCurrency);
      const amtInBase = t.amount * rate;
      if (amtInBase >= 0) bought += amtInBase;
      else sold -= amtInBase;
    }
  }
  return { bought, sold };
}

function getPensionFlows(
  txs: Transaction[],
  baseCurrency: string,
  rates: ExchangeRateEntry[],
): { contrib: number; withdraw: number } {
  let contrib = 0, withdraw = 0;
  for (const t of txs) {
    if (t.type === 'pension_activity') {
      const rate = t.currency === baseCurrency ? 1 : getRate(rates, t.date, t.currency, baseCurrency);
      const amtInBase = t.amount * rate;
      if (amtInBase >= 0) contrib += amtInBase;
      else withdraw -= amtInBase;
    }
  }
  return { contrib, withdraw };
}

export function computeMetrics(data: AppData, period: Period): PeriodMetrics {
  const { accounts, balanceEntries, transactions, exchangeRates, meta: { baseCurrency } } = data;
  const periodEntries = balanceEntries.filter((e) => e.periodId === period.id);

  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const currentIdx = sortedPeriods.findIndex((p) => p.id === period.id);
  const prevPeriod = currentIdx > 0 ? sortedPeriods[currentIdx - 1] : null;

  const periodTxs = transactions.filter((t) => {
    if (t.date > period.date) return false;
    if (prevPeriod && t.date <= prevPeriod.date) return false;
    return true;
  });

  const netWorthByCategory: Partial<Record<AccountCategory, number>> = {};
  for (const cat of ALL_CATEGORIES) {
    const accountIds = new Set(
      accounts.filter((a) => a.category === cat).map((a) => a.id),
    );
    const total = sumEntries(periodEntries, accountIds, accounts, exchangeRates, baseCurrency, period.date);
    if (total !== 0 || periodEntries.some((e) => accountIds.has(e.accountId))) {
      netWorthByCategory[cat] = cat === 'liabilities' ? -total : total;
    }
  }

  const totalNetWorth = Object.values(netWorthByCategory).reduce((a, b) => a + (b ?? 0), 0);

  if (!prevPeriod) {
    return { totalNetWorth, netWorthByCategory, expenses: null, unrealizedPL: null, pensionPL: null };
  }

  const prevEntries = balanceEntries.filter((e) => e.periodId === prevPeriod.id);

  const cashAccountIds = new Set(
    accounts.filter((a) => a.category === 'cash').map((a) => a.id),
  );
  const startCash = sumEntries(prevEntries, cashAccountIds, accounts, exchangeRates, baseCurrency, prevPeriod.date);
  const endCash   = sumEntries(periodEntries, cashAccountIds, accounts, exchangeRates, baseCurrency, period.date);

  const income = sumTx(
    periodTxs,
    ['income_employment', 'income_dividend', 'income_interest', 'income_rental', 'income_other'],
    baseCurrency,
    exchangeRates,
  );
  const { bought: investBought, sold: investSold } = getInvestFlows(periodTxs, baseCurrency, exchangeRates);
  const netInvested = investBought - investSold;
  const taxesPaid = sumTx(periodTxs, ['tax_paid'], baseCurrency, exchangeRates);
  const { contrib: pensionContrib, withdraw: pensionWithdraw } = getPensionFlows(periodTxs, baseCurrency, exchangeRates);
  const expenses = startCash + income - investBought + investSold - taxesPaid - pensionContrib + pensionWithdraw - endCash;

  const investmentAccountIds = new Set(
    accounts.filter((a) => a.category === 'investments').map((a) => a.id),
  );
  const startInvest = sumEntries(prevEntries, investmentAccountIds, accounts, exchangeRates, baseCurrency, prevPeriod.date);
  const endInvest   = sumEntries(periodEntries, investmentAccountIds, accounts, exchangeRates, baseCurrency, period.date);
  const unrealizedPL = endInvest - startInvest - netInvested;

  const pensionAccountIds = new Set(
    accounts.filter((a) => a.category === 'pension').map((a) => a.id),
  );
  const startPension = sumEntries(prevEntries, pensionAccountIds, accounts, exchangeRates, baseCurrency, prevPeriod.date);
  const endPension   = sumEntries(periodEntries, pensionAccountIds, accounts, exchangeRates, baseCurrency, period.date);
  const pensionPL = endPension - startPension - (pensionContrib - pensionWithdraw);

  return { totalNetWorth, netWorthByCategory, expenses, unrealizedPL, pensionPL };
}

export function buildComputedData(data: AppData): ComputedData {
  const sorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const periodMetrics: Record<string, PeriodMetrics> = {};
  for (const period of sorted) {
    periodMetrics[period.id] = computeMetrics(data, period);
  }
  return { generatedAt: new Date().toISOString(), periodMetrics };
}

export interface WaterfallStep {
  name: string;
  value: number;
  base: number;
  isTotal: boolean;
  isNegative: boolean;
}

export function buildRangeWaterfallSteps(
  data: AppData,
  fromPeriod: Period,
  toPeriod: Period,
  prevFromPeriod: Period | null,
): WaterfallStep[] {
  const { accounts, balanceEntries, transactions, exchangeRates, meta: { baseCurrency } } = data;

  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const fromIdx = sortedPeriods.findIndex((p) => p.id === fromPeriod.id);
  const toIdx   = sortedPeriods.findIndex((p) => p.id === toPeriod.id);
  const periodsInRange = sortedPeriods.slice(fromIdx, toIdx + 1);

  const prevEntries = prevFromPeriod
    ? balanceEntries.filter((e) => e.periodId === prevFromPeriod.id)
    : [];
  const toEntries = balanceEntries.filter((e) => e.periodId === toPeriod.id);

  const cashIds = new Set(accounts.filter((a) => a.category === 'cash').map((a) => a.id));

  const startCash = sumEntries(prevEntries, cashIds, accounts, exchangeRates, baseCurrency, prevFromPeriod?.date ?? fromPeriod.date);
  const endCash   = sumEntries(toEntries,   cashIds, accounts, exchangeRates, baseCurrency, toPeriod.date);

  let income = 0, investBought = 0, investSold = 0;
  let taxesPaid = 0, pensionContrib = 0, pensionWithdraw = 0;

  for (let i = 0; i < periodsInRange.length; i++) {
    const period = periodsInRange[i];
    const prevForWindow = i === 0 ? prevFromPeriod : periodsInRange[i - 1];
    const txs = transactions.filter((t) => {
      if (t.date > period.date) return false;
      if (prevForWindow && t.date <= prevForWindow.date) return false;
      return true;
    });
    income += sumTx(txs, ['income_employment', 'income_dividend', 'income_interest', 'income_rental', 'income_other'], baseCurrency, exchangeRates);
    const inv = getInvestFlows(txs, baseCurrency, exchangeRates);
    investBought += inv.bought;
    investSold   += inv.sold;
    taxesPaid    += sumTx(txs, ['tax_paid'], baseCurrency, exchangeRates);
    const pen = getPensionFlows(txs, baseCurrency, exchangeRates);
    pensionContrib  += pen.contrib;
    pensionWithdraw += pen.withdraw;
  }

  const expenses = startCash + income - investBought + investSold - taxesPaid - pensionContrib + pensionWithdraw - endCash;

  return buildSteps(startCash, endCash, income, investBought, investSold, taxesPaid, pensionContrib, pensionWithdraw, expenses);
}

export function buildWaterfallSteps(
  data: AppData,
  period: Period,
  prevPeriod: Period | null,
): WaterfallStep[] {
  const { accounts, balanceEntries, transactions, exchangeRates, meta: { baseCurrency } } = data;
  const periodEntries = balanceEntries.filter((e) => e.periodId === period.id);
  const prevEntries   = prevPeriod ? balanceEntries.filter((e) => e.periodId === prevPeriod.id) : [];

  const periodTxs = transactions.filter((t) => {
    if (t.date > period.date) return false;
    if (prevPeriod && t.date <= prevPeriod.date) return false;
    return true;
  });

  const cashIds = new Set(accounts.filter((a) => a.category === 'cash').map((a) => a.id));

  const startCash = sumEntries(prevEntries, cashIds, accounts, exchangeRates, baseCurrency, prevPeriod?.date ?? period.date);
  const endCash   = sumEntries(periodEntries, cashIds, accounts, exchangeRates, baseCurrency, period.date);

  const income = sumTx(periodTxs, ['income_employment', 'income_dividend', 'income_interest', 'income_rental', 'income_other'], baseCurrency, exchangeRates);
  const { bought: investBought, sold: investSold } = getInvestFlows(periodTxs, baseCurrency, exchangeRates);
  const taxesPaid = sumTx(periodTxs, ['tax_paid'], baseCurrency, exchangeRates);
  const { contrib: pensionContrib, withdraw: pensionWithdraw } = getPensionFlows(periodTxs, baseCurrency, exchangeRates);
  const expenses = startCash + income - investBought + investSold - taxesPaid - pensionContrib + pensionWithdraw - endCash;

  return buildSteps(startCash, endCash, income, investBought, investSold, taxesPaid, pensionContrib, pensionWithdraw, expenses);
}

function buildSteps(
  startCash: number, endCash: number,
  income: number, investBought: number, investSold: number,
  taxesPaid: number, pensionContrib: number, pensionWithdraw: number,
  expenses: number,
): WaterfallStep[] {
  const steps: Array<{ name: string; delta: number }> = [
    { name: 'Start Cash',      delta: startCash },
    { name: 'Income',          delta: income },
    { name: 'Invest. Bought',  delta: -investBought },
    { name: 'Invest. Sold',    delta: investSold },
    { name: 'Taxes Paid',      delta: -taxesPaid },
    { name: 'Pension Out',     delta: -pensionContrib },
    { name: 'Pension In',      delta: pensionWithdraw },
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
