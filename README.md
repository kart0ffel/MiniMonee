# MiniMonee

A personal finance manager that runs entirely in your browser. No login, no database, no server — just a portable JSON file and a clean interface for tracking your net worth over time.

---

## Features

- **Multi-currency support** — each account can hold a different currency; values are converted to your chosen base currency via the [Frankfurter API](https://www.frankfurter.app/), with exchange rates cached in your JSON to avoid redundant API calls
- **Periodic snapshots** — enter your account balances at any interval you choose (monthly, quarterly, etc.)
- **Transaction tracking** — log salary, dividends, taxes paid, investments bought/sold, and pension contributions between each snapshot
- **Five views:** Net Worth, Expenses, Performance (P&L), Waterfall, and a Data Manager
- **Fully portable** — all data lives in `localStorage` and can be exported or imported as a single JSON file at any time
- **Dockerized** — ships as a self-contained container; no Node.js required to run it

---

## Getting Started

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

### Option B — Local dev server

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## First-Time Setup

1. **Choose a base currency** — all charts and totals display values in this currency. Individual accounts can still be in any supported currency.
2. **Add accounts** — go to *Accounts* and create your accounts. Each account has:
   - A name (e.g. "Main Checking", "Vanguard ISA")
   - A category: `Cash`, `Pension`, `Real Estate`, `Liabilities`, `Brokerage`, `Stocks`, or `Others`
   - A currency
3. **Add your first period** — go to *Add Period* and enter the current balance for each account. This is your baseline snapshot.

From then on, return periodically to add new snapshots. The app will calculate your expenses, investment performance, and cash flow automatically.

---

## Account Categories

| Category | Used for |
|---|---|
| Cash | Bank accounts, savings, cash on hand |
| Pension | Pension funds, retirement accounts (401k, SIPP, etc.) |
| Real Estate | Property values |
| Liabilities | Mortgages, loans, credit card balances (enter as positive numbers — they reduce net worth) |
| Brokerage | Investment/trading accounts |
| Stocks | Individual stock holdings |
| Others | Anything else |

Accounts can be **closed** at any time — they disappear from future periods but historical data is preserved.

---

## Adding a Period

The input wizard has four steps:

1. **Date** — pick the snapshot date (e.g. the last day of the month) and an optional note
2. **Balances** — enter the current balance of each active account in its own currency
3. **Transactions** — log any of the following that occurred since the last period:
   - Salary / Income
   - Dividends
   - Taxes Paid
   - Investment Bought
   - Investment Sold
   - Pension Contribution
   - Pension Withdrawal
4. **Review & Confirm** — currency conversion happens here (Frankfurter API is called for any non-base-currency entry), metrics are calculated, and the period is saved

---

## Views

### Net Worth
Line chart showing total net worth and per-category breakdowns over time. Toggle individual categories on/off. Filter to 1Y, 2Y, 5Y, or all time.

### Expenses
Bar chart of living expenses per period.

**Formula:**
```
Expenses = StartCash + Income − NetInvested − TaxesPaid − EndCash
```
Where `Income = Salary + Dividends` and `NetInvested = InvestmentBought − InvestmentSold`. Only cash-category accounts are used for Start/End Cash.

A negative result means you spent less than you received — a surplus.

### Performance
Two grouped bar series per period:

**Unrealized P&L** (Stocks + Brokerage):
```
Unrealized P&L = EndStocksValue − StartStocksValue − NetInvested
```
This isolates market appreciation from new money you put in.

**Pension P&L:**
```
Pension P&L = EndPensionValue − StartPensionValue − NetPensionContributions
```
Same logic — isolates fund growth from your own contributions.

### Waterfall
A cash flow waterfall for any selected period, showing how cash moved step by step:

```
Start Cash
  + Income
  − Investment Bought
  + Investment Sold
  − Taxes Paid
  − Pension Contributions
  + Pension Withdrawals
  − Living Expenses  ← residual, makes the chart reconcile
= End Cash
```

### Data Manager
Four tabs:
- **Periods** — table of all periods with their computed metrics
- **Transactions** — all logged transactions
- **Accounts** — full account list including closed accounts
- **Raw JSON** — view or directly edit the underlying JSON, with validation on save

Also contains **Export JSON**, **Import JSON**, and **Recalculate Metrics** buttons.

---

## Data Storage

Everything is stored in **browser localStorage** and serialized as JSON. The JSON structure is:

```json
{
  "meta": {
    "version": "1.0",
    "baseCurrency": "EUR",
    "createdAt": "...",
    "lastUpdated": "..."
  },
  "accounts": [ ... ],
  "periods": [ ... ],
  "balanceEntries": [ ... ],
  "transactions": [ ... ],
  "exchangeRateCache": { ... }
}
```

- **Export** your JSON regularly as a backup (Data Manager → Export JSON)
- **Import** a JSON file to restore data or move between devices
- The `exchangeRateCache` stores fetched exchange rates so the Frankfurter API is never called twice for the same date/pair
- The schema includes a `version` field and a migration function — future updates will not break existing JSON files

---

## Supported Currencies

AUD, BRL, CAD, CHF, CNY, CZK, DKK, EUR, GBP, HKD, HUF, INR, JPY, MXN, NOK, NZD, PLN, SEK, SGD, USD, ZAR

Exchange rates are fetched from [api.frankfurter.app](https://api.frankfurter.app) — a free, open-source API with no key required. If a historical date is unavailable, the latest rate is used as a fallback.

---

## Tech Stack

| Layer | Tool |
|---|---|
| UI framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Routing | React Router v6 |
| Date handling | date-fns |
| Container | Docker (nginx:alpine) |

---

## Project Structure

```
MiniMonee/
├── src/
│   ├── types/index.ts              TypeScript types and display constants
│   ├── utils/
│   │   ├── currency.ts             Frankfurter API, formatters, currency list
│   │   ├── calculations.ts         Expenses, P&L, pension, waterfall math
│   │   └── storage.ts              localStorage, JSON import/export, migrations
│   ├── contexts/DataContext.tsx    Global state and all data mutations
│   ├── components/Layout.tsx       Sidebar navigation (responsive)
│   └── pages/
│       ├── Welcome.tsx             First-run screen
│       ├── Setup.tsx               Account management
│       ├── BalanceInput.tsx        4-step period input wizard
│       ├── Overview.tsx            Net Worth chart
│       ├── Expenses.tsx            Expenses bar chart
│       ├── Performance.tsx         P&L charts
│       ├── Waterfall.tsx           Cash flow waterfall
│       └── DataManager.tsx         Tables, JSON editor, import/export
├── Dockerfile                      Multi-stage build (Node → nginx)
├── docker-compose.yml
└── nginx.conf                      SPA routing, gzip, cache headers
```

---

## Privacy

MiniMonee is fully client-side. No data is sent to any server except exchange rate lookups to `api.frankfurter.app` (which only receives currency codes and dates — never your balances). Your financial data never leaves your browser unless you export it yourself.
