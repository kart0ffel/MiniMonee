import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppData, Account, Period, BalanceEntry, Transaction } from '../types';
import { loadFromStorage, saveToStorage } from '../utils/storage';
import { getExchangeRate } from '../utils/currency';
import { computeMetrics, recalculateAllMetrics } from '../utils/calculations';

interface DataContextValue {
  data: AppData | null;
  setData: (data: AppData) => void;
  updateMeta: (updates: Partial<AppData['meta']>) => void;
  upsertAccount: (account: Account) => void;
  closeAccount: (accountId: string, closedAt: string) => void;
  deleteAccount: (accountId: string) => void;
  addPeriod: (period: Period, entries: BalanceEntry[]) => void;
  updatePeriod: (period: Period, entries: BalanceEntry[]) => void;
  deletePeriod: (periodId: string) => void;
  upsertTransaction: (tx: Transaction) => void;
  deleteTransaction: (txId: string) => void;
  upsertBalanceEntry: (entry: BalanceEntry) => void;
  batchUpsertBalanceEntries: (entries: BalanceEntry[]) => void;
  fetchRate: (date: string, from: string, to: string) => Promise<number>;
  refetchMissingRates: () => Promise<{ fixed: number; failed: number }>;
  recalculate: () => void;
  clearData: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<AppData | null>(() => loadFromStorage());

  const setData = useCallback((newData: AppData) => {
    setDataState(newData);
    saveToStorage(newData);
  }, []);

  useEffect(() => {
    if (data) saveToStorage(data);
  }, [data]);

  // Helper that runs mutations without stale closure issues
  const mutate = useCallback((fn: (d: AppData) => AppData) => {
    setDataState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveToStorage(next);
      return next;
    });
  }, []);

  const updateMeta = useCallback((updates: Partial<AppData['meta']>) => {
    mutate((d) => ({ ...d, meta: { ...d.meta, ...updates } }));
  }, [mutate]);

  const upsertAccount = useCallback((account: Account) => {
    mutate((d) => {
      const existing = d.accounts.findIndex((a) => a.id === account.id);
      const accounts =
        existing >= 0
          ? d.accounts.map((a) => (a.id === account.id ? account : a))
          : [...d.accounts, account];
      return { ...d, accounts };
    });
  }, [mutate]);

  const closeAccount = useCallback((accountId: string, closedAt: string) => {
    mutate((d) => ({
      ...d,
      accounts: d.accounts.map((a) =>
        a.id === accountId ? { ...a, isActive: false, closedAt } : a,
      ),
    }));
  }, [mutate]);

  const deleteAccount = useCallback((accountId: string) => {
    mutate((d) => ({
      ...d,
      accounts: d.accounts.filter((a) => a.id !== accountId),
      balanceEntries: d.balanceEntries.filter((e) => e.accountId !== accountId),
    }));
  }, [mutate]);

  const addPeriod = useCallback(
    (period: Period, entries: BalanceEntry[]) => {
      mutate((d) => {
        const newData: AppData = {
          ...d,
          periods: [...d.periods, period],
          balanceEntries: [...d.balanceEntries, ...entries],
        };
        const metrics = computeMetrics(newData, period);
        return {
          ...newData,
          periods: newData.periods.map((p) =>
            p.id === period.id ? { ...p, metrics } : p,
          ),
        };
      });
    },
    [mutate],
  );

  const updatePeriod = useCallback(
    (period: Period, entries: BalanceEntry[]) => {
      mutate((d) => {
        const newData: AppData = {
          ...d,
          periods: d.periods.map((p) => (p.id === period.id ? period : p)),
          balanceEntries: [
            ...d.balanceEntries.filter((e) => e.periodId !== period.id),
            ...entries,
          ],
          // Transactions are now standalone and not managed through periods
        };
        return recalculateAllMetrics(newData);
      });
    },
    [mutate],
  );

  const deletePeriod = useCallback((periodId: string) => {
    mutate((d) => {
      const newData: AppData = {
        ...d,
        periods: d.periods.filter((p) => p.id !== periodId),
        balanceEntries: d.balanceEntries.filter((e) => e.periodId !== periodId),
        transactions: d.transactions.filter((t) => t.periodId !== periodId),
      };
      return recalculateAllMetrics(newData);
    });
  }, [mutate]);

  const upsertBalanceEntry = useCallback((entry: BalanceEntry) => {
    mutate((d) => {
      const idx = d.balanceEntries.findIndex(
        (e) => e.accountId === entry.accountId && e.periodId === entry.periodId,
      );
      const merged = idx >= 0 ? { ...entry, id: d.balanceEntries[idx].id } : entry;
      const newEntries =
        idx >= 0
          ? d.balanceEntries.map((e, i) => (i === idx ? merged : e))
          : [...d.balanceEntries, merged];
      return recalculateAllMetrics({ ...d, balanceEntries: newEntries });
    });
  }, [mutate]);

  const batchUpsertBalanceEntries = useCallback((entries: BalanceEntry[]) => {
    mutate((d) => {
      let newEntries = [...d.balanceEntries];
      for (const entry of entries) {
        const idx = newEntries.findIndex(
          (e) => e.accountId === entry.accountId && e.periodId === entry.periodId,
        );
        if (idx >= 0) {
          newEntries[idx] = { ...entry, id: newEntries[idx].id };
        } else {
          newEntries = [...newEntries, entry];
        }
      }
      return recalculateAllMetrics({ ...d, balanceEntries: newEntries });
    });
  }, [mutate]);

  const upsertTransaction = useCallback((tx: Transaction) => {
    mutate((d) => {
      const exists = d.transactions.some((t) => t.id === tx.id);
      const newData: AppData = {
        ...d,
        transactions: exists
          ? d.transactions.map((t) => (t.id === tx.id ? tx : t))
          : [...d.transactions, tx],
      };
      return recalculateAllMetrics(newData);
    });
  }, [mutate]);

  const deleteTransaction = useCallback((txId: string) => {
    mutate((d) => {
      const newData: AppData = {
        ...d,
        transactions: d.transactions.filter((t) => t.id !== txId),
      };
      return recalculateAllMetrics(newData);
    });
  }, [mutate]);

  const fetchRate = useCallback(
    async (date: string, from: string, to: string): Promise<number> => {
      if (!data) throw new Error('No data');
      const { rate, key } = await getExchangeRate(date, from, to, data.exchangeRateCache);
      if (data.exchangeRateCache[key] === undefined) {
        mutate((d) => ({
          ...d,
          exchangeRateCache: { ...d.exchangeRateCache, [key]: rate },
        }));
      }
      return rate;
    },
    [data, mutate],
  );

  const refetchMissingRates = useCallback(async (): Promise<{ fixed: number; failed: number }> => {
    if (!data) return { fixed: 0, failed: 0 };
    const baseCurrency = data.meta.baseCurrency;
    let fixed = 0;
    let failed = 0;
    const newCache = { ...data.exchangeRateCache };

    const newEntries = await Promise.all(
      data.balanceEntries.map(async (e) => {
        if (e.exchangeRate !== 0) return e;
        const acc = data.accounts.find((a) => a.id === e.accountId);
        if (!acc || acc.currency === baseCurrency) return e;
        const period = data.periods.find((p) => p.id === e.periodId);
        if (!period) return e;
        try {
          const { rate, key } = await getExchangeRate(period.date, acc.currency, baseCurrency, newCache);
          newCache[key] = rate;
          fixed++;
          return { ...e, exchangeRate: rate, valueInBase: e.value * rate };
        } catch {
          failed++;
          return e;
        }
      }),
    );

    const newTxs = await Promise.all(
      data.transactions.map(async (t) => {
        if (t.exchangeRate !== 0 || t.currency === baseCurrency) return t;
        try {
          const { rate, key } = await getExchangeRate(t.date, t.currency, baseCurrency, newCache);
          newCache[key] = rate;
          fixed++;
          return { ...t, exchangeRate: rate, amountInBase: t.amount * rate };
        } catch {
          failed++;
          return t;
        }
      }),
    );

    mutate((d) =>
      recalculateAllMetrics({
        ...d,
        balanceEntries: newEntries,
        transactions: newTxs,
        exchangeRateCache: newCache,
      }),
    );

    return { fixed, failed };
  }, [data, mutate]);

  const recalculate = useCallback(() => {
    mutate((d) => recalculateAllMetrics(d));
  }, [mutate]);

  const clearData = useCallback(() => {
    setDataState(null);
    localStorage.removeItem('minimonee_data');
  }, []);

  return (
    <DataContext.Provider
      value={{
        data,
        setData,
        updateMeta,
        upsertAccount,
        closeAccount,
        deleteAccount,
        addPeriod,
        updatePeriod,
        deletePeriod,
        upsertTransaction,
        deleteTransaction,
        upsertBalanceEntry,
        batchUpsertBalanceEntries,
        fetchRate,
        refetchMissingRates,
        recalculate,
        clearData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
