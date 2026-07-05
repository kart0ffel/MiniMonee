import { useState, useRef, DragEvent, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  UploadCloud, FileText, X, ChevronRight, AlertCircle, Loader,
  ArrowRight, Check, AlertTriangle, ChevronsUpDown, ChevronUp, ChevronDown,
} from 'lucide-react';
import { parseIBKRCSV, IBKRParseResult, IBKRTrade, IBKRDividend } from '../utils/ibkrParser';
import { useData } from '../contexts/DataContext';
import { Transaction, ExchangeRateEntry } from '../types';

interface PendingRate { key: string; from: string; to: string; date: string }

type Step = 'upload' | 'preview' | 'import';

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: 'upload',  label: 'Upload',  description: 'Select your IBKR CSV export' },
  { key: 'preview', label: 'Preview', description: 'Review detected data'         },
  { key: 'import',  label: 'Import',  description: 'Confirm and add to MiniMonee' },
];

type SortState = { col: string; dir: 'asc' | 'desc' };

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Buy = positive (outflow), Sell = negative (inflow)
function signedAmount(trade: IBKRTrade): number {
  return trade.action === 'Buy' ? trade.proceeds : -trade.proceeds;
}

function tradeDescription(trade: IBKRTrade, filename: string): string {
  const qty   = trade.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const price = fmtNum(trade.pricePerShare, 4);
  return `${trade.symbol} - ${qty} x ${price} - ${filename}`;
}

function dividendDescription(div: IBKRDividend): string {
  const parts = [div.symbol, div.currency, fmtNum(div.gross)];
  if (div.withholding < 0) parts.push(`- ${fmtNum(Math.abs(div.withholding))}`);
  return parts.join(', ');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: 'Buy' | 'Sell' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
      action === 'Buy' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
    }`}>
      {action}
    </span>
  );
}

function SortTh({
  col, label, sort, onSort, className = 'text-left',
}: {
  col: string; label: string; sort: SortState;
  onSort: (col: string) => void; className?: string;
}) {
  const active = sort.col === col;
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-4 py-2.5 ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider select-none ${
          active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
        } ${className.includes('right') ? 'ml-auto' : ''}`}
      >
        {label}
        <Icon className="w-3 h-3 shrink-0" />
      </button>
    </th>
  );
}

function TriIndeterminate({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={el => { if (el) el.indeterminate = indeterminate; }}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-brand-600 cursor-pointer"
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function IBKRImporter() {
  const { data, setData, fetchRate, upsertExchangeRates } = useData();

  const [step, setStep]             = useState<Step>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [dragging, setDragging]     = useState(false);
  const [result, setResult]         = useState<IBKRParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing]       = useState(false);

  // Import step state
  const [selectedTradeIdxs, setSelectedTradeIdxs] = useState<Set<number>>(new Set());
  const [selectedDivIdxs,   setSelectedDivIdxs]   = useState<Set<number>>(new Set());
  const [duplicateTrades,   setDuplicateTrades]   = useState<boolean[]>([]);
  const [duplicateDivs,     setDuplicateDivs]     = useState<boolean[]>([]);
  const [tradeSort,  setTradeSort]  = useState<SortState>({ col: 'date', dir: 'asc' });
  const [divSort,    setDivSort]    = useState<SortState>({ col: 'date', dir: 'asc' });
  const [importedCount,  setImportedCount]  = useState(0);
  const [imported,       setImported]       = useState(false);
  const [importLoading,  setImportLoading]  = useState(false);
  const [pendingRates,   setPendingRates]   = useState<PendingRate[]>([]);
  const [manualRates,    setManualRates]    = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepIndex = STEPS.findIndex(s => s.key === step);
  const filename  = file?.name ?? '';

  // ── Date range & existing overlap ────────────────────────────────────────────
  const { minDate, maxDate } = useMemo(() => {
    if (!result) return { minDate: '', maxDate: '' };
    const dates = [
      ...result.trades.map(t => t.date),
      ...result.dividends.map(d => d.date),
    ].filter(Boolean).sort();
    return { minDate: dates[0] ?? '', maxDate: dates[dates.length - 1] ?? '' };
  }, [result]);

  const existingInvestments = useMemo(() => {
    if (!data || !minDate || !maxDate) return [];
    return data.transactions.filter(
      t => t.type === 'investment' && t.date >= minDate && t.date <= maxDate,
    );
  }, [data, minDate, maxDate]);

  const existingDividends = useMemo(() => {
    if (!data || !minDate || !maxDate) return [];
    return data.transactions.filter(
      t => t.type === 'income_dividend' && t.date >= minDate && t.date <= maxDate,
    );
  }, [data, minDate, maxDate]);

  // ── Sorted index arrays for import tables ─────────────────────────────────────
  const sortedTradeIdxs = useMemo(() => {
    if (!result) return [];
    const indices = result.trades.map((_, i) => i);
    return indices.sort((a, b) => {
      const ta = result.trades[a], tb = result.trades[b];
      const dir = tradeSort.dir === 'asc' ? 1 : -1;
      switch (tradeSort.col) {
        case 'date':    return dir * ta.date.localeCompare(tb.date);
        case 'symbol':  return dir * ta.symbol.localeCompare(tb.symbol);
        case 'action':  return dir * ta.action.localeCompare(tb.action);
        case 'proceeds': return dir * (ta.proceeds - tb.proceeds);
        default: return 0;
      }
    });
  }, [result, tradeSort]);

  const sortedDivIdxs = useMemo(() => {
    if (!result) return [];
    const indices = result.dividends.map((_, i) => i);
    return indices.sort((a, b) => {
      const da = result.dividends[a], db = result.dividends[b];
      const dir = divSort.dir === 'asc' ? 1 : -1;
      switch (divSort.col) {
        case 'date':     return dir * da.date.localeCompare(db.date);
        case 'symbol':   return dir * da.symbol.localeCompare(db.symbol);
        case 'currency': return dir * da.currency.localeCompare(db.currency);
        case 'net':      return dir * (da.net - db.net);
        default: return 0;
      }
    });
  }, [result, divSort]);

  // ── File handling ─────────────────────────────────────────────────────────────
  function handleFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.csv')) return;
    setFile(f);
    setResult(null);
    setParseError(null);
    setImported(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>)  { e.preventDefault(); setDragging(true);  }
  function handleDragLeave(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragging(false); }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function clearFile() {
    setFile(null); setResult(null); setParseError(null); setImported(false); setStep('upload');
  }

  function handleParse() {
    if (!file) return;
    setParsing(true);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = parseIBKRCSV(e.target?.result as string);
        setResult(parsed);
        setParseError(null);
        setStep('preview');
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => { setParseError('Failed to read file.'); setParsing(false); };
    reader.readAsText(file);
  }

  // ── Advance to import step with duplicate detection ───────────────────────────
  function handleProceedToImport() {
    if (!result || !data) return;

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const dupTrades = result.trades.map(t =>
      data.transactions.some(ex =>
        ex.type === 'investment' &&
        ex.date === t.date &&
        ex.currency === t.currency &&
        round2(Math.abs(ex.amount)) === t.proceeds,
      ),
    );
    const dupDivs = result.dividends.map(d =>
      data.transactions.some(ex =>
        ex.type === 'income_dividend' &&
        ex.date === d.date &&
        ex.currency === d.currency &&
        round2(Math.abs(ex.amount)) === d.net,
      ),
    );

    setDuplicateTrades(dupTrades);
    setDuplicateDivs(dupDivs);
    setSelectedTradeIdxs(new Set(result.trades.map((_, i) => i).filter(i => !dupTrades[i])));
    setSelectedDivIdxs(new Set(result.dividends.map((_, i) => i).filter(i => !dupDivs[i])));
    setTradeSort({ col: 'date', dir: 'asc' });
    setDivSort({ col: 'date', dir: 'asc' });
    setImported(false);
    setStep('import');
  }

  // ── Sort toggles ──────────────────────────────────────────────────────────────
  function toggleTradeSort(col: string) {
    setTradeSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }
  function toggleDivSort(col: string) {
    setDivSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  // ── Selection helpers ─────────────────────────────────────────────────────────
  function toggleTrade(i: number) {
    setSelectedTradeIdxs(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function toggleDiv(i: number) {
    setSelectedDivIdxs(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function toggleAllTrades() {
    if (!result) return;
    const allIdxs = result.trades.map((_, i) => i);
    setSelectedTradeIdxs(
      selectedTradeIdxs.size === allIdxs.length ? new Set() : new Set(allIdxs),
    );
  }
  function toggleAllDivs() {
    if (!result) return;
    const allIdxs = result.dividends.map((_, i) => i);
    setSelectedDivIdxs(
      selectedDivIdxs.size === allIdxs.length ? new Set() : new Set(allIdxs),
    );
  }

  // ── Save + rate fetch ─────────────────────────────────────────────────────────
  async function handleImport() {
    if (!result || !data) return;
    setImportLoading(true);
    setPendingRates([]);
    setManualRates({});

    const trades = result.trades.filter((_, i) => selectedTradeIdxs.has(i));
    const divs   = result.dividends.filter((_, i) => selectedDivIdxs.has(i));

    const newTx: Transaction[] = [
      ...trades.map(t => ({
        id: uuidv4(), periodId: null,
        date: t.date, type: 'investment' as const,
        amount: signedAmount(t),
        currency: t.currency,
        description: tradeDescription(t, filename),
      })),
      ...divs.map(d => ({
        id: uuidv4(), periodId: null,
        date: d.date, type: 'income_dividend' as const,
        amount: d.net, currency: d.currency,
        description: dividendDescription(d),
      })),
    ];

    // Persist transactions first so they are never lost even if rate fetch fails.
    const baseCurrency = data.meta.baseCurrency;
    setData({
      ...data,
      transactions: [...data.transactions, ...newTx],
      meta: { ...data.meta, lastUpdated: new Date().toISOString() },
    });
    setImportedCount(newTx.length);

    // Collect unique (date, currency) pairs that need a rate.
    const needed = new Map<string, PendingRate>();
    for (const tx of newTx) {
      if (tx.currency === baseCurrency) continue;
      const key = `${tx.currency}|${baseCurrency}|${tx.date}`;
      if (!needed.has(key)) needed.set(key, { key, from: tx.currency, to: baseCurrency, date: tx.date });
    }

    // Try to auto-fetch; collect anything that fails.
    const failed: PendingRate[] = [];
    for (const pr of needed.values()) {
      try {
        await fetchRate(pr.date, pr.from, pr.to); // auto-saves on success via DataContext
      } catch {
        failed.push(pr);
      }
    }

    setImportLoading(false);
    if (failed.length > 0) {
      setPendingRates(failed);
    } else {
      setImported(true);
    }
  }

  // Called when the user submits manually-entered rates after auto-fetch failures.
  function handleConfirmRates() {
    const entries: ExchangeRateEntry[] = [];
    for (const [key, v] of Object.entries(manualRates)) {
      const rate = parseFloat(v);
      if (!isNaN(rate) && rate > 0) {
        const [from, to, date] = key.split('|');
        entries.push({ date, from, to, rate });
      }
    }
    if (entries.length > 0) upsertExchangeRates(entries);
    setImported(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">IBKR Importer</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import transactions and activity from an Interactive Brokers CSV export.
        </p>
      </div>

      {/* Step progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ol className="flex items-start gap-0">
          {STEPS.map((s, i) => {
            const isActive = s.key === step;
            const isDone   = i < stepIndex;
            const isLast   = i === STEPS.length - 1;
            return (
              <li key={s.key} className="flex items-start flex-1 min-w-0">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    isDone   ? 'bg-brand-600 text-white' :
                    isActive ? 'bg-brand-600 text-white ring-4 ring-brand-100' :
                               'bg-gray-100 text-gray-400'
                  }`}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${isActive ? 'text-gray-900' : isDone ? 'text-brand-600' : 'text-gray-400'}`}>
                      {s.label}
                    </p>
                    <p className="text-xs text-gray-400 leading-tight">{s.description}</p>
                  </div>
                </div>
                {!isLast && (
                  <ChevronRight className={`w-4 h-4 mx-2 mt-1.5 shrink-0 ${i < stepIndex ? 'text-brand-400' : 'text-gray-200'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
              cursor-pointer transition-all p-12 text-center select-none
              ${dragging ? 'border-brand-400 bg-brand-50' :
                file      ? 'border-green-300 bg-green-50' :
                            'border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/40'}
            `}
          >
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
            {file ? (
              <>
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <FileText className="w-7 h-7 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Click to replace</p>
                </div>
              </>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragging ? 'bg-brand-100' : 'bg-gray-100'}`}>
                  <UploadCloud className={`w-7 h-7 transition-colors ${dragging ? 'text-brand-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-700">{dragging ? 'Drop the file here' : 'Drag & drop your IBKR export'}</p>
                  <p className="text-sm text-gray-400 mt-1">or <span className="text-brand-600 font-medium">click to browse</span> · CSV files only</p>
                </div>
              </>
            )}
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{parseError}</p>
            </div>
          )}

          {file && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={clearFile} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" /> Remove
                </button>
                <button
                  onClick={handleParse} disabled={parsing}
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {parsing ? 'Parsing…' : <><span>Parse File</span><ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
            <p className="font-semibold">How to export from Interactive Brokers</p>
            <ol className="list-decimal list-inside space-y-1 text-amber-700">
              <li>Log in to IBKR Client Portal or Trader Workstation</li>
              <li>Go to <strong>Reports → Activity Statements</strong></li>
              <li>Select the date range and choose <strong>CSV</strong> as the format</li>
              <li>Download and drop the file above</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && result && (
        <div className="space-y-6">
          <button onClick={() => setStep('upload')} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Back to upload
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Account Holder', value: result.accountInfo.name      || '—' },
              { label: 'Account ID',     value: result.accountInfo.accountId || '—' },
              { label: 'Period',         value: result.accountInfo.period    || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="font-semibold text-gray-900 text-sm break-all">{value}</p>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
              <p className="text-amber-800 font-medium text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {result.warnings.length} parsing {result.warnings.length === 1 ? 'warning' : 'warnings'}
              </p>
              {result.warnings.slice(0, 5).map((w, i) => (
                <p key={i} className="text-amber-700 text-xs pl-6">• {w}</p>
              ))}
              {result.warnings.length > 5 && (
                <p className="text-amber-600 text-xs pl-6">…and {result.warnings.length - 5} more</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Trades',  value: result.trades.length,                                  color: 'text-gray-900'     },
              { label: 'Buys',          value: result.trades.filter(t => t.action === 'Buy').length,   color: 'text-orange-500'   },
              { label: 'Sells',         value: result.trades.filter(t => t.action === 'Sell').length,  color: 'text-emerald-600'  },
              { label: 'Dividends',     value: result.dividends.length,                                color: 'text-gray-900'     },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Trades table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                Investment Trades
                <span className="ml-2 text-gray-400 font-normal">({result.trades.length})</span>
              </h2>
              <span className="text-xs text-gray-400">
                Will be recorded as <code className="bg-gray-100 px-1 rounded font-mono">investment</code>
              </span>
            </div>
            <div className="overflow-x-auto">
              {result.trades.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No stock trades found in this file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Symbol</th>
                      <th className="px-4 py-2.5 text-left">Action</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Proceeds</th>
                      <th className="px-4 py-2.5 text-right">Fees</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.trades.map((t, i) => (
                      <tr key={i} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{t.date}</td>
                        <td className="px-4 py-2 font-semibold text-gray-900">{t.symbol}</td>
                        <td className="px-4 py-2"><ActionBadge action={t.action} /></td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-600 text-xs">
                          {t.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">
                          {fmtNum(t.pricePerShare, 4)}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums font-medium text-sm ${
                          t.action === 'Buy' ? 'text-orange-600' : 'text-emerald-600'
                        }`}>
                          {t.currency} {fmtNum(t.proceeds)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-400 text-xs">
                          {t.fees > 0 ? `${t.currency} ${fmtNum(t.fees)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Dividends table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                Dividends
                <span className="ml-2 text-gray-400 font-normal">({result.dividends.length})</span>
              </h2>
              <span className="text-xs text-gray-400">
                Will be recorded as <code className="bg-gray-100 px-1 rounded font-mono">income_dividend</code>
              </span>
            </div>
            <div className="overflow-x-auto">
              {result.dividends.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No dividends found in this file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Symbol</th>
                      <th className="px-4 py-2.5 text-left">Currency</th>
                      <th className="px-4 py-2.5 text-right">Gross</th>
                      <th className="px-4 py-2.5 text-right">Withholding</th>
                      <th className="px-4 py-2.5 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.dividends.map((d, i) => (
                      <tr key={i} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{d.date}</td>
                        <td className="px-4 py-2 font-semibold text-gray-900">{d.symbol}</td>
                        <td className="px-4 py-2 text-gray-500">{d.currency}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmtNum(d.gross)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${d.withholding < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {d.withholding !== 0 ? fmtNum(d.withholding) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-600">
                          {fmtNum(d.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Data looks correct?</p>
              <p className="text-xs text-gray-400 mt-0.5">
                The next step lets you select exactly what to import and checks for duplicates.
              </p>
            </div>
            <button
              onClick={handleProceedToImport}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Review Import <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import ── */}
      {step === 'import' && result && (
        <div className="space-y-6">
          {importLoading ? (
            /* ─ Fetching rates ─ */
            <div className="bg-white rounded-xl border border-gray-200 p-16 flex flex-col items-center gap-4">
              <Loader className="w-10 h-10 text-brand-600 animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-gray-900">Importing…</p>
                <p className="text-sm text-gray-500 mt-1">Fetching missing exchange rates, please wait.</p>
              </div>
            </div>
          ) : pendingRates.length > 0 ? (
            /* ─ Manual rate entry ─ */
            <div className="space-y-5">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {pendingRates.length} exchange rate{pendingRates.length !== 1 ? 's' : ''} could not be fetched automatically
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your transactions have been saved. Enter the missing rates below to complete the import.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                {pendingRates.map(pr => (
                  <div key={pr.key} className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-gray-800">{pr.from}</span>
                      <span className="text-gray-400 text-sm">→</span>
                      <span className="text-sm font-semibold text-gray-800">{pr.to}</span>
                      <span className="text-xs text-gray-400 ml-1">
                        {new Date(pr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <input
                      type="number" min="0" step="any"
                      placeholder={`1 ${pr.from} = ? ${pr.to}`}
                      value={manualRates[pr.key] ?? ''}
                      onChange={e => setManualRates(prev => ({ ...prev, [pr.key]: e.target.value }))}
                      className="w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleConfirmRates}
                  disabled={pendingRates.some(pr => {
                    const v = parseFloat(manualRates[pr.key] ?? '');
                    return isNaN(v) || v <= 0;
                  })}
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Check className="w-4 h-4" /> Confirm Rates &amp; Finish
                </button>
              </div>
            </div>
          ) : imported ? (
            /* ─ Success ─ */
            <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">Import complete</p>
                <p className="text-sm text-gray-500 mt-1">{importedCount} transaction{importedCount !== 1 ? 's' : ''} added to your data.</p>
              </div>
              <button onClick={clearFile} className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium">
                Import another file
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setStep('preview')} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                ← Back to preview
              </button>

              {/* ─ Duplicate legend ─ */}
              {(duplicateTrades.some(Boolean) || duplicateDivs.some(Boolean)) && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Rows marked with <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-0.5" /> may already exist in your data and are unselected by default.
                </div>
              )}

              {/* ─ Investments ─ */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">The following transactions will be added as Investments</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedTradeIdxs.size} of {result.trades.length} selected
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {result.trades.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 text-sm">No investment trades to import</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 w-10">
                            <TriIndeterminate
                              checked={selectedTradeIdxs.size === result.trades.length}
                              indeterminate={selectedTradeIdxs.size > 0 && selectedTradeIdxs.size < result.trades.length}
                              onChange={toggleAllTrades}
                            />
                          </th>
                          <SortTh col="date"    label="Date"    sort={tradeSort} onSort={toggleTradeSort} />
                          <SortTh col="symbol"  label="Symbol"  sort={tradeSort} onSort={toggleTradeSort} />
                          <SortTh col="action"  label="Action"  sort={tradeSort} onSort={toggleTradeSort} />
                          <SortTh col="proceeds" label="Amount" sort={tradeSort} onSort={toggleTradeSort} className="text-right" />
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedTradeIdxs.map(i => {
                          const t    = result.trades[i];
                          const isDup = duplicateTrades[i] ?? false;
                          const sel  = selectedTradeIdxs.has(i);
                          return (
                            <tr
                              key={i}
                              onClick={() => toggleTrade(i)}
                              className={`cursor-pointer transition-colors ${
                                sel ? 'hover:bg-gray-50/70' : 'bg-gray-50/40 hover:bg-gray-100/60 opacity-60'
                              }`}
                            >
                              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox" checked={sel}
                                    onChange={() => toggleTrade(i)}
                                    className="w-4 h-4 rounded border-gray-300 text-brand-600 cursor-pointer"
                                  />
                                  {isDup && (
                                    <span title="May already exist in your data"><AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /></span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{t.date}</td>
                              <td className="px-4 py-2.5 font-semibold text-gray-900">{t.symbol}</td>
                              <td className="px-4 py-2.5"><ActionBadge action={t.action} /></td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">
                                {t.currency} {fmtNum(t.proceeds)}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">{tradeDescription(t, filename)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ─ Dividends ─ */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <p className="font-semibold text-gray-900">The following Dividends will be classified as Income / Dividend</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDivIdxs.size} of {result.dividends.length} selected · net of withholding tax
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {result.dividends.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 text-sm">No dividends to import</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 w-10">
                            <TriIndeterminate
                              checked={selectedDivIdxs.size === result.dividends.length}
                              indeterminate={selectedDivIdxs.size > 0 && selectedDivIdxs.size < result.dividends.length}
                              onChange={toggleAllDivs}
                            />
                          </th>
                          <SortTh col="date"     label="Date"     sort={divSort} onSort={toggleDivSort} />
                          <SortTh col="symbol"   label="Symbol"   sort={divSort} onSort={toggleDivSort} />
                          <SortTh col="currency" label="Currency" sort={divSort} onSort={toggleDivSort} />
                          <SortTh col="net"      label="Net"      sort={divSort} onSort={toggleDivSort} className="text-right" />
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedDivIdxs.map(i => {
                          const d    = result.dividends[i];
                          const isDup = duplicateDivs[i] ?? false;
                          const sel  = selectedDivIdxs.has(i);
                          return (
                            <tr
                              key={i}
                              onClick={() => toggleDiv(i)}
                              className={`cursor-pointer transition-colors ${
                                sel ? 'hover:bg-gray-50/70' : 'bg-gray-50/40 hover:bg-gray-100/60 opacity-60'
                              }`}
                            >
                              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox" checked={sel}
                                    onChange={() => toggleDiv(i)}
                                    className="w-4 h-4 rounded border-gray-300 text-brand-600 cursor-pointer"
                                  />
                                  {isDup && (
                                    <span title="May already exist in your data"><AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /></span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{d.date}</td>
                              <td className="px-4 py-2.5 font-semibold text-gray-900">{d.symbol}</td>
                              <td className="px-4 py-2.5 text-gray-500">{d.currency}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                                {d.currency} {fmtNum(d.net)}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">{dividendDescription(d)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ─ Existing overlap ─ */}
              {(existingInvestments.length > 0 || existingDividends.length > 0) && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Transactions already in your data</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        These investment and dividend transactions already exist between <strong>{minDate}</strong> and <strong>{maxDate}</strong>.
                      </p>
                    </div>
                  </div>

                  {existingInvestments.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/50">
                        <p className="text-sm font-semibold text-gray-800">
                          Existing investments in range
                          <span className="ml-2 text-gray-400 font-normal">({existingInvestments.length})</span>
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-left">Action</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                              <th className="px-4 py-2 text-left">Currency</th>
                              <th className="px-4 py-2 text-left">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {existingInvestments.map(t => (
                              <tr key={t.id} className="hover:bg-gray-50/70">
                                <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{t.date}</td>
                                <td className="px-4 py-2"><ActionBadge action={t.amount >= 0 ? 'Buy' : 'Sell'} /></td>
                                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-800">
                                  {fmtNum(Math.abs(t.amount))}
                                </td>
                                <td className="px-4 py-2 text-gray-500">{t.currency}</td>
                                <td className="px-4 py-2 text-gray-600 text-xs">{t.description || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {existingDividends.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/50">
                        <p className="text-sm font-semibold text-gray-800">
                          Existing dividends in range
                          <span className="ml-2 text-gray-400 font-normal">({existingDividends.length})</span>
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                              <th className="px-4 py-2 text-left">Currency</th>
                              <th className="px-4 py-2 text-left">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {existingDividends.map(t => (
                              <tr key={t.id} className="hover:bg-gray-50/70">
                                <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">{t.date}</td>
                                <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-600">
                                  {fmtNum(Math.abs(t.amount))}
                                </td>
                                <td className="px-4 py-2 text-gray-500">{t.currency}</td>
                                <td className="px-4 py-2 text-gray-600 text-xs">{t.description || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Confirm ─ */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Ready to import?</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedTradeIdxs.size + selectedDivIdxs.size} of {result.trades.length + result.dividends.length} transactions selected.
                  </p>
                </div>
                <button
                  onClick={handleImport}
                  disabled={importLoading || selectedTradeIdxs.size + selectedDivIdxs.size === 0}
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {importLoading
                    ? <Loader className="w-4 h-4 animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Confirm Import
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
