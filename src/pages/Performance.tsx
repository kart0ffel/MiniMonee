import { useState } from 'react';
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';
import { Period } from '../types';

type RangeKey = '1m' | '3m' | '6m' | '1Y' | '5Y' | 'all' | 'custom';
type Granularity = 'period' | 'month' | 'quarter' | 'year';

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
  return date; // period: full ISO date
}

// Short label used on chart axes
function getBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'year' || granularity === 'quarter') return key;
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return new Date(key).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Long label used in the detail table
function getBucketLabelLong(key: string, granularity: Granularity): string {
  if (granularity === 'year' || granularity === 'quarter') return key;
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReturnsTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const mwr = payload.find((p: { dataKey: string }) => p.dataKey === 'mwr')?.value;
  const twr = payload.find((p: { dataKey: string }) => p.dataKey === 'twr')?.value;
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {mwr !== undefined && (
        <div className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: '#059669' }} />
            <span className="text-gray-600">MWR</span>
          </span>
          <span className={`font-medium ${mwr >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>{fmt(mwr)}</span>
        </div>
      )}
      {twr !== undefined && (
        <div className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: '#0284c7', borderTop: '1px dashed #0284c7', height: 0 }} />
            <span className="text-gray-600">TWR</span>
          </span>
          <span className={`font-medium ${twr >= 0 ? 'text-sky-700' : 'text-red-500'}`}>{fmt(twr)}</span>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CombinedTip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  const value      = payload.find((p: { dataKey: string }) => p.dataKey === 'value')?.value;
  const netInvested = payload.find((p: { dataKey: string }) => p.dataKey === 'netInvested')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {value !== undefined && (
        <div className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#8b5cf6' }} />
            <span className="text-gray-600">Investment Value</span>
          </span>
          <span className="font-medium text-gray-900">{formatCurrency(value, currency)}</span>
        </div>
      )}
      {netInvested !== undefined && (
        <div className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#a78bfa' }} />
            <span className="text-gray-600">Net Invested</span>
          </span>
          <span className="font-medium text-gray-900">{formatCurrency(netInvested, currency)}</span>
        </div>
      )}
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
      <span className={`font-medium ${v >= 0 ? 'text-violet-600' : 'text-red-500'}`}>
        {v >= 0 ? '+' : ''}{formatCurrency(v, currency)}
      </span>
    </div>
  );
}

function StatCard({ label, value, currency, neutral }: {
  label: string; value: number | null; currency: string; neutral?: boolean;
}) {
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

export default function Performance() {
  const { data, computed } = useData();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [granularity, setGranularity] = useState<Granularity>('period');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showMWR, setShowMWR] = useState(true);
  const [showTWR, setShowTWR] = useState(false);

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const stockAccounts = data.accounts.filter((a) => a.category === 'investments');

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

  function stockValueForPeriod(period: Period): number {
    return stockAccounts.reduce((sum, acc) => {
      const entry = data!.balanceEntries.find((e) => e.accountId === acc.id && e.periodId === period.id);
      if (!entry) return sum;
      if (acc.currency === baseCurrency) return sum + entry.value;
      const rate = data!.exchangeRates.find(
        (r) => r.from === acc.currency && r.to === baseCurrency && r.date === period.date,
      )?.rate ?? 0;
      return sum + entry.value * rate;
    }, 0);
  }

  // Build buckets: one entry per bucket key.
  // Value = snapshot of LAST period in bucket; P&L = sum of all periods in bucket.
  type Bucket = {
    key: string;
    label: string;
    labelLong: string;
    lastPeriod: Period;
    pl: number | null;
  };

  const bucketMap = new Map<string, Bucket>();
  for (const p of periodsInRange) {
    const key = getBucketKey(p.date, granularity);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        label: getBucketLabel(key, granularity),
        labelLong: getBucketLabelLong(key, granularity),
        lastPeriod: p,
        pl: null,
      });
    }
    const bucket = bucketMap.get(key)!;
    bucket.lastPeriod = p; // overwrite → keeps the chronologically last period

    const pl = computed?.periodMetrics[p.id]?.unrealizedPL;
    if (pl != null) bucket.pl = (bucket.pl ?? 0) + pl;
  }

  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  const plData = buckets
    .filter((b) => b.pl !== null)
    .map((b) => ({ date: b.label, pl: b.pl! }));

  // Cumulative net invested: always from full dataset; displayed as of last period in bucket
  const investmentTxs = data.transactions.filter((t) => t.type === 'investment');

  function cumulativeNetInvested(upToDate: string): number {
    return investmentTxs
      .filter((t) => t.date <= upToDate)
      .reduce((sum, t) => {
        if (t.currency === baseCurrency) return sum + t.amount;
        const rate = data!.exchangeRates.find(
          (r) => r.from === t.currency && r.to === baseCurrency && r.date === t.date,
        )?.rate ?? 0;
        return sum + t.amount * rate;
      }, 0);
  }

  // Combined dataset: bars (net invested) + area line (portfolio value) share one X axis
  const combinedData = buckets.map((b) => ({
    date: b.label,
    value: stockValueForPeriod(b.lastPeriod),
    netInvested: cumulativeNetInvested(b.lastPeriod.date),
  }));

  // ── Returns: MWR & TWR via Modified Dietz ────────────────────────────────────
  // Scoped to the selected range. Returns start at 0% at the first period in
  // the range. MWR = Modified Dietz overall from range-start to each period.
  // TWR = chained sub-period Modified Dietz returns.
  function txBase(tx: { amount: number; currency: string; date: string }): number {
    if (tx.currency === baseCurrency) return tx.amount;
    return tx.amount * (data!.exchangeRates.find(
      (r) => r.from === tx.currency && r.to === baseCurrency && r.date === tx.date,
    )?.rate ?? 0);
  }

  const returnsData: { date: string; mwr: number | null; twr: number | null }[] = [];

  if (periodsInRange.length >= 1) {
    const rp0 = periodsInRange[0];
    const v0  = stockValueForPeriod(rp0);
    const d0  = rp0.date;

    const pMWR = new Map<string, number>(); // periodId → cumulative MWR
    const pTWR = new Map<string, number>(); // periodId → cumulative TWR
    pMWR.set(rp0.id, 0);
    pTWR.set(rp0.id, 0);

    let runningTWR = 1.0;

    for (let i = 1; i < periodsInRange.length; i++) {
      const prev = periodsInRange[i - 1];
      const curr = periodsInRange[i];
      const vPrev = stockValueForPeriod(prev);
      const vCurr = stockValueForPeriod(curr);

      // Sub-period flows (prev.date exclusive, curr.date inclusive)
      const subFlows = investmentTxs
        .filter((t) => t.date > prev.date && t.date <= curr.date)
        .map(txBase);
      const subCF = subFlows.reduce((s, v) => s + v, 0);

      // TWR: sub-period Modified Dietz (cashflows at midpoint), then chain
      const spDenom = vPrev + subCF / 2;
      const spR = Math.abs(spDenom) > 0.01 ? (vCurr - vPrev - subCF) / spDenom : 0;
      runningTWR *= (1 + spR);
      pTWR.set(curr.id, runningTWR - 1);

      // MWR: Modified Dietz from range-start to curr
      const T = (new Date(curr.date).getTime() - new Date(d0).getTime()) / 86400000;
      let weightedSum = 0;
      let netSum = 0;
      for (const t of investmentTxs.filter((t) => t.date > d0 && t.date <= curr.date)) {
        const amt = txBase(t);
        const days = (new Date(t.date).getTime() - new Date(d0).getTime()) / 86400000;
        weightedSum += amt * (T > 0 ? (T - days) / T : 0.5);
        netSum += amt;
      }
      const mwrDenom = v0 + weightedSum;
      if (Math.abs(mwrDenom) > 0.01) {
        pMWR.set(curr.id, (vCurr - v0 - netSum) / mwrDenom);
      }
    }

    for (const b of buckets) {
      returnsData.push({
        date: b.label,
        mwr: pMWR.get(b.lastPeriod.id) ?? null,
        twr: pTWR.get(b.lastPeriod.id) ?? null,
      });
    }
  }

  // Stat cards: always reflect the actual latest period snapshot
  const latest = periodsInRange[periodsInRange.length - 1];
  const latestStockValue = latest ? stockValueForPeriod(latest) : null;
  const latestPL = latest ? (computed?.periodMetrics[latest.id]?.unrealizedPL ?? null) : null;
  const cumulativePL = buckets.reduce((s, b) => s + (b.pl ?? 0), 0);

  const noData = allSorted.length < 2;
  const granLabel = granularity.charAt(0).toUpperCase() + granularity.slice(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Investment Performance</h1>
        <p className="text-gray-500 text-sm mt-1">Investment portfolio value and unrealized P&amp;L over time</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
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

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {GRANULARITIES.map(({ key, label }) => (
            <button key={key} onClick={() => setGranularity(key)}
              className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-r-0 ${granularity === key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Investment Value"  value={latestStockValue} currency={baseCurrency} neutral />
        <StatCard label="Last Period P&L"   value={latestPL}         currency={baseCurrency} />
        <StatCard label="Cumulative P&L"    value={plData.length ? cumulativePL : null} currency={baseCurrency} />
      </div>

      {noData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Performance is calculated from the second period onward. Add more data points to see charts.</p>
        </div>
      ) : combinedData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No periods in the selected range.</p>
        </div>
      ) : (
        <>
          {/* Returns chart: MWR & TWR */}
          {returnsData.length >= 2 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Money-Weighted &amp; Time-Weighted Return</h2>
              <p className="text-xs text-gray-400 mb-3">
                Cumulative return from the first period in the selected range. Both use Modified Dietz (GIPS standard; approximates true IRR/XIRR).
              </p>
              {/* Toggles */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => setShowMWR((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    showMWR ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: showMWR ? '#059669' : '#d1d5db' }} />
                  MWR
                </button>
                <button
                  onClick={() => setShowTWR((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    showTWR ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: showTWR ? '#0284c7' : '#d1d5db', borderTop: showTWR ? '1.5px dashed #0284c7' : '1.5px dashed #d1d5db', height: 0 }} />
                  TWR
                </button>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={returnsData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    width={72}
                  />
                  <Tooltip content={<ReturnsTip />} />
                  <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                  {showMWR && (
                    <Line
                      dataKey="mwr"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  )}
                  {showTWR && (
                    <Line
                      dataKey="twr"
                      stroke="#0284c7"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r: 3, fill: '#0284c7', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Combined chart: bars = cumulative net invested, area = portfolio value */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Investment Value vs. Net Invested</h2>
            <p className="text-xs text-gray-400 mb-1">
              Bars: cumulative capital deployed (bought − sold) from the start of the dataset.
              {granularity !== 'period' && ` Line: portfolio value as of the last snapshot in each ${granularity}.`}
            </p>
            {/* Legend */}
            <div className="flex gap-5 mb-4 mt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#a78bfa' }} />
                Net Invested
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="inline-block w-3 h-0.5 shrink-0" style={{ background: '#8b5cf6' }} />
                Investment Value
              </span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={combinedData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
                  width={72}
                />
                <Tooltip content={<CombinedTip currency={baseCurrency} />} />
                <Bar dataKey="netInvested" name="Net Invested" fill="#a78bfa" opacity={0.75} maxBarSize={64} radius={[3, 3, 0, 0]} />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Investment Value"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#stockGradient)"
                  dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart: unrealized P&L — summed per bucket */}
          {plData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4">P&amp;L per {granLabel}</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={plData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, baseCurrency, true)} width={72} />
                  <Tooltip content={<BarTip currency={baseCurrency} />} />
                  <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                  <Bar dataKey="pl" name="Invest. P&L" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {plData.map((d, i) => (
                      <Cell key={i} fill={d.pl >= 0 ? '#8b5cf6' : '#c4b5fd'} opacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-3">
                {granularity === 'period'
                  ? 'P&L = (End investment value − Start investment value) − Net invested in the period.'
                  : `P&L is the sum of per-period P&Ls within each ${granularity}.`}
              </p>
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
                    <th className="px-5 py-3">{granLabel}</th>
                    <th className="px-5 py-3 text-right">
                      Investment Value
                      {granularity !== 'period' && <span className="normal-case font-normal ml-1 text-gray-400">(last snapshot)</span>}
                    </th>
                    <th className="px-5 py-3 text-right">P&amp;L</th>
                    <th className="px-5 py-3 text-right">Net Invested (Cumul.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...buckets].reverse().map((b) => (
                    <tr key={b.key} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">{b.labelLong}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(stockValueForPeriod(b.lastPeriod), baseCurrency)}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${b.pl === null ? 'text-gray-300' : b.pl >= 0 ? 'text-violet-600' : 'text-red-500'}`}>
                        {b.pl !== null ? `${b.pl >= 0 ? '+' : ''}${formatCurrency(b.pl, baseCurrency)}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {formatCurrency(cumulativeNetInvested(b.lastPeriod.date), baseCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
