import { useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

type RangeKey = '1m' | '3m' | '6m' | '1Y' | '5Y' | 'all' | 'custom';
type Granularity = 'period' | 'month' | 'quarter' | 'year';

const INCOME_TYPES = [
  'income_employment', 'income_dividend', 'income_interest',
  'income_rental', 'income_other',
] as const;

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

// Series config — fixed categorical colors + display metadata
const SERIES = {
  income:             { label: 'Income',              color: '#1baf7a', activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  expenses:           { label: 'Expenses',            color: '#f97316', activeClass: 'border-orange-300 bg-orange-50 text-orange-800'   },
  taxes:              { label: 'Taxes',               color: '#e34948', activeClass: 'border-red-300 bg-red-50 text-red-800'            },
  savingsRate:        { label: 'Savings Rate',        color: '#2a78d6', activeClass: 'border-blue-300 bg-blue-50 text-blue-800'         },
  savingsRateWoTax:   { label: 'Savings Rate (wo Tax)', color: '#7c3aed', activeClass: 'border-violet-300 bg-violet-50 text-violet-800'  },
} as const;

function getRangeFrom(key: RangeKey): string | null {
  if (key === 'all' || key === 'custom') return null;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1Y': 12, '5Y': 60 }[key];
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function getBucketKey(date: string, granularity: Granularity): string {
  if (granularity === 'month')   return date.slice(0, 7);
  if (granularity === 'year')    return date.slice(0, 4);
  if (granularity === 'quarter') {
    const [y, m] = date.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
  }
  return date;
}

function getBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'year' || granularity === 'quarter') return key;
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return new Date(key).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function assignToPeriod(txDate: string, periods: { id: string; date: string }[]): string {
  if (periods.length === 0) return txDate.slice(0, 7);
  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  return (sorted.find((p) => p.date >= txDate) ?? sorted[sorted.length - 1]).date;
}

function getTxBucketKey(
  date: string,
  granularity: Granularity,
  periodId: string | null,
  periods: { id: string; date: string }[],
): string {
  if (granularity === 'month')   return date.slice(0, 7);
  if (granularity === 'year')    return date.slice(0, 4);
  if (granularity === 'quarter') {
    const [y, m] = date.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
  }
  return periodId
    ? (periods.find((p) => p.id === periodId)?.date ?? assignToPeriod(date, periods))
    : assignToPeriod(date, periods);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExpensesTooltip({ active, payload, label, baseCurrency }: any) {
  if (!active || !payload?.length) return null;

  const order: (keyof typeof SERIES)[] = ['income', 'expenses', 'taxes', 'savingsRate', 'savingsRateWoTax'];
  const items = order
    .map((key) => ({ key, entry: payload.find((p: { dataKey: string }) => p.dataKey === key) }))
    .filter(({ entry }) => entry != null && entry.value != null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {items.map(({ key, entry }) => {
        const { label: seriesLabel, color } = SERIES[key];
        const isRate = key === 'savingsRate' || key === 'savingsRateWoTax';
        const formatted = isRate
          ? `${(entry.value * 100).toFixed(1)}%`
          : formatCurrency(entry.value, baseCurrency);
        return (
          <div key={key} className="flex items-center justify-between gap-6 py-0.5">
            <span className="flex items-center gap-1.5">
              {isRate
                ? <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: color }} />
                : <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />}
              <span className="text-gray-600">{seriesLabel}</span>
            </span>
            <span className="font-medium text-gray-900">{formatted}</span>
          </div>
        );
      })}
    </div>
  );
}

type SeriesKey = keyof typeof SERIES;

function TogglePill({ id, active, onToggle }: { id: SeriesKey; active: boolean; onToggle: () => void }) {
  const { label, color, activeClass } = SERIES[id];
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
        active ? activeClass : 'border-gray-200 bg-white text-gray-400'
      }`}
    >
      {id === 'savingsRate'
        ? <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: active ? color : '#d1d5db' }} />
        : <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: active ? color : '#d1d5db' }} />}
      {label}
    </button>
  );
}

export default function Expenses() {
  const { data, computed } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [granularity, setGranularity] = useState<Granularity>('period');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showIncome, setShowIncome] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showTaxes, setShowTaxes] = useState(true);
  const [showSavingsRate, setShowSavingsRate] = useState(true);
  const [showSavingsRateWoTax, setShowSavingsRateWoTax] = useState(true);

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to   = range === 'custom' ? customTo   : null;

  function toBase(amount: number, currency: string, date: string): number {
    if (currency === baseCurrency) return amount;
    return (data!.exchangeRates.find(
      (r) => r.from === currency && r.to === baseCurrency && r.date === date,
    )?.rate ?? 1) * amount;
  }

  const allPeriodsSorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Expense buckets (from computed period metrics — only periods with valid expenses)
  const expenseByBucket = new Map<string, number>();
  const allKeys = new Set<string>();

  const periodsWithExpenses = allPeriodsSorted.filter(
    (p) => (computed?.periodMetrics[p.id]?.expenses ?? null) !== null
      && (!from || p.date >= from)
      && (!to   || p.date <= to),
  );

  for (const p of periodsWithExpenses) {
    const key = getBucketKey(p.date, granularity);
    allKeys.add(key);
    expenseByBucket.set(key, (expenseByBucket.get(key) ?? 0) + (computed!.periodMetrics[p.id].expenses ?? 0));
  }

  // Income and tax buckets (from transactions)
  const incomeByBucket = new Map<string, number>();
  const taxByBucket    = new Map<string, number>();

  for (const t of data.transactions) {
    if (from && t.date < from) continue;
    if (to   && t.date > to)   continue;
    const key = getTxBucketKey(t.date, granularity, t.periodId, allPeriodsSorted);
    if ((INCOME_TYPES as readonly string[]).includes(t.type)) {
      allKeys.add(key);
      incomeByBucket.set(key, (incomeByBucket.get(key) ?? 0) + toBase(t.amount, t.currency, t.date));
    } else if (t.type === 'tax_paid') {
      allKeys.add(key);
      taxByBucket.set(key, (taxByBucket.get(key) ?? 0) + toBase(t.amount, t.currency, t.date));
    }
  }

  // Merge all buckets into unified chart rows
  const chartData = [...allKeys]
    .sort()
    .map((key) => {
      const income   = incomeByBucket.get(key) ?? 0;
      const expenses = expenseByBucket.get(key) ?? 0;
      const taxes    = taxByBucket.get(key) ?? 0;
      const savingsRate = income > 0 ? (income - expenses - taxes) / income : null;
      const savingsRateWoTax = income > 0 ? (income - expenses) / income : null;
      return { key, date: getBucketLabel(key, granularity), income, expenses, taxes, savingsRate, savingsRateWoTax };
    });

  // Summary stats
  const totalIncome   = chartData.reduce((s, d) => s + d.income, 0);
  const totalExpenses = chartData.reduce((s, d) => s + d.expenses, 0);
  const totalTaxes    = chartData.reduce((s, d) => s + d.taxes, 0);
  const rateRows      = chartData.filter((d) => d.savingsRate !== null);
  const avgSavingsRate = rateRows.length > 0
    ? rateRows.reduce((s, d) => s + d.savingsRate!, 0) / rateRows.length
    : null;
  const avgExpenses   = chartData.length > 0 ? totalExpenses / chartData.length : 0;

  const hasData  = chartData.length > 0;
  const hasIncome = totalIncome > 0;
  const granLabel = granularity.charAt(0).toUpperCase() + granularity.slice(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <p className="text-gray-500 text-sm mt-1">
          Expenses = Start Cash + Income − Invested (net) − Taxes − Pension − End Cash. Savings Rate = (Income − Expenses − Taxes) / Income. Rate (wo Tax) = (Income − Expenses) / Income.
        </p>
      </div>

      {/* Controls: range + granularity */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                  range === key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
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
                granularity === key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Series toggles */}
      <div className="flex flex-wrap gap-2">
        <TogglePill id="income"             active={showIncome}           onToggle={() => setShowIncome(!showIncome)}                       />
        <TogglePill id="expenses"           active={showExpenses}         onToggle={() => setShowExpenses(!showExpenses)}                   />
        <TogglePill id="taxes"             active={showTaxes}            onToggle={() => setShowTaxes(!showTaxes)}                         />
        <TogglePill id="savingsRate"       active={showSavingsRate}      onToggle={() => setShowSavingsRate(!showSavingsRate)}             />
        <TogglePill id="savingsRateWoTax"  active={showSavingsRateWoTax} onToggle={() => setShowSavingsRateWoTax(!showSavingsRateWoTax)}   />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Savings Rate</p>
          {avgSavingsRate === null ? (
            <p className="text-gray-400 text-sm">No income data</p>
          ) : (
            <p className={`text-2xl font-bold ${avgSavingsRate >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {(avgSavingsRate * 100).toFixed(1)}%
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Income</p>
          <p className="text-2xl font-bold text-gray-900">
            {hasIncome ? formatCurrency(totalIncome, baseCurrency, true) : <span className="text-gray-400 text-sm">No data</span>}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-orange-600">
            {hasData ? formatCurrency(totalExpenses, baseCurrency, true) : <span className="text-gray-400 text-sm">No data</span>}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Taxes</p>
          <p className="text-2xl font-bold text-gray-900">
            {totalTaxes > 0 ? formatCurrency(totalTaxes, baseCurrency, true) : <span className="text-gray-400 text-sm">No data</span>}
          </p>
        </div>
      </div>

      {/* Chart */}
      {!hasData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            Expenses are calculated from the second period onward (requires a previous period for comparison).
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Income, Expenses &amp; Taxes per {granLabel}</h2>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ top: 8, right: (showSavingsRate || showSavingsRateWoTax) ? 48 : 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />

              {/* Left axis: currency amounts */}
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
                width={72}
              />

              {/* Right axis: savings rate % — shown when either rate line is visible */}
              {(showSavingsRate || showSavingsRateWoTax) && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  width={44}
                />
              )}

              <Tooltip content={<ExpensesTooltip baseCurrency={baseCurrency} />} />

              {/* Avg expenses reference line */}
              {showExpenses && (
                <ReferenceLine
                  yAxisId="left"
                  y={avgExpenses}
                  stroke="#f97316"
                  strokeDasharray="6 3"
                  label={{ value: 'Avg', position: 'insideTopLeft', fontSize: 10, fill: '#f97316' }}
                />
              )}

              <ReferenceLine yAxisId="left" y={0} stroke="#374151" strokeWidth={1} />

              {/* Income — standalone green bar */}
              {showIncome && (
                <Bar
                  yAxisId="left"
                  dataKey="income"
                  name="Income"
                  fill="#1baf7a"
                  opacity={0.85}
                  maxBarSize={60}
                  radius={[3, 3, 0, 0]}
                />
              )}

              {/* Expenses — base of the spending stack */}
              {showExpenses && (
                <Bar
                  yAxisId="left"
                  dataKey="expenses"
                  name="Expenses"
                  fill="#f97316"
                  stackId="costs"
                  opacity={0.85}
                  maxBarSize={60}
                  radius={showTaxes ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                />
              )}

              {/* Taxes — stacked on top of expenses */}
              {showTaxes && (
                <Bar
                  yAxisId="left"
                  dataKey="taxes"
                  name="Taxes"
                  fill="#e34948"
                  stackId="costs"
                  opacity={0.85}
                  maxBarSize={60}
                  radius={[3, 3, 0, 0]}
                />
              )}

              {/* Savings rate — line on secondary axis */}
              {showSavingsRate && (
                <Line
                  yAxisId="right"
                  dataKey="savingsRate"
                  name="Savings Rate"
                  stroke="#2a78d6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#2a78d6', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              )}

              {/* Savings rate without taxes — line on secondary axis */}
              {showSavingsRateWoTax && (
                <Line
                  yAxisId="right"
                  dataKey="savingsRateWoTax"
                  name="Savings Rate (wo Tax)"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3, fill: '#7c3aed', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
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
                  <th className="px-5 py-3 text-right">Income</th>
                  <th className="px-5 py-3 text-right">Expenses</th>
                  <th className="px-5 py-3 text-right">Taxes</th>
                  <th className="px-5 py-3 text-right">Savings Rate</th>
                  <th className="px-5 py-3 text-right">Rate (wo Tax)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...chartData].reverse().map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{row.date}</td>
                    <td className="px-5 py-3 text-right font-medium text-emerald-700 tabular-nums">
                      {row.income > 0 ? formatCurrency(row.income, baseCurrency) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${row.expenses > 0 ? 'text-orange-600' : row.expenses < 0 ? 'text-green-600' : 'text-gray-300'}`}>
                      {row.expenses !== 0 ? formatCurrency(row.expenses, baseCurrency) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-red-600 tabular-nums">
                      {row.taxes > 0 ? formatCurrency(row.taxes, baseCurrency) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${
                      row.savingsRate === null ? 'text-gray-300' : row.savingsRate >= 0 ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {row.savingsRate !== null ? `${(row.savingsRate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${
                      row.savingsRateWoTax === null ? 'text-gray-300' : row.savingsRateWoTax >= 0 ? 'text-violet-600' : 'text-red-500'
                    }`}>
                      {row.savingsRateWoTax !== null ? `${(row.savingsRateWoTax * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t border-gray-200 text-sm">
                  <td className="px-5 py-3 text-gray-700">Total</td>
                  <td className="px-5 py-3 text-right text-emerald-700 tabular-nums">{formatCurrency(totalIncome, baseCurrency)}</td>
                  <td className="px-5 py-3 text-right text-orange-600 tabular-nums">{formatCurrency(totalExpenses, baseCurrency)}</td>
                  <td className="px-5 py-3 text-right text-red-600 tabular-nums">{formatCurrency(totalTaxes, baseCurrency)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums ${avgSavingsRate === null ? 'text-gray-300' : avgSavingsRate >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {avgSavingsRate !== null ? `${(avgSavingsRate * 100).toFixed(1)}% avg` : '—'}
                  </td>
                  {(() => {
                    const rows = chartData.filter((d) => d.savingsRateWoTax !== null);
                    const avg = rows.length > 0 ? rows.reduce((s, d) => s + d.savingsRateWoTax!, 0) / rows.length : null;
                    return (
                      <td className={`px-5 py-3 text-right tabular-nums ${avg === null ? 'text-gray-300' : avg >= 0 ? 'text-violet-600' : 'text-red-500'}`}>
                        {avg !== null ? `${(avg * 100).toFixed(1)}% avg` : '—'}
                      </td>
                    );
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
