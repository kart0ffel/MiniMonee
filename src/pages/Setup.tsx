import { useState } from 'react';
import { Plus, Edit2, X, Check, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useData } from '../contexts/DataContext';
import { Account, AccountCategory, ALL_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from '../types';
import { CURRENCIES } from '../utils/currency';

interface AccountFormState {
  id: string;
  name: string;
  category: AccountCategory;
  currency: string;
  notes: string;
}

const emptyForm = (baseCurrency: string): AccountFormState => ({
  id: uuidv4(),
  name: '',
  category: 'cash',
  currency: baseCurrency,
  notes: '',
});

export default function Setup() {
  const { data, upsertAccount, closeAccount, deleteAccount } = useData();
  const baseCurrency = data?.meta.baseCurrency ?? 'USD';
  const [form, setForm] = useState<AccountFormState | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [closeDate, setCloseDate] = useState(new Date().toISOString().slice(0, 10));

  if (!data) return null;

  const activeAccounts = data.accounts.filter((a) => a.isActive);
  const closedAccounts = data.accounts.filter((a) => !a.isActive);

  function startAdd() {
    setForm(emptyForm(baseCurrency));
  }

  function startEdit(account: Account) {
    setForm({
      id: account.id,
      name: account.name,
      category: account.category,
      currency: account.currency,
      notes: account.notes ?? '',
    });
  }

  function saveForm() {
    if (!form || !form.name.trim()) return;
    const existing = data!.accounts.find((a) => a.id === form.id);
    const account: Account = {
      id: form.id,
      name: form.name.trim(),
      category: form.category,
      currency: form.currency,
      isActive: existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      closedAt: existing?.closedAt ?? null,
      notes: form.notes || undefined,
    };
    upsertAccount(account);
    setForm(null);
  }

  function confirmClose() {
    if (!closeId) return;
    closeAccount(closeId, closeDate);
    setCloseId(null);
  }

  const grouped = ALL_CATEGORIES.reduce<Record<AccountCategory, Account[]>>(
    (acc, cat) => {
      acc[cat] = activeAccounts.filter((a) => a.category === cat);
      return acc;
    },
    {} as Record<AccountCategory, Account[]>,
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your financial accounts</p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      </div>

      {activeAccounts.length === 0 && !form && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">
            No accounts yet. Add your first account to start tracking your net worth.
          </p>
        </div>
      )}

      {/* Add/Edit form */}
      {form && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">
            {data.accounts.some((a) => a.id === form.id) ? 'Edit Account' : 'New Account'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Main Checking"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as AccountCategory })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency *</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional description"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveForm}
              disabled={!form.name.trim()}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Close confirmation */}
      {closeId && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800 font-medium mb-3">
            Close account: "{data.accounts.find((a) => a.id === closeId)?.name}"?
          </p>
          <p className="text-red-700 text-sm mb-3">
            The account will be hidden from future periods. Historical data is preserved.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm text-red-700">Close date:</label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="border border-red-300 rounded px-2 py-1 text-sm"
            />
            <button
              onClick={confirmClose}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium"
            >
              Confirm Close
            </button>
            <button
              onClick={() => setCloseId(null)}
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Account groups */}
      {ALL_CATEGORIES.map((cat) => {
        const accounts = grouped[cat];
        if (accounts.length === 0) return null;
        return (
          <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div
              className="px-5 py-3 flex items-center gap-2 border-b border-gray-100"
              style={{ borderLeftColor: CATEGORY_COLORS[cat], borderLeftWidth: 4 }}
            >
              <h3 className="font-semibold text-gray-900">{CATEGORY_LABELS[cat]}</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {accounts.length}
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center px-5 py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{acc.name}</p>
                    {acc.notes && <p className="text-xs text-gray-500 truncate">{acc.notes}</p>}
                  </div>
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                    {acc.currency}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(acc)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCloseId(acc.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Close account"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Closed accounts */}
      {closedAccounts.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700">
            Closed accounts ({closedAccounts.length})
          </summary>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {closedAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center px-5 py-3 gap-4 opacity-60">
                <div className="flex-1">
                  <p className="font-medium text-gray-700 text-sm line-through">{acc.name}</p>
                  <p className="text-xs text-gray-400">
                    Closed {acc.closedAt ? new Date(acc.closedAt).toLocaleDateString() : '—'} · {CATEGORY_LABELS[acc.category]}
                  </p>
                </div>
                <span className="text-xs text-gray-500">{acc.currency}</span>
                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
