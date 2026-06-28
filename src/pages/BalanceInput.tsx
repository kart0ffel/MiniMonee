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
}

const TX_TYPES: TransactionType[] = [
  'income_salary', 'income_dividend', 'tax_paid',
  'investment_bought', 'investment_sold',
  'pension_contribution', 'pension_withdrawal',
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
      .map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        amount: String(t.amount),
        currency: t.currency,
        description: t.description,
      }));
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
      { id: uuidv4(), date: periodDate, type: 'income_salary', amount: '', currency: baseCurrency, description: '' },
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
    try {
      const periodId = editPeriodId ?? uuidv4();

      // Build balance entries with currency conversion
      const entries: BalanceEntry[] = [];
      for (const acc of activeAccounts) {
        const rawVal = parseFloat(balances[acc.id] ?? '0') || 0;
        let rate = 1;
        if (acc.currency !== baseCurrency) {
          rate = await fetchRate(periodDate, acc.currency, baseCurrency);
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
        const amount = Math.abs(parseFloat(tx.amount));
        let rate = 1;
        if (tx.currency !== baseCurrency) {
          rate = await fetchRate(tx.date, tx.currency, baseCurrency);
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

      navigate('/overview');
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
                        onChange={(e) => updateTx(tx.id, 'type', e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {TX_TYPES.map((t) => (
                          <option key={t} value={t}>{TRANSACTION_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
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
