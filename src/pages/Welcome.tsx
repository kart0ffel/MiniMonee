import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ArrowRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { createEmptyData } from '../utils/storage';
import { importFromJson } from '../utils/storage';
import { CURRENCIES } from '../utils/currency';

export default function Welcome() {
  const { setData } = useData();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState('EUR');
  const [userName, setUserName] = useState('');
  const [importError, setImportError] = useState('');
  const [showStart, setShowStart] = useState(false);

  function handleStart() {
    const data = createEmptyData(currency, userName.trim() || undefined);
    setData(data);
    navigate('/accounts');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { data, warnings } = importFromJson(ev.target?.result as string);
        setData(data);
        if (warnings.length) alert('Imported with warnings:\n' + warnings.join('\n'));
        navigate('/overview');
      } catch (err) {
        setImportError(String(err));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">

        {/* Hero image */}
        <div className="text-center">
          <img
            src={`${import.meta.env.BASE_URL}monkeymain.png`}
            alt="MiniMonee"
            className="w-full max-h-56 object-contain mx-auto rounded-2xl"
          />
        </div>

        {/* Title + description */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-white">MiniMonee</h1>
          <div className="text-gray-300 text-sm leading-relaxed space-y-3 text-left bg-gray-800/50 rounded-xl px-5 py-4">
            <p>
              MiniMonee is the finance tracker for people who are too busy to track every coffee
              but still want to know if they're getting richer.
            </p>
            <p className="text-gray-400">
              One snapshot a month across all your accounts, currencies, and investments —
              and it tells you exactly where you stand.
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          {['Multi-currency', 'Stocks & Pension', 'No login', '100% Private', 'Portable JSON'].map((f) => (
            <span key={f} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm">
              {f}
            </span>
          ))}
        </div>

        {/* Action card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">

          {!showStart ? (
            <>
              <button
                onClick={() => setShowStart(true)}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-brand-400 text-gray-600 hover:text-brand-600 font-medium py-3 px-4 rounded-xl transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                Import existing JSON
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>

              {importError && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{importError}</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Let's get you set up</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name (optional)</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Anna"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base currency</label>
                <p className="text-xs text-gray-400 mb-1">All values shown in this currency. Accounts can use others.</p>
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                Continue — Set Up Accounts
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowStart(false)}
                className="w-full text-gray-500 hover:text-gray-700 text-sm py-1"
              >
                ← Back
              </button>
            </>
          )}
        </div>

        {/* Description */}
        <div className="space-y-6 pb-12">

          {/* Intended use */}
          <div className="bg-gray-800/60 rounded-2xl px-6 py-5 space-y-3">
            <h2 className="text-white font-semibold text-base">What is MiniMonee for?</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              MiniMonee is a <strong className="text-white">personal net worth tracker</strong> for people who hold assets
              across multiple accounts, currencies, and investment types. It answers one question:{' '}
              <em className="text-gray-200">how is my overall financial picture evolving over time?</em>
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              You log balances once a period (monthly or quarterly), record what moved money in or out,
              and the tool calculates how your wealth changed, where your money went, and how your
              investments performed — all converted into a single base currency.
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              It is suited for people who hold accounts in <strong className="text-gray-300">multiple currencies</strong>,
              have assets spread across different types (cash, stocks, real estate, pension), and want
              a <strong className="text-gray-300">long-term view</strong> of wealth rather than a day-to-day budget.
            </p>
          </div>

          {/* Advantages */}
          <div className="bg-gray-800/60 rounded-2xl px-6 py-5 space-y-4">
            <h2 className="text-white font-semibold text-base">Advantages</h2>
            <div className="space-y-3">
              {[
                {
                  title: 'Multi-account tracking',
                  body: 'Bank accounts, portfolios, pension funds, property, liabilities — all in one place, shown as a single net worth.',
                },
                {
                  title: 'Multiple currencies, auto-converted',
                  body: 'Each account keeps its native currency. Exchange rates are fetched automatically and historical rates are used for past periods, so comparisons stay accurate.',
                },
                {
                  title: 'Investment & pension performance',
                  body: 'Separates market appreciation from money you put in yourself. See how much your portfolio grew due to the market — not just because you contributed more.',
                },
                {
                  title: 'Cash flow waterfall',
                  body: 'See exactly where your cash went in any period: income, taxes, investments, pension — all reconciling to your end cash balance.',
                },
                {
                  title: 'No lock-in, 100% private',
                  body: 'Data lives locally in your browser and exports as a plain JSON file. No subscription, no account, no data ever leaves your machine.',
                },
              ].map(({ title, body }) => (
                <div key={title} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-gray-200 text-sm font-medium">{title}</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Not intended for */}
          <div className="bg-gray-800/60 rounded-2xl px-6 py-5 space-y-4">
            <h2 className="text-white font-semibold text-base">What MiniMonee is <span className="text-red-400">not</span> for</h2>
            <div className="space-y-3">
              {[
                {
                  title: 'Detailed expense tracking',
                  body: 'MiniMonee calculates total spending as a residual, but does not track individual purchases or spending categories. Use YNAB or a budgeting app for that.',
                },
                {
                  title: 'Single-account or simple budgets',
                  body: 'If you have one bank account in one currency and want a monthly budget, MiniMonee is more complexity than you need.',
                },
                {
                  title: 'Real-time portfolio tracking',
                  body: 'MiniMonee does not pull live stock prices or connect to brokerage APIs. You enter balances manually — it is a snapshot tool, not a live dashboard.',
                },
                {
                  title: 'Tax reporting',
                  body: 'It tracks taxes paid and investment activity, but does not produce tax documents or calculate capital gains per lot.',
                },
              ].map(({ title, body }) => (
                <div key={title} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-gray-200 text-sm font-medium">{title}</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
