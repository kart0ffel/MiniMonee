import { useState, useRef } from 'react';
import { Download, Upload, Trash2, RefreshCw, AlertCircle, Edit2, Check, X, Loader, Wifi, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useData } from '../contexts/DataContext';
import { exportToJson, importFromJson } from '../utils/storage';
import { formatCurrency } from '../utils/currency';
import { CATEGORY_LABELS, LEGACY_TRANSACTION_LABELS, AccountCategory, BalanceEntry, Period } from '../types';

type Tab = 'periods' | 'transactions' | 'accounts' | 'balances' | 'json';

const CAT_ORDER: AccountCategory[] = ['cash', 'pension', 'real_estate', 'liabilities', 'stocks', 'others'];

function BalancesTab() {
  const { data, upsertBalanceEntry, batchUpsertBalanceEntries, addPeriod } = useData();
  const [newPeriodDate, setNewPeriodDate] = useState('');
  const [editCell, setEditCell] = useState<{ accountId: string; periodId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const navigating = useRef(false);

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;

  const periodColumns = [...data.periods].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const accountRows = [...data.accounts].sort((a, b) => {
    const ci = CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category);
    return ci !== 0 ? ci : a.name.localeCompare(b.name);
  });

  const accountIndexMap = new Map(accountRows.map((a, i) => [a.id, i]));

  const groupedAccounts = CAT_ORDER
    .map((cat) => ({ category: cat, accounts: accountRows.filter((a) => a.category === cat) }))
    .filter((g) => g.accounts.length > 0);

  function getCellValue(accountId: string, periodId: string): string {
    const entry = data!.balanceEntries.find(
      (e) => e.accountId === accountId && e.periodId === periodId,
    );
    return entry !== undefined ? String(entry.value) : '';
  }

  function buildEntry(accountId: string, periodId: string, valueStr: string): BalanceEntry {
    const num = parseFloat(valueStr.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const account = data!.accounts.find((a) => a.id === accountId)!;
    const period = data!.periods.find((p) => p.id === periodId)!;
    const existing = data!.balanceEntries.find(
      (e) => e.accountId === accountId && e.periodId === periodId,
    );
    const cacheKey = `${period.date}|${account.currency}|${baseCurrency}`;
    const rate =
      account.currency === baseCurrency
        ? 1
        : existing?.exchangeRate || data!.exchangeRateCache[cacheKey] || 0;
    return {
      id: existing?.id ?? uuidv4(),
      periodId,
      accountId,
      value: num,
      valueInBase: num * rate,
      exchangeRate: rate,
    };
  }

  function commitCell(accountId: string, periodId: string, valueStr: string) {
    if (valueStr.trim() === '') return;
    upsertBalanceEntry(buildEntry(accountId, periodId, valueStr));
  }

  function startEdit(accountId: string, periodId: string) {
    setEditCell({ accountId, periodId });
    setEditValue(getCellValue(accountId, periodId));
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    ai: number,
    pi: number,
  ) {
    if (e.key === 'Escape') { setEditCell(null); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitCell(accountRows[ai].id, periodColumns[pi].id, editValue);
      navigating.current = true;
      setTimeout(() => { navigating.current = false; }, 0);
      if (e.key === 'Tab') {
        const nextPi = e.shiftKey ? pi - 1 : pi + 1;
        if (nextPi >= 0 && nextPi < periodColumns.length) {
          const next = { accountId: accountRows[ai].id, periodId: periodColumns[nextPi].id };
          setEditCell(next); setEditValue(getCellValue(next.accountId, next.periodId));
        } else setEditCell(null);
      } else {
        const nextAi = ai + 1;
        if (nextAi < accountRows.length) {
          const next = { accountId: accountRows[nextAi].id, periodId: periodColumns[pi].id };
          setEditCell(next); setEditValue(getCellValue(next.accountId, next.periodId));
        } else setEditCell(null);
      }
    }
  }

  function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    startAi: number,
    startPi: number,
  ) {
    const text = e.clipboardData.getData('text');
    const rows = text.trim().split(/\r?\n/).map((r) => r.split('\t'));
    if (rows.length === 1 && rows[0].length === 1) return;
    e.preventDefault();
    const entries: BalanceEntry[] = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const ai = startAi + ri;
      if (ai >= accountRows.length) break;
      for (let ci = 0; ci < rows[ri].length; ci++) {
        const pi = startPi + ci;
        if (pi >= periodColumns.length) break;
        const val = rows[ri][ci].trim();
        if (!val) continue;
        entries.push(buildEntry(accountRows[ai].id, periodColumns[pi].id, val));
      }
    }
    if (entries.length > 0) batchUpsertBalanceEntries(entries);
    setEditCell(null);
  }

  function handleAddPeriod() {
    if (!newPeriodDate || data!.periods.some((p) => p.date === newPeriodDate)) return;
    const period: Period = {
      id: uuidv4(),
      date: newPeriodDate,
      note: '',
      metrics: { totalNetWorth: 0, netWorthByCategory: {}, expenses: null, unrealizedPL: null, pensionPL: null },
    };
    addPeriod(period, []);
    setNewPeriodDate('');
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-600 font-medium">Add period:</span>
        <input
          type="date"
          value={newPeriodDate}
          onChange={(e) => setNewPeriodDate(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          onClick={handleAddPeriod}
          disabled={!newPeriodDate || data.periods.some((p) => p.date === newPeriodDate)}
          className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
        <span className="text-xs text-gray-400 ml-1 hidden sm:block">
          Tip: click a cell then paste (Ctrl/Cmd+V) to fill multiple cells from a spreadsheet
        </span>
      </div>

      <div className="overflow-x-auto">
        {periodColumns.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">
            No periods yet — add one above or use Add Period in the sidebar.
          </p>
        ) : (
          <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-r border-gray-200"
                  style={{ minWidth: 200 }}
                >
                  Account
                </th>
                {periodColumns.map((p) => (
                  <th
                    key={p.id}
                    className="bg-gray-50 px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap"
                    style={{ minWidth: 100 }}
                  >
                    {new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedAccounts.flatMap(({ category, accounts }) => [
                <tr key={`cat-${category}`} className="bg-gray-50">
                  <td className="sticky left-0 z-10 bg-gray-50 px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    {CATEGORY_LABELS[category as AccountCategory]}
                  </td>
                  {periodColumns.map((p) => (
                    <td key={p.id} className="bg-gray-50 border-b border-gray-100" />
                  ))}
                </tr>,
                ...accounts.map((acc) => (
                  <tr key={acc.id} className={`border-b border-gray-100 ${!acc.isActive ? 'opacity-60' : ''}`}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-200 font-medium text-gray-800 whitespace-nowrap">
                      {acc.name}
                      <span className="ml-1.5 text-xs font-normal text-gray-400">{acc.currency}</span>
                    </td>
                    {periodColumns.map((period, pi) => {
                      const isEditing =
                        editCell?.accountId === acc.id && editCell?.periodId === period.id;
                      const rawVal = getCellValue(acc.id, period.id);
                      const ai = accountIndexMap.get(acc.id)!;
                      return (
                        <td key={period.id} className="p-0">
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                if (navigating.current) return;
                                commitCell(acc.id, period.id, editValue);
                                setEditCell(null);
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, ai, pi)}
                              onPaste={(e) => handlePaste(e, ai, pi)}
                              className="w-full px-3 py-2 text-right text-sm border-2 border-brand-500 outline-none bg-white"
                              style={{ minWidth: 100 }}
                            />
                          ) : (
                            <div
                              className="px-3 py-2 text-right cursor-pointer hover:bg-brand-50 select-none"
                              onClick={() => startEdit(acc.id, period.id)}
                            >
                              <span className={`text-sm tabular-nums ${rawVal === '' ? 'text-gray-300' : 'text-gray-800'}`}>
                                {rawVal === ''
                                  ? '—'
                                  : Number(rawVal).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ])}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 font-semibold text-gray-700 border-r border-gray-200 text-sm">
                  Net Worth
                </td>
                {periodColumns.map((p) => (
                  <td key={p.id} className="px-3 py-2.5 text-right font-semibold text-gray-900 text-sm tabular-nums">
                    {formatCurrency(p.metrics.totalNetWorth, baseCurrency, true)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

export default function DataManager() {
  const { data, setData, recalculate, refetchMissingRates, clearData } = useData();
  const [tab, setTab] = useState<Tab>('periods');
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [jsonText, setJsonText] = useState('');
  const [jsonEditing, setJsonEditing] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [refetchResult, setRefetchResult] = useState<{ fixed: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;
  const missingRateCount =
    data.balanceEntries.filter((e) => e.exchangeRate === 0).length +
    data.transactions.filter((t) => t.exchangeRate === 0).length;

  async function handleRefetchMissingRates() {
    setRefetching(true);
    setRefetchResult(null);
    const result = await refetchMissingRates();
    setRefetchResult(result);
    setRefetching(false);
  }
  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  function handleExport() {
    exportToJson(data!);
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
    { key: 'balances', label: 'Balances' },
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
          onClick={handleRefetchMissingRates}
          disabled={refetching || missingRateCount === 0}
          className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {refetching ? <Loader className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Refetch Missing Rates
          {missingRateCount > 0 && (
            <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {missingRateCount}
            </span>
          )}
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
      {refetchResult && (
        <div className={`border rounded-xl p-3 flex gap-2 ${refetchResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${refetchResult.failed > 0 ? 'text-amber-500' : 'text-green-500'}`} />
          <p className={`text-sm ${refetchResult.failed > 0 ? 'text-amber-800' : 'text-green-800'}`}>
            {refetchResult.fixed > 0
              ? `Fixed ${refetchResult.fixed} exchange rate${refetchResult.fixed > 1 ? 's' : ''}.`
              : 'No rates were updated.'}{' '}
            {refetchResult.failed > 0 && `${refetchResult.failed} still could not be fetched — try again later.`}
          </p>
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
                        {LEGACY_TRANSACTION_LABELS[t.type] ?? t.type}
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

        {/* Balances tab */}
        {tab === 'balances' && <BalancesTab />}

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
