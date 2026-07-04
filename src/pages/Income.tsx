import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';
import { TRANSACTION_LABELS } from '../types';

type RangeKey = '1m' | '3m' | '6m' | '1Y' | '5Y' | 'all' | 'custom';
type Granularity = 'period' | 'month' | 'quarter' | 'year';

const INCOME_TYPES = [
  'income_employment',
  'income_dividend',
  'income_interest',
  'income_rental',
  'income_other',
] as const;

type IncomeType = typeof INCOME_TYPES[number];

// Fixed categorical order — slots 1-5 from the validated palette
const INCOME_COLORS: Record<IncomeType, string> = {
  income_employment: '#2a78d6',
  income_dividend:   '#1baf7a',
  income_interest:   '#eda100',
  income_rental:     '#008300',
  income_other:      '#4a3aa7',
};

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: '1m',     label: '1M'     },
  { key: '3m',     label: '3M'     },
  { key: '6m',     label: '6M'     },
  { key: '1Y',     label: '1Y'     },
  { key: '5Y',     label: '5Y'     },
  { key: 'all',    label: 'All'    },
  { key: 'custom', label: 'Custom' },
];

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'period',  label: 'Period'  },
  { key: 'month',   label: 'Month'   },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year'    },
];

function getRangeFrom(key: RangeKey): string | null {
  if (key === 'all' || key === 'custom') return null;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1Y': 12, '5Y': 60 }[key];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function assignToPeriod(txDate: string, periods: { id: string; date: string }[]): string {
  if (periods.length === 0) return txDate.slice(0, 7);
  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  return (sorted.find((p) => p.date >= txDate) ?? sorted[sorted.length - 1]).date;
}

function getBucketKey(
  date: string,
  granularity: Granularity,
  periodId: string | null,
  periods: { id: string; date: string }[],
): string {
  if (granularity === 'month') return date.slice(0, 7);
  if (granularity === 'year') return date.slice(0, 4);
  if (granularity === 'quarter') {
    const [y, m] = date.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
  }
  // period granularity
  const pDate = periodId
    ? (periods.find((p) => p.id === periodId)?.date ?? assignToPeriod(date, periods))
    : assignToPeriod(date, periods);
  return pDate;
}

function getBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'year' || granularity === 'quarter') return key;
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  // period: full ISO date
  return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IncomeTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  const entries = [...payload]
    .reverse()
    .filter((p: { value?: number }) => (p.value ?? 0) > 0);
  const total = entries.reduce((s: number, p: { value: number }) => s + p.value, 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {entries.map((p: { dataKey: string; fill: string; value: number }) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span className="text-gray-600">
              {TRANSACTION_LABELS[p.dataKey as IncomeType] ?? p.dataKey}
            </span>
          </span>
          <span className="font-medium text-gray-900">
            {formatCurrency(p.value, baseCurrency, true)}
          </span>
        </div>
      ))}
      {entries.length > 1 && (
        <div className="flex justify-between gap-6 mt-1.5 pt-1.5 border-t border-gray-100 font-semibold">
          <span className="text-gray-700">Total</span>
          <span className="text-gray-900">{formatCurrency(total, baseCurrency, true)}</span>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, currency, sub,
}: {
  label: string; value: number | null; currency: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mb-1">{sub}</p>}
      {value === null ? (
        <p className="text-gray-400 text-sm">No data</p>
      ) : (
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(value, currency, true)}
        </p>
      )}
    </div>
  );
}

export default function Income() {
  const { data } = useData();
  const [range, setRange] = useState<RangeKey>('all');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to   = range === 'custom' ? customTo   : null;

  function toBase(amount: number, currency: string, date: string): number {
    if (currency === baseCurrency) return amount;
    const rate = data!.exchangeRates.find(
      (r) => r.from === currency && r.to === baseCurrency && r.date === date,
    )?.rate ?? 1;
    return amount * rate;
  }

  const incomeTxs = data.transactions.filter((t) => {
    if (!(INCOME_TYPES as readonly string[]).includes(t.type)) return false;
    if (from && t.date < from) return false;
    if (to   && t.date > to)   return false;
    return true;
  });

  // Build time-bucketed data
  const bucketMap = new Map<string, Record<IncomeType, number>>();
  for (const t of incomeTxs) {
    const key = getBucketKey(t.date, granularity, t.periodId, data.periods);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        income_employment: 0,
        income_dividend:   0,
        income_interest:   0,
        income_rental:     0,
        income_other:      0,
      });
    }
    bucketMap.get(key)![t.type as IncomeType] += toBase(t.amount, t.currency, t.date);
  }

  const chartData = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cats]) => ({
      key,
      label: getBucketLabel(key, granularity),
      ...cats,
      total: INCOME_TYPES.reduce((s, k) => s + cats[k], 0),
    }));

  // Summary
  const grandTotal = chartData.reduce((s, d) => s + d.total, 0);
  const avgPerBucket = chartData.length > 0 ? grandTotal / chartData.length : 0;
  const byCategory = INCOME_TYPES
    .map((type) => ({
      type,
      total: chartData.reduce((s, d) => s + (d[type] as number), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const activeTypes = INCOME_TYPES.filter((type) => byCategory.some((c) => c.type === type));
  const hasData = chartData.length > 0;

  const granLabel = granularity.charAt(0).toUpperCase() + granularity.slice(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Income</h1>
        <p className="text-gray-500 text-sm mt-1">Income by source, aggregated over time</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Range selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                  range === key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        {/* Granularity selector */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {GRANULARITIES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setGranularity(key)}
              className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                granularity === key
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Income"
          value={hasData ? grandTotal : null}
          currency={baseCurrency}
        />
        <StatCard
          label={`Avg / ${granLabel}`}
          value={hasData ? avgPerBucket : null}
          currency={baseCurrency}
        />
        <StatCard
          label="Top Source"
          value={byCategory[0]?.total ?? null}
          currency={baseCurrency}
          sub={byCategory[0] ? TRANSACTION_LABELS[byCategory[0].type] : undefined}
        />
      </div>

      {/* Stacked bar chart */}
      {!hasData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No income transactions in the selected range.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Income by Source</h2>
          <p className="text-xs text-gray-400 mb-4">
            Amounts converted to {baseCurrency} using the exchange rate on the transaction date.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 8, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
                width={72}
              />
              <Tooltip content={<IncomeTooltip baseCurrency={baseCurrency} />} />
              {activeTypes.map((type) => (
                <Bar
                  key={type}
                  dataKey={type}
                  name={TRANSACTION_LABELS[type]}
                  stackId="income"
                  fill={INCOME_COLORS[type]}
                  maxBarSize={64}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Legend — below chart, for ≥ 2 series identity is never color-alone */}
          {activeTypes.length > 1 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 justify-center pt-4">
              {activeTypes.map((type) => (
                <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: INCOME_COLORS[type] }}
                  />
                  {TRANSACTION_LABELS[type]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category breakdown with mini progress bars */}
      {byCategory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Breakdown by Source</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {byCategory.map(({ type, total }) => {
              const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
              return (
                <div key={type} className="px-5 py-3 flex items-center gap-4">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: INCOME_COLORS[type] }}
                  />
                  <span className="text-sm text-gray-700 flex-1 min-w-[100px]">
                    {TRANSACTION_LABELS[type]}
                  </span>
                  <div className="flex-1 max-w-[180px] hidden sm:block">
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: INCOME_COLORS[type] }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-9 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="text-sm font-semibold text-gray-900 text-right min-w-[80px] tabular-nums">
                    {formatCurrency(total, baseCurrency, true)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail table */}
      {hasData && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Detail</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3 whitespace-nowrap">{granLabel}</th>
                  {activeTypes.map((type) => (
                    <th key={type} className="px-5 py-3 text-right whitespace-nowrap">
                      {TRANSACTION_LABELS[type]}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...chartData].reverse().map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{row.label}</td>
                    {activeTypes.map((type) => {
                      const v = row[type] as number;
                      return (
                        <td key={type} className="px-5 py-3 text-right tabular-nums text-gray-600">
                          {v > 0
                            ? formatCurrency(v, baseCurrency)
                            : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(row.total, baseCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-sm border-t border-gray-200">
                  <td className="px-5 py-3 text-gray-700">Total</td>
                  {activeTypes.map((type) => (
                    <td key={type} className="px-5 py-3 text-right tabular-nums text-gray-900">
                      {formatCurrency(byCategory.find((c) => c.type === type)?.total ?? 0, baseCurrency)}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">
                    {formatCurrency(grandTotal, baseCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
