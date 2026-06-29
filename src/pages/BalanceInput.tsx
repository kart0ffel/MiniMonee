import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Check, ChevronRight, ChevronLeft, Plus, Trash2, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import {
  Account, BalanceEntry, Transaction, Period, TransactionType,
  CATEGORY_LABELS, TRANSACTION_LABELS,
} from '../types';
import { formatCurrency, CURRENCIES } from '../utils/currency';

type Step = 'date' | 'balances' | 'transactions' | 'review';

interface TxDraft {
  id: string;
  date: string;
  type: TransactionType;
  amount: string;
  currency: string;
  description: string;
  direction: string; // 'in' | 'out' — applies to investment and pension_activity
}

const TX_TYPES: TransactionType[] = [
  'income_salary', 'income_dividend', 'tax_paid',
  'investment',
  'pension_activity',
];

export default function BalanceInput() {
  const { data, addPeriod, updatePeriod, fetchRate } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editPeriodId = params.get('edit');

  const [step, setStep] = useState<Step>('date');
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodNote, setPeriodNote] = useState('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [txDrafts, setTxDrafts] = useState<TxDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitWarnings, setSubmitWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const baseCurrency = data?.meta.baseCurrency ?? 'USD';

  // Load existing period for edit mode
  useEffect(() => {
    if (!editPeriodId || !data) return;
    const period = data.periods.find((p) => p.id === editPeriodId);
    if (!period) return;
    setPeriodDate(period.date);
    setPeriodNote(period.note);
    const existingBalances: Record<string, string> = {};
    data.balanceEntries
      .filter((e) => e.periodId === editPeriodId)
      .forEach((e) => { existingBalances[e.accountId] = String(e.value); });
    setBalances(existingBalances);
    const existingTxs: TxDraft[] = data.transactions
      .filter((t) => t.periodId === editPeriodId)
      .map((t) => {
        const raw = t.type as string;
        let type: TransactionType = t.type;
        let direction = 'in';
        if (raw === 'investment_bought') { type = 'investment'; direction = 'in'; }
        else if (raw === 'investment_sold') { type = 'investment'; direction = 'out'; }
        else if (raw === 'pension_contribution') { type = 'pension_activity'; direction = 'in'; }
        else if (raw === 'pension_withdrawal') { type = 'pension_activity'; direction = 'out'; }
        else if (raw === 'investment') { direction = t.amount < 0 ? 'out' : 'in'; }
        else if (raw === 'pension_activity') { direction = t.amount < 0 ? 'out' : 'in'; }
        return {
          id: t.id,
          date: t.date,
          type,
          amount: String(Math.abs(t.amount)),
          currency: t.currency,
          description: t.description,
          direction,
        };
      });
    setTxDrafts(existingTxs);
  }, [editPeriodId, data]);

  if (!data) return null;

  // Determine active accounts for this date
  const activeAccounts = data.accounts.filter((a) => {
    if (!a.isActive && a.closedAt && a.closedAt < periodDate) return false;
    if (a.createdAt > periodDate) return false;
    return true;
  });

  // Group accounts by category
  const grouped = activeAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] ?? []).push(a);
    return acc;
  }, {});

  function addTx() {
    setTxDrafts((prev) => [
      ...prev,
      { id: uuidv4(), date: periodDate, type: 'income_salary', amount: '', currency: baseCurrency, description: '', direction: 'in' },
    ]);
  }

  function removeTx(id: string) {
    setTxDrafts((prev) => prev.filter((t) => t.id !== id));
  }

  function updateTx(id: string, field: keyof TxDraft, value: string) {
    setTxDrafts((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setSubmitWarnings([]);
    const warnings: string[] = [];
    try {
      const periodId = editPeriodId ?? uuidv4();

      // Build balance entries with currency conversion
      const entries: BalanceEntry[] = [];
      for (const acc of activeAccounts) {
        const rawVal = parseFloat(balances[acc.id] ?? '0') || 0;
        let rate = 1;
        if (acc.currency !== baseCurrency) {
          try {
            rate = await fetchRate(periodDate, acc.currency, baseCurrency);
          } catch {
            warnings.push(`${acc.name} (${acc.currency}→${baseCurrency})`);
            rate = 0;
          }
        }
        entries.push({
          id: uuidv4(),
          periodId,
          accountId: acc.id,
          value: rawVal,
          valueInBase: rawVal * rate,
          exchangeRate: rate,
        });
      }

      // Build transactions
      const transactions: Transaction[] = [];
      for (const tx of txDrafts) {
        if (!tx.amount || parseFloat(tx.amount) === 0) continue;
        const absAmount = Math.abs(parseFloat(tx.amount));
        const isSigned = tx.type === 'investment' || tx.type === 'pension_activity';
        const amount = isSigned && tx.direction === 'out' ? -absAmount : absAmount;
        let rate = 1;
        if (tx.currency !== baseCurrency) {
          try {
            rate = await fetchRate(tx.date, tx.currency, baseCurrency);
          } catch {
            const label = tx.description || TRANSACTION_LABELS[tx.type];
            warnings.push(`${label} (${tx.currency}→${baseCurrency})`);
            rate = 0;
          }
        }
        transactions.push({
          id: tx.id,
          periodId,
          date: tx.date,
          type: tx.type,
          amount,
          currency: tx.currency,
          amountInBase: amount * rate,
          exchangeRate: rate,
          description: tx.description,
        });
      }

      const period: Period = {
        id: periodId,
        date: periodDate,
        note: periodNote,
        metrics: {
          totalNetWorth: 0,
          netWorthByCategory: {},
          expenses: null,
          unrealizedPL: null,
          pensionPL: null,
        },
      };

      if (editPeriodId) {
        updatePeriod(period, entries, transactions);
      } else {
        addPeriod(period, entries, transactions);
      }

      if (warnings.length > 0) {
        setSubmitWarnings(warnings);
        setSaved(true);
      } else {
        navigate('/overview');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const steps: Step[] = ['date', 'balances', 'transactions', 'review'];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {editPeriodId ? 'Edit Period' : 'Add New Period'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter a snapshot of your account balances
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {['Date', 'Balances', 'Transactions', 'Review'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                i < stepIdx
                  ? 'bg-brand-600 text-white'
                  : i === stepIdx
                  ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i < stepIdx ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === stepIdx ? 'text-gray-900' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < 3 && <ChevronRight className="w-4 h-4 text-gray-300" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {/* Step 1: Date */}
        {step === 'date' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Period Date</h2>
            <p className="text-sm text-gray-500">
              Select the date for this balance snapshot (e.g. end of month).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={periodDate}
                onChange={(e) => setPeriodDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <input
                type="text"
                value={periodNote}
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
                  <button onClick={() => navigate('/accounts')} className="underline">
                    Add accounts first
                  </button>.
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
                Enter values in the account's own currency.
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
                          value={balances[acc.id] ?? ''}
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

        {/* Step 3: Transactions */}
        {step === 'transactions' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Transactions</h2>
              <p className="text-sm text-gray-500">
                Enter any income, investments, or pension activity since the last period.
              </p>
            </div>
            {txDrafts.map((tx) => (
              <div key={tx.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                      <select
                        value={tx.type}
                        onChange={(e) => setTxDrafts((prev) => prev.map((t) =>
                          t.id === tx.id ? { ...t, type: e.target.value as TransactionType, direction: 'in' } : t
                        ))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {TX_TYPES.map((t) => (
                          <option key={t} value={t}>{TRANSACTION_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    {(tx.type === 'investment' || tx.type === 'pension_activity') && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {tx.type === 'investment' ? 'Bought / Sold' : 'Contribution / Withdrawal'}
                        </label>
                        <div className="flex rounded border border-gray-300 overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => updateTx(tx.id, 'direction', 'in')}
                            className={`flex-1 px-2 py-1.5 font-medium transition-colors ${tx.direction === 'in' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                          >
                            {tx.type === 'investment' ? 'Bought' : 'Contribution'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTx(tx.id, 'direction', 'out')}
                            className={`flex-1 px-2 py-1.5 font-medium transition-colors border-l border-gray-300 ${tx.direction === 'out' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                          >
                            {tx.type === 'investment' ? 'Sold' : 'Withdrawal'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={tx.date}
                        max={periodDate}
                        onChange={(e) => updateTx(tx.id, 'date', e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                      <input
                        type="number"
                        value={tx.amount}
                        onChange={(e) => updateTx(tx.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                      <select
                        value={tx.currency}
                        onChange={(e) => updateTx(tx.id, 'currency', e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeTx(tx.id)} className="mt-5 p-1 text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={tx.description}
                    onChange={(e) => updateTx(tx.id, 'description', e.target.value)}
                    placeholder="e.g. Monthly salary"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={addTx}
              className="flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add transaction
            </button>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Review & Confirm</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{new Date(periodDate).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Accounts</span>
                <span className="font-medium">{activeAccounts.length} accounts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Transactions</span>
                <span className="font-medium">{txDrafts.filter((t) => t.amount && parseFloat(t.amount) !== 0).length} entries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total (estimate)</span>
                <span className="font-medium text-brand-600">
                  {formatCurrency(
                    activeAccounts.reduce((sum, acc) => sum + (parseFloat(balances[acc.id] ?? '0') || 0), 0),
                    baseCurrency,
                    true,
                  )}
                </span>
              </div>
            </div>
            {submitWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-800 text-sm font-medium">
                    Saved — but {submitWarnings.length} exchange rate{submitWarnings.length > 1 ? 's' : ''} could not be fetched:
                  </p>
                </div>
                <ul className="pl-6 space-y-0.5">
                  {submitWarnings.map((w, i) => (
                    <li key={i} className="text-amber-700 text-xs">• {w}</li>
                  ))}
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

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={() => {
            if (stepIdx === 0) navigate(-1);
            else setStep(steps[stepIdx - 1]);
          }}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {stepIdx === 0 ? 'Cancel' : 'Back'}
        </button>

        {step !== 'review' ? (
          <button
            onClick={() => setStep(steps[stepIdx + 1])}
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
