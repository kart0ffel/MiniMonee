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
function CustomTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className={val >= 0 ? 'text-orange-600 font-bold' : 'text-green-600 font-bold'}>
        {formatCurrency(val, baseCurrency)}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">
        {val >= 0 ? 'Living expenses' : 'Surplus (negative expenses)'}
      </p>
    </div>
  );
}

export default function Expenses() {
  const { data, computed } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;

  const allSorted = [...data.periods]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((p) => (computed?.periodMetrics[p.id]?.expenses ?? null) !== null);

  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to = range === 'custom' ? customTo : null;

  const sorted = allSorted.filter((p) => {
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    return true;
  });

  const chartData = sorted.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    expenses: computed?.periodMetrics[p.id]?.expenses ?? 0,
    periodId: p.id,
  }));

  const avg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.expenses, 0) / chartData.length
    : 0;
  const maxExpense = Math.max(...chartData.map((d) => d.expenses), 0);
  const totalExpenses = chartData.reduce((s, d) => s + d.expenses, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <p className="text-gray-500 text-sm mt-1">
          Calculated as: Start Cash + Income + Dividends − Invested bought + Invested sold − Taxes − Pension contribution − End Cash
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Average / Period</p>
          <p className="text-2xl font-bold text-orange-600">
            {formatCurrency(avg, baseCurrency, true)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Highest Period</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(maxExpense, baseCurrency, true)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Total ({range === 'all' ? 'all periods' : 'selected range'})
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(totalExpenses, baseCurrency, true)}
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            {allSorted.length === 0
              ? 'Expenses are calculated from the second period onward (requires a previous period for comparison).'
              : 'No periods in the selected range.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Expenses per Period</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              />
              <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
              <ReferenceLine
                y={avg}
                stroke="#f97316"
                strokeDasharray="6 3"
                label={{ value: 'Avg', position: 'right', fontSize: 11, fill: '#f97316' }}
              />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
              <Bar dataKey="expenses" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.expenses >= 0 ? '#f97316' : '#10b981'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
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
                  <th className="px-5 py-3 text-right">Expenses</th>
                  <th className="px-5 py-3 text-right">vs Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...chartData].reverse().map((row) => {
                  const diff = row.expenses - avg;
                  return (
                    <tr key={row.periodId} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">{row.date}</td>
                      <td className={`px-5 py-3 text-right font-medium ${row.expenses >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {formatCurrency(row.expenses, baseCurrency)}
                      </td>
                      <td className={`px-5 py-3 text-right text-xs ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff, baseCurrency, true)}
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
