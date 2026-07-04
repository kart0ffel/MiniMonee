import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Check, ChevronRight, ChevronLeft, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Account, BalanceEntry, Period, Transaction, CATEGORY_LABELS, LEGACY_TRANSACTION_LABELS } from '../types';
import { formatCurrency } from '../utils/currency';
import TransactionInputSection, { TxDraft, TxDrafts, INCOME_OPTIONS, makeEmptyDrafts } from '../components/TransactionInputSection';

type Step = 'date' | 'balances' | 'review_balances' | 'transactions' | 'review';
const STEPS: Step[] = ['date', 'balances', 'review_balances', 'transactions', 'review'];
const STEP_LABELS = ['Date', 'Balances', 'Review', 'Transactions', 'Confirm'];

interface PendingRate { key: string; from: string; to: string; date: string; label: string }

function existingTxLabel(tx: Transaction): string {
  if (tx.type === 'investment')       return tx.amount >= 0 ? 'Investment · Bought' : 'Investment · Sold';
  if (tx.type === 'pension_activity') return tx.amount >= 0 ? 'Pension · Contribution' : 'Pension · Withdrawal';
  if (tx.type === 'tax_paid')         return tx.amount < 0 ? 'Tax Refund' : 'Taxes Paid';
  return LEGACY_TRANSACTION_LABELS[tx.type] ?? tx.type;
}

export default function BalanceInput() {
  const { data, addPeriod, updatePeriod, fetchRate, upsertTransaction } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editPeriodId = params.get('edit');

  const [step, setStep] = useState<Step>('date');
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodNote, setPeriodNote] = useState('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [pendingRates, setPendingRates] = useState<PendingRate[]>([]);
  const [manualRates, setManualRates] = useState<Record<string, string>>({});
  const ratesPanelRef = useRef<HTMLDivElement>(null);

  const baseCurrency = data?.meta.baseCurrency ?? 'USD';

  const [txDrafts, setTxDrafts] = useState<TxDrafts>(() => makeEmptyDrafts(baseCurrency));

  useEffect(() => {
    if (pendingRates.length > 0)
      ratesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pendingRates.length]);

  useEffect(() => {
    if (!editPeriodId || !data) return;
    const period = data.periods.find((p) => p.id === editPeriodId);
    if (!period) return;
    setPeriodDate(period.date);
    setPeriodNote(period.note);
    const existing: Record<string, string> = {};
    data.balanceEntries
      .filter((e) => e.periodId === editPeriodId)
      .forEach((e) => { existing[e.accountId] = String(e.value); });
    setBalances(existing);
  }, [editPeriodId, data]);

  if (!data) return null;

  const prevCandidates = [...data.periods]
    .filter((p) => p.date < periodDate && p.id !== editPeriodId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prevPeriod = prevCandidates.length > 0 ? prevCandidates[prevCandidates.length - 1] : null;

  const prevBalances: Record<string, string> = prevPeriod
    ? Object.fromEntries(
        data.balanceEntries
          .filter((e) => e.periodId === prevPeriod.id)
          .map((e) => [e.accountId, String(e.value)]),
      )
    : {};

  function effectiveValue(accId: string): string {
    const explicit = balances[accId];
    if (explicit !== undefined) return explicit;
    return prevBalances[accId] ?? '';
  }

  const activeAccounts = data.accounts.filter((a) => {
    if (!a.isActive && a.closedAt && a.closedAt < periodDate) return false;
    if (a.createdAt > periodDate) return false;
    return true;
  });

  const grouped = activeAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] ?? []).push(a);
    return acc;
  }, {});

  const prevDateLabel = prevPeriod
    ? new Date(prevPeriod.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'the beginning';
  const currentDateLabel = new Date(periodDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const netWorthEst = activeAccounts.reduce(
    (s, a) => s + (parseFloat(effectiveValue(a.id) || '0') || 0), 0,
  );

  // Existing transactions in the range [prevPeriod.date < date <= periodDate]
  const existingTxsInRange = [...data.transactions]
    .filter((t) => {
      if (t.date > periodDate) return false;
      if (prevPeriod && t.date <= prevPeriod.date) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Build review list of pending new tx items
  type ReviewTxItem = { label: string; amount: string; currency: string; date: string; description: string };
  const activeTxItems: ReviewTxItem[] = [];
  for (const d of txDrafts.income) {
    const amt = parseFloat(d.amount);
    if (d.amount && !isNaN(amt) && amt !== 0) {
      const label = INCOME_OPTIONS.find((o) => o.value === d.subtype)?.label ?? d.subtype;
      activeTxItems.push({ label, amount: d.amount, currency: d.currency, date: d.date || periodDate, description: d.description });
    }
  }
  for (const d of txDrafts.tax) {
    const amt = parseFloat(d.amount);
    if (d.amount && !isNaN(amt) && amt !== 0)
      activeTxItems.push({ label: d.direction === 'in' ? 'Taxes Paid' : 'Tax Refund', amount: d.amount, currency: d.currency, date: d.date || periodDate, description: d.description });
  }
  for (const d of txDrafts.investment) {
    const amt = parseFloat(d.amount);
    if (d.amount && !isNaN(amt) && amt !== 0)
      activeTxItems.push({ label: d.direction === 'in' ? 'Investment Bought' : 'Investment Sold', amount: d.amount, currency: d.currency, date: d.date || periodDate, description: d.description });
  }
  for (const d of txDrafts.pension) {
    const amt = parseFloat(d.amount);
    if (d.amount && !isNaN(amt) && amt !== 0)
      activeTxItems.push({ label: d.direction === 'in' ? 'Pension Contribution' : 'Pension Withdrawal', amount: d.amount, currency: d.currency, date: d.date || periodDate, description: d.description });
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

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
      for (const acc of activeAccounts) {
        if (acc.currency !== baseCurrency)
          await resolveRate(acc.currency, baseCurrency, periodDate, `Balance: ${acc.name}`);
      }
      const txMeta: { drafts: TxDraft[]; label: string }[] = [
        { drafts: txDrafts.income,     label: 'Income' },
        { drafts: txDrafts.tax,        label: 'Taxes' },
        { drafts: txDrafts.investment, label: 'Investment' },
        { drafts: txDrafts.pension,    label: 'Pension' },
      ];
      for (const { drafts, label } of txMeta) {
        for (const d of drafts) {
          const amt = parseFloat(d.amount);
          if (d.currency !== baseCurrency && d.amount && !isNaN(amt) && amt !== 0)
            await resolveRate(d.currency, baseCurrency, d.date || periodDate, label);
        }
      }

      if (failed.length > 0) {
        setPendingRates(failed);
        setLoading(false);
        return;
      }

      const periodId = editPeriodId ?? uuidv4();

      const entries: BalanceEntry[] = activeAccounts.map((acc) => {
        const rawVal = parseFloat(effectiveValue(acc.id) || '0') || 0;
        const rate = acc.currency === baseCurrency
          ? 1
          : (rateCache.get(`${acc.currency}|${baseCurrency}|${periodDate}`) ?? 0);
        return { id: uuidv4(), periodId, accountId: acc.id, value: rawVal, valueInBase: rawVal * rate, exchangeRate: rate };
      });

      const period: Period = {
        id: periodId, date: periodDate, note: periodNote,
        metrics: { totalNetWorth: 0, netWorthByCategory: {}, expenses: null, unrealizedPL: null, pensionPL: null },
      };
      if (editPeriodId) { updatePeriod(period, entries); } else { addPeriod(period, entries); }

      function saveTx(type: Transaction['type'], draft: TxDraft, sign: 1 | -1 = 1) {
        const absAmt = parseFloat(draft.amount);
        if (!absAmt || isNaN(absAmt)) return;
        const txDate = draft.date || periodDate;
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

      for (const d of txDrafts.income)      saveTx(d.subtype,     d,  1);
      for (const d of txDrafts.tax)         saveTx('tax_paid',    d, d.direction === 'in' ? 1 : -1);
      for (const d of txDrafts.investment)   saveTx('investment',        d, d.direction === 'in' ? 1 : -1);
      for (const d of txDrafts.pension)      saveTx('pension_activity',  d, d.direction === 'in' ? 1 : -1);

      setPendingRates([]);
      navigate('/overview');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {editPeriodId ? 'Edit Period' : 'Add New Period'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Enter a snapshot of your account balances</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
              i < stepIdx ? 'bg-brand-600 text-white' :
              i === stepIdx ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' :
              'bg-gray-100 text-gray-400'
            }`}>
              {i < stepIdx ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === stepIdx ? 'text-gray-900' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

        {/* Step 1: Date */}
        {step === 'date' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Period Date</h2>
            <p className="text-sm text-gray-500">Select the date for this balance snapshot (e.g. end of month).</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={periodDate}
                onChange={(e) => setPeriodDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <input type="text" value={periodNote}
                onChange={(e) => setPeriodNote(e.target.value)}
                placeholder="e.g. End of January 2025"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {activeAccounts.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  No active accounts for this date.{' '}
                  <button onClick={() => navigate('/accounts')} className="underline">Add accounts first</button>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Balances */}
        {step === 'balances' && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900">Account Balances</h2>
              <p className="text-sm text-gray-500">
                Enter the balance of each account as of {new Date(periodDate).toLocaleDateString()}.
                {prevPeriod && (
                  <span className="text-gray-400">
                    {' '}Values pre-filled from {new Date(prevPeriod.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.
                  </span>
                )}
              </p>
            </div>
            {Object.entries(grouped).map(([cat, accounts]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
                </h3>
                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="flex items-center gap-3">
                      <label className="flex-1 text-sm text-gray-700 font-medium">{acc.name}</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 w-8 text-right">{acc.currency}</span>
                        <input
                          type="number"
                          value={effectiveValue(acc.id)}
                          onChange={(e) => setBalances((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                          placeholder="0"
                          className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Review Balances */}
        {step === 'review_balances' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Review Balances</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between pb-2 border-b border-gray-200">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{new Date(periodDate).toLocaleDateString()}</span>
              </div>
              {periodNote && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Note</span>
                  <span className="font-medium">{periodNote}</span>
                </div>
              )}
              {activeAccounts.map((acc) => {
                const val = effectiveValue(acc.id);
                return (
                  <div key={acc.id} className="flex justify-between">
                    <span className="text-gray-500">{acc.name}</span>
                    <span className="font-medium tabular-nums">
                      {val !== '' ? Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'} {acc.currency}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                <span className="text-gray-700">Estimated total</span>
                <span className="text-brand-600">{formatCurrency(netWorthEst, baseCurrency, true)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Transactions */}
        {step === 'transactions' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Transactions</h2>
              <p className="text-sm text-gray-500">
                Input all relevant transactions between{' '}
                <span className="font-medium text-gray-700">{prevDateLabel}</span> and{' '}
                <span className="font-medium text-gray-700">{currentDateLabel}</span>.
                Leave blank to skip.
              </p>
            </div>

            {/* Existing transactions in the period window */}
            {existingTxsInRange.length > 0 && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Already recorded ({existingTxsInRange.length})
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {existingTxsInRange.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{existingTxLabel(tx)}</td>
                          <td className={`px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap ${tx.amount < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                            {tx.amount < 0 ? '-' : ''}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{tx.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New transaction input */}
            <div className="pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Add new transactions</p>
              <TransactionInputSection
                txDrafts={txDrafts}
                setTxDrafts={setTxDrafts}
                baseCurrency={baseCurrency}
                periodDate={periodDate}
              />
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Confirm &amp; Save</h2>

            {pendingRates.length > 0 && (
              <div ref={ratesPanelRef} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-800 text-sm font-semibold">
                      Could not fetch {pendingRates.length} exchange rate{pendingRates.length > 1 ? 's' : ''} automatically.
                    </p>
                    <p className="text-amber-700 text-xs mt-0.5">
                      Enter the rates below, then click Save.
                    </p>
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

            <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between pb-2 border-b border-gray-200">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{new Date(periodDate).toLocaleDateString()}</span>
              </div>
              {periodNote && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Note</span>
                  <span className="font-medium">{periodNote}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Accounts</span>
                <span className="font-medium">{activeAccounts.length}</span>
              </div>
              <div className="flex justify-between pt-1 font-semibold">
                <span className="text-gray-700">Net Worth (est.)</span>
                <span className="text-brand-600">{formatCurrency(netWorthEst, baseCurrency, true)}</span>
              </div>
            </div>

            {activeTxItems.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Transactions to save</p>
                {activeTxItems.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-500">
                      {item.label}
                      {item.description && <span className="text-gray-400 ml-1">— {item.description}</span>}
                    </span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(item.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} {item.currency}
                      <span className="text-gray-400 ml-2 font-normal">
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTxItems.length === 0 && (
              <p className="text-xs text-gray-400">No transactions entered — only balances will be saved.</p>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => { if (stepIdx === 0) navigate(-1); else setStep(STEPS[stepIdx - 1]); }}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {stepIdx === 0 ? 'Cancel' : 'Back'}
        </button>

        {step !== 'review' ? (
          <button
            onClick={() => setStep(STEPS[stepIdx + 1])}
            disabled={step === 'date' && activeAccounts.length === 0}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={
              loading ||
              pendingRates.some((r) => {
                const v = parseFloat(manualRates[r.key] ?? '');
                return isNaN(v) || v <= 0;
              })
            }
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {pendingRates.length > 0
              ? 'Save with manual rates'
              : editPeriodId ? 'Save Changes' : 'Save Period'}
          </button>
        )}
      </div>
    </div>
  );
}
