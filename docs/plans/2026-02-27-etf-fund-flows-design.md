# ETF Fund Flows Tracker — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Overview

A Bloomberg-style dark dashboard that tracks ETF fund flows using the shares outstanding method. Starts with EWY (iShares MSCI South Korea ETF), modular to add more ETFs by editing a config file. Deployed on Vercel with daily auto-updating data via GitHub Actions.

## Fund Flow Calculation

**Method:** Shares Outstanding

```
Daily Fund Flow = (Shares Outstanding Today - Shares Outstanding Yesterday) × NAV Today
```

**Time horizons:**
- Daily — raw daily flows
- Weekly — rolling 5-day sum
- Monthly — rolling 21-day sum
- 3M — rolling 63-day sum
- 6M — rolling 126-day sum

**Data source:** yfinance (`get_shares_full()` for shares outstanding, `.history()` for price/NAV)

## Architecture

**Approach:** Next.js frontend + Python data pipeline + GitHub Actions cron + Vercel hosting

### Data Pipeline (Python)

`scripts/fetch_flows.py` runs daily via GitHub Actions at 7am ET:

1. Read `scripts/etf_config.json` for ticker list
2. For each ticker, fetch shares outstanding + price/NAV history via yfinance
3. Calculate daily fund flows and rolling aggregates
4. Enrich with metadata (AUM, expense ratio, top holdings, sector allocation)
5. Output to `public/data/{TICKER}.json`
6. GitHub Actions commits the updated JSON, triggering Vercel redeploy

### Frontend (Next.js)

Single-page dashboard with:
- **Stats bar:** AUM, NAV, expense ratio, shares outstanding
- **Fund flows chart:** Green/red bar chart + cumulative flow line, with time horizon toggles (1D, 1W, 1M, 3M, 6M, 1Y, ALL)
- **Price performance chart:** Line chart
- **Flows summary table:** Exact flow numbers for each time horizon
- **Top holdings table:** Top ~10 holdings with percentages
- **Sector allocation:** Donut chart
- **ETF selector dropdown:** Switch between tracked ETFs

### Visual Style

- Dark background (#0a0a0a), Bloomberg terminal aesthetic
- Green for inflows, red for outflows, amber accents
- Dense data layout, responsive for mobile

## Project Structure

```
etf-fund-flows/
├── scripts/
│   ├── etf_config.json          # Ticker config
│   ├── fetch_flows.py           # Data pipeline
│   └── requirements.txt         # yfinance, pandas
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Dark theme shell
│   │   └── page.tsx             # Main dashboard
│   ├── components/
│   │   ├── FlowsChart.tsx       # Flows bar chart + cumulative line
│   │   ├── PriceChart.tsx       # Price line chart
│   │   ├── StatsBar.tsx         # Key stats cards
│   │   ├── FlowsSummary.tsx     # Flows by time horizon
│   │   ├── TopHoldings.tsx      # Holdings table
│   │   ├── SectorAllocation.tsx # Donut chart
│   │   └── ETFSelector.tsx      # ETF dropdown
│   └── lib/
│       └── data.ts              # JSON data loader
├── public/
│   └── data/
│       └── EWY.json             # Generated data
├── .github/
│   └── workflows/
│       └── update-data.yml      # Daily cron
└── package.json
```

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Fast static builds, Vercel-native |
| Charts | Recharts | React-native, dark theme support |
| Styling | Tailwind CSS | Fast Bloomberg-style theming |
| Data | yfinance + pandas | Best free ETF data source |
| CI/CD | GitHub Actions | Free daily cron |
| Hosting | Vercel (free tier) | Auto-deploy on push |

## Modularity

Adding a new ETF requires only one change:

1. Add the ticker to `scripts/etf_config.json`

The pipeline generates `{TICKER}.json`, and the frontend dynamically reads all available data files.

## Key Decisions

- **Shares outstanding method over AUM-based:** More accurate, direct measurement of creation/redemption activity
- **Static JSON over live API:** Simpler, more reliable, no server costs, data only changes daily anyway
- **Recharts over D3:** Faster to build, sufficient for this use case
- **GitHub Actions over Vercel Cron:** More reliable Python runtime, free, full yfinance/pandas support
