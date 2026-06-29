import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Check, X, Edit2, Trash2, AlertCircle, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Transaction, TransactionType, TRANSACTION_LABELS, LEGACY_TRANSACTION_LABELS } from '../types';
import { formatCurrency, CURRENCIES } from '../utils/currency';

interface TxForm {
  id: string | null;
  date: string;
  type: TransactionType;
  amount: string;
  currency: string;
  description: string;
  direction: string;
}

const TX_TYPES: TransactionType[] = [
  'income_salary', 'income_dividend', 'tax_paid', 'investment', 'pension_activity',
];

function directionLabel(type: TransactionType, dir: string): string {
  if (type === 'investment') return dir === 'in' ? 'Bought' : 'Sold';
  if (type === 'pension_activity') return dir === 'in' ? 'Contribution' : 'Withdrawal';
  return '';
}

function txLabel(tx: Transaction): string {
  const base = LEGACY_TRANSACTION_LABELS[tx.type] ?? tx.type;
  if (tx.type === 'investment' || (tx.type as string) === 'investment_bought' || (tx.type as string) === 'investment_sold') {
    if (tx.type === 'investment') return tx.amount >= 0 ? 'Investment · Bought' : 'Investment · Sold';
  }
  if (tx.type === 'pension_activity' || (tx.type as string) === 'pension_contribution' || (tx.type as string) === 'pension_withdrawal') {
    if (tx.type === 'pension_activity') return tx.amount >= 0 ? 'Pension · Contribution' : 'Pension · Withdrawal';
  }
  return base;
}

export default function Transactions() {
  const { data, fetchRate, upsertTransaction, deleteTransaction } = useData();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const baseCurrency = data?.meta.baseCurrency ?? 'USD';

  function emptyForm(): TxForm {
    return {
      id: null,
      date: new Date().toISOString().slice(0, 10),
      type: 'income_salary',
      amount: '',
      currency: baseCurrency,
      description: '',
      direction: 'in',
    };
  }

  const [form, setForm] = useState<TxForm>(emptyForm);

  function updateForm(field: keyof TxForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'type' ? { direction: 'in' } : {}),
    }));
  }

  function startAdd() {
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  }

  function startEdit(tx: Transaction) {
    const raw = tx.type as string;
    let type: TransactionType = tx.type;
    let direction = 'in';
    if (raw === 'investment_bought') { type = 'investment'; direction = 'in'; }
    else if (raw === 'investment_sold') { type = 'investment'; direction = 'out'; }
    else if (raw === 'pension_contribution') { type = 'pension_activity'; direction = 'in'; }
    else if (raw === 'pension_withdrawal') { type = 'pension_activity'; direction = 'out'; }
    else if (raw === 'investment') direction = tx.amount < 0 ? 'out' : 'in';
    else if (raw === 'pension_activity') direction = tx.amount < 0 ? 'out' : 'in';
    setForm({
      id: tx.id,
      date: tx.date,
      type,
      amount: String(Math.abs(tx.amount)),
      currency: tx.currency,
      description: tx.description,
      direction,
    });
    setError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(form.amount);
    if (!form.amount || parsedAmount === 0) { setError('Amount is required'); return; }
    setLoading(true);
    setError('');
    try {
      const absAmount = Math.abs(parsedAmount);
      const isSigned = form.type === 'investment' || form.type === 'pension_activity';
      const amount = isSigned && form.direction === 'out' ? -absAmount : absAmount;
      let rate = 1;
      if (form.currency !== baseCurrency) {
        try {
          rate = await fetchRate(form.date, form.currency, baseCurrency);
        } catch {
          rate = 0;
        }
      }
      const tx: Transaction = {
        id: form.id ?? uuidv4(),
        periodId: null,
        date: form.date,
        type: form.type,
        amount,
        currency: form.currency,
        amountInBase: amount * rate,
        exchangeRate: rate,
        description: form.description,
      };
      upsertTransaction(tx);
      setShowForm(false);
      setForm(emptyForm());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!data) return null;

  const sorted = [...data.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const isSigned = form.type === 'investment' || form.type === 'pension_activity';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">
            Financial movements used in period calculations. Independent of balance snapshots.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startAdd}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">
            {form.id ? 'Edit Transaction' : 'New Transaction'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateForm('date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => updateForm('type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {TX_TYPES.map((t) => (
                    <option key={t} value={t}>{TRANSACTION_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              {isSigned && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {form.type === 'investment' ? 'Bought / Sold' : 'Contribution / Withdrawal'}
                  </label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => updateForm('direction', 'in')}
                      className={`flex-1 px-3 py-2 font-medium transition-colors ${form.direction === 'in' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {form.type === 'investment' ? 'Bought' : 'Contribution'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateForm('direction', 'out')}
                      className={`flex-1 px-3 py-2 font-medium transition-colors border-l border-gray-300 ${form.direction === 'out' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {form.type === 'investment' ? 'Sold' : 'Withdrawal'}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => updateForm('amount', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => updateForm('currency', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="e.g. Monthly salary, MSFT shares"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {error && (
              <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {form.id ? 'Save Changes' : 'Add Transaction'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 hover:text-gray-900 rounded-lg text-sm font-medium transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">No transactions yet — add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">In {baseCurrency}</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                      {txLabel(tx)}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums whitespace-nowrap ${tx.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {tx.amount < 0 ? '-' : ''}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 tabular-nums whitespace-nowrap">
                      {tx.currency !== baseCurrency
                        ? (tx.exchangeRate === 0
                          ? <span className="text-amber-500 text-xs">rate missing</span>
                          : formatCurrency(Math.abs(tx.amountInBase), baseCurrency))
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{tx.description || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {confirmDelete === tx.id ? (
                          <>
                            <span className="text-xs text-red-600 mr-1">Delete?</span>
                            <button
                              onClick={() => { deleteTransaction(tx.id); setConfirmDelete(null); }}
                              className="text-xs text-red-600 font-medium hover:text-red-800"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(tx)}
                              className="p-1 text-gray-400 hover:text-brand-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(tx.id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
