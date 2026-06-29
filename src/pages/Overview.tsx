import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PlusCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';
import { AccountCategory, ALL_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from '../types';

const RANGE_OPTIONS = [
  { label: 'All', months: 0 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: { color: string; name: string; value: number }) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="text-gray-900">{formatCurrency(p.value, baseCurrency, true)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { data } = useData();
  const navigate = useNavigate();
  const [rangeMonths, setRangeMonths] = useState(0);
  const [hiddenCategories, setHiddenCategories] = useState<Set<AccountCategory>>(new Set());

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const now = new Date();
  const filtered =
    rangeMonths === 0
      ? sorted
      : sorted.filter((p) => {
          const diff =
            (now.getFullYear() - new Date(p.date).getFullYear()) * 12 +
            (now.getMonth() - new Date(p.date).getMonth());
          return diff <= rangeMonths;
        });

  const chartData = filtered.map((p) => {
    const row: Record<string, number | string> = {
      date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      Total: p.metrics.totalNetWorth,
    };
    for (const cat of ALL_CATEGORIES) {
      row[CATEGORY_LABELS[cat]] = p.metrics.netWorthByCategory[cat] ?? 0;
    }
    return row;
  });

  // Latest period stats
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const netWorthChange = latest && prev
    ? latest.metrics.totalNetWorth - prev.metrics.totalNetWorth
    : null;

  const usedCategories = ALL_CATEGORIES.filter((cat) =>
    sorted.some((p) => (p.metrics.netWorthByCategory[cat] ?? 0) !== 0),
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
              {formatCurrency(latest.metrics.totalNetWorth, baseCurrency, true)}
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
                {formatCurrency(latest.metrics.netWorthByCategory[cat] ?? 0, baseCurrency, true)}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">History</h2>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setRangeMonths(opt.months)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    rangeMonths === opt.months
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category toggles */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setHiddenCategories(new Set())}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                hiddenCategories.size === 0
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              Total
            </button>
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

          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              />
              <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
              <Line
                type="monotone"
                dataKey="Total"
                stroke="#111827"
                strokeWidth={2.5}
                dot={false}
                hide={hiddenCategories.size > 0}
              />
              {usedCategories.map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={CATEGORY_LABELS[cat]}
                  stroke={CATEGORY_COLORS[cat]}
                  strokeWidth={1.5}
                  dot={false}
                  hide={hiddenCategories.has(cat)}
                  strokeDasharray="4 2"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category breakdown */}
      {latest && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Current Breakdown</h2>
          <div className="space-y-2">
            {ALL_CATEGORIES.map((cat) => {
              const val = latest.metrics.netWorthByCategory[cat] ?? 0;
              if (val === 0) return null;
              const total = Math.abs(latest.metrics.totalNetWorth) || 1;
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
