#!/usr/bin/env python3
"""
ETF Fund Flows Data Pipeline

Fetches shares outstanding and price data from yfinance,
calculates fund flows using the shares outstanding method,
and outputs JSON for the frontend.

Formula: Daily Fund Flow = (Shares_Today - Shares_Yesterday) x NAV_Today
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

    # 3. Merge on date and forward-fill shares outstanding
    # Shares data from yfinance can be very sparse (only reported on change dates).
    # We forward-fill so every trading day gets the last known shares value.
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
    tickers = load_config()
    output_dir = Path(__file__).parent.parent / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    for ticker in tickers:
        data = fetch_etf_data(ticker)
        if data is None:
            print(f"Skipping {ticker} -- no data available")
            continue

        output_path = output_dir / f"{ticker}.json"
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

        print(f"  Wrote {output_path} ({len(data['flows'])} data points)")

    print("Done!")


if __name__ == "__main__":
    main()
