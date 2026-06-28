import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

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
  const { data } = useData();
  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sorted = [...data.periods]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((p) => p.metrics.expenses !== null);

  const chartData = sorted.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    expenses: p.metrics.expenses ?? 0,
    periodId: p.id,
  }));

  const avg =
    chartData.length > 0
      ? chartData.reduce((s, d) => s + d.expenses, 0) / chartData.length
      : 0;

  const maxExpense = Math.max(...chartData.map((d) => d.expenses), 0);
  const totalExpenses = chartData.reduce((s, d) => s + d.expenses, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <p className="text-gray-500 text-sm mt-1">
          Calculated as: Start Cash + Income − Net Invested − Taxes − End Cash
        </p>
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
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total (all periods)</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(totalExpenses, baseCurrency, true)}
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            Expenses are calculated from the second period onward (requires a previous period for comparison).
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
