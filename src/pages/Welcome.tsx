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
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/monkee.png"
            alt="MiniMonee"
            className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4 shadow-lg"
          />
          <h1 className="text-4xl font-bold text-white mb-2">MiniMonee</h1>
          <p className="text-gray-400 text-lg">Your personal finance tracker</p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {['Multi-currency', 'No login', 'Privacy-first', 'Portable JSON'].map((f) => (
            <span key={f} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm">
              {f}
            </span>
          ))}
        </div>

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

        <p className="text-center text-gray-600 text-xs mt-6">
          All data stays in your browser. Export anytime as JSON.
        </p>
      </div>
    </div>
  );
}
