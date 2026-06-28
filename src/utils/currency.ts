import { ExchangeRateCache } from '../types';

export const CURRENCIES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR',
  'GBP', 'HKD', 'HUF', 'INR', 'JPY', 'MXN', 'NOK', 'NZD',
  'PLN', 'SEK', 'SGD', 'USD', 'ZAR',
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: 'A$', BRL: 'R$', CAD: 'C$', CHF: 'Fr', CNY: '¥',
  CZK: 'Kč', DKK: 'kr', EUR: '€', GBP: '£', HKD: 'HK$',
  HUF: 'Ft', INR: '₹', JPY: '¥', MXN: '$', NOK: 'kr',
  NZD: 'NZ$', PLN: 'zł', SEK: 'kr', SGD: 'S$', USD: '$', ZAR: 'R',
};

function cacheKey(date: string, from: string, to: string): string {
  return `${date}|${from}|${to}`;
}

export async function getExchangeRate(
  date: string,
  from: string,
  to: string,
  cache: ExchangeRateCache,
): Promise<{ rate: number; key: string }> {
  if (from === to) return { rate: 1, key: cacheKey(date, from, to) };

  const key = cacheKey(date, from, to);
  if (cache[key] !== undefined) return { rate: cache[key], key };

  // Try historical date first, fall back to latest
  const urls = [
    `https://api.frankfurter.app/${date}?from=${from}&to=${to}`,
    `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data.rates?.[to];
      if (rate !== undefined) return { rate, key };
    } catch {
      // try next
    }
  }

  throw new Error(`Could not fetch exchange rate ${from}→${to} for ${date}`);
}

export function formatCurrency(value: number, currency: string, compact = false): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (compact) {
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  }

  return `${sign}${sym}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatCurrencyFull(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
