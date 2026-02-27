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
- Next.js 16, Tailwind CSS 4, Recharts (frontend)
- Python, yfinance, pandas (data pipeline)
- GitHub Actions (daily cron)
- Vercel (hosting)

## Key formula
Daily Fund Flow = (Shares Outstanding Today - Shares Outstanding Yesterday) x NAV Today
