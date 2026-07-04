import { Plus } from 'lucide-react';
import { CURRENCIES } from '../utils/currency';

// ── Shared types ────────────────────────────────────────────────────────────

export type IncomeSubtype =
  | 'income_employment'
  | 'income_dividend'
  | 'income_interest'
  | 'income_rental'
  | 'income_other';

export const INCOME_OPTIONS: { value: IncomeSubtype; label: string }[] = [
  { value: 'income_employment', label: 'Employment' },
  { value: 'income_dividend',   label: 'Dividend' },
  { value: 'income_interest',   label: 'Interest' },
  { value: 'income_rental',     label: 'Rental' },
  { value: 'income_other',      label: 'Other' },
];

export interface TxDraft {
  date: string;
  amount: string;
  currency: string;
  description: string;
}
export interface TxDraftWithDir extends TxDraft {
  direction: 'in' | 'out';
}
export interface IncomeDraft extends TxDraft {
  subtype: IncomeSubtype;
}
export interface TxDrafts {
  income:     IncomeDraft[];
  tax:        TxDraftWithDir[];
  investment: TxDraftWithDir[];
  pension:    TxDraftWithDir[];
}

export function makeEmptyDrafts(baseCurrency: string): TxDrafts {
  const d: TxDraft = { date: '', amount: '', currency: baseCurrency, description: '' };
  return {
    income:     [{ ...d, subtype: 'income_employment' as const }],
    tax:        [{ ...d, direction: 'in' as const }],
    investment: [{ ...d, direction: 'in' as const }],
    pension:    [{ ...d, direction: 'in' as const }],
  };
}

// ── Component ───────────────────────────────────────────────────────────────

const COL1 = 'w-48 shrink-0';

interface Props {
  txDrafts: TxDrafts;
  setTxDrafts: React.Dispatch<React.SetStateAction<TxDrafts>>;
  baseCurrency: string;
  periodDate: string;
}

export default function TransactionInputSection({ txDrafts, setTxDrafts, baseCurrency, periodDate }: Props) {
  const dateInputCls      = 'w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0';
  const amountInputCls    = 'w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0';
  const currencySelectCls = 'w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none shrink-0';
  const descInputCls      = 'flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500';

  // Plain functions (not React components) — prevents focus loss on each keystroke.

  function updateIncomeTx(idx: number, key: keyof IncomeDraft, value: string) {
    setTxDrafts((prev) => ({
      ...prev,
      income: prev.income.map((d, i) => (i === idx ? { ...d, [key]: value } : d)),
    }));
  }

  function updateTx(field: 'tax' | 'investment' | 'pension', idx: number, key: 'date' | 'amount' | 'currency' | 'description', value: string) {
    setTxDrafts((prev) => ({
      ...prev,
      [field]: prev[field].map((d, i) => (i === idx ? { ...d, [key]: value } : d)),
    }));
  }

  function toggleDir(field: 'investment' | 'pension' | 'tax', idx: number) {
    setTxDrafts((prev) => ({
      ...prev,
      [field]: (prev[field] as TxDraftWithDir[]).map((d, i) =>
        i === idx ? { ...d, direction: d.direction === 'in' ? 'out' : 'in' } : d,
      ),
    }));
  }

  function addIncomeRow() {
    const d: IncomeDraft = { date: '', amount: '', currency: baseCurrency, description: '', subtype: 'income_employment' };
    setTxDrafts((prev) => ({ ...prev, income: [...prev.income, d] }));
  }

  function addDirRow(field: 'investment' | 'pension' | 'tax') {
    const d: TxDraftWithDir = { date: '', amount: '', currency: baseCurrency, description: '', direction: 'in' };
    setTxDrafts((prev) => ({ ...prev, [field]: [...prev[field], d] }));
  }

  function renderIncomeRow(draft: IncomeDraft, idx: number) {
    return (
      <div key={idx} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0">
        <select
          value={draft.subtype}
          onChange={(e) => updateIncomeTx(idx, 'subtype', e.target.value)}
          className={`${COL1} border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500`}
        >
          {INCOME_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input type="date" value={draft.date || periodDate}
          onChange={(e) => { if (e.target.value) updateIncomeTx(idx, 'date', e.target.value); }} className={dateInputCls} />
        <input type="number" min="0" step="any" value={draft.amount} placeholder="0"
          onChange={(e) => updateIncomeTx(idx, 'amount', e.target.value)} className={amountInputCls} />
        <select value={draft.currency}
          onChange={(e) => updateIncomeTx(idx, 'currency', e.target.value)} className={currencySelectCls}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={draft.description} placeholder="Description (optional)"
          onChange={(e) => updateIncomeTx(idx, 'description', e.target.value)} className={descInputCls} />
      </div>
    );
  }

  function renderDirTxRow(
    field: 'investment' | 'pension' | 'tax',
    inLabel: string,
    outLabel: string,
    draft: TxDraftWithDir,
    idx: number,
  ) {
    const dir = draft.direction;
    return (
      <div key={idx} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0">
        <div className={COL1}>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button type="button" onClick={() => { if (dir !== 'in') toggleDir(field, idx); }}
              className={`px-2 py-1.5 font-medium transition-colors ${dir === 'in' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {inLabel}
            </button>
            <button type="button" onClick={() => { if (dir !== 'out') toggleDir(field, idx); }}
              className={`px-2 py-1.5 font-medium transition-colors border-l border-gray-200 ${dir === 'out' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {outLabel}
            </button>
          </div>
        </div>
        <input type="date" value={draft.date || periodDate}
          onChange={(e) => { if (e.target.value) updateTx(field, idx, 'date', e.target.value); }} className={dateInputCls} />
        <input type="number" min="0" step="any" value={draft.amount} placeholder="0"
          onChange={(e) => updateTx(field, idx, 'amount', e.target.value)} className={amountInputCls} />
        <select value={draft.currency}
          onChange={(e) => updateTx(field, idx, 'currency', e.target.value)} className={currencySelectCls}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={draft.description} placeholder="Description (optional)"
          onChange={(e) => updateTx(field, idx, 'description', e.target.value)} className={descInputCls} />
      </div>
    );
  }

  function addRowButton(onClick: () => void) {
    return (
      <button type="button" onClick={onClick}
        className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
        <Plus className="w-3.5 h-3.5" />
        Add another
      </button>
    );
  }

  return (
    <>
      {/* Income */}
      <div className="rounded-xl border border-emerald-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Income</span>
        </div>
        {txDrafts.income.map((d, i) => renderIncomeRow(d, i))}
        {addRowButton(addIncomeRow)}
      </div>

      {/* Investment */}
      <div className="rounded-xl border border-violet-200 overflow-hidden">
        <div className="bg-violet-50 px-4 py-2 border-b border-violet-100">
          <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Investment</span>
        </div>
        <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Investment Purchases / Sells</span>
        </div>
        {txDrafts.investment.map((d, i) => renderDirTxRow('investment', 'Bought', 'Sold', d, i))}
        {addRowButton(() => addDirRow('investment'))}
      </div>

      {/* Taxes */}
      <div className="rounded-xl border border-red-200 overflow-hidden">
        <div className="bg-red-50 px-4 py-2 border-b border-red-100">
          <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Taxes</span>
        </div>
        {txDrafts.tax.map((d, i) => renderDirTxRow('tax', 'Paid', 'Refunded', d, i))}
        {addRowButton(() => addDirRow('tax'))}
      </div>

      {/* Pension */}
      <div className="rounded-xl border border-indigo-200 overflow-hidden">
        <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Pension</span>
        </div>
        {txDrafts.pension.map((d, i) => renderDirTxRow('pension', 'Contribution', 'Withdrawal', d, i))}
        {addRowButton(() => addDirRow('pension'))}
      </div>
    </>
  );
}
