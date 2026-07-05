// Parser for two IBKR CSV export formats:
//   1. "Simple" flat CSV (ibkr_YYYY_ytd_transactions.csv style)
//   2. "Activity Statement" multi-section CSV (annual U12458083_YYYY_YYYY.csv style)

export interface IBKRAccountInfo {
  name: string;
  accountId: string;
  period: string;
}

export interface IBKRTrade {
  date: string;         // YYYY-MM-DD
  currency: string;
  symbol: string;
  action: 'Buy' | 'Sell';
  quantity: number;
  pricePerShare: number;
  proceeds: number;     // always positive
  fees: number;         // always positive
  rawDescription: string;
}

export interface IBKRDividend {
  date: string;
  currency: string;
  symbol: string;
  gross: number;
  withholding: number;  // negative (or 0)
  net: number;          // gross + withholding
  rawDescription: string;
}

export interface IBKRParseResult {
  format: 'simple' | 'activity';
  accountInfo: IBKRAccountInfo;
  trades: IBKRTrade[];
  dividends: IBKRDividend[];
  warnings: string[];
}

// ── CSV tokeniser ─────────────────────────────────────────────────────────────
// Handles quoted fields with embedded commas/newlines and "" escaping.
// Also strips the UTF-8 BOM (ï»¿ / ﻿) that IBKR adds to its exports.
function tokeniseCSV(raw: string): string[][] {
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const rows: string[][] = [];
  let i = 0;
  const n = raw.length;

  while (i < n) {
    const row: string[] = [];

    // Each iteration of this inner loop reads one field
    while (i < n) {
      if (raw[i] === '"') {
        // Quoted field
        let field = '';
        i++; // skip opening "
        while (i < n) {
          if (raw[i] === '"' && raw[i + 1] === '"') { field += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else { field += raw[i++]; }
        }
        row.push(field);
        if (raw[i] === ',') i++;
      } else {
        // Unquoted field — ends at comma or line ending
        let field = '';
        while (i < n && raw[i] !== ',' && raw[i] !== '\r' && raw[i] !== '\n') {
          field += raw[i++];
        }
        row.push(field);
        if (raw[i] === ',') i++;
      }

      // If the next char is a line ending we are done with this row
      if (raw[i] === '\r' || raw[i] === '\n') break;
    }

    // Consume line ending(s)
    if (raw[i] === '\r') i++;
    if (raw[i] === '\n') i++;

    if (row.some(c => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, '').trim()) || 0;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Format detection ──────────────────────────────────────────────────────────
function detectFormat(rows: string[][]): 'simple' | 'activity' {
  if (!rows.length) throw new Error('CSV file is empty.');
  const first = rows[0][0]?.trim();
  if (first === 'Date') return 'simple';
  if (first === 'Statement') return 'activity';
  throw new Error(
    `Unrecognised CSV format (first column: "${first}"). ` +
    'Drop an IBKR Activity Statement or the simplified YTD transactions export.'
  );
}

// ── Simple-format parser ──────────────────────────────────────────────────────
// Headers: Date,Year,Key,Account,Currency,Ticker,Google finance ticker,Action,Shares,Price,Fees,Total,Notes
function parseSimpleFormat(rows: string[][]): IBKRParseResult {
  const warnings: string[] = [];
  const dataRows = rows.slice(1).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[0]?.trim()));

  if (!dataRows.length) throw new Error('Simple format: no data rows found.');

  // Account ID — extract "U#######" from the Account column
  const accountRaw = dataRows[0][3]?.trim() ?? '';
  const accountIdMatch = accountRaw.match(/U\d+/);
  const accountId = accountIdMatch ? accountIdMatch[0] : accountRaw;

  const dates = dataRows.map(r => r[0]).sort();
  const period = `${dates[0]} – ${dates[dates.length - 1]}`;

  const trades: IBKRTrade[] = [];
  const dividends: IBKRDividend[] = [];

  for (const row of dataRows) {
    const date     = row[0]?.trim();
    const currency = row[4]?.trim();
    const ticker   = row[5]?.trim();
    const gTicker  = row[6]?.trim() ?? '';
    const action   = row[7]?.trim();
    const shares   = num(row[8]);
    const price    = num(row[9]);
    const fees     = num(row[10]);
    const total    = num(row[11]);
    const notes    = row[12]?.trim() ?? '';

    // Prefer the Google Finance ticker's exchange suffix as the display symbol
    const symbol = gTicker.includes(':') ? (gTicker.split(':').pop() ?? ticker) : (gTicker || ticker);

    if (action === 'Buy' || action === 'Sell') {
      trades.push({
        date, currency, symbol, action,
        quantity: shares,
        pricePerShare: price,
        proceeds: r2(total),
        fees: r2(fees),
        rawDescription: `${ticker} · ${action} ${shares} shares @ ${price} ${currency}`,
      });
    } else if (action === 'Dividend') {
      // In the simple format the Total column is already the net amount.
      // The Notes field optionally contains "Gross X.XX USD, withholding tax -Y.YY USD …"
      const grossMatch = notes.match(/Gross\s+([\d.]+)/i);
      const whMatch    = notes.match(/withholding tax\s+(-[\d.]+)/i);
      const gross      = grossMatch ? parseFloat(grossMatch[1]) : total;
      const withholding = whMatch  ? parseFloat(whMatch[1])    : total - gross;

      dividends.push({
        date, currency, symbol,
        gross: r2(gross),
        withholding: r2(withholding),
        net: r2(total),
        rawDescription: notes || ticker,
      });
    } else {
      warnings.push(`Skipped unrecognised action "${action}" on ${date}`);
    }
  }

  return {
    format: 'simple',
    accountInfo: { name: 'IBKR Account', accountId, period },
    trades,
    dividends,
    warnings,
  };
}

// ── Activity-Statement-format parser ─────────────────────────────────────────
// Multi-section CSV where col[0] is the section name, col[1] is Header/Data/SubTotal/Total.
function parseActivityFormat(rows: string[][]): IBKRParseResult {
  const warnings: string[] = [];
  let name = '';
  let accountId = '';
  let period = '';

  // ─ Account / period metadata ─
  for (const row of rows) {
    const sec  = row[0]?.trim();
    const kind = row[1]?.trim();
    if (sec === 'Account Information' && kind === 'Data') {
      if (row[2]?.trim() === 'Name')    name      = row[3]?.trim() ?? '';
      if (row[2]?.trim() === 'Account') accountId = row[3]?.trim() ?? '';
    }
    if (sec === 'Statement' && kind === 'Data' && row[2]?.trim() === 'Period') {
      period = row[3]?.trim() ?? '';
    }
  }

  // ─ Trades ─
  // There are two Trades header variants:
  //   Stock header → col[6] = "Date/Time", col[9] = "C. Price"
  //   Forex header → col[6] = "Date/Time", col[9] = ""         (different column layout)
  // We only want stock rows (col[3] === 'Stocks'), so we just filter directly.
  const trades: IBKRTrade[] = [];

  for (const row of rows) {
    if (row[0]?.trim() !== 'Trades')  continue;
    if (row[1]?.trim() !== 'Data')    continue;
    if (row[2]?.trim() !== 'Order')   continue;
    if (row[3]?.trim() !== 'Stocks')  continue;

    const currency  = row[4]?.trim();
    const symbol    = row[5]?.trim();
    const dateRaw   = row[6]?.trim();              // "2024-01-16, 15:41:24"
    const date      = dateRaw.split(',')[0].trim(); // "2024-01-16"
    const quantity  = num(row[7]);
    const tPrice    = num(row[8]);
    const proceeds  = num(row[10]);                 // negative = buy, positive = sell
    const commFee   = num(row[11]);

    if (!date.match(/^\d{4}-\d{2}-\d{2}/) || !currency || !symbol) {
      warnings.push(`Skipped malformed trade row: ${row.slice(0, 8).join(',')}`);
      continue;
    }

    const action: 'Buy' | 'Sell' = proceeds <= 0 ? 'Buy' : 'Sell';

    trades.push({
      date, currency, symbol, action,
      quantity: Math.abs(quantity),
      pricePerShare: tPrice,
      proceeds: r2(Math.abs(proceeds)),
      fees: r2(Math.abs(commFee)),
      rawDescription:
        `${symbol} · ${action} ${Math.abs(quantity).toLocaleString('en-US', { maximumFractionDigits: 4 })} @ ${tPrice} ${currency}`,
    });
  }

  // ─ Dividends & Withholding Tax ─
  // Dividends rows:        Dividends,Data,{CCY},{YYYY-MM-DD},{description},{amount}
  // Withholding Tax rows:  Withholding Tax,Data,{CCY},{YYYY-MM-DD},{description},{amount},{code}
  // Skip Total / "Total in CHF" / "Total Dividends in CHF" aggregation rows by
  // checking that col[2] looks like an uppercase currency code and col[3] a date.

  type RawEntry = { date: string; currency: string; symbol: string; amount: number; description: string };
  const rawDividends: RawEntry[]   = [];
  const rawWithholding: RawEntry[] = [];

  for (const row of rows) {
    const sec  = row[0]?.trim();
    const kind = row[1]?.trim();
    if (kind !== 'Data') continue;
    if (sec !== 'Dividends' && sec !== 'Withholding Tax') continue;

    const currency    = row[2]?.trim();
    const date        = row[3]?.trim();
    const description = row[4]?.trim() ?? '';
    const amount      = num(row[5]);

    // Validate: must look like a real currency code + ISO date
    if (!/^[A-Z]{2,5}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    // Skip if description is empty or amount is 0 (some CSSMI "Return of Capital" rows have amount 0 tax entries)
    if (!description) continue;

    // Extract ticker from descriptions like "VT(US9220427424) Cash Dividend …" → "VT"
    const symMatch = description.match(/^([A-Za-z0-9]+)\(/);
    const symbol   = symMatch ? symMatch[1] : description.slice(0, 8);

    const entry: RawEntry = { date, currency, symbol, amount, description };

    if (sec === 'Dividends')       rawDividends.push(entry);
    else if (sec === 'Withholding Tax') rawWithholding.push(entry);
  }

  // Group by (date|currency|symbol) and net dividends against withholding.
  // Note: IBKR sometimes emits cancelled+reissued withholding rows with opposite signs —
  // summing them naturally nets the cancellations out.
  const divMap = new Map<string, { gross: number; withholding: number; description: string }>();

  for (const d of rawDividends) {
    const key = `${d.date}|${d.currency}|${d.symbol}`;
    const prev = divMap.get(key);
    if (prev) prev.gross += d.amount;
    else divMap.set(key, { gross: d.amount, withholding: 0, description: d.description });
  }

  for (const w of rawWithholding) {
    const key = `${w.date}|${w.currency}|${w.symbol}`;
    const prev = divMap.get(key);
    if (prev) {
      prev.withholding += w.amount; // w.amount is negative
    } else {
      // Occasional "CANCEL WITHHOLDING" entries with no base dividend — safe to ignore
      if (w.amount < 0) {
        warnings.push(`Withholding tax with no matching dividend: ${w.date} ${w.currency} ${w.symbol} ${w.amount}`);
      }
    }
  }

  const dividends: IBKRDividend[] = [...divMap.entries()]
    .map(([key, { gross, withholding, description }]) => {
      const [date, currency, symbol] = key.split('|');
      return { date, currency, symbol, gross: r2(gross), withholding: r2(withholding), net: r2(gross + withholding), rawDescription: description };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    format: 'activity',
    accountInfo: { name, accountId, period },
    trades,
    dividends,
    warnings,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
export function parseIBKRCSV(rawText: string): IBKRParseResult {
  const rows   = tokeniseCSV(rawText);
  const format = detectFormat(rows);
  return format === 'simple' ? parseSimpleFormat(rows) : parseActivityFormat(rows);
}
