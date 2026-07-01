import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
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
function CustomTooltip({ active, payload, label, baseCurrency, hidden }: any) {
  if (!active || !payload?.length) return null;
  const visible = (payload as { color: string; name: string; value: number; dataKey: string }[])
    .filter((p) => !hidden?.has(p.dataKey));
  if (!visible.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {visible.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-6">
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

const PL_SERIES = [
  { key: 'Unrealized P&L', posColor: '#8b5cf6', negColor: '#c4b5fd', label: 'Invest. P&L' },
  { key: 'Pension P&L',   posColor: '#6366f1', negColor: '#a5b4fc', label: 'Pension P&L' },
] as const;

export default function Performance() {
  const { data } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  function toggleSeries(key: string) {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">P&amp;L per Period</h2>
            <div className="flex items-center gap-2">
              {PL_SERIES.map(({ key, posColor, label }) => {
                const hidden = hiddenSeries.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleSeries(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      hidden
                        ? 'bg-gray-100 text-gray-400 border-gray-200'
                        : 'text-white border-transparent'
                    }`}
                    style={hidden ? undefined : { backgroundColor: posColor }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: hidden ? '#9ca3af' : 'rgba(255,255,255,0.7)' }}
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              />
              <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} hidden={hiddenSeries} />} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
              {PL_SERIES.map(({ key, posColor, negColor, label }, idx) => {
                const isTop = idx === PL_SERIES.length - 1;
                const onlyThisVisible = hiddenSeries.has(
                  PL_SERIES[idx === 0 ? 1 : 0].key,
                );
                const topRadius: [number, number, number, number] =
                  isTop || onlyThisVisible ? [4, 4, 0, 0] : [0, 0, 0, 0];
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={label}
                    stackId="a"
                    radius={topRadius}
                    maxBarSize={60}
                    hide={hiddenSeries.has(key)}
                  >
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={(entry[key] ?? 0) >= 0 ? posColor : negColor}
                        opacity={0.9}
                      />
                    ))}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-3">
            Invest. P&amp;L = (End stocks value − Start stocks value) − Net invested.
            Pension P&amp;L = (End pension − Start pension) − Net contributions.
          </p>
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
