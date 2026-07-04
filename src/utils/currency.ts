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

export async function getExchangeRate(date: string, from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const errors: string[] = [];

  const base = window.location.hostname === 'localhost'
    ? '/api/rates'
    : 'https://api.frankfurter.app';

  const urls = [
    `${base}/${date}?from=${from}&to=${to}`,
    `${base}/latest?from=${from}&to=${to}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`HTTP ${res.status} from Frankfurter API`);
        continue;
      }
      const json = await res.json();
      const rate = json.rates?.[to];
      if (rate !== undefined) return rate;
      errors.push(`API responded but returned no rate for ${to} (unsupported pair?)`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(
    `Cannot fetch ${from}→${to} rate for ${date}. ${errors.join('; ')}`,
  );
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
