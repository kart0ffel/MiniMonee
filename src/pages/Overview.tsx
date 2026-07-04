import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PlusCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';
import { AccountCategory, ALL_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from '../types';

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
  const total = payload.reduce((s: number, p: { value: number }) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {[...payload].reverse().map((p: { color: string; name: string; value: number }) => (
        p.value !== 0 && (
          <div key={p.name} className="flex justify-between gap-6">
            <span style={{ color: p.color }} className="font-medium">{p.name}</span>
            <span className="text-gray-900">{formatCurrency(p.value, baseCurrency, true)}</span>
          </div>
        )
      ))}
      <div className="flex justify-between gap-6 mt-1.5 pt-1.5 border-t border-gray-100 font-semibold">
        <span className="text-gray-700">Total</span>
        <span className="text-gray-900">{formatCurrency(total, baseCurrency, true)}</span>
      </div>
    </div>
  );
}

export default function Overview() {
  const { data, computed } = useData();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hiddenCategories, setHiddenCategories] = useState<Set<AccountCategory>>(new Set());

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to = range === 'custom' ? customTo : null;

  const filtered = sorted.filter((p) => {
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    return true;
  });

  const chartData = filtered.map((p) => {
    const metrics = computed?.periodMetrics[p.id];
    const row: Record<string, number | string> = {
      date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    };
    for (const cat of ALL_CATEGORIES) {
      row[CATEGORY_LABELS[cat]] = metrics?.netWorthByCategory[cat] ?? 0;
    }
    return row;
  });

  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const latestMetrics = latest ? computed?.periodMetrics[latest.id] : undefined;
  const prevMetrics   = prev   ? computed?.periodMetrics[prev.id]   : undefined;
  const netWorthChange = latestMetrics && prevMetrics
    ? latestMetrics.totalNetWorth - prevMetrics.totalNetWorth
    : null;

  const usedCategories = ALL_CATEGORIES.filter((cat) =>
    sorted.some((p) => (computed?.periodMetrics[p.id]?.netWorthByCategory[cat] ?? 0) !== 0),
  );

  function toggleCategory(cat: AccountCategory) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Net Worth</h1>
          <p className="text-gray-500 text-sm mt-1">Evolution over time by category</p>
        </div>
        <button
          onClick={() => navigate('/input')}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Add Period
        </button>
      </div>

      {/* Summary cards */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Net Worth</p>
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(latestMetrics?.totalNetWorth ?? 0, baseCurrency, true)}
            </p>
            {netWorthChange !== null && (
              <p className={`flex items-center gap-1 text-sm mt-1 ${netWorthChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {netWorthChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {formatCurrency(netWorthChange, baseCurrency, true)} from last period
              </p>
            )}
          </div>
          {usedCategories.slice(0, 2).map((cat) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                {CATEGORY_LABELS[cat]}
              </p>
              <p className="text-xl font-bold" style={{ color: CATEGORY_COLORS[cat] }}>
                {formatCurrency(latestMetrics?.netWorthByCategory[cat] ?? 0, baseCurrency, true)}
              </p>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No data yet. Add your first period to get started.</p>
          <button
            onClick={() => navigate('/input')}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Add First Period
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          {/* Range selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">History</h2>
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
          </div>

          {/* Category toggles */}
          <div className="flex flex-wrap gap-2 mb-4">
            {usedCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  !hiddenCategories.has(cat)
                    ? 'text-white border-transparent'
                    : 'text-gray-400 border-gray-200 hover:border-gray-400'
                }`}
                style={!hiddenCategories.has(cat) ? { backgroundColor: CATEGORY_COLORS[cat] } : {}}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">No periods in the selected range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
                />
                <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                {usedCategories.map((cat) => (
                  <Bar
                    key={cat}
                    dataKey={CATEGORY_LABELS[cat]}
                    stackId="a"
                    fill={CATEGORY_COLORS[cat]}
                    hide={hiddenCategories.has(cat)}
                    maxBarSize={80}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Category breakdown */}
      {latest && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Current Breakdown</h2>
          <div className="space-y-2">
            {ALL_CATEGORIES.map((cat) => {
              const val = latestMetrics?.netWorthByCategory[cat] ?? 0;
              if (val === 0) return null;
              const total = Math.abs(latestMetrics?.totalNetWorth ?? 0) || 1;
              const pct = Math.round((Math.abs(val) / total) * 100);
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                  />
                  <span className="text-sm text-gray-600 w-32 shrink-0">{CATEGORY_LABELS[cat]}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-24 text-right">
                    {formatCurrency(val, baseCurrency, true)}
                  </span>
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
