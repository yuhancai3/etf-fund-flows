#!/usr/bin/env python3
"""
ETF Fund Flows Data Pipeline

Fetches shares outstanding and price data from yfinance,
calculates fund flows using the shares outstanding method,
and outputs JSON for the frontend.

Formula: Daily Fund Flow = (Shares_Today - Shares_Yesterday) x NAV_Today
"""

import csv
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

from scrape_ishares import scrape_all as scrape_ishares

SHARES_HISTORY_CSV = Path(__file__).parent.parent / "public" / "data" / "shares_history.csv"


def load_config() -> list[dict]:
    """Load ticker configs from config file.

    Returns list of dicts with at minimum a 'symbol' key.
    """
    config_path = Path(__file__).parent / "etf_config.json"
    with open(config_path) as f:
        config = json.load(f)

    tickers = config["tickers"]
    # Support both old format (list of strings) and new format (list of dicts)
    result = []
    for t in tickers:
        if isinstance(t, str):
            result.append({"symbol": t})
        else:
            result.append(t)
    return result


def load_shares_history(ticker: str) -> pd.Series:
    """Load accumulated shares history from CSV for a given ticker.

    Returns a Series indexed by DatetimeIndex with shares outstanding values.
    """
    if not SHARES_HISTORY_CSV.exists():
        return pd.Series(dtype=float)

    rows = []
    with open(SHARES_HISTORY_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["ticker"] == ticker:
                rows.append({
                    "date": pd.Timestamp(row["date"]),
                    "shares": int(row["shares_outstanding"]),
                })

    if not rows:
        return pd.Series(dtype=float)

    df = pd.DataFrame(rows)
    series = pd.Series(df["shares"].values, index=pd.DatetimeIndex(df["date"]))
    series.name = "shares_outstanding"
    return series


def fetch_etf_data(ticker: str) -> dict:
    """Fetch all data for a single ETF and calculate fund flows."""
    print(f"Fetching data for {ticker}...")
    etf = yf.Ticker(ticker)

    # 1. Get shares outstanding from iShares history (primary source)
    # We do NOT use yfinance shares data — it can be years stale and causes
    # artificial $B spikes when merged with fresh iShares scrapes.
    shares = load_shares_history(ticker)
    if not shares.empty:
        print(f"  iShares shares: {len(shares)} data points")
    else:
        print(f"  WARNING: No shares outstanding data for {ticker}")
        print(f"  Run the iShares scraper daily to accumulate data")

    # 2. Get price/NAV history
    hist = etf.history(period="max")
    if hist.empty:
        print(f"  WARNING: No price history for {ticker}")
        return None

    hist.index = hist.index.tz_localize(None)

    # 3. Merge on date and forward-fill shares outstanding
    # iShares data accumulates daily. We forward-fill so every trading day
    # gets the last known shares value.
    df = pd.DataFrame({"close": hist["Close"]})
    df["shares"] = shares
    df["shares"] = df["shares"].ffill()
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
    sector_data = {}
    try:
        funds_data = etf.get_funds_data()

        # Top holdings: DataFrame with columns ['Name', 'Holding Percent'], indexed by Symbol
        top_holdings = funds_data.top_holdings
        if top_holdings is not None and not top_holdings.empty:
            for symbol, row in top_holdings.head(10).iterrows():
                weight = row.get("Holding Percent", 0)
                holdings_data.append({
                    "name": row.get("Name", "Unknown"),
                    "symbol": str(symbol),
                    "weight": round(float(weight) * 100, 2) if pd.notna(weight) else 0,
                })

        # Sector weightings: dict like {'technology': 0.5261, ...}
        sector_weights = funds_data.sector_weightings
        if sector_weights:
            for sector, weight in sector_weights.items():
                sector_data[sector] = round(float(weight) * 100, 2)
    except Exception as e:
        print(f"  Note: Could not fetch fund data: {e}")

    # 7. Build output JSON
    # Only include last 2 years of daily data for the chart
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
    ticker_configs = load_config()
    output_dir = Path(__file__).parent.parent / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Step 0: Scrape iShares for today's shares outstanding
    print("=== Scraping iShares for shares outstanding ===")
    try:
        scrape_ishares()
    except Exception as e:
        print(f"WARNING: iShares scrape failed: {e}")
        print("Continuing with existing data...")
    print()

    # Step 1: Fetch and process each ticker
    print("=== Fetching ETF data ===")
    for ticker_config in ticker_configs:
        symbol = ticker_config["symbol"]
        data = fetch_etf_data(symbol)
        if data is None:
            print(f"Skipping {symbol} -- no data available")
            continue

        output_path = output_dir / f"{symbol}.json"
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"  Wrote {output_path} ({len(data['flows'])} data points)")

    print("Done!")


if __name__ == "__main__":
    main()
