# ETF Fund Flows Tracker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Bloomberg-style dark dashboard that tracks ETF fund flows (starting with EWY) using the shares outstanding method, deployed on Vercel with daily auto-updating data.

**Architecture:** Python script fetches shares outstanding + price data from yfinance, calculates daily fund flows and rolling aggregates, outputs static JSON. Next.js frontend reads the JSON and renders a dense, dark-themed dashboard. GitHub Actions runs the Python script daily and commits updated data.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Recharts, Python 3, yfinance, pandas, GitHub Actions, Vercel

**Design doc:** `docs/plans/2026-02-27-etf-fund-flows-design.md`

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `.gitignore`

**Step 1: Initialize Next.js with Tailwind**

Run from `C:\Users\Yuhan\Desktop\Claude Projects\etf-fund-flows`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --turbopack
```

When prompted, accept defaults. This scaffolds into the current directory.

**Step 2: Verify it runs**

```bash
npm run dev
```

Expected: Dev server starts at http://localhost:3000, default Next.js page renders.

**Step 3: Set up dark theme globals**

Replace `src/app/globals.css` with Bloomberg-style dark theme base:

```css
@import "tailwindcss";

:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-card: #1a1a1a;
  --border: #2a2a2a;
  --text-primary: #e5e5e5;
  --text-secondary: #888888;
  --green: #00c853;
  --red: #ff1744;
  --amber: #ffab00;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}
```

Replace `src/app/layout.tsx` with dark theme shell:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETF Fund Flows Tracker",
  description: "Track ETF fund flows using the shares outstanding method",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] antialiased">
        {children}
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx` with placeholder:

```tsx
export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-mono font-bold text-[#ffab00]">
        ETF FUND FLOWS TRACKER
      </h1>
      <p className="text-[#888888] mt-2">Dashboard loading...</p>
    </main>
  );
}
```

**Step 4: Verify dark theme renders**

```bash
npm run dev
```

Expected: Dark page with amber title "ETF FUND FLOWS TRACKER" at http://localhost:3000.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dark theme"
```

---

### Task 2: Python Data Pipeline — Config & Setup

**Files:**
- Create: `scripts/etf_config.json`
- Create: `scripts/requirements.txt`
- Create: `scripts/fetch_flows.py` (skeleton)

**Step 1: Create ETF config**

`scripts/etf_config.json`:
```json
{
  "tickers": ["EWY"]
}
```

**Step 2: Create requirements**

`scripts/requirements.txt`:
```
yfinance>=0.2.36
pandas>=2.0.0
```

**Step 3: Install Python deps**

```bash
cd scripts && pip install -r requirements.txt && cd ..
```

Expected: yfinance and pandas install successfully.

**Step 4: Create fetch_flows.py skeleton**

`scripts/fetch_flows.py`:
```python
#!/usr/bin/env python3
"""
ETF Fund Flows Data Pipeline

Fetches shares outstanding and price data from yfinance,
calculates fund flows using the shares outstanding method,
and outputs JSON for the frontend.

Formula: Daily Fund Flow = (Shares_Today - Shares_Yesterday) × NAV_Today
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf


def load_config() -> list[str]:
    """Load ticker list from config file."""
    config_path = Path(__file__).parent / "etf_config.json"
    with open(config_path) as f:
        config = json.load(f)
    return config["tickers"]


def fetch_etf_data(ticker: str) -> dict:
    """Fetch all data for a single ETF and calculate fund flows."""
    print(f"Fetching data for {ticker}...")
    etf = yf.Ticker(ticker)

    # 1. Get shares outstanding history
    shares = etf.get_shares_full(start="2020-01-01")
    if shares is None or shares.empty:
        print(f"  WARNING: No shares outstanding data for {ticker}")
        return None

    # Remove duplicate dates (keep last value per date)
    shares.index = pd.to_datetime(shares.index).date
    shares = shares.groupby(shares.index).last()
    shares = pd.Series(shares.values.flatten(), index=pd.DatetimeIndex(shares.index))
    shares.name = "shares_outstanding"

    # 2. Get price/NAV history
    hist = etf.history(period="max")
    if hist.empty:
        print(f"  WARNING: No price history for {ticker}")
        return None

    hist.index = hist.index.tz_localize(None)

    # 3. Merge on date
    df = pd.DataFrame({"close": hist["Close"]})
    df["shares"] = shares
    df = df.dropna(subset=["shares"])
    df = df.sort_index()

    # 4. Calculate daily fund flows
    df["shares_change"] = df["shares"].diff()
    df["daily_flow"] = df["shares_change"] * df["close"]

    # 5. Calculate rolling aggregates
    df["weekly_flow"] = df["daily_flow"].rolling(5, min_periods=1).sum()
    df["monthly_flow"] = df["daily_flow"].rolling(21, min_periods=1).sum()
    df["three_month_flow"] = df["daily_flow"].rolling(63, min_periods=1).sum()
    df["six_month_flow"] = df["daily_flow"].rolling(126, min_periods=1).sum()
    df["cumulative_flow"] = df["daily_flow"].cumsum()

    # 6. Get metadata
    info = etf.info
    holdings_data = []
    try:
        top_holdings = etf.get_holdings()
        if top_holdings is not None and not top_holdings.empty:
            for _, row in top_holdings.head(10).iterrows():
                holdings_data.append({
                    "name": row.get("Name", row.get("holdingName", "Unknown")),
                    "symbol": row.get("Symbol", row.get("symbol", "")),
                    "weight": round(float(row.get("% Assets", row.get("pctAssets", 0))) if not pd.isna(row.get("% Assets", row.get("pctAssets", 0))) else 0, 2),
                })
    except Exception as e:
        print(f"  Note: Could not fetch holdings: {e}")

    sector_data = {}
    try:
        sector_weights = info.get("sectorWeightings", [])
        for sector_dict in sector_weights:
            for sector, weight in sector_dict.items():
                sector_data[sector] = round(float(weight) * 100, 2)
    except Exception:
        pass

    # 7. Build output JSON
    # Only include last 2 years of daily data for the chart (keep file size manageable)
    cutoff = datetime.now() - timedelta(days=730)
    chart_df = df[df.index >= cutoff].copy()

    flows_data = []
    for date, row in chart_df.iterrows():
        if pd.notna(row["daily_flow"]):
            flows_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(float(row["close"]), 2),
                "shares": int(row["shares"]),
                "daily_flow": round(float(row["daily_flow"]), 0),
                "weekly_flow": round(float(row["weekly_flow"]), 0),
                "monthly_flow": round(float(row["monthly_flow"]), 0),
                "three_month_flow": round(float(row["three_month_flow"]), 0),
                "six_month_flow": round(float(row["six_month_flow"]), 0),
                "cumulative_flow": round(float(row["cumulative_flow"]), 0),
            })

    # Summary stats (latest values)
    latest = df.iloc[-1] if not df.empty else None

    output = {
        "ticker": ticker,
        "name": info.get("longName", info.get("shortName", ticker)),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "metadata": {
            "aum": info.get("totalAssets", None),
            "nav": round(float(info.get("navPrice", info.get("previousClose", 0))), 2),
            "expense_ratio": info.get("annualReportExpenseRatio", None),
            "shares_outstanding": int(latest["shares"]) if latest is not None else None,
            "currency": info.get("currency", "USD"),
        },
        "summary": {
            "daily": round(float(latest["daily_flow"]), 0) if latest is not None and pd.notna(latest["daily_flow"]) else 0,
            "weekly": round(float(latest["weekly_flow"]), 0) if latest is not None and pd.notna(latest["weekly_flow"]) else 0,
            "monthly": round(float(latest["monthly_flow"]), 0) if latest is not None and pd.notna(latest["monthly_flow"]) else 0,
            "three_month": round(float(latest["three_month_flow"]), 0) if latest is not None and pd.notna(latest["three_month_flow"]) else 0,
            "six_month": round(float(latest["six_month_flow"]), 0) if latest is not None and pd.notna(latest["six_month_flow"]) else 0,
        },
        "holdings": holdings_data,
        "sectors": sector_data,
        "flows": flows_data,
    }

    return output


def main():
    tickers = load_config()
    output_dir = Path(__file__).parent.parent / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    for ticker in tickers:
        data = fetch_etf_data(ticker)
        if data is None:
            print(f"Skipping {ticker} — no data available")
            continue

        output_path = output_dir / f"{ticker}.json"
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"  Wrote {output_path} ({len(data['flows'])} data points)")

    print("Done!")


if __name__ == "__main__":
    main()
```

**Step 5: Run the pipeline and verify output**

```bash
python scripts/fetch_flows.py
```

Expected: Creates `public/data/EWY.json` with fund flows data. Check the file has `ticker`, `metadata`, `summary`, `flows` arrays.

**Step 6: Verify JSON structure**

```bash
python -c "import json; d=json.load(open('public/data/EWY.json')); print(f'Ticker: {d[\"ticker\"]}, Flows: {len(d[\"flows\"])} days, Latest: {d[\"summary\"]}')"
```

Expected: Prints ticker, number of days, and summary flow values.

**Step 7: Commit**

```bash
git add scripts/ public/data/EWY.json
git commit -m "feat: add Python data pipeline for ETF fund flows"
```

---

### Task 3: Data Types & Loader

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/data.ts`

**Step 1: Define TypeScript types**

`src/lib/types.ts`:
```typescript
export interface ETFFlow {
  date: string;
  close: number;
  shares: number;
  daily_flow: number;
  weekly_flow: number;
  monthly_flow: number;
  three_month_flow: number;
  six_month_flow: number;
  cumulative_flow: number;
}

export interface ETFMetadata {
  aum: number | null;
  nav: number;
  expense_ratio: number | null;
  shares_outstanding: number | null;
  currency: string;
}

export interface ETFSummary {
  daily: number;
  weekly: number;
  monthly: number;
  three_month: number;
  six_month: number;
}

export interface Holding {
  name: string;
  symbol: string;
  weight: number;
}

export interface ETFData {
  ticker: string;
  name: string;
  last_updated: string;
  metadata: ETFMetadata;
  summary: ETFSummary;
  holdings: Holding[];
  sectors: Record<string, number>;
  flows: ETFFlow[];
}
```

**Step 2: Create data loader**

`src/lib/data.ts`:
```typescript
import { ETFData } from "./types";

export async function loadETFData(ticker: string): Promise<ETFData> {
  const res = await fetch(`/data/${ticker}.json`);
  if (!res.ok) throw new Error(`Failed to load data for ${ticker}`);
  return res.json();
}

export async function getAvailableETFs(): Promise<string[]> {
  // In static build, we know the tickers from the data directory
  // For now, hardcode; later can be dynamic
  return ["EWY"];
}

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
```

**Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: add TypeScript types and data loader"
```

---

### Task 4: StatsBar Component

**Files:**
- Create: `src/components/StatsBar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Build StatsBar**

`src/components/StatsBar.tsx`:
```tsx
import { ETFMetadata } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/data";

interface StatsBarProps {
  metadata: ETFMetadata;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3">
      <div className="text-[#888888] text-xs font-mono uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[#e5e5e5] text-lg font-mono font-bold mt-1">
        {value}
      </div>
    </div>
  );
}

export default function StatsBar({ metadata }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="AUM"
        value={metadata.aum ? formatCurrency(metadata.aum, true) : "N/A"}
      />
      <StatCard label="NAV" value={`$${metadata.nav.toFixed(2)}`} />
      <StatCard
        label="Expense Ratio"
        value={
          metadata.expense_ratio
            ? formatPercent(metadata.expense_ratio)
            : "N/A"
        }
      />
      <StatCard
        label="Shares Outstanding"
        value={
          metadata.shares_outstanding
            ? formatNumber(metadata.shares_outstanding)
            : "N/A"
        }
      />
    </div>
  );
}
```

**Step 2: Wire into page.tsx**

Update `src/app/page.tsx` to load data and render StatsBar (will be expanded each task):

```tsx
"use client";

import { useEffect, useState } from "react";
import { ETFData } from "@/lib/types";
import { loadETFData } from "@/lib/data";
import StatsBar from "@/components/StatsBar";

export default function Home() {
  const [data, setData] = useState<ETFData | null>(null);
  const [ticker] = useState("EWY");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadETFData(ticker)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [ticker]);

  if (error) {
    return (
      <main className="p-6">
        <p className="text-[#ff1744]">Error: {error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-6">
        <p className="text-[#888888] font-mono">Loading...</p>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-[#ffab00]">
            ETF FUND FLOWS
          </h1>
          <p className="text-[#888888] text-sm font-mono mt-1">
            {data.name} ({data.ticker})
          </p>
        </div>
        <div className="text-right text-xs text-[#888888] font-mono">
          <div>Last updated</div>
          <div>{data.last_updated}</div>
        </div>
      </div>

      {/* Stats */}
      <StatsBar metadata={data.metadata} />
    </main>
  );
}
```

**Step 3: Verify in browser**

```bash
npm run dev
```

Expected: Dark page with amber "ETF FUND FLOWS" header, "iShares MSCI South Korea ETF (EWY)" subtitle, and 4 stat cards showing AUM, NAV, Expense Ratio, Shares Outstanding.

**Step 4: Commit**

```bash
git add src/components/StatsBar.tsx src/app/page.tsx
git commit -m "feat: add StatsBar component with key ETF metrics"
```

---

### Task 5: FlowsSummary Component

**Files:**
- Create: `src/components/FlowsSummary.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Build FlowsSummary**

`src/components/FlowsSummary.tsx`:
```tsx
import { ETFSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowsSummaryProps {
  summary: ETFSummary;
}

function FlowRow({ label, value }: { label: string; value: number }) {
  const isPositive = value >= 0;
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a] last:border-b-0">
      <span className="text-[#888888] text-sm font-mono">{label}</span>
      <span
        className={`text-sm font-mono font-bold ${
          isPositive ? "text-[#00c853]" : "text-[#ff1744]"
        }`}
      >
        {isPositive ? "+" : ""}
        {formatCurrency(value, true)}
      </span>
    </div>
  );
}

export default function FlowsSummary({ summary }: FlowsSummaryProps) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Fund Flows Summary
      </h3>
      <FlowRow label="Today" value={summary.daily} />
      <FlowRow label="1 Week" value={summary.weekly} />
      <FlowRow label="1 Month" value={summary.monthly} />
      <FlowRow label="3 Months" value={summary.three_month} />
      <FlowRow label="6 Months" value={summary.six_month} />
    </div>
  );
}
```

**Step 2: Add to page.tsx**

Add import and render below StatsBar:

```tsx
import FlowsSummary from "@/components/FlowsSummary";
// ... in the return JSX, after <StatsBar />:
<FlowsSummary summary={data.summary} />
```

**Step 3: Verify and commit**

```bash
npm run dev
# Check: Flows summary shows green/red values for each time horizon
git add src/components/FlowsSummary.tsx src/app/page.tsx
git commit -m "feat: add FlowsSummary component"
```

---

### Task 6: FlowsChart Component (Main Chart)

**Files:**
- Create: `src/components/FlowsChart.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Install Recharts**

```bash
npm install recharts
```

**Step 2: Build FlowsChart**

`src/components/FlowsChart.tsx`:
```tsx
"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ETFFlow } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowsChartProps {
  flows: ETFFlow[];
}

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
type FlowField = "daily_flow" | "weekly_flow" | "monthly_flow" | "three_month_flow" | "six_month_flow";

const TIME_RANGES: { label: string; value: TimeRange; days: number }[] = [
  { label: "1M", value: "1M", days: 30 },
  { label: "3M", value: "3M", days: 90 },
  { label: "6M", value: "6M", days: 180 },
  { label: "1Y", value: "1Y", days: 365 },
  { label: "ALL", value: "ALL", days: 9999 },
];

const FLOW_FIELDS: { label: string; value: FlowField }[] = [
  { label: "Daily", value: "daily_flow" },
  { label: "Weekly", value: "weekly_flow" },
  { label: "Monthly", value: "monthly_flow" },
  { label: "3M Rolling", value: "three_month_flow" },
  { label: "6M Rolling", value: "six_month_flow" },
];

export default function FlowsChart({ flows }: FlowsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("6M");
  const [flowField, setFlowField] = useState<FlowField>("daily_flow");

  const filteredData = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === timeRange);
    if (!range || range.value === "ALL") return flows;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range.days);
    return flows.filter((f) => new Date(f.date) >= cutoff);
  }, [flows, timeRange]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-3 font-mono text-xs">
        <div className="text-[#888888] mb-1">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className={p.value >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}>
            {p.name}: {formatCurrency(p.value, true)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00]">
          Fund Flows
        </h3>
        <div className="flex gap-2 flex-wrap">
          {/* Flow type selector */}
          <div className="flex gap-1">
            {FLOW_FIELDS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFlowField(f.value)}
                className={`px-2 py-1 text-xs font-mono rounded ${
                  flowField === f.value
                    ? "bg-[#ffab00] text-[#0a0a0a]"
                    : "bg-[#111111] text-[#888888] hover:text-[#e5e5e5]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Time range selector */}
          <div className="flex gap-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setTimeRange(r.value)}
                className={`px-2 py-1 text-xs font-mono rounded ${
                  timeRange === r.value
                    ? "bg-[#ffab00] text-[#0a0a0a]"
                    : "bg-[#111111] text-[#888888] hover:text-[#e5e5e5]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={filteredData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            stroke="#888888"
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#888888"
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => formatCurrency(v, true)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey={flowField}
            name="Flow"
            fill="#00c853"
            radius={[1, 1, 0, 0]}
            isAnimationActive={false}
          >
            {filteredData.map((entry, index) => (
              <rect
                key={index}
                fill={
                  (entry[flowField] ?? 0) >= 0 ? "#00c853" : "#ff1744"
                }
              />
            ))}
          </Bar>
          <Line
            dataKey="cumulative_flow"
            name="Cumulative"
            stroke="#ffab00"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Note:** The conditional bar coloring above is simplified — Recharts `Bar` doesn't natively support per-bar colors via `<rect>` children like that. The actual implementation should use the `Cell` component from Recharts:

```tsx
import { Cell } from "recharts";
// Replace the <Bar> element's children:
<Bar dataKey={flowField} name="Flow" radius={[1, 1, 0, 0]} isAnimationActive={false}>
  {filteredData.map((entry, index) => (
    <Cell key={index} fill={(entry[flowField] ?? 0) >= 0 ? "#00c853" : "#ff1744"} />
  ))}
</Bar>
```

**Step 3: Add to page.tsx**

```tsx
import FlowsChart from "@/components/FlowsChart";
// ... after StatsBar:
<FlowsChart flows={data.flows} />
```

**Step 4: Verify and commit**

```bash
npm run dev
# Check: Bar chart renders with green/red bars, amber cumulative line, time range toggles work
git add src/components/FlowsChart.tsx src/app/page.tsx package.json package-lock.json
git commit -m "feat: add FlowsChart with time range and flow type toggles"
```

---

### Task 7: PriceChart Component

**Files:**
- Create: `src/components/PriceChart.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Build PriceChart**

`src/components/PriceChart.tsx`:
```tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ETFFlow } from "@/lib/types";

interface PriceChartProps {
  flows: ETFFlow[];
}

export default function PriceChart({ flows }: PriceChartProps) {
  // Use last 6 months by default
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const data = flows.filter((f) => new Date(f.date) >= cutoff);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-4">
        Price Performance
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ffab00" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ffab00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            stroke="#888888"
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#888888"
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => `$${v}`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#888888" }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="#ffab00"
            fill="url(#priceGradient)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Add to page.tsx and commit**

```tsx
import PriceChart from "@/components/PriceChart";
// ... after FlowsChart:
<PriceChart flows={data.flows} />
```

```bash
git add src/components/PriceChart.tsx src/app/page.tsx
git commit -m "feat: add PriceChart component"
```

---

### Task 8: TopHoldings & SectorAllocation Components

**Files:**
- Create: `src/components/TopHoldings.tsx`
- Create: `src/components/SectorAllocation.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Build TopHoldings**

`src/components/TopHoldings.tsx`:
```tsx
import { Holding } from "@/lib/types";

interface TopHoldingsProps {
  holdings: Holding[];
}

export default function TopHoldings({ holdings }: TopHoldingsProps) {
  if (holdings.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
          Top Holdings
        </h3>
        <p className="text-[#888888] text-sm font-mono">No holdings data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Top Holdings
      </h3>
      <div className="space-y-2">
        {holdings.map((h, i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-[#888888] text-xs font-mono w-4">
                {i + 1}
              </span>
              <span className="text-[#e5e5e5] text-sm font-mono truncate max-w-[180px]">
                {h.name}
              </span>
            </div>
            <span className="text-[#ffab00] text-sm font-mono font-bold">
              {h.weight}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Build SectorAllocation**

`src/components/SectorAllocation.tsx`:
```tsx
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface SectorAllocationProps {
  sectors: Record<string, number>;
}

const COLORS = [
  "#ffab00", "#00c853", "#2979ff", "#ff1744",
  "#aa00ff", "#00e5ff", "#ff6d00", "#76ff03",
  "#d500f9", "#1de9b6",
];

export default function SectorAllocation({ sectors }: SectorAllocationProps) {
  const data = Object.entries(sectors).map(([name, value]) => ({
    name: name.replace(/([A-Z])/g, " $1").trim(),
    value,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
          Sector Allocation
        </h3>
        <p className="text-[#888888] text-sm font-mono">No sector data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Sector Allocation
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`${value.toFixed(1)}%`]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-1 mt-2">
        {data.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-xs font-mono">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-[#888888] truncate">{s.name}</span>
            <span className="text-[#e5e5e5] ml-auto">{s.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Wire into page.tsx with layout grid**

The final page layout should arrange FlowsSummary + TopHoldings + SectorAllocation in a responsive grid below the charts:

```tsx
import TopHoldings from "@/components/TopHoldings";
import SectorAllocation from "@/components/SectorAllocation";

// In the return JSX, after PriceChart:
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <FlowsSummary summary={data.summary} />
  <TopHoldings holdings={data.holdings} />
  <SectorAllocation sectors={data.sectors} />
</div>
```

**Step 4: Verify and commit**

```bash
npm run dev
# Check: Full dashboard renders — stats, flows chart, price chart, summary, holdings, sectors
git add src/components/TopHoldings.tsx src/components/SectorAllocation.tsx src/app/page.tsx
git commit -m "feat: add TopHoldings and SectorAllocation components"
```

---

### Task 9: ETF Selector Component

**Files:**
- Create: `src/components/ETFSelector.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Build ETFSelector**

`src/components/ETFSelector.tsx`:
```tsx
interface ETFSelectorProps {
  tickers: string[];
  selected: string;
  onChange: (ticker: string) => void;
}

export default function ETFSelector({
  tickers,
  selected,
  onChange,
}: ETFSelectorProps) {
  if (tickers.length <= 1) return null;

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#111111] border border-[#2a2a2a] text-[#e5e5e5] text-sm font-mono rounded px-3 py-1.5 focus:outline-none focus:border-[#ffab00]"
    >
      {tickers.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
```

**Step 2: Wire into page.tsx header**

Update page.tsx to use ETFSelector and manage ticker state for switching between ETFs (will become useful when more are added):

```tsx
import ETFSelector from "@/components/ETFSelector";
import { getAvailableETFs } from "@/lib/data";

// Add state:
const [tickers, setTickers] = useState<string[]>(["EWY"]);

// In useEffect, load available tickers:
useEffect(() => {
  getAvailableETFs().then(setTickers);
}, []);

// In header div:
<ETFSelector tickers={tickers} selected={ticker} onChange={setTicker} />
```

Change `const [ticker]` to `const [ticker, setTicker]`.

**Step 3: Verify and commit**

```bash
npm run dev
# Check: Selector doesn't show (only 1 ETF). Add a second ticker later to test.
git add src/components/ETFSelector.tsx src/app/page.tsx
git commit -m "feat: add ETFSelector component for multi-ETF support"
```

---

### Task 10: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/update-data.yml`

**Step 1: Create the workflow**

`.github/workflows/update-data.yml`:
```yaml
name: Update ETF Data

on:
  schedule:
    # Run daily at 12:00 UTC (7:00 AM ET)
    - cron: "0 12 * * 1-5"
  workflow_dispatch: # Allow manual trigger

permissions:
  contents: write

jobs:
  update-data:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Fetch ETF data
        run: python scripts/fetch_flows.py

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data/
          git diff --staged --quiet || git commit -m "data: update ETF fund flows $(date +%Y-%m-%d)"
          git push
```

**Step 2: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat: add GitHub Actions daily data update workflow"
```

---

### Task 11: Project CLAUDE.md & Final Polish

**Files:**
- Create: `CLAUDE.md`
- Modify: `src/app/page.tsx` (final layout tweaks)

**Step 1: Create project CLAUDE.md**

`CLAUDE.md`:
```markdown
# ETF Fund Flows Tracker

## What it does
Tracks ETF fund flows using the shares outstanding method. Bloomberg-style dark dashboard.

## How to run

### Frontend (Next.js)
```bash
npm install
npm run dev
```
Open http://localhost:3000

### Data pipeline (Python)
```bash
pip install -r scripts/requirements.txt
python scripts/fetch_flows.py
```
Generates `public/data/{TICKER}.json`.

### Add a new ETF
Edit `scripts/etf_config.json` and add the ticker symbol.

## Stack
- Next.js 15, Tailwind CSS, Recharts (frontend)
- Python, yfinance, pandas (data pipeline)
- GitHub Actions (daily cron)
- Vercel (hosting)

## Key formula
Daily Fund Flow = (Shares Outstanding Today - Shares Outstanding Yesterday) x NAV Today
```

**Step 2: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: add project CLAUDE.md"
```

---

### Task 12: Vercel Deployment

**Step 1: Create GitHub repo**

```bash
gh repo create etf-fund-flows --public --source=. --remote=origin --push
```

**Step 2: Deploy to Vercel**

Use the `vercel:setup` skill, then `vercel:deploy`.

**Step 3: Verify the live URL works**

Expected: Public URL shows the full Bloomberg-style dashboard with EWY fund flows.

**Step 4: Share URL with user**

```bash
git add -A
git commit -m "chore: finalize for deployment"
git push
```
