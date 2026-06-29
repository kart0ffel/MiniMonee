import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

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
  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sorted = [...data.periods]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((p) => p.metrics.unrealizedPL !== null || p.metrics.pensionPL !== null);

  const chartData = sorted.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    'Unrealized P&L': p.metrics.unrealizedPL ?? null,
    'Pension P&L': p.metrics.pensionPL ?? null,
    periodId: p.id,
  }));

  const allPeriods = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const totalUnrealized = allPeriods.reduce((s, p) => s + (p.metrics.unrealizedPL ?? 0), 0);
  const totalPension = allPeriods.reduce((s, p) => s + (p.metrics.pensionPL ?? 0), 0);
  const latestUnrealized = sorted[sorted.length - 1]?.metrics.unrealizedPL ?? null;
  const latestPension = sorted[sorted.length - 1]?.metrics.pensionPL ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
        <p className="text-gray-500 text-sm mt-1">
          Unrealized P&amp;L and Pension growth per period
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Last Period — Invest." value={latestUnrealized} currency={baseCurrency} sub="Stocks" />
        <StatCard label="Last Period — Pension" value={latestPension} currency={baseCurrency} sub="Pension growth" />
        <StatCard label="Cumulative Invest." value={totalUnrealized} currency={baseCurrency} />
        <StatCard label="Cumulative Pension" value={totalPension} currency={baseCurrency} />
      </div>

      {chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            Performance is calculated from the second period onward. Add more data points to see charts.
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
