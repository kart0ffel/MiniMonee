import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

type RangeKey = '1m' | '3m' | '6m' | '1Y' | '5Y' | 'all' | 'custom';
type Granularity = 'period' | 'month' | 'quarter' | 'year';

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
  return periodId
    ? (periods.find((p) => p.id === periodId)?.date ?? assignToPeriod(date, periods))
    : assignToPeriod(date, periods);
}

function getBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'year' || granularity === 'quarter') return key;
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TaxTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  const v: number = payload[0]?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-orange-600 font-medium">{formatCurrency(v, baseCurrency)}</p>
    </div>
  );
}

export default function Taxes() {
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
    return (
      data!.exchangeRates.find(
        (r) => r.from === currency && r.to === baseCurrency && r.date === date,
      )?.rate ?? 1
    ) * amount;
  }

  const taxTxs = data.transactions.filter((t) => {
    if (t.type !== 'tax_paid') return false;
    if (from && t.date < from) return false;
    if (to   && t.date > to)   return false;
    return true;
  });

  // Build time-bucketed data
  const bucketMap = new Map<string, number>();
  for (const t of taxTxs) {
    const key = getBucketKey(t.date, granularity, t.periodId, data.periods);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + toBase(t.amount, t.currency, t.date));
  }

  const chartData = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, taxes]) => ({
      key,
      label: getBucketLabel(key, granularity),
      taxes,
    }));

  const grandTotal  = chartData.reduce((s, d) => s + d.taxes, 0);
  const avg         = chartData.length > 0 ? grandTotal / chartData.length : 0;
  const max         = chartData.length > 0 ? Math.max(...chartData.map((d) => d.taxes)) : 0;
  const maxBucket   = chartData.find((d) => d.taxes === max);
  const hasData     = chartData.length > 0;
  const granLabel   = granularity.charAt(0).toUpperCase() + granularity.slice(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Taxes</h1>
        <p className="text-gray-500 text-sm mt-1">Taxes paid over time</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Taxes</p>
          {hasData ? (
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(grandTotal, baseCurrency, true)}
            </p>
          ) : (
            <p className="text-gray-400 text-sm">No data</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg / {granLabel}</p>
          {hasData ? (
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(avg, baseCurrency, true)}
            </p>
          ) : (
            <p className="text-gray-400 text-sm">No data</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Highest {granLabel}</p>
          {maxBucket && <p className="text-xs text-gray-400 mb-1">{maxBucket.label}</p>}
          {hasData ? (
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(max, baseCurrency, true)}
            </p>
          ) : (
            <p className="text-gray-400 text-sm">No data</p>
          )}
        </div>
      </div>

      {/* Bar chart */}
      {!hasData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No tax transactions in the selected range.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Taxes Paid</h2>
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
              <Tooltip content={<TaxTooltip baseCurrency={baseCurrency} />} />
              <ReferenceLine
                y={avg}
                stroke="#eb6834"
                strokeDasharray="6 3"
                label={{ value: 'Avg', position: 'right', fontSize: 11, fill: '#eb6834' }}
              />
              <Bar dataKey="taxes" maxBarSize={64} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.taxes >= max * 0.9 ? '#eb6834' : '#f5b899'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
                  <th className="px-5 py-3">{granLabel}</th>
                  <th className="px-5 py-3 text-right">Taxes Paid</th>
                  <th className="px-5 py-3 text-right">vs Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...chartData].reverse().map((row) => {
                  const diff = row.taxes - avg;
                  return (
                    <tr key={row.key} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">{row.label}</td>
                      <td className="px-5 py-3 text-right font-medium text-orange-600 tabular-nums">
                        {formatCurrency(row.taxes, baseCurrency)}
                      </td>
                      <td className={`px-5 py-3 text-right text-xs tabular-nums ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff, baseCurrency, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                  <td className="px-5 py-3 text-gray-700">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">
                    {formatCurrency(grandTotal, baseCurrency)}
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
