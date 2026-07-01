import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Check, ChevronRight, ChevronLeft, AlertCircle, Loader, Plus } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Account, BalanceEntry, Period, Transaction, CATEGORY_LABELS } from '../types';
import { formatCurrency, CURRENCIES } from '../utils/currency';

type Step = 'date' | 'balances' | 'review_balances' | 'transactions' | 'review';
const STEPS: Step[] = ['date', 'balances', 'review_balances', 'transactions', 'review'];
const STEP_LABELS = ['Date', 'Balances', 'Review', 'Transactions', 'Confirm'];

interface TxDraft { date: string; amount: string; currency: string; description: string; }
interface TxDraftWithDir extends TxDraft { direction: 'in' | 'out'; }
interface TxDrafts {
  salary: TxDraft[];
  dividend: TxDraft[];
  tax: TxDraft[];
  investment: TxDraftWithDir[];
  pension: TxDraftWithDir[];
}

// First column width shared by label spans and direction-toggle wrappers — keeps
// all date / amount / currency / description inputs vertically aligned.
const COL1 = 'w-48 shrink-0';

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
  const [submitWarnings, setSubmitWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const baseCurrency = data?.meta.baseCurrency ?? 'USD';

  function emptyDraft(): TxDraft {
    return { date: '', amount: '', currency: baseCurrency, description: '' };
  }
  function emptyDrafts(): TxDrafts {
    const d = emptyDraft();
    return {
      salary: [{ ...d }],
      dividend: [{ ...d }],
      tax: [{ ...d }],
      investment: [{ ...d, direction: 'in' as const }],
      pension: [{ ...d, direction: 'in' as const }],
    };
  }
  const [txDrafts, setTxDrafts] = useState<TxDrafts>(emptyDrafts);

  function updateTx(
    field: keyof TxDrafts,
    idx: number,
    key: 'date' | 'amount' | 'currency' | 'description',
    value: string,
  ) {
    setTxDrafts((prev) => ({
      ...prev,
      [field]: prev[field].map((d, i) => (i === idx ? { ...d, [key]: value } : d)),
    }));
  }

  function toggleDir(field: 'investment' | 'pension', idx: number) {
    setTxDrafts((prev) => ({
      ...prev,
      [field]: (prev[field] as TxDraftWithDir[]).map((d, i) =>
        i === idx ? { ...d, direction: d.direction === 'in' ? 'out' : 'in' } : d,
      ),
    }));
  }

  function addRow(field: keyof TxDrafts) {
    const d = emptyDraft();
    if (field === 'investment' || field === 'pension') {
      setTxDrafts((prev) => ({
        ...prev,
        [field]: [...(prev[field] as TxDraftWithDir[]), { ...d, direction: 'in' as const }],
      }));
    } else {
      setTxDrafts((prev) => ({
        ...prev,
        [field]: [...(prev[field] as TxDraft[]), d],
      }));
    }
  }

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

  // Shared input class helpers
  const dateInputCls = 'w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0';
  const amountInputCls = 'w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0';
  const currencySelectCls = 'w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none shrink-0';
  const descInputCls = 'flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500';

  // Plain render functions (not React components) to avoid focus loss on keystroke

  function renderTxRow(
    field: 'salary' | 'dividend' | 'tax',
    label: string,
    draft: TxDraft,
    idx: number,
  ) {
    return (
      <div key={idx} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0">
        <span className={`${COL1} text-sm font-medium text-gray-700`}>
          {idx === 0 ? label : ''}
        </span>
        <input type="date" value={draft.date || periodDate}
          onChange={(e) => updateTx(field, idx, 'date', e.target.value)} className={dateInputCls} />
        <input type="number" min="0" step="any" value={draft.amount} placeholder="0"
          onChange={(e) => updateTx(field, idx, 'amount', e.target.value)} className={amountInputCls} />
        <select value={draft.currency}
          onChange={(e) => updateTx(field, idx, 'currency', e.target.value)} className={currencySelectCls}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={draft.description} placeholder="Description (optional)"
          onChange={(e) => updateTx(field, idx, 'description', e.target.value)} className={descInputCls} />
      </div>
    );
  }

  function renderDirTxRow(
    field: 'investment' | 'pension',
    inLabel: string,
    outLabel: string,
    draft: TxDraftWithDir,
    idx: number,
  ) {
    const dir = draft.direction;
    return (
      <div key={idx} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0">
        <div className={COL1}>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button type="button" onClick={() => { if (dir !== 'in') toggleDir(field, idx); }}
              className={`px-2 py-1.5 font-medium transition-colors ${dir === 'in' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {inLabel}
            </button>
            <button type="button" onClick={() => { if (dir !== 'out') toggleDir(field, idx); }}
              className={`px-2 py-1.5 font-medium transition-colors border-l border-gray-200 ${dir === 'out' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {outLabel}
            </button>
          </div>
        </div>
        <input type="date" value={draft.date || periodDate}
          onChange={(e) => updateTx(field, idx, 'date', e.target.value)} className={dateInputCls} />
        <input type="number" min="0" step="any" value={draft.amount} placeholder="0"
          onChange={(e) => updateTx(field, idx, 'amount', e.target.value)} className={amountInputCls} />
        <select value={draft.currency}
          onChange={(e) => updateTx(field, idx, 'currency', e.target.value)} className={currencySelectCls}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={draft.description} placeholder="Description (optional)"
          onChange={(e) => updateTx(field, idx, 'description', e.target.value)} className={descInputCls} />
      </div>
    );
  }

  function addRowButton(field: keyof TxDrafts) {
    return (
      <button
        type="button"
        onClick={() => addRow(field)}
        className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another
      </button>
    );
  }

  // Build review list of active tx items
  type ReviewTxItem = { label: string; amount: string; currency: string; date: string; description: string };
  const activeTxItems: ReviewTxItem[] = [];
  const simpleMeta: { field: 'salary' | 'dividend' | 'tax'; label: string }[] = [
    { field: 'salary', label: 'Salary / Income' },
    { field: 'dividend', label: 'Dividends' },
    { field: 'tax', label: 'Taxes Paid' },
  ];
  for (const { field, label } of simpleMeta) {
    for (const d of txDrafts[field]) {
      const amt = parseFloat(d.amount);
      if (d.amount && !isNaN(amt) && amt !== 0)
        activeTxItems.push({ label, amount: d.amount, currency: d.currency, date: d.date || periodDate, description: d.description });
    }
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
    setSubmitWarnings([]);
    const warnings: string[] = [];
    try {
      const periodId = editPeriodId ?? uuidv4();

      // Balance entries
      const entries: BalanceEntry[] = [];
      for (const acc of activeAccounts) {
        const rawVal = parseFloat(effectiveValue(acc.id) || '0') || 0;
        let rate = 1;
        if (acc.currency !== baseCurrency) {
          try { rate = await fetchRate(periodDate, acc.currency, baseCurrency); }
          catch { warnings.push(`${acc.name} (${acc.currency}→${baseCurrency})`); rate = 0; }
        }
        entries.push({ id: uuidv4(), periodId, accountId: acc.id, value: rawVal, valueInBase: rawVal * rate, exchangeRate: rate });
      }

      const period: Period = {
        id: periodId, date: periodDate, note: periodNote,
        metrics: { totalNetWorth: 0, netWorthByCategory: {}, expenses: null, unrealizedPL: null, pensionPL: null },
      };
      if (editPeriodId) { updatePeriod(period, entries); } else { addPeriod(period, entries); }

      // Helper to save one tx
      async function saveTx(
        type: Transaction['type'],
        draft: TxDraft,
        sign: 1 | -1 = 1,
      ) {
        const absAmt = parseFloat(draft.amount);
        if (!absAmt || isNaN(absAmt)) return;
        const amount = absAmt * sign;
        const txDate = draft.date || periodDate;
        let rate = 1;
        if (draft.currency !== baseCurrency) {
          try { rate = await fetchRate(txDate, draft.currency, baseCurrency); }
          catch { warnings.push(`${type} (${draft.currency}→${baseCurrency})`); rate = 0; }
        }
        upsertTransaction({
          id: uuidv4(), periodId: null, date: txDate, type, amount,
          currency: draft.currency, amountInBase: amount * rate,
          exchangeRate: rate, description: draft.description,
        });
      }

      for (const d of txDrafts.salary)    await saveTx('income_salary',   d,  1);
      for (const d of txDrafts.tax)       await saveTx('tax_paid',        d,  1);
      for (const d of txDrafts.dividend)  await saveTx('income_dividend', d,  1);
      for (const d of txDrafts.investment) await saveTx('investment',     d, d.direction === 'in' ? 1 : -1);
      for (const d of txDrafts.pension)   await saveTx('pension_activity', d, d.direction === 'in' ? 1 : -1);

      if (warnings.length > 0) { setSubmitWarnings(warnings); setSaved(true); }
      else { navigate('/overview'); }
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

            {/* Income */}
            <div className="rounded-xl border border-emerald-200 overflow-hidden">
              <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Income</span>
              </div>
              {txDrafts.salary.map((d, i) => renderTxRow('salary', 'Salary / Income', d, i))}
              {addRowButton('salary')}
            </div>

            {/* Investment */}
            <div className="rounded-xl border border-violet-200 overflow-hidden">
              <div className="bg-violet-50 px-4 py-2 border-b border-violet-100">
                <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Investment</span>
              </div>
              <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock Purchases / Sells</span>
              </div>
              {txDrafts.investment.map((d, i) => renderDirTxRow('investment', 'Bought', 'Sold', d, i))}
              {addRowButton('investment')}
              <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dividends</span>
              </div>
              {txDrafts.dividend.map((d, i) => renderTxRow('dividend', 'Dividends', d, i))}
              {addRowButton('dividend')}
            </div>

            {/* Taxes */}
            <div className="rounded-xl border border-red-200 overflow-hidden">
              <div className="bg-red-50 px-4 py-2 border-b border-red-100">
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Taxes</span>
              </div>
              <p className="px-4 py-2 text-xs text-gray-500 italic border-b border-red-100">
                Add the taxes you paid in this period as a positive value.
              </p>
              {txDrafts.tax.map((d, i) => renderTxRow('tax', 'Taxes Paid', d, i))}
              {addRowButton('tax')}
            </div>

            {/* Pension */}
            <div className="rounded-xl border border-indigo-200 overflow-hidden">
              <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Pension</span>
              </div>
              {txDrafts.pension.map((d, i) => renderDirTxRow('pension', 'Contribution', 'Withdrawal', d, i))}
              {addRowButton('pension')}
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Confirm &amp; Save</h2>
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

            {submitWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-800 text-sm font-medium">
                    Saved — but {submitWarnings.length} exchange rate{submitWarnings.length > 1 ? 's' : ''} could not be fetched:
                  </p>
                </div>
                <ul className="pl-6 space-y-0.5">
                  {submitWarnings.map((w, i) => <li key={i} className="text-amber-700 text-xs">• {w}</li>)}
                </ul>
                <p className="text-amber-700 text-xs pl-6">
                  Use <strong>Refetch Missing Rates</strong> in Data Manager to fix these later.
                </p>
              </div>
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
        ) : saved ? (
          <button
            onClick={() => navigate('/overview')}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            Continue to Overview
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editPeriodId ? 'Save Changes' : 'Save Period'}
          </button>
        )}
      </div>
    </div>
  );
}
