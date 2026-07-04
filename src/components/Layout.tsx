import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  TrendingUp, BarChart2, Activity, GitCommit,
  PlusCircle, FilePlus, Settings, Database, Menu, X, PiggyBank,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { formatCurrency } from '../utils/currency';

const NAV_ITEMS = [
  { to: '/overview',    label: 'Net Worth',          icon: TrendingUp },
  { to: '/expenses',    label: 'Expenses',            icon: BarChart2  },
  { to: '/performance', label: 'Investment Performance', icon: Activity   },
  { to: '/pension',     label: 'Pension',             icon: PiggyBank  },
  { to: '/waterfall',   label: 'Waterfall',           icon: GitCommit  },
];

const INPUT_ITEMS = [
  { to: '/input',        label: 'Add Period',       icon: PlusCircle },
  { to: '/transactions', label: 'Add Transactions', icon: FilePlus   },
];

const SECONDARY_ITEMS = [
  { to: '/accounts', label: 'Accounts', icon: Settings },
  { to: '/data', label: 'Data Manager', icon: Database },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const latestPeriod = data
    ? [...data.periods].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0]
    : null;

  const netWorth = latestPeriod?.metrics.totalNetWorth ?? 0;
  const baseCurrency = data?.meta.baseCurrency ?? 'USD';
  const userName = data?.meta.userName;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
          <img src={`${import.meta.env.BASE_URL}monkee.png`} alt="MiniMonee" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-lg font-bold tracking-tight">MiniMonee</span>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Net worth summary */}
        {latestPeriod && (
          <div className="px-6 py-4 border-b border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Net Worth</p>
            <p className="text-xl font-bold text-brand-400">
              {formatCurrency(netWorth, baseCurrency, true)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              as of {new Date(latestPeriod.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Input
          </p>
          {INPUT_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          <div className="pt-4">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Analytics
            </p>
          </div>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          <div className="pt-4">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Manage
            </p>
            {SECONDARY_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 space-y-0.5">
          {userName && (
            <p className="text-sm font-medium text-gray-300">Hi, {userName} 👋</p>
          )}
          <p className="text-xs text-gray-500">
            Base: <span className="text-gray-300 font-medium">{baseCurrency}</span>
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-gray-900">MiniMonee</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
