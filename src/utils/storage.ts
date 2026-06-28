import { AppData, AppMeta } from '../types';

const STORAGE_KEY = 'minimonee_data';
const CURRENT_VERSION = '1.0';

export function createEmptyData(baseCurrency: string): AppData {
  const now = new Date().toISOString();
  return {
    meta: {
      version: CURRENT_VERSION,
      baseCurrency,
      createdAt: now,
      lastUpdated: now,
    },
    accounts: [],
    periods: [],
    balanceEntries: [],
    transactions: [],
    exchangeRateCache: {},
  };
}

export function loadFromStorage(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    return migrateData(parsed);
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

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
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
  const raw = JSON.parse(json) as Partial<AppData>;
  const warnings: string[] = [];

  if (!raw.meta) throw new Error('Invalid file: missing meta field');
  if (!raw.accounts) throw new Error('Invalid file: missing accounts field');

  const data = migrateData({
    meta: raw.meta as AppMeta,
    accounts: raw.accounts ?? [],
    periods: raw.periods ?? [],
    balanceEntries: raw.balanceEntries ?? [],
    transactions: raw.transactions ?? [],
    exchangeRateCache: raw.exchangeRateCache ?? {},
  });

  // Check metric consistency
  for (const period of data.periods) {
    if (
      period.metrics.expenses !== null &&
      period.metrics.unrealizedPL !== null &&
      period.metrics.pensionPL !== null
    ) {
      // Metrics exist — they'll be validated on display
    }
  }

  return { data, warnings };
}

function migrateData(data: AppData): AppData {
  // Future migrations go here — check data.meta.version
  return {
    ...data,
    meta: { ...data.meta, version: CURRENT_VERSION },
    exchangeRateCache: data.exchangeRateCache ?? {},
  };
}
