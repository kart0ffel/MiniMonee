import { AppData, ComputedData, ExchangeRateEntry } from '../types';

const STORAGE_KEY = 'minimonee_data';
const COMPUTED_KEY = 'minimonee_computed';
const CURRENT_VERSION = '2.0';

export function createEmptyData(baseCurrency: string, userName?: string): AppData {
  const now = new Date().toISOString();
  return {
    meta: {
      version: CURRENT_VERSION,
      baseCurrency,
      ...(userName ? { userName } : {}),
      createdAt: now,
      lastUpdated: now,
    },
    accounts: [],
    periods: [],
    balanceEntries: [],
    transactions: [],
    exchangeRates: [],
  };
}

export function loadFromStorage(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveToStorage(data: AppData): void {
  try {
    const updated: AppData = {
      ...data,
      meta: { ...data.meta, lastUpdated: new Date().toISOString() },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

export function loadComputed(): ComputedData | null {
  try {
    const raw = localStorage.getItem(COMPUTED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ComputedData;
  } catch {
    return null;
  }
}

export function saveComputed(computed: ComputedData | null): void {
  try {
    if (computed === null) {
      localStorage.removeItem(COMPUTED_KEY);
    } else {
      localStorage.setItem(COMPUTED_KEY, JSON.stringify(computed));
    }
  } catch (e) {
    console.error('Failed to save computed to localStorage', e);
  }
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(COMPUTED_KEY);
}

export function exportToJson(data: AppData): void {
  const updated: AppData = {
    ...data,
    meta: { ...data.meta, lastUpdated: new Date().toISOString() },
  };
  const json = JSON.stringify(updated, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minimonee_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromJson(json: string): { data: AppData; warnings: string[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = JSON.parse(json) as any;
  const warnings: string[] = [];

  if (!raw.meta) throw new Error('Invalid file: missing meta field');
  if (!raw.accounts) throw new Error('Invalid file: missing accounts field');

  const data = migrateData(raw);
  return { data, warnings };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateData(raw: any): AppData {
  const baseCurrency: string = raw.meta?.baseCurrency ?? 'USD';

  // Build exchange rates table from whatever the file provides
  const rateMap = new Map<string, ExchangeRateEntry>();

  function addRate(date: string, from: string, to: string, rate: number) {
    const key = `${date}|${from}|${to}`;
    if (!rateMap.has(key)) rateMap.set(key, { date, from, to, rate });
  }

  // New format: exchangeRates array
  if (Array.isArray(raw.exchangeRates)) {
    for (const r of raw.exchangeRates) {
      if (r.date && r.from && r.to && r.rate) addRate(r.date, r.from, r.to, r.rate);
    }
  }

  // Old format: flat exchangeRateCache keyed as "date|from|to"
  if (raw.exchangeRateCache && typeof raw.exchangeRateCache === 'object') {
    for (const [key, rate] of Object.entries(raw.exchangeRateCache as Record<string, number>)) {
      const parts = key.split('|');
      if (parts.length === 3) addRate(parts[0], parts[1], parts[2], rate);
    }
  }

  // Old format: rates embedded per-transaction
  if (Array.isArray(raw.transactions)) {
    for (const t of raw.transactions) {
      if (t.exchangeRate && t.exchangeRate !== 0 && t.currency && t.date && t.currency !== baseCurrency) {
        addRate(t.date, t.currency, baseCurrency, t.exchangeRate);
      }
    }
  }

  // Old format: rates embedded per-balance-entry
  if (Array.isArray(raw.balanceEntries) && Array.isArray(raw.accounts)) {
    for (const e of raw.balanceEntries) {
      if (e.exchangeRate && e.exchangeRate !== 0) {
        const acc = raw.accounts.find((a: { id: string }) => a.id === e.accountId);
        const period = raw.periods?.find((p: { id: string }) => p.id === e.periodId);
        if (acc && period && acc.currency !== baseCurrency) {
          addRate(period.date, acc.currency, baseCurrency, e.exchangeRate);
        }
      }
    }
  }

  return {
    meta: { ...raw.meta, version: CURRENT_VERSION },
    accounts: (raw.accounts ?? []).map((a: Record<string, unknown>) => ({
      id: a.id, name: a.name, category: a.category, currency: a.currency,
      isActive: a.isActive, createdAt: a.createdAt, closedAt: a.closedAt ?? null,
      ...(a.notes ? { notes: a.notes } : {}),
    })),
    periods: (raw.periods ?? []).map((p: Record<string, unknown>) => ({
      id: p.id, date: p.date, note: p.note ?? '',
    })),
    balanceEntries: (raw.balanceEntries ?? []).map((e: Record<string, unknown>) => ({
      id: e.id, periodId: e.periodId, accountId: e.accountId, value: e.value,
    })),
    transactions: (raw.transactions ?? []).map((t: Record<string, unknown>) => ({
      id: t.id, periodId: t.periodId ?? null, date: t.date, type: t.type,
      amount: t.amount, currency: t.currency, description: t.description ?? '',
    })),
    exchangeRates: [...rateMap.values()],
  };
}
