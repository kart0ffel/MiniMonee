import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Check, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Transaction } from '../types';
import TransactionInputSection, {
  TxDraft, TxDrafts, makeEmptyDrafts,
} from '../components/TransactionInputSection';

interface PendingRate { key: string; from: string; to: string; date: string; label: string }

export default function AddTransactions() {
  const { data, fetchRate, upsertTransaction } = useData();
  const baseCurrency = data?.meta.baseCurrency ?? 'USD';

  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));
  const [txDrafts, setTxDrafts] = useState<TxDrafts>(() => makeEmptyDrafts(baseCurrency));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [pendingRates, setPendingRates] = useState<PendingRate[]>([]);
  const [manualRates, setManualRates] = useState<Record<string, string>>({});
  const ratesPanelRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  async function handleSave() {
    setLoading(true);
    setError('');
    setSaved(false);

    const rateCache = new Map<string, number>();
    const failed: PendingRate[] = [];

    async function resolveRate(from: string, to: string, date: string, label: string): Promise<number> {
      if (from === to) return 1;
      const key = `${from}|${to}|${date}`;
      if (rateCache.has(key)) return rateCache.get(key)!;
      const manual = parseFloat(manualRates[key] ?? '');
      if (!isNaN(manual) && manual > 0) { rateCache.set(key, manual); return manual; }
      try {
        const r = await fetchRate(date, from, to);
        rateCache.set(key, r);
        return r;
      } catch {
        if (!failed.some((f) => f.key === key))
          failed.push({ key, from, to, date, label });
        return 0;
      }
    }

    try {
      // Pre-resolve all rates needed
      const allDrafts: { draft: TxDraft; label: string }[] = [
        ...txDrafts.income.map((d) => ({ draft: d, label: 'Income' })),
        ...txDrafts.tax.map((d) => ({ draft: d, label: 'Taxes' })),
        ...txDrafts.investment.map((d) => ({ draft: d, label: 'Investment' })),
        ...txDrafts.pension.map((d) => ({ draft: d, label: 'Pension' })),
      ];
      for (const { draft: d, label } of allDrafts) {
        const amt = parseFloat(d.amount);
        if (d.currency !== baseCurrency && d.amount && !isNaN(amt) && amt !== 0)
          await resolveRate(d.currency, baseCurrency, d.date || defaultDate, label);
      }

      if (failed.length > 0) {
        setPendingRates(failed);
        ratesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setLoading(false);
        return;
      }

      function saveTx(type: Transaction['type'], draft: TxDraft, sign: 1 | -1 = 1) {
        const absAmt = parseFloat(draft.amount);
        if (!absAmt || isNaN(absAmt)) return;
        const txDate = draft.date || defaultDate;
        const rate = draft.currency === baseCurrency
          ? 1
          : (rateCache.get(`${draft.currency}|${baseCurrency}|${txDate}`) ?? 0);
        const amount = absAmt * sign;
        upsertTransaction({
          id: uuidv4(), periodId: null, date: txDate, type, amount,
          currency: draft.currency, amountInBase: amount * rate,
          exchangeRate: rate, description: draft.description,
        });
      }

      let count = 0;
      for (const d of txDrafts.income) {
        const amt = parseFloat(d.amount);
        if (d.amount && !isNaN(amt) && amt !== 0) { saveTx(d.subtype, d, 1); count++; }
      }
      for (const d of txDrafts.tax) {
        const amt = parseFloat(d.amount);
        if (d.amount && !isNaN(amt) && amt !== 0) { saveTx('tax_paid', d, d.direction === 'in' ? 1 : -1); count++; }
      }
      for (const d of txDrafts.investment) {
        const amt = parseFloat(d.amount);
        if (d.amount && !isNaN(amt) && amt !== 0) { saveTx('investment', d, d.direction === 'in' ? 1 : -1); count++; }
      }
      for (const d of txDrafts.pension) {
        const amt = parseFloat(d.amount);
        if (d.amount && !isNaN(amt) && amt !== 0) { saveTx('pension_activity', d, d.direction === 'in' ? 1 : -1); count++; }
      }

      if (count === 0) { setError('No transactions to save — fill in at least one amount.'); setLoading(false); return; }

      setPendingRates([]);
      setManualRates({});
      setTxDrafts(makeEmptyDrafts(baseCurrency));
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Transactions</h1>
        <p className="text-gray-500 text-sm mt-1">Record income, investments, taxes, or pension activity independently of a balance period.</p>
      </div>

      {/* Default date */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Default date</label>
        <p className="text-xs text-gray-400 mb-2">Used for any row where you leave the date blank.</p>
        <input
          type="date"
          value={defaultDate}
          onChange={(e) => setDefaultDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Transaction input */}
      <div className="space-y-4">
        <TransactionInputSection
          txDrafts={txDrafts}
          setTxDrafts={setTxDrafts}
          baseCurrency={baseCurrency}
          periodDate={defaultDate}
        />
      </div>

      {/* Manual rate panel */}
      {pendingRates.length > 0 && (
        <div ref={ratesPanelRef} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 text-sm font-semibold">
                Could not fetch {pendingRates.length} exchange rate{pendingRates.length > 1 ? 's' : ''} automatically.
              </p>
              <p className="text-amber-700 text-xs mt-0.5">Enter the rates below, then click Save.</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingRates.map((r) => (
              <div key={r.key} className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-semibold text-gray-800">{r.from}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-sm font-semibold text-gray-800">{r.to}</span>
                  <span className="text-xs text-gray-400 ml-1">
                    {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <span className="text-xs text-gray-500 italic shrink-0">{r.label}</span>
                <input
                  type="number" min="0" step="any"
                  placeholder={`1 ${r.from} = ? ${r.to}`}
                  value={manualRates[r.key] ?? ''}
                  onChange={(e) => setManualRates((prev) => ({ ...prev, [r.key]: e.target.value }))}
                  className="w-48 border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-emerald-700 text-sm font-medium">Transactions saved successfully.</p>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading || pendingRates.some((r) => {
            const v = parseFloat(manualRates[r.key] ?? '');
            return isNaN(v) || v <= 0;
          })}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {pendingRates.length > 0 ? 'Save with manual rates' : 'Save Transactions'}
        </button>
      </div>
    </div>
  );
}
