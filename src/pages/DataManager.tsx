import { useState, useRef } from 'react';
import {
  Download, Upload, Trash2, RefreshCw, AlertCircle, Edit2, Check, X,
  Loader, Wifi, ArrowUpDown, ArrowUp, ArrowDown, Search, Plus,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { exportToJson, importFromJson } from '../utils/storage';
import { formatCurrency } from '../utils/currency';
import { CATEGORY_LABELS, TRANSACTION_LABELS, Transaction, TransactionType } from '../types';

type Tab = 'balances' | 'periods' | 'transactions' | 'accounts' | 'rates' | 'json';
type SortDir = 'asc' | 'desc';
interface SortState { col: string; dir: SortDir }

interface TxEditForm {
  date: string;
  type: TransactionType;
  amount: string;
  currency: string;
  description: string;
}

const IC = 'border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';
const ICR = IC + ' text-right';

export default function DataManager() {
  const { data, computed, setData, recalculate, refetchMissingRates, clearData } = useData();
  const [tab, setTab] = useState<Tab>('balances');
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [jsonText, setJsonText] = useState('');
  const [jsonEditing, setJsonEditing] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [refetchResult, setRefetchResult] = useState<{ fixed: number; failed: number } | null>(null);
  const [sortStates, setSortStates] = useState<Partial<Record<Tab, SortState>>>({});
  const [filterTexts, setFilterTexts] = useState<Partial<Record<Tab, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Edit state: balances ─────────────────────────────────────────────────
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [editBalVal, setEditBalVal] = useState('');

  // ── Edit state: transactions ─────────────────────────────────────────────
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [editTxForm, setEditTxForm] = useState<TxEditForm>({
    date: '', type: 'income_employment', amount: '', currency: '', description: '',
  });
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<string | null>(null);

  // ── Edit state: rates ────────────────────────────────────────────────────
  const [editingRate, setEditingRate] = useState<{ pair: string; date: string } | null>(null);
  const [editRateVal, setEditRateVal] = useState('');

  if (!data) return null;

  const baseCurrency = data.meta.baseCurrency;

  // ── Missing rate detection ───────────────────────────────────────────────
  const neededRateKeys = new Set<string>();
  for (const e of data.balanceEntries) {
    const acc = data.accounts.find((a) => a.id === e.accountId);
    const period = data.periods.find((p) => p.id === e.periodId);
    if (acc && period && acc.currency !== baseCurrency)
      neededRateKeys.add(`${acc.currency}|${baseCurrency}|${period.date}`);
  }
  for (const t of data.transactions) {
    if (t.currency !== baseCurrency)
      neededRateKeys.add(`${t.currency}|${baseCurrency}|${t.date}`);
  }
  const missingRateCount = [...neededRateKeys].filter((key) => {
    const [from, to, date] = key.split('|');
    return !data.exchangeRates.some((r) => r.from === from && r.to === to && r.date === date);
  }).length;

  // ── Sort / filter helpers ────────────────────────────────────────────────
  function getSort(t: Tab) { return sortStates[t]; }
  function getFilter(t: Tab) { return filterTexts[t] ?? ''; }

  function toggleSort(t: Tab, col: string) {
    setSortStates((prev) => {
      const cur = prev[t];
      const dir: SortDir = cur?.col === col && cur.dir === 'asc' ? 'desc' : 'asc';
      return { ...prev, [t]: { col, dir } };
    });
  }

  function setFilterText(t: Tab, val: string) {
    setFilterTexts((prev) => ({ ...prev, [t]: val }));
  }

  function sortIcon(t: Tab, col: string) {
    const s = getSort(t);
    if (s?.col !== col) return <ArrowUpDown className="w-3 h-3 text-gray-300 shrink-0" />;
    return s.dir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-brand-600 shrink-0" />
      : <ArrowDown className="w-3 h-3 text-brand-600 shrink-0" />;
  }

  function th(t: Tab, col: string, label: string, right = false) {
    const active = getSort(t)?.col === col;
    return (
      <th
        key={col}
        onClick={() => toggleSort(t, col)}
        className={`px-4 py-3 cursor-pointer select-none hover:bg-gray-100 transition-colors ${right ? 'text-right' : 'text-left'}`}
      >
        <span className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider ${active ? 'text-brand-600' : 'text-gray-500'} ${right ? 'flex-row-reverse' : ''}`}>
          {label}{sortIcon(t, col)}
        </span>
      </th>
    );
  }

  function filterBar(t: Tab, placeholder: string) {
    const val = getFilter(t);
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={val}
          onChange={(e) => setFilterText(t, e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
        />
        {val && (
          <button onClick={() => setFilterText(t, '')} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // ── Per-tab derived rows ─────────────────────────────────────────────────

  const balFilter = getFilter('balances').toLowerCase();
  const balSort = getSort('balances');
  const balanceRows = data.balanceEntries
    .map((entry) => ({
      entry,
      account: data.accounts.find((a) => a.id === entry.accountId),
      period: data.periods.find((p) => p.id === entry.periodId),
    }))
    .filter((r) => r.account && r.period)
    .filter((r) => !balFilter ||
      new Date(r.period!.date).toLocaleDateString().toLowerCase().includes(balFilter) ||
      r.account!.name.toLowerCase().includes(balFilter) ||
      CATEGORY_LABELS[r.account!.category].toLowerCase().includes(balFilter) ||
      r.account!.currency.toLowerCase().includes(balFilter)
    )
    .sort((a, b) => {
      let cmp = 0;
      switch (balSort?.col) {
        case 'date':        cmp = a.period!.date.localeCompare(b.period!.date); break;
        case 'account':     cmp = a.account!.name.localeCompare(b.account!.name); break;
        case 'type':        cmp = CATEGORY_LABELS[a.account!.category].localeCompare(CATEGORY_LABELS[b.account!.category]); break;
        case 'value':       cmp = a.entry.value - b.entry.value; break;
        case 'currency':    cmp = a.account!.currency.localeCompare(b.account!.currency); break;
        case 'valueInBase': cmp = a.entry.value - b.entry.value; break;
        default: return b.period!.date.localeCompare(a.period!.date) || a.account!.name.localeCompare(b.account!.name);
      }
      return balSort!.dir === 'asc' ? cmp : -cmp;
    });

  const perFilter = getFilter('periods').toLowerCase();
  const perSort = getSort('periods');
  const periodRows = [...data.periods]
    .filter((p) => !perFilter || p.date.includes(perFilter) || p.note.toLowerCase().includes(perFilter))
    .sort((a, b) => {
      let cmp = 0;
      switch (perSort?.col) {
        case 'date':        cmp = a.date.localeCompare(b.date); break;
        case 'netWorth':    cmp = (computed?.periodMetrics[a.id]?.totalNetWorth ?? 0) - (computed?.periodMetrics[b.id]?.totalNetWorth ?? 0); break;
        case 'expenses':    cmp = (computed?.periodMetrics[a.id]?.expenses ?? -Infinity) - (computed?.periodMetrics[b.id]?.expenses ?? -Infinity); break;
        case 'unrealizedPL': cmp = (computed?.periodMetrics[a.id]?.unrealizedPL ?? -Infinity) - (computed?.periodMetrics[b.id]?.unrealizedPL ?? -Infinity); break;
        case 'pensionPL':   cmp = (computed?.periodMetrics[a.id]?.pensionPL ?? -Infinity) - (computed?.periodMetrics[b.id]?.pensionPL ?? -Infinity); break;
        default: return b.date.localeCompare(a.date);
      }
      return perSort!.dir === 'asc' ? cmp : -cmp;
    });

  const txFilter = getFilter('transactions').toLowerCase();
  const txSort = getSort('transactions');
  const txRows = [...data.transactions]
    .filter((t) => !txFilter ||
      t.date.includes(txFilter) ||
      (TRANSACTION_LABELS[t.type] ?? t.type).toLowerCase().includes(txFilter) ||
      (t.description ?? '').toLowerCase().includes(txFilter) ||
      t.currency.toLowerCase().includes(txFilter)
    )
    .sort((a, b) => {
      let cmp = 0;
      switch (txSort?.col) {
        case 'date':   cmp = a.date.localeCompare(b.date); break;
        case 'type':   cmp = (TRANSACTION_LABELS[a.type] ?? a.type).localeCompare(TRANSACTION_LABELS[b.type] ?? b.type); break;
        case 'amount': cmp = a.amount - b.amount; break;
        default: return b.date.localeCompare(a.date);
      }
      return txSort!.dir === 'asc' ? cmp : -cmp;
    });

  const accFilter = getFilter('accounts').toLowerCase();
  const accSort = getSort('accounts');
  const accountRows = [...data.accounts]
    .filter((a) => !accFilter ||
      a.name.toLowerCase().includes(accFilter) ||
      CATEGORY_LABELS[a.category].toLowerCase().includes(accFilter) ||
      a.currency.toLowerCase().includes(accFilter) ||
      (a.isActive ? 'active' : 'closed').includes(accFilter)
    )
    .sort((a, b) => {
      let cmp = 0;
      switch (accSort?.col) {
        case 'name':      cmp = a.name.localeCompare(b.name); break;
        case 'category':  cmp = CATEGORY_LABELS[a.category].localeCompare(CATEGORY_LABELS[b.category]); break;
        case 'currency':  cmp = a.currency.localeCompare(b.currency); break;
        case 'status':    cmp = (a.isActive ? 0 : 1) - (b.isActive ? 0 : 1); break;
        case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break;
        case 'closedAt':  cmp = (a.closedAt ?? '').localeCompare(b.closedAt ?? ''); break;
        default: return a.name.localeCompare(b.name);
      }
      return accSort!.dir === 'asc' ? cmp : -cmp;
    });

  const rateMap = new Map<string, number>();
  for (const r of data.exchangeRates) rateMap.set(`${r.from}→${r.to}|${r.date}`, r.rate);
  const allRateDates = [...new Set([...rateMap.keys()].map((k) => k.split('|')[1]))].sort();
  const allRatePairs = [...new Set([...rateMap.keys()].map((k) => k.split('|')[0]))].sort();

  const ratesFilter = getFilter('rates').toLowerCase();
  const ratesSort = getSort('rates');
  const filteredRatePairs = allRatePairs.filter((p) => !ratesFilter || p.toLowerCase().includes(ratesFilter));
  const sortedRateDates = [...allRateDates].sort((a, b) =>
    (ratesSort?.dir ?? 'desc') === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
  );

  // ── Edit helpers: balances ───────────────────────────────────────────────
  function startEditBalance(id: string, currentValue: number) {
    setEditingBalance(id);
    setEditBalVal(String(currentValue));
    setEditingTx(null);
    setEditingRate(null);
  }

  function saveBalance(id: string) {
    const val = parseFloat(editBalVal);
    if (isNaN(val)) return;
    setData({
      ...data!,
      balanceEntries: data!.balanceEntries.map((e) => e.id === id ? { ...e, value: val } : e),
    });
    setEditingBalance(null);
  }

  // ── Edit helpers: transactions ───────────────────────────────────────────
  function startEditTx(t: Transaction) {
    setEditingTx(t.id);
    setEditTxForm({
      date: t.date,
      type: t.type,
      amount: String(t.amount),
      currency: t.currency,
      description: t.description ?? '',
    });
    setEditingBalance(null);
    setEditingRate(null);
  }

  function saveTx(id: string) {
    const amount = parseFloat(editTxForm.amount);
    if (isNaN(amount) || !editTxForm.date || !editTxForm.currency) return;
    setData({
      ...data!,
      transactions: data!.transactions.map((t) =>
        t.id === id ? { ...t, ...editTxForm, amount } : t
      ),
    });
    setEditingTx(null);
  }

  function deleteTx(id: string) {
    setData({ ...data!, transactions: data!.transactions.filter((t) => t.id !== id) });
    setConfirmDeleteTx(null);
    setEditingTx(null);
  }

  // ── Edit helpers: rates ──────────────────────────────────────────────────
  function startEditRate(pair: string, date: string) {
    const current = rateMap.get(`${pair}|${date}`);
    setEditingRate({ pair, date });
    setEditRateVal(current !== undefined ? String(current) : '');
    setEditingBalance(null);
    setEditingTx(null);
  }

  function saveRate() {
    if (!editingRate) return;
    const val = parseFloat(editRateVal);
    if (isNaN(val) || val <= 0) return;
    const [from, to] = editingRate.pair.split('→');
    const existing = data!.exchangeRates.findIndex(
      (r) => r.from === from && r.to === to && r.date === editingRate!.date,
    );
    const updated = existing >= 0
      ? data!.exchangeRates.map((r, i) => (i === existing ? { ...r, rate: val } : r))
      : [...data!.exchangeRates, { from, to, date: editingRate.date, rate: val }];
    setData({ ...data!, exchangeRates: updated });
    setEditingRate(null);
  }

  // ── Misc handlers ────────────────────────────────────────────────────────
  async function handleRefetchMissingRates() {
    setRefetching(true);
    setRefetchResult(null);
    const result = await refetchMissingRates();
    setRefetchResult(result);
    setRefetching(false);
  }

  function handleExport() { exportToJson(data!); }

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
      } catch (err) { setImportError(String(err)); }
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
    } catch (err) { setJsonError(String(err)); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'balances',     label: `Balances (${data.balanceEntries.length})` },
    { key: 'periods',      label: `Periods (${data.periods.length})` },
    { key: 'transactions', label: `Transactions (${data.transactions.length})` },
    { key: 'accounts',     label: `Accounts (${data.accounts.length})` },
    { key: 'rates',        label: `Rates (${rateMap.size})` },
    { key: 'json',         label: 'Raw JSON' },
  ];

  const actTh = <th className="w-16 px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-right" />;
  const actionBtnCls = 'p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors';
  const saveBtnCls  = 'p-1 rounded hover:bg-green-100 text-green-600 hover:text-green-700 transition-colors';
  const cancelBtnCls = 'p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Manager</h1>
        <p className="text-gray-500 text-sm mt-1">Import, export, and edit your data. Click the pencil icon on any row to edit it inline.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={handleExport} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Download className="w-4 h-4" /> Export JSON
        </button>
        <label className="flex items-center gap-2 border border-gray-300 hover:border-brand-400 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors">
          <Upload className="w-4 h-4" /> Import JSON
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </label>
        <button onClick={recalculate} className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className="w-4 h-4" /> Recalculate Metrics
        </button>
        <button
          onClick={handleRefetchMissingRates}
          disabled={refetching || missingRateCount === 0}
          className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {refetching ? <Loader className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Refetch Missing Rates
          {missingRateCount > 0 && (
            <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{missingRateCount}</span>
          )}
        </button>
        <button onClick={() => setConfirmClear(true)} className="flex items-center gap-2 border border-red-200 hover:border-red-400 text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto">
          <Trash2 className="w-4 h-4" /> Clear All Data
        </button>
      </div>

      {confirmClear && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-800 text-sm flex-1">This will delete ALL data permanently (export a backup first!).</p>
          <button onClick={() => { clearData(); setConfirmClear(false); }} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium">Delete Everything</button>
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
            {refetchResult.fixed > 0 ? `Fixed ${refetchResult.fixed} exchange rate${refetchResult.fixed > 1 ? 's' : ''}.` : 'No rates were updated.'}{' '}
            {refetchResult.failed > 0 && `${refetchResult.failed} still could not be fetched — try again later.`}
          </p>
        </div>
      )}

      {/* Meta */}
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
                tab === key ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Balances ── */}
        {tab === 'balances' && (
          <>
            {filterBar('balances', 'Filter by date, account, type, or currency…')}
            <div className="overflow-x-auto">
              {balanceRows.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {getFilter('balances') ? 'No entries match the filter.' : 'No balance entries yet.'}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {th('balances', 'date',        'Date')}
                      {th('balances', 'account',     'Account')}
                      {th('balances', 'type',        'Type')}
                      {th('balances', 'value',       'Value', true)}
                      {th('balances', 'currency',    'Currency')}
                      {th('balances', 'valueInBase', `In ${baseCurrency}`, true)}
                      {actTh}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {balanceRows.map(({ entry, account, period }) => {
                      const isEditing = editingBalance === entry.id;
                      const rate = account!.currency !== baseCurrency
                        ? data.exchangeRates.find((r) => r.from === account!.currency && r.to === baseCurrency && r.date === period!.date)?.rate ?? null
                        : null;
                      const inBase = account!.currency === baseCurrency ? null : (rate !== null ? entry.value * rate : null);
                      return (
                        <tr key={entry.id} className={`group ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                            {new Date(period!.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-2.5 text-gray-900 font-medium">{account!.name}</td>
                          <td className="px-4 py-2.5 text-gray-500">{CATEGORY_LABELS[account!.category]}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="number"
                                value={editBalVal}
                                onChange={(e) => setEditBalVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveBalance(entry.id); if (e.key === 'Escape') setEditingBalance(null); }}
                                className={ICR + ' w-32'}
                              />
                            ) : (
                              <span className="text-gray-900">{entry.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{account!.currency}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                            {account!.currency === baseCurrency ? '—' : inBase !== null ? formatCurrency(inBase, baseCurrency) : '?'}
                          </td>
                          <td className="px-3 py-2.5">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => saveBalance(entry.id)} className={saveBtnCls} title="Save"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingBalance(null)} className={cancelBtnCls} title="Cancel"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEditBalance(entry.id, entry.value)} className={actionBtnCls} title="Edit value">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── Periods ── */}
        {tab === 'periods' && (
          <>
            {filterBar('periods', 'Filter by date or note…')}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {th('periods', 'date',        'Date')}
                    {th('periods', 'netWorth',    'Net Worth',    true)}
                    {th('periods', 'expenses',    'Expenses',     true)}
                    {th('periods', 'unrealizedPL','Invest. P&L',  true)}
                    {th('periods', 'pensionPL',   'Pension P&L',  true)}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {periodRows.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">
                        {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                        {formatCurrency(computed?.periodMetrics[p.id]?.totalNetWorth ?? 0, baseCurrency, true)}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${(computed?.periodMetrics[p.id]?.expenses ?? null) === null ? 'text-gray-300' : (computed?.periodMetrics[p.id]?.expenses ?? 0) >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {(computed?.periodMetrics[p.id]?.expenses ?? null) !== null ? formatCurrency(computed!.periodMetrics[p.id].expenses!, baseCurrency, true) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${(computed?.periodMetrics[p.id]?.unrealizedPL ?? null) === null ? 'text-gray-300' : (computed?.periodMetrics[p.id]?.unrealizedPL ?? 0) >= 0 ? 'text-violet-600' : 'text-red-500'}`}>
                        {(computed?.periodMetrics[p.id]?.unrealizedPL ?? null) !== null ? `${computed!.periodMetrics[p.id].unrealizedPL! >= 0 ? '+' : ''}${formatCurrency(computed!.periodMetrics[p.id].unrealizedPL!, baseCurrency, true)}` : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${(computed?.periodMetrics[p.id]?.pensionPL ?? null) === null ? 'text-gray-300' : (computed?.periodMetrics[p.id]?.pensionPL ?? 0) >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                        {(computed?.periodMetrics[p.id]?.pensionPL ?? null) !== null ? `${computed!.periodMetrics[p.id].pensionPL! >= 0 ? '+' : ''}${formatCurrency(computed!.periodMetrics[p.id].pensionPL!, baseCurrency, true)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{p.note || '—'}</td>
                    </tr>
                  ))}
                  {periodRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {getFilter('periods') ? 'No periods match the filter.' : 'No periods yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Transactions ── */}
        {tab === 'transactions' && (
          <>
            {filterBar('transactions', 'Filter by date, type, currency, or description…')}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {th('transactions', 'date',   'Date')}
                    {th('transactions', 'type',   'Type')}
                    {th('transactions', 'amount', 'Amount', true)}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                    {th('transactions', 'base', `In ${baseCurrency}`, true)}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    {actTh}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {txRows.map((t) => {
                    const isEditing = editingTx === t.id;
                    const isConfirmDelete = confirmDeleteTx === t.id;
                    const baseRate = t.currency !== baseCurrency
                      ? data.exchangeRates.find((r) => r.from === t.currency && r.to === baseCurrency && r.date === t.date)?.rate ?? null
                      : null;

                    if (isEditing) {
                      return (
                        <tr key={t.id} className="bg-blue-50">
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={editTxForm.date}
                              onChange={(e) => setEditTxForm((f) => ({ ...f, date: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Escape') setEditingTx(null); }}
                              className={IC}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={editTxForm.type}
                              onChange={(e) => setEditTxForm((f) => ({ ...f, type: e.target.value as TransactionType }))}
                              className={IC + ' w-full'}
                            >
                              {(Object.keys(TRANSACTION_LABELS) as TransactionType[]).map((k) => (
                                <option key={k} value={k}>{TRANSACTION_LABELS[k]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={editTxForm.amount}
                              onChange={(e) => setEditTxForm((f) => ({ ...f, amount: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveTx(t.id); if (e.key === 'Escape') setEditingTx(null); }}
                              className={ICR + ' w-28'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editTxForm.currency}
                              onChange={(e) => setEditTxForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                              maxLength={10}
                              className={IC + ' w-16'}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400 text-xs">—</td>
                          <td className="px-3 py-2">
                            <input
                              value={editTxForm.description}
                              onChange={(e) => setEditTxForm((f) => ({ ...f, description: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveTx(t.id); if (e.key === 'Escape') setEditingTx(null); }}
                              placeholder="Description"
                              className={IC + ' w-full'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => saveTx(t.id)} className={saveBtnCls} title="Save"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setEditingTx(null)} className={cancelBtnCls} title="Cancel"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    if (isConfirmDelete) {
                      return (
                        <tr key={t.id} className="bg-red-50">
                          <td className="px-4 py-2.5 text-red-700 text-xs" colSpan={6}>
                            Delete <strong>{TRANSACTION_LABELS[t.type]}</strong> {formatCurrency(t.amount, t.currency)} on {t.date}?
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => deleteTx(t.id)} className="p-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors" title="Confirm delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setConfirmDeleteTx(null)} className={cancelBtnCls} title="Cancel"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={t.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                          {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{TRANSACTION_LABELS[t.type] ?? t.type}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                          {t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{t.currency}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">
                          {t.currency === baseCurrency ? '—' : baseRate !== null ? formatCurrency(t.amount * baseRate, baseCurrency) : '?'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{t.description || '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditTx(t)} className={actionBtnCls} title="Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setConfirmDeleteTx(t.id); setEditingTx(null); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {txRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      {getFilter('transactions') ? 'No transactions match the filter.' : 'No transactions yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Accounts ── */}
        {tab === 'accounts' && (
          <>
            {filterBar('accounts', 'Filter by name, type, currency, or status…')}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {th('accounts', 'name',      'Name')}
                    {th('accounts', 'category',  'Category')}
                    {th('accounts', 'currency',  'Currency')}
                    {th('accounts', 'status',    'Status')}
                    {th('accounts', 'createdAt', 'Created At')}
                    {th('accounts', 'closedAt',  'Closed At')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accountRows.map((a) => (
                    <tr key={a.id} className={`hover:bg-gray-50 ${!a.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{CATEGORY_LABELS[a.category]}</td>
                      <td className="px-4 py-2.5 text-gray-600">{a.currency}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.isActive ? 'Active' : 'Closed'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{a.closedAt ? new Date(a.closedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                  {accountRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {getFilter('accounts') ? 'No accounts match the filter.' : 'No accounts yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Rates ── */}
        {tab === 'rates' && (
          <>
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={getFilter('rates')}
                  onChange={(e) => setFilterText('rates', e.target.value)}
                  placeholder="Filter currency pairs (columns)…"
                  className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                />
                {getFilter('rates') && (
                  <button onClick={() => setFilterText('rates', '')} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 shrink-0">Click any cell to edit · Click — to add</p>
            </div>
            <div className="overflow-x-auto">
              {allRatePairs.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">No exchange rates cached yet.</p>
              ) : filteredRatePairs.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">No pairs match the filter.</p>
              ) : (
                <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th
                        onClick={() => toggleSort('rates', 'date')}
                        className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left cursor-pointer select-none hover:bg-gray-100 border-b border-r border-gray-200"
                        style={{ minWidth: 150 }}
                      >
                        <span className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider ${getSort('rates')?.col === 'date' ? 'text-brand-600' : 'text-gray-500'}`}>
                          Date {sortIcon('rates', 'date')}
                        </span>
                      </th>
                      {filteredRatePairs.map((pair) => (
                        <th key={pair} className="bg-gray-50 px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap" style={{ minWidth: 120 }}>
                          {pair}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRateDates.map((d) => (
                      <tr key={d} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-200 font-medium text-gray-800 whitespace-nowrap">
                          {new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        {filteredRatePairs.map((pair) => {
                          const rate = rateMap.get(`${pair}|${d}`);
                          const isEditingThisCell = editingRate?.pair === pair && editingRate?.date === d;
                          return (
                            <td
                              key={pair}
                              className="px-3 py-2 text-right tabular-nums"
                            >
                              {isEditingThisCell ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    autoFocus
                                    type="number"
                                    step="any"
                                    value={editRateVal}
                                    onChange={(e) => setEditRateVal(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setEditingRate(null); }}
                                    className={ICR + ' w-24'}
                                    placeholder="Rate"
                                  />
                                  <button onClick={saveRate} className={saveBtnCls} title="Save"><Check className="w-3 h-3" /></button>
                                  <button onClick={() => setEditingRate(null)} className={cancelBtnCls} title="Cancel"><X className="w-3 h-3" /></button>
                                </div>
                              ) : rate !== undefined ? (
                                <button
                                  onClick={() => startEditRate(pair, d)}
                                  className="w-full text-right text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors tabular-nums group/cell"
                                  title="Click to edit"
                                >
                                  {rate.toFixed(4)}
                                  <Edit2 className="w-2.5 h-2.5 inline-block ml-1 opacity-0 group-hover/cell:opacity-50 transition-opacity" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => startEditRate(pair, d)}
                                  className="w-full text-right text-gray-300 hover:text-blue-400 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors group/cell"
                                  title="Click to add rate"
                                >
                                  <Plus className="w-2.5 h-2.5 inline-block opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                                  <span className="group-hover/cell:hidden">—</span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── JSON ── */}
        {tab === 'json' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {!jsonEditing ? (
                <button onClick={startJsonEdit} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium">
                  <Edit2 className="w-4 h-4" /> Edit JSON
                </button>
              ) : (
                <>
                  <button onClick={saveJsonEdit} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium">
                    <Check className="w-4 h-4" /> Apply Changes
                  </button>
                  <button onClick={() => { setJsonEditing(false); setJsonError(''); }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </>
              )}
            </div>
            {jsonError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{jsonError}</div>
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
