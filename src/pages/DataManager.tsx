import { useState, useRef } from 'react';
import { Download, Upload, Trash2, RefreshCw, AlertCircle, Edit2, Check, X } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { exportToJson, importFromJson } from '../utils/storage';
import { formatCurrency } from '../utils/currency';
import { CATEGORY_LABELS, TRANSACTION_LABELS } from '../types';

type Tab = 'periods' | 'transactions' | 'accounts' | 'json';

export default function DataManager() {
  const { data, setData, recalculate, clearData } = useData();
  const [tab, setTab] = useState<Tab>('periods');
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [jsonText, setJsonText] = useState('');
  const [jsonEditing, setJsonEditing] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  function handleExport() {
    exportToJson(data);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { data: imported, warnings } = importFromJson(ev.target?.result as string);
        setData(imported);
        setImportWarnings(warnings);
        setImportError('');
      } catch (err) {
        setImportError(String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function startJsonEdit() {
    setJsonText(JSON.stringify(data, null, 2));
    setJsonEditing(true);
    setJsonError('');
  }

  function saveJsonEdit() {
    try {
      const { data: imported } = importFromJson(jsonText);
      setData(imported);
      setJsonEditing(false);
      setJsonError('');
    } catch (err) {
      setJsonError(String(err));
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'periods', label: `Periods (${data.periods.length})` },
    { key: 'transactions', label: `Transactions (${data.transactions.length})` },
    { key: 'accounts', label: `Accounts (${data.accounts.length})` },
    { key: 'json', label: 'Raw JSON' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Manager</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import, export, and inspect your data
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export JSON
        </button>
        <label className="flex items-center gap-2 border border-gray-300 hover:border-brand-400 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          Import JSON
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </label>
        <button
          onClick={recalculate}
          className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recalculate Metrics
        </button>
        <button
          onClick={() => setConfirmClear(true)}
          className="flex items-center gap-2 border border-red-200 hover:border-red-400 text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          Clear All Data
        </button>
      </div>

      {/* Confirm clear */}
      {confirmClear && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-800 text-sm flex-1">
            This will delete ALL data permanently (export a backup first!).
          </p>
          <button
            onClick={() => { clearData(); setConfirmClear(false); }}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Delete Everything
          </button>
          <button onClick={() => setConfirmClear(false)} className="text-gray-600 text-sm">Cancel</button>
        </div>
      )}

      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{importError}</p>
        </div>
      )}
      {importWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-amber-800 text-sm font-medium mb-1">Imported with warnings:</p>
          {importWarnings.map((w, i) => <p key={i} className="text-amber-700 text-sm">• {w}</p>)}
        </div>
      )}

      {/* Meta info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Version', value: data.meta.version },
          { label: 'Base Currency', value: data.meta.baseCurrency },
          { label: 'Created', value: new Date(data.meta.createdAt).toLocaleDateString() },
          { label: 'Last Updated', value: new Date(data.meta.lastUpdated).toLocaleDateString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="font-semibold text-gray-900 text-sm">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key
                  ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Periods tab */}
        {tab === 'periods' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Net Worth</th>
                  <th className="px-5 py-3 text-right">Expenses</th>
                  <th className="px-5 py-3 text-right">Invest. P&L</th>
                  <th className="px-5 py-3 text-right">Pension P&L</th>
                  <th className="px-5 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPeriods.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700 font-medium">
                      {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(p.metrics.totalNetWorth, baseCurrency, true)}
                    </td>
                    <td className={`px-5 py-3 text-right ${p.metrics.expenses === null ? 'text-gray-300' : p.metrics.expenses >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {p.metrics.expenses !== null ? formatCurrency(p.metrics.expenses, baseCurrency, true) : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right ${p.metrics.unrealizedPL === null ? 'text-gray-300' : p.metrics.unrealizedPL >= 0 ? 'text-violet-600' : 'text-red-500'}`}>
                      {p.metrics.unrealizedPL !== null ? `${p.metrics.unrealizedPL >= 0 ? '+' : ''}${formatCurrency(p.metrics.unrealizedPL, baseCurrency, true)}` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right ${p.metrics.pensionPL === null ? 'text-gray-300' : p.metrics.pensionPL >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                      {p.metrics.pensionPL !== null ? `${p.metrics.pensionPL >= 0 ? '+' : ''}${formatCurrency(p.metrics.pensionPL, baseCurrency, true)}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{p.note || '—'}</td>
                  </tr>
                ))}
                {sortedPeriods.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No periods yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Transactions tab */}
        {tab === 'transactions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">In {baseCurrency}</th>
                  <th className="px-5 py-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data.transactions]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-600">
                        {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {TRANSACTION_LABELS[t.type]}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(t.amount, t.currency)}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">
                        {t.currency !== baseCurrency ? formatCurrency(t.amountInBase, baseCurrency) : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{t.description || '—'}</td>
                    </tr>
                  ))}
                {data.transactions.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Accounts tab */}
        {tab === 'accounts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Currency</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.accounts.map((a) => (
                  <tr key={a.id} className={`hover:bg-gray-50 ${!a.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-medium text-gray-900">{a.name}</td>
                    <td className="px-5 py-3 text-gray-600">{CATEGORY_LABELS[a.category]}</td>
                    <td className="px-5 py-3 text-gray-600">{a.currency}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.isActive ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {data.accounts.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No accounts yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* JSON tab */}
        {tab === 'json' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {!jsonEditing ? (
                <button
                  onClick={startJsonEdit}
                  className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit JSON
                </button>
              ) : (
                <>
                  <button
                    onClick={saveJsonEdit}
                    className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Apply Changes
                  </button>
                  <button
                    onClick={() => { setJsonEditing(false); setJsonError(''); }}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </>
              )}
            </div>
            {jsonError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {jsonError}
              </div>
            )}
            <textarea
              readOnly={!jsonEditing}
              value={jsonEditing ? jsonText : JSON.stringify(data, null, 2)}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full h-96 font-mono text-xs border border-gray-200 rounded-lg p-3 bg-gray-50 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
