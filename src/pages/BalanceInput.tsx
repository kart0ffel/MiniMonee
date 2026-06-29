import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Check, ChevronRight, ChevronLeft, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Account, BalanceEntry, Period, CATEGORY_LABELS } from '../types';
import { formatCurrency } from '../utils/currency';

type Step = 'date' | 'balances' | 'review';

export default function BalanceInput() {
  const { data, addPeriod, updatePeriod, fetchRate } = useData();
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

  const activeAccounts = data.accounts.filter((a) => {
    if (!a.isActive && a.closedAt && a.closedAt < periodDate) return false;
    if (a.createdAt > periodDate) return false;
    return true;
  });

  const grouped = activeAccounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] ?? []).push(a);
    return acc;
  }, {});

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setSubmitWarnings([]);
    const warnings: string[] = [];
    try {
      const periodId = editPeriodId ?? uuidv4();

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
        updatePeriod(period, entries);
      } else {
        addPeriod(period, entries);
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

  const steps: Step[] = ['date', 'balances', 'review'];
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
        {['Date', 'Balances', 'Review'].map((label, i) => (
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
            {i < 2 && <ChevronRight className="w-4 h-4 text-gray-300" />}
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

        {/* Step 3: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Review & Confirm</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
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
                <span className="font-medium">{activeAccounts.length} accounts</span>
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
            <p className="text-xs text-gray-400">
              Transactions are recorded separately in the Transactions section.
            </p>
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

      {/* Navigation */}
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
