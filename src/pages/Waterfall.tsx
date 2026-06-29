import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';
import { buildWaterfallSteps } from '../utils/calculations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  const step = payload[0]?.payload;
  if (!step) return null;
  const val = step.isTotal ? step.value : (step.isNegative ? -step.value : step.value);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className={`font-bold text-base ${val >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        {val >= 0 ? '+' : ''}{formatCurrency(val, baseCurrency)}
      </p>
      {step.isTotal && <p className="text-xs text-gray-400">Running total</p>}
    </div>
  );
}

// Recharts waterfall: each bar = [base (transparent), value (colored)]
function WaterfallBarShape(props: {
  x?: number; y?: number; width?: number; height?: number;
  payload?: { isTotal: boolean; isNegative: boolean };
  fill?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, fill } = props;
  if (!payload) return null;
  const color = payload.isTotal ? '#374151' : payload.isNegative ? '#ef4444' : '#10b981';
  return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={fill ?? color} rx={3} />;
}

export default function Waterfall() {
  const { data } = useData();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Cash Flow Waterfall</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No periods yet. Add data to see the waterfall.</p>
        </div>
      </div>
    );
  }

  // Select latest period by default
  const activePeriodId = selectedPeriodId || sorted[sorted.length - 1].id;
  const period = sorted.find((p) => p.id === activePeriodId) ?? sorted[sorted.length - 1];
  const periodIdx = sorted.findIndex((p) => p.id === period.id);
  const prevPeriod = periodIdx > 0 ? sorted[periodIdx - 1] : null;

  const steps = buildWaterfallSteps(data, period, prevPeriod)
    .filter((s) => s.isTotal || s.value !== 0);

  // Build Recharts data: stacked bars [transparent base, visible value]
  const chartData = steps.map((s) => ({
    name: s.name,
    base: s.isTotal ? 0 : s.base,
    value: s.value,
    isTotal: s.isTotal,
    isNegative: s.isNegative,
  }));

  const allValues = steps.map((s) => s.base + s.value);
  const minVal = Math.min(...steps.map((s) => (s.isNegative ? s.base : s.base)), 0);
  const maxVal = Math.max(...allValues, 0);
  const padding = (maxVal - minVal) * 0.15;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow Waterfall</h1>
          <p className="text-gray-500 text-sm mt-1">
            How cash moved during the selected period
          </p>
        </div>
        <select
          value={activePeriodId}
          onChange={(e) => setSelectedPeriodId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {[...sorted].reverse().map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              {p.note ? ` — ${p.note}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!prevPeriod && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          This is the first period — no previous period to compare cash flow against.
          The waterfall shows current period values only.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis
              domain={[minVal - padding, maxVal + padding]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
            />
            <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
            <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
            {/* Transparent base bar */}
            <Bar dataKey="base" stackId="a" fill="transparent" legendType="none" />
            {/* Colored value bar */}
            <Bar dataKey="value" stackId="a" radius={[3, 3, 0, 0]} shape={<WaterfallBarShape />}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isTotal ? '#374151' : entry.isNegative ? '#ef4444' : '#10b981'}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 justify-center text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
            Inflow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
            Outflow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-700 inline-block" />
            Total
          </span>
        </div>
      </div>

      {/* Step table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
              <th className="px-5 py-3">Step</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">Running Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {steps.map((s, i) => {
              const delta = s.isTotal ? null : (s.isNegative ? -s.value : s.value);
              return (
                <tr key={i} className={`hover:bg-gray-50 ${s.isTotal ? 'bg-gray-50 font-semibold' : ''}`}>
                  <td className="px-5 py-3 text-gray-700">{s.name}</td>
                  <td className={`px-5 py-3 text-right ${
                    delta === null ? 'text-gray-900' :
                    delta >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {delta === null
                      ? formatCurrency(s.value, baseCurrency)
                      : `${delta >= 0 ? '+' : ''}${formatCurrency(delta, baseCurrency)}`}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">
                    {s.isTotal ? '—' : formatCurrency(s.base + (s.isNegative ? 0 : s.value), baseCurrency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
