import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Check, ChevronRight, ChevronLeft, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Account, BalanceEntry, Period, Transaction, CATEGORY_LABELS } from '../types';
import { formatCurrency, CURRENCIES } from '../utils/currency';

type Step = 'date' | 'balances' | 'review_balances' | 'transactions' | 'review';

const STEPS: Step[] = ['date', 'balances', 'review_balances', 'transactions', 'review'];
const STEP_LABELS = ['Date', 'Balances', 'Review', 'Transactions', 'Confirm'];

interface TxDraft { amount: string; currency: string; }
interface TxDrafts {
  salary: TxDraft; dividend: TxDraft; tax: TxDraft;
  investBought: TxDraft; investSold: TxDraft;
  pensionContrib: TxDraft; pensionWithdraw: TxDraft;
}

const TX_LABELS: Record<keyof TxDrafts, string> = {
  salary: 'Salary / Income', dividend: 'Dividends', tax: 'Taxes Paid',
  investBought: 'Investment Bought', investSold: 'Investment Sold',
  pensionContrib: 'Pension Contribution', pensionWithdraw: 'Pension Withdrawal',
};

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

  function emptyDrafts(): TxDrafts {
    const d = { amount: '', currency: baseCurrency };
    return {
      salary: { ...d }, dividend: { ...d }, tax: { ...d },
      investBought: { ...d }, investSold: { ...d },
      pensionContrib: { ...d }, pensionWithdraw: { ...d },
    };
  }
  const [txDrafts, setTxDrafts] = useState<TxDrafts>(emptyDrafts);

  function updateTx(field: keyof TxDrafts, key: 'amount' | 'currency', value: string) {
    setTxDrafts((prev: TxDrafts) => ({ ...prev, [field]: { ...prev[field], [key]: value } }));
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

  // Most recent period before periodDate — used for default balance values and date label
  const prevCandidates = [...data.periods]
    .filter((p) => p.date < periodDate && p.id !== editPeriodId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prevPeriod = prevCandidates[prevCandidates.length - 1];

  const prevBalances: Record<string, string> = prevPeriod
    ? Object.fromEntries(
        data.balanceEntries
          .filter((e) => e.periodId === prevPeriod.id)
          .map((e) => [e.accountId, String(e.value)]),
      )
    : {};

  function effectiveValue(accId: string): string {
    return balances[accId] ?? prevBalances[accId] ?? '';
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

  const activeTxDrafts = (Object.entries(txDrafts) as [keyof TxDrafts, TxDraft][])
    .filter(([, d]) => d.amount !== '' && parseFloat(d.amount) !== 0);

  // Called as a function (not a component) to avoid remount/focus loss on keystroke
  function txRow(field: keyof TxDrafts) {
    const draft = txDrafts[field];
    return (
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span className="text-xs font-medium text-gray-600 w-24 shrink-0 truncate">{TX_LABELS[field]}</span>
        <input
          type="number"
          min="0"
          step="any"
          value={draft.amount}
          onChange={(e) => updateTx(field, 'amount', e.target.value)}
          placeholder="0"
          className="flex-1 min-w-0 text-right text-sm bg-transparent outline-none placeholder-gray-300 focus:placeholder-transparent"
        />
        <select
          value={draft.currency}
          onChange={(e) => updateTx(field, 'currency', e.target.value)}
          className="text-xs text-gray-500 bg-transparent outline-none cursor-pointer ml-1 shrink-0"
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setSubmitWarnings([]);
    const warnings: string[] = [];
    try {
      const periodId = editPeriodId ?? uuidv4();

      // --- Balance entries ---
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

      if (editPeriodId) { updatePeriod(period, entries); }
      else { addPeriod(period, entries); }

      // --- Transactions ---
      type TxSpec = { field: keyof TxDrafts; type: Transaction['type']; sign: 1 | -1 };
      const TX_SPECS: TxSpec[] = [
        { field: 'salary',        type: 'income_salary',   sign:  1 },
        { field: 'dividend',      type: 'income_dividend', sign:  1 },
        { field: 'tax',           type: 'tax_paid',        sign: -1 },
        { field: 'investBought',  type: 'investment',      sign:  1 },
        { field: 'investSold',    type: 'investment',      sign: -1 },
        { field: 'pensionContrib',type: 'pension_activity',sign:  1 },
        { field: 'pensionWithdraw',type:'pension_activity',sign: -1 },
      ];
      for (const spec of TX_SPECS) {
        const draft = txDrafts[spec.field];
        const absAmt = parseFloat(draft.amount);
        if (!absAmt || isNaN(absAmt)) continue;
        const amount = absAmt * spec.sign;
        let rate = 1;
        if (draft.currency !== baseCurrency) {
          try { rate = await fetchRate(periodDate, draft.currency, baseCurrency); }
          catch { warnings.push(`${TX_LABELS[spec.field]} (${draft.currency}→${baseCurrency})`); rate = 0; }
        }
        upsertTransaction({
          id: uuidv4(), periodId: null, date: periodDate,
          type: spec.type, amount, currency: draft.currency,
          amountInBase: amount * rate, exchangeRate: rate, description: '',
        });
      }

      if (warnings.length > 0) { setSubmitWarnings(warnings); setSaved(true); }
      else { navigate('/overview'); }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const stepIdx = STEPS.indexOf(step);
  const netWorthEst = activeAccounts.reduce((s, a) => s + (parseFloat(effectiveValue(a.id) || '0') || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
              <input
                type="date" value={periodDate}
                onChange={(e) => setPeriodDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <input
                type="text" value={periodNote}
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
                Enter the balance of each account as of {new Date(periodDate).toLocaleDateString()}. Values in each account's own currency.
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
                          onChange={(e) => setBalances({ ...balances, [acc.id]: e.target.value })}
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

            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Income</p>
              <div className="grid grid-cols-2 gap-2">
                {txRow('salary')}
                {txRow('dividend')}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Taxes</p>
              <div className="grid grid-cols-2 gap-2">
                {txRow('tax')}
                <div />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Investment</p>
              <div className="grid grid-cols-2 gap-2">
                {txRow('investBought')}
                {txRow('investSold')}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">Pension</p>
              <div className="grid grid-cols-2 gap-2">
                {txRow('pensionContrib')}
                {txRow('pensionWithdraw')}
              </div>
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

            {activeTxDrafts.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Transactions to save</p>
                {activeTxDrafts.map(([field, draft]) => (
                  <div key={field} className="flex justify-between">
                    <span className="text-gray-500">{TX_LABELS[field]}</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(draft.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} {draft.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTxDrafts.length === 0 && (
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
