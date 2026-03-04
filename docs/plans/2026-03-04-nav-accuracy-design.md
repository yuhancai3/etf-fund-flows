# NAV-Based Fund Flow Accuracy Fix

**Date**: 2026-03-04
**Status**: Approved

## Problem

Fund flow calculations use yfinance **close price** instead of **NAV**, causing a ~6-7% understatement vs professional sources (Bloomberg, etfdb.com). Additionally:
- AUM from yfinance is stale ($12.2B vs real ~$18B)
- Data hasn't updated in 5 trading days

## Comparison vs Professional Sources

| Period | etfdb.com | Ours | Gap |
|--------|-----------|------|-----|
| 1-Month | $3.10B | $2.57B | -17% |
| 3-Month | $5.09B | $4.79B | -6% |
| 6-Month | $5.50B | $5.12B | -7% |

## Root Cause

The industry standard formula is:
```
Daily Fund Flow = (Shares_today - Shares_yesterday) x NAV_today
```

We use `close` price instead of `NAV`. For EWY (international ETF), the premium/discount between close and NAV can be ~2-2.5% due to the 14.5-hour time zone gap between Korean and US markets.

## What's Correct (No Changes Needed)

- Shares outstanding source (iShares CSV scraper) - verified against Nasdaq
- Forward-fill for missing days - industry standard
- The formula structure itself (shares_change * price)
- Rolling window aggregation (5/21/63/126 trading days)

## Design

### 1. Add NAV Scraping

Modify `scrape_ishares.py` to also fetch NAV from the iShares product page HTML.

- iShares product page (`/us/products/239681/...`) displays NAV prominently
- Parse NAV from the HTML response
- Store in `shares_history.csv` as new column: `nav`
- Format: `date,ticker,shares_outstanding,nav`

### 2. Update Fund Flow Formula

In `fetch_flows.py`:

```python
# Load NAV from shares_history.csv alongside shares
df["nav"] = nav_series
df["nav"] = df["nav"].ffill()
df["nav"] = df["nav"].fillna(df["close"])  # Fallback for dates before NAV collection
df["daily_flow"] = df["shares_change"] * df["nav"]
```

Keep `close` price in output for the price chart (shows market price investors actually see).

### 3. Fix AUM Calculation

```python
# Before: info.get("totalAssets")  ← stale from yfinance
# After:  shares * nav             ← computed from real data
aum = int(latest["shares"]) * float(latest["nav"])
```

### 4. Re-run Pipeline

Get fresh data through today (Mar 4, 2026).

## Expected Accuracy Improvement

| Metric | Before | After |
|--------|--------|-------|
| vs Bloomberg (6M) | ~93% | ~97%+ |
| AUM accuracy | Off by ~$6B | Exact |
| Data freshness | 5 days stale | Current |
