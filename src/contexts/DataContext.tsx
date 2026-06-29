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
  addPeriod: (period: Period, entries: BalanceEntry[], transactions: Transaction[]) => void;
  updatePeriod: (period: Period, entries: BalanceEntry[], transactions: Transaction[]) => void;
  deletePeriod: (periodId: string) => void;
  upsertTransaction: (tx: Transaction) => void;
  deleteTransaction: (txId: string) => void;
  fetchRate: (date: string, from: string, to: string) => Promise<number>;
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
    (period: Period, entries: BalanceEntry[], transactions: Transaction[]) => {
      mutate((d) => {
        const newData: AppData = {
          ...d,
          periods: [...d.periods, period],
          balanceEntries: [...d.balanceEntries, ...entries],
          transactions: [...d.transactions, ...transactions],
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
    (period: Period, entries: BalanceEntry[], transactions: Transaction[]) => {
      mutate((d) => {
        const newData: AppData = {
          ...d,
          periods: d.periods.map((p) => (p.id === period.id ? period : p)),
          balanceEntries: [
            ...d.balanceEntries.filter((e) => e.periodId !== period.id),
            ...entries,
          ],
          transactions: [
            ...d.transactions.filter((t) => t.periodId !== period.id),
            ...transactions,
          ],
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
        fetchRate,
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
