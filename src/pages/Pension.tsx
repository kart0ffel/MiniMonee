import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AreaTip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-indigo-600 font-medium">{formatCurrency(payload[0].value, currency)}</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  const v: number = payload[0]?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <span className={`font-medium ${v >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
        {v >= 0 ? '+' : ''}{formatCurrency(v, currency)}
      </span>
    </div>
  );
}

function StatCard({ label, value, currency, neutral }: { label: string; value: number | null; currency: string; neutral?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      {value === null ? (
        <p className="text-gray-400 text-sm">Not enough data</p>
      ) : (
        <p className={`text-2xl font-bold ${neutral ? 'text-gray-900' : value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {!neutral && value > 0 ? '+' : ''}{formatCurrency(value, currency, true)}
        </p>
      )}
    </div>
  );
}

export default function Pension() {
  const { data } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const pensionAccounts = data.accounts.filter((a) => a.category === 'pension');

  const allSorted = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const from = range === 'custom' ? customFrom : getRangeFrom(range);
  const to   = range === 'custom' ? customTo   : null;

  const periodsInRange = allSorted.filter((p) => {
    if (from && p.date < from) return false;
    if (to   && p.date > to)   return false;
    return true;
  });

  function pensionValueForPeriod(periodId: string): number {
    return pensionAccounts.reduce((sum, acc) => {
      const entry = data!.balanceEntries.find((e) => e.accountId === acc.id && e.periodId === periodId);
      return sum + (entry?.valueInBase ?? 0);
    }, 0);
  }

  // Area chart: total pension portfolio value for every period in range
  const portfolioData = periodsInRange.map((p) => ({
    date: fmtDate(p.date),
    value: pensionValueForPeriod(p.id),
  }));

  // Bar chart: pension P&L, only periods where it's been computed
  const plData = periodsInRange
    .filter((p) => p.metrics.pensionPL !== null)
    .map((p) => ({ date: fmtDate(p.date), pl: p.metrics.pensionPL! }));

  // Cumulative net contributed — always from the full dataset regardless of range.
  const pensionTxs = data.transactions.filter((t) => {
    const ty = t.type as string;
    return ty === 'pension_activity' || ty === 'pension_contribution' || ty === 'pension_withdrawal';
  });

  function cumulativeNetContributed(upToDate: string): number {
    return pensionTxs
      .filter((t) => t.date <= upToDate)
      .reduce((sum, t) => {
        const ty = t.type as string;
        if (ty === 'pension_withdrawal') return sum - t.amountInBase;
        return sum + t.amountInBase; // pension_activity (signed) and pension_contribution (positive)
      }, 0);
  }

  const netContribData = periodsInRange.map((p) => ({
    date: fmtDate(p.date),
    netContributed: cumulativeNetContributed(p.date),
  }));

  const latest            = periodsInRange[periodsInRange.length - 1];
  const latestPensionValue = latest ? pensionValueForPeriod(latest.id) : null;
  const latestPL          = latest?.metrics.pensionPL ?? null;
  const cumulativePL      = plData.reduce((s, d) => s + d.pl, 0);

  const noData = allSorted.length < 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pension</h1>
        <p className="text-gray-500 text-sm mt-1">Pension portfolio value and growth over time</p>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {PRESETS.map(({ key, label }) => (
            <button key={key} onClick={() => setRange(key)}
              className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${range === key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <span className="text-gray-400">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pension Value"    value={latestPensionValue} currency={baseCurrency} neutral />
        <StatCard label="Last Period P&L"  value={latestPL}           currency={baseCurrency} />
        <StatCard label="Cumulative P&L"   value={plData.length ? cumulativePL : null} currency={baseCurrency} />
      </div>

      {noData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Growth is calculated from the second period onward. Add more data points to see charts.</p>
        </div>
      ) : portfolioData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No periods in the selected range.</p>
        </div>
      ) : (
        <>
          {/* Area chart: pension portfolio value */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Pension Portfolio Value</h2>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={portfolioData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="pensionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
                  domain={[(dataMin: number) => dataMin * 0.97, (dataMax: number) => dataMax * 1.03]}
                />
                <Tooltip content={<AreaTip currency={baseCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#pensionGradient)"
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart: pension P&L per period */}
          {plData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4">P&amp;L per Period</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={plData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, baseCurrency, true)} />
                  <Tooltip content={<BarTip currency={baseCurrency} />} />
                  <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                  <Bar dataKey="pl" name="Pension P&L" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {plData.map((d, i) => (
                      <Cell key={i} fill={d.pl >= 0 ? '#6366f1' : '#a5b4fc'} opacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-3">
                P&amp;L = (End pension value − Start pension value) − Net contributions in the period.
              </p>
            </div>
          )}

          {/* Bar chart: cumulative net pension contributions */}
          {netContribData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Cumulative Net Contributed</h2>
              <p className="text-xs text-gray-400 mb-4">
                Total capital contributed to pension (contributions − withdrawals) from the beginning of the dataset — not reset by the date range filter.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={netContribData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, baseCurrency, true)} />
                  <Tooltip content={<BarTip currency={baseCurrency} />} />
                  <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                  <Bar dataKey="netContributed" name="Net Contributed" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {netContribData.map((d, i) => (
                      <Cell key={i} fill={d.netContributed >= 0 ? '#818cf8' : '#f97316'} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Detail</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                    <th className="px-5 py-3">Period</th>
                    <th className="px-5 py-3 text-right">Pension Value</th>
                    <th className="px-5 py-3 text-right">P&amp;L</th>
                    <th className="px-5 py-3 text-right">Net Contributed (Cumul.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...periodsInRange].reverse().map((p) => {
                    const val = pensionValueForPeriod(p.id);
                    const pl  = p.metrics.pensionPL;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-700">
                          {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {formatCurrency(val, baseCurrency)}
                        </td>
                        <td className={`px-5 py-3 text-right font-medium ${pl === null ? 'text-gray-300' : pl >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                          {pl !== null ? `${pl >= 0 ? '+' : ''}${formatCurrency(pl, baseCurrency)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {formatCurrency(cumulativeNetContributed(p.date), baseCurrency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
