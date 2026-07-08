import { useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

type DCAFreq = 'monthly' | 'quarterly' | 'annual';
type VolFreq  = 'annual' | 'monthly';

const DCA_FREQS: { key: DCAFreq; label: string; perMonth: number }[] = [
  { key: 'monthly',   label: 'Monthly',   perMonth: 1      },
  { key: 'quarterly', label: 'Quarterly', perMonth: 1 / 3  },
  { key: 'annual',    label: 'Annually',  perMonth: 1 / 12 },
];

const YEAR_OPTIONS = [5, 10, 15, 20, 25, 30, 40];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProjectionTip({ active, payload, baseCurrency }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const yrs = pt.t / 12;
  const label = yrs === 0 ? 'Now' : `${Number.isInteger(yrs) ? yrs : yrs.toFixed(1)} years`;
  const gain = pt.expected - pt.contributed;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[230px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-6 py-0.5">
          <span className="text-gray-400">Upper (+1σ)</span>
          <span className="font-medium text-green-600">{formatCurrency(pt.upper, baseCurrency)}</span>
        </div>
        <div className="flex justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block w-3 h-0.5 shrink-0" style={{ background: '#7c3aed' }} />
            Expected
          </span>
          <span className="font-medium text-violet-700">{formatCurrency(pt.expected, baseCurrency)}</span>
        </div>
        <div className="flex justify-between gap-6 py-0.5">
          <span className="text-gray-400">Lower (−1σ)</span>
          <span className="font-medium text-red-500">{formatCurrency(pt.lower, baseCurrency)}</span>
        </div>
        <div className="flex justify-between gap-6 py-0.5 border-t border-gray-100 mt-1 pt-1.5">
          <span className="text-gray-500">Contributed</span>
          <span className="font-medium text-gray-600">{formatCurrency(pt.contributed, baseCurrency)}</span>
        </div>
        <div className="flex justify-between gap-6 py-0.5">
          <span className="text-gray-500">Expected gain</span>
          <span className={`font-medium ${gain >= 0 ? 'text-violet-700' : 'text-red-500'}`}>
            {gain >= 0 ? '+' : ''}{formatCurrency(gain, baseCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Projections() {
  const { data } = useData();
  const baseCurrency = data?.meta.baseCurrency ?? 'USD';
  const stockAccounts = data ? data.accounts.filter((a) => a.category === 'investments') : [];
  const allSorted = data
    ? [...data.periods].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const latestPeriod = allSorted[allSorted.length - 1];
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(latestPeriod?.date ?? today);
  const [startValueStr, setStartValueStr] = useState('');
  const [dcaAmount, setDcaAmount] = useState('500');
  const [dcaFrequency, setDcaFrequency] = useState<DCAFreq>('monthly');
  const [growthRate, setGrowthRate] = useState('7');
  const [volatility, setVolatility] = useState('20');
  const [volFrequency, setVolFrequency] = useState<VolFreq>('annual');
  const [projectionYears, setProjectionYears] = useState(10);

  // Closest period to startDate
  const closestPeriod = allSorted.length > 0
    ? allSorted.reduce((best, p) => {
        const bd = Math.abs(new Date(best.date).getTime() - new Date(startDate).getTime());
        const pd = Math.abs(new Date(p.date).getTime() - new Date(startDate).getTime());
        return pd < bd ? p : best;
      })
    : null;

  function investValueForPeriod(periodId: string, periodDate: string): number {
    if (!data) return 0;
    return stockAccounts.reduce((sum, acc) => {
      const entry = data.balanceEntries.find((e) => e.accountId === acc.id && e.periodId === periodId);
      if (!entry) return sum;
      if (acc.currency === baseCurrency) return sum + entry.value;
      const rate = data.exchangeRates.find(
        (r) => r.from === acc.currency && r.to === baseCurrency && r.date === periodDate,
      )?.rate ?? 0;
      return sum + entry.value * rate;
    }, 0);
  }

  const autoStartValue = closestPeriod ? investValueForPeriod(closestPeriod.id, closestPeriod.date) : 0;
  const effectiveStart = startValueStr !== '' ? (parseFloat(startValueStr) || 0) : autoStartValue;

  const dcaPerMonth = (parseFloat(dcaAmount) || 0)
    * (DCA_FREQS.find((f) => f.key === dcaFrequency)?.perMonth ?? 1);

  const σAnnual = (parseFloat(volatility) || 0) / 100
    * (volFrequency === 'monthly' ? Math.sqrt(12) : 1);

  // Projection data (quarterly resolution for long ranges, monthly for short)
  const projData = useMemo(() => {
    const r   = (parseFloat(growthRate) || 0) / 100;
    const r_m = Math.pow(1 + r, 1 / 12) - 1;
    const totalMonths = projectionYears * 12;
    const step = totalMonths <= 60 ? 1 : totalMonths <= 240 ? 3 : 6;

    type Pt = {
      t: number; lowerBase: number; bandHeight: number;
      expected: number; contributed: number; upper: number; lower: number;
    };

    function at(t: number): Pt {
      const grow = Math.pow(1 + r_m, t);
      const expected = effectiveStart * grow
        + (Math.abs(r_m) > 1e-9
          ? dcaPerMonth * (grow - 1) / r_m
          : dcaPerMonth * t);
      const contributed = effectiveStart + dcaPerMonth * t;
      const yrs = t / 12;
      const bf  = yrs > 0 ? Math.exp(σAnnual * Math.sqrt(yrs)) : 1;
      const upper = expected * bf;
      const lower = expected / bf;
      return { t, lowerBase: lower, bandHeight: Math.max(0, upper - lower), expected, contributed, upper, lower };
    }

    const pts: Pt[] = [];
    for (let t = 0; t <= totalMonths; t += step) pts.push(at(t));
    if (pts[pts.length - 1].t < totalMonths) pts.push(at(totalMonths));
    return pts;
  }, [growthRate, projectionYears, effectiveStart, dcaPerMonth, σAnnual]);

  const finalPt  = projData[projData.length - 1];
  const yearTicks = Array.from({ length: projectionYears + 1 }, (_, i) => i * 12);

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Investment Projections</h1>
        <p className="text-gray-500 text-sm mt-1">
          Simulate future portfolio growth with DCA. The band shows a ±1σ lognormal confidence interval.
        </p>
      </div>

      {/* Inputs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Assumptions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Starting date */}
          <div>
            <label className={lbl}>Starting Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setStartValueStr(''); }}
              className={inp}
            />
            {closestPeriod && closestPeriod.date !== startDate && (
              <p className="text-xs text-gray-400 mt-1">
                Using {new Date(closestPeriod.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>

          {/* Starting value */}
          <div>
            <label className={lbl}>
              Starting Value ({baseCurrency})
              {startValueStr === '' && (
                <span className="ml-1 font-normal text-gray-400">auto</span>
              )}
            </label>
            <input
              type="number"
              min="0"
              value={startValueStr}
              onChange={(e) => setStartValueStr(e.target.value)}
              placeholder={String(Math.round(autoStartValue))}
              className={inp}
            />
          </div>

          {/* Growth rate */}
          <div>
            <label className={lbl}>Annual Growth (%)</label>
            <input
              type="number"
              step="0.5"
              value={growthRate}
              onChange={(e) => setGrowthRate(e.target.value)}
              className={inp}
            />
          </div>

          {/* Volatility with monthly/annual toggle */}
          <div>
            <label className={lbl}>
              <span className="mr-2">Volatility (%)</span>
              <span className="inline-flex rounded overflow-hidden border border-gray-200 text-xs font-normal">
                {(['annual', 'monthly'] as VolFreq[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setVolFrequency(k)}
                    className={`px-1.5 py-0.5 transition-colors ${volFrequency === k ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    {k === 'annual' ? 'yr' : 'mo'}
                  </button>
                ))}
              </span>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={volatility}
              onChange={(e) => setVolatility(e.target.value)}
              className={inp}
            />
          </div>

          {/* DCA amount */}
          <div>
            <label className={lbl}>DCA Amount ({baseCurrency})</label>
            <input
              type="number"
              min="0"
              value={dcaAmount}
              onChange={(e) => setDcaAmount(e.target.value)}
              className={inp}
            />
          </div>

          {/* DCA frequency */}
          <div>
            <label className={lbl}>DCA Frequency</label>
            <select
              value={dcaFrequency}
              onChange={(e) => setDcaFrequency(e.target.value as DCAFreq)}
              className={inp}
            >
              {DCA_FREQS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>

          {/* Projection years */}
          <div>
            <label className={lbl}>Projection Period</label>
            <select
              value={projectionYears}
              onChange={(e) => setProjectionYears(Number(e.target.value))}
              className={inp}
            >
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y} years</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: `Expected in ${projectionYears}Y`, val: finalPt?.expected ?? 0,   cls: 'text-violet-700' },
          { label: 'Best case (+1σ)',                   val: finalPt?.upper ?? 0,      cls: 'text-green-600'  },
          { label: 'Worst case (−1σ)',                  val: finalPt?.lower ?? 0,      cls: 'text-red-500'    },
          { label: 'Total Contributed',                 val: finalPt?.contributed ?? 0, cls: 'text-gray-900'  },
        ].map(({ label, val, cls }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{formatCurrency(val, baseCurrency, true)}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Projection</h2>
        <div className="flex flex-wrap gap-5 mb-4">
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-8 h-3 rounded-sm" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }} />
            ±1σ range
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-0.5 shrink-0" style={{ background: '#7c3aed' }} />
            Expected (geometric mean)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 shrink-0" style={{ borderTop: '1.5px dashed #a78bfa', height: 0 }} />
            Contributed
          </span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={projData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, projectionYears * 12]}
              ticks={yearTicks}
              tickFormatter={(v) => v === 0 ? 'Now' : `${v / 12}Y`}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, baseCurrency, true)}
              width={80}
            />
            <Tooltip content={<ProjectionTip baseCurrency={baseCurrency} />} />
            {/* Band: stacked transparent base + colored overlay */}
            <Area dataKey="lowerBase" fill="transparent" stroke="none" stackId="band" isAnimationActive={false} />
            <Area
              dataKey="bandHeight"
              fill="rgba(139,92,246,0.15)"
              stroke="rgba(139,92,246,0.35)"
              strokeWidth={0.5}
              stackId="band"
              isAnimationActive={false}
            />
            {/* Expected line */}
            <Line dataKey="expected" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {/* Contributed line */}
            <Line dataKey="contributed" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 mt-3">
          Band = expected × exp(±σ√t), where σ is annualised volatility and t is time in years.
          Expected = V₀(1+r)^t + DCA × [(1+r)^t − 1] / r. Values in {baseCurrency}.
        </p>
      </div>
    </div>
  );
}
