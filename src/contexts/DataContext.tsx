import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppData, Account, Period, BalanceEntry, Transaction, ExchangeRateEntry, ComputedData } from '../types';
import { loadFromStorage, saveToStorage, loadComputed, saveComputed } from '../utils/storage';
import { getExchangeRate } from '../utils/currency';
import { buildComputedData } from '../utils/calculations';

interface DataContextValue {
  data: AppData | null;
  computed: ComputedData | null;
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
  upsertExchangeRates: (entries: ExchangeRateEntry[]) => void;
  fetchRate: (date: string, from: string, to: string) => Promise<number>;
  refetchMissingRates: () => Promise<{ fixed: number; failed: number }>;
  recalculate: () => void;
  clearData: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<AppData | null>(() => loadFromStorage());
  const [computed, setComputedState] = useState<ComputedData | null>(() => loadComputed());

  // Recompute the derived layer whenever source data changes.
  useEffect(() => {
    if (!data) {
      setComputedState(null);
      saveComputed(null);
      return;
    }
    const newComputed = buildComputedData(data);
    setComputedState(newComputed);
    saveComputed(newComputed);
  }, [data]);

  // Centralised mutation helper — saves source data immediately.
  const mutate = useCallback((fn: (d: AppData) => AppData) => {
    setDataState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveToStorage(next);
      return next;
    });
  }, []);

  const setData = useCallback((newData: AppData) => {
    saveToStorage(newData);
    setDataState(newData);
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

  const addPeriod = useCallback((period: Period, entries: BalanceEntry[]) => {
    mutate((d) => ({
      ...d,
      periods: [...d.periods, period],
      balanceEntries: [...d.balanceEntries, ...entries],
    }));
  }, [mutate]);

  const updatePeriod = useCallback((period: Period, entries: BalanceEntry[]) => {
    mutate((d) => ({
      ...d,
      periods: d.periods.map((p) => (p.id === period.id ? period : p)),
      balanceEntries: [
        ...d.balanceEntries.filter((e) => e.periodId !== period.id),
        ...entries,
      ],
    }));
  }, [mutate]);

  const deletePeriod = useCallback((periodId: string) => {
    mutate((d) => ({
      ...d,
      periods: d.periods.filter((p) => p.id !== periodId),
      balanceEntries: d.balanceEntries.filter((e) => e.periodId !== periodId),
      transactions: d.transactions.filter((t) => t.periodId !== periodId),
    }));
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
      return { ...d, balanceEntries: newEntries };
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
      return { ...d, balanceEntries: newEntries };
    });
  }, [mutate]);

  const upsertTransaction = useCallback((tx: Transaction) => {
    mutate((d) => {
      const exists = d.transactions.some((t) => t.id === tx.id);
      return {
        ...d,
        transactions: exists
          ? d.transactions.map((t) => (t.id === tx.id ? tx : t))
          : [...d.transactions, tx],
      };
    });
  }, [mutate]);

  const deleteTransaction = useCallback((txId: string) => {
    mutate((d) => ({
      ...d,
      transactions: d.transactions.filter((t) => t.id !== txId),
    }));
  }, [mutate]);

  const upsertExchangeRates = useCallback((entries: ExchangeRateEntry[]) => {
    mutate((d) => {
      let rates = [...d.exchangeRates];
      for (const e of entries) {
        rates = rates.filter((r) => !(r.from === e.from && r.to === e.to && r.date === e.date));
        rates.push(e);
      }
      return { ...d, exchangeRates: rates };
    });
  }, [mutate]);

  const fetchRate = useCallback(
    async (date: string, from: string, to: string): Promise<number> => {
      if (from === to) return 1;
      if (!data) throw new Error('No data');

      const existing = data.exchangeRates.find(
        (r) => r.from === from && r.to === to && r.date === date,
      );
      if (existing) return existing.rate;

      const rate = await getExchangeRate(date, from, to);
      mutate((d) => {
        const filtered = d.exchangeRates.filter(
          (r) => !(r.from === from && r.to === to && r.date === date),
        );
        return { ...d, exchangeRates: [...filtered, { date, from, to, rate }] };
      });
      return rate;
    },
    [data, mutate],
  );

  const refetchMissingRates = useCallback(async (): Promise<{ fixed: number; failed: number }> => {
    if (!data) return { fixed: 0, failed: 0 };
    const baseCurrency = data.meta.baseCurrency;
    let fixed = 0, failed = 0;
    const newRates: ExchangeRateEntry[] = [...data.exchangeRates];

    // Collect all (from, to, date) pairs referenced by the data that are missing a rate.
    const needed = new Set<string>();
    for (const e of data.balanceEntries) {
      const acc = data.accounts.find((a) => a.id === e.accountId);
      const period = data.periods.find((p) => p.id === e.periodId);
      if (acc && period && acc.currency !== baseCurrency)
        needed.add(`${acc.currency}|${baseCurrency}|${period.date}`);
    }
    for (const t of data.transactions) {
      if (t.currency !== baseCurrency)
        needed.add(`${t.currency}|${baseCurrency}|${t.date}`);
    }

    for (const key of needed) {
      const [from, to, date] = key.split('|');
      if (newRates.some((r) => r.from === from && r.to === to && r.date === date)) continue;
      try {
        const rate = await getExchangeRate(date, from, to);
        newRates.push({ date, from, to, rate });
        fixed++;
      } catch {
        failed++;
      }
    }

    if (fixed > 0) {
      mutate((d) => ({ ...d, exchangeRates: newRates }));
    }

    return { fixed, failed };
  }, [data, mutate]);

  const recalculate = useCallback(() => {
    if (!data) return;
    const newComputed = buildComputedData(data);
    setComputedState(newComputed);
    saveComputed(newComputed);
  }, [data]);

  const clearData = useCallback(() => {
    setDataState(null);
    setComputedState(null);
    localStorage.removeItem('minimonee_data');
    localStorage.removeItem('minimonee_computed');
  }, []);

  return (
    <DataContext.Provider
      value={{
        data,
        computed,
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
        upsertExchangeRates,
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
