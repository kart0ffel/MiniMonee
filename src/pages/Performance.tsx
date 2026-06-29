import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

type RangeKey = '1m' | '3m' | '6m' | '1Y' | '5Y' | 'all' | 'custom';

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: '5Y', label: '5Y' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

function getRangeFrom(key: RangeKey): string | null {
  if (key === 'all' || key === 'custom') return null;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1Y': 12, '5Y': 60 }[key];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: { color: string; name: string; value: number }) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className={p.value >= 0 ? 'text-green-700' : 'text-red-600'}>
            {p.value >= 0 ? '+' : ''}{formatCurrency(p.value, baseCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, currency, sub }: { label: string; value: number | null; currency: string; sub?: string }) {
  if (value === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-gray-400 text-sm">Not enough data</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        {value >= 0 ? '+' : ''}{formatCurrency(value, currency, true)}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Performance() {
  const { data } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;

  const allSorted = [...data.periods]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((p) => p.metrics.unrealizedPL !== null || p.metrics.pensionPL !== null);

  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to = range === 'custom' ? customTo : null;

  const sorted = allSorted.filter((p) => {
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    return true;
  });

  const chartData = sorted.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    'Unrealized P&L': p.metrics.unrealizedPL ?? null,
    'Pension P&L': p.metrics.pensionPL ?? null,
    periodId: p.id,
  }));

  const ACCOUNT_COLORS = [
    '#8b5cf6', '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
    '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#ec4899', '#a78bfa', '#ef4444',
  ];

  const allPeriodsSorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const investmentAccounts = data.accounts.filter(
    (a) => a.category === 'stocks' || a.category === 'pension',
  );

  const accountPlData = sorted.map((period) => {
    const idxInAll = allPeriodsSorted.findIndex((p) => p.id === period.id);
    const prevPeriod = idxInAll > 0 ? allPeriodsSorted[idxInAll - 1] : null;
    const point: Record<string, number | string> = {
      date: new Date(period.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    };
    for (const acc of investmentAccounts) {
      const curr = data.balanceEntries.find(
        (e) => e.accountId === acc.id && e.periodId === period.id,
      );
      if (!curr) continue;
      const prev = prevPeriod
        ? data.balanceEntries.find((e) => e.accountId === acc.id && e.periodId === prevPeriod.id)
        : null;
      point[acc.id] = curr.valueInBase - (prev?.valueInBase ?? 0);
    }
    return point;
  });

  const visibleInvestmentAccounts = investmentAccounts.filter((acc) =>
    accountPlData.some((d) => d[acc.id] !== undefined),
  );

  const latest = sorted[sorted.length - 1];
  const latestUnrealized = latest?.metrics.unrealizedPL ?? null;
  const latestPension = latest?.metrics.pensionPL ?? null;
  const totalUnrealized = sorted.reduce((s, p) => s + (p.metrics.unrealizedPL ?? 0), 0);
  const totalPension = sorted.reduce((s, p) => s + (p.metrics.pensionPL ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
        <p className="text-gray-500 text-sm mt-1">
          Unrealized P&amp;L and Pension growth per period
        </p>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Last Period — Invest." value={latestUnrealized} currency={baseCurrency} sub="Stocks" />
        <StatCard label="Last Period — Pension" value={latestPension} currency={baseCurrency} sub="Pension growth" />
        <StatCard label="Total Invest. P&L" value={sorted.length ? totalUnrealized : null} currency={baseCurrency} />
        <StatCard label="Total Pension P&L" value={sorted.length ? totalPension : null} currency={baseCurrency} />
      </div>

      {chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            {allSorted.length === 0
              ? 'Performance is calculated from the second period onward. Add more data points to see charts.'
              : 'No periods in the selected range.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">P&amp;L per Period</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              />
              <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
              <Bar dataKey="Unrealized P&L" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={(entry['Unrealized P&L'] ?? 0) >= 0 ? '#8b5cf6' : '#fca5a5'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
              <Bar dataKey="Pension P&L" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={(entry['Pension P&L'] ?? 0) >= 0 ? '#6366f1' : '#fca5a5'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-3">
            Unrealized P&amp;L = (End stocks value − Start stocks value) − Net invested in period.
            Pension P&amp;L = (End pension − Start pension) − Net pension contributions.
          </p>
        </div>
      )}

      {/* P&L by account chart */}
      {sorted.length > 0 && visibleInvestmentAccounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">P&amp;L by Account</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={accountPlData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              />
              <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
              {visibleInvestmentAccounts.map((acc, i) => {
                const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
                return (
                  <Bar key={acc.id} dataKey={acc.id} name={acc.name} radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {accountPlData.map((entry, j) => (
                      <Cell
                        key={j}
                        fill={(entry[acc.id] as number ?? 0) >= 0 ? color : '#fca5a5'}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Detail</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3 text-right">Invest. P&amp;L</th>
                  <th className="px-5 py-3 text-right">Pension P&amp;L</th>
                  <th className="px-5 py-3 text-right">Combined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...sorted].reverse().map((p) => {
                  const upl = p.metrics.unrealizedPL;
                  const ppl = p.metrics.pensionPL;
                  const combined = (upl ?? 0) + (ppl ?? 0);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">
                        {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${upl !== null ? (upl >= 0 ? 'text-violet-600' : 'text-red-500') : 'text-gray-300'}`}>
                        {upl !== null ? `${upl >= 0 ? '+' : ''}${formatCurrency(upl, baseCurrency)}` : '—'}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${ppl !== null ? (ppl >= 0 ? 'text-indigo-600' : 'text-red-500') : 'text-gray-300'}`}>
                        {ppl !== null ? `${ppl >= 0 ? '+' : ''}${formatCurrency(ppl, baseCurrency)}` : '—'}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${combined >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {(upl !== null || ppl !== null) ? `${combined >= 0 ? '+' : ''}${formatCurrency(combined, baseCurrency)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
