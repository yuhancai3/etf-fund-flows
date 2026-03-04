#!/usr/bin/env python3
"""
iShares Shares Outstanding Scraper

Fetches daily shares outstanding from iShares.com CSV endpoints
and appends to a local history CSV file.

This builds up a daily history that supplements yfinance's sparse
shares outstanding data.
"""

import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import requests


ISHARES_CSV_URL = (
    "https://www.ishares.com/us/products/{product_id}/{name}"
    "/1467271812596.ajax?fileType=csv&fileName={symbol}_holdings&dataType=fund"
)

ISHARES_PAGE_URL = (
    "https://www.ishares.com/us/products/{product_id}/{name}"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

HISTORY_CSV = Path(__file__).parent.parent / "public" / "data" / "shares_history.csv"


def load_config() -> list[dict]:
    """Load ticker configs from etf_config.json."""
    config_path = Path(__file__).parent / "etf_config.json"
    with open(config_path) as f:
        config = json.load(f)
    return config["tickers"]


def parse_shares_outstanding(text: str) -> int | None:
    """Parse shares outstanding from iShares CSV metadata lines.

    The CSV starts with metadata lines like:
        Line 0: iShares MSCI South Korea ETF
        Line 1: Fund Holdings as of,"Feb 25, 2026"
        Line 2: Inception Date,"May 09, 2000"
        Line 3: Shares Outstanding,"116,000,000.00"
    """
    for line in text.split("\n")[:10]:
        # Remove BOM if present
        line = line.strip().lstrip("\ufeff")
        if line.lower().startswith("shares outstanding"):
            # Extract the value after the comma, remove quotes and commas
            parts = line.split(",", 1)
            if len(parts) >= 2:
                value_str = parts[1].replace('"', "").replace(",", "").strip()
                try:
                    return int(float(value_str))
                except ValueError:
                    # Try joining all parts after the first split
                    # Handle case like: Shares Outstanding,"116,000,000.00"
                    pass

            # Alternative: rejoin everything after "Shares Outstanding,"
            raw = line.split("Shares Outstanding,")[-1] if "Shares Outstanding," in line else ""
            if not raw:
                raw = line.split("shares outstanding,")[-1] if "shares outstanding," in line else ""
            raw = raw.replace('"', "").replace(",", "").strip()
            if raw:
                try:
                    return int(float(raw))
                except ValueError:
                    pass
    return None


def parse_holdings_date(text: str) -> str | None:
    """Parse the 'Fund Holdings as of' date from iShares CSV metadata.

    Returns date in YYYY-MM-DD format.
    """
    for line in text.split("\n")[:10]:
        line = line.strip().lstrip("\ufeff")
        if line.lower().startswith("fund holdings as of"):
            # Extract date string like "Feb 25, 2026"
            raw = line.split(",", 1)
            if len(raw) >= 2:
                date_str = raw[1].replace('"', "").strip()
                # May have trailing comma from CSV
                date_str = date_str.rstrip(",").strip()
                try:
                    dt = datetime.strptime(date_str, "%b %d, %Y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    # Try alternate format
                    try:
                        # Sometimes the date might be split across CSV columns
                        # e.g. "Fund Holdings as of","Feb 25"," 2026"
                        # Rejoin all parts
                        all_parts = line.split(",")
                        date_str = ",".join(all_parts[1:]).replace('"', "").strip()
                        dt = datetime.strptime(date_str, "%b %d, %Y")
                        return dt.strftime("%Y-%m-%d")
                    except ValueError:
                        pass
    return None


def fetch_ishares_shares(ticker_config: dict) -> tuple[str | None, int | None]:
    """Fetch shares outstanding for a ticker from iShares.com.

    Returns (date, shares_outstanding) or (None, None) on failure.
    """
    symbol = ticker_config["symbol"]
    product_id = ticker_config.get("ishares_product_id")
    name = ticker_config.get("ishares_name")

    if not product_id or not name:
        print(f"  {symbol}: No iShares config, skipping scrape")
        return None, None

    url = ISHARES_CSV_URL.format(
        product_id=product_id,
        name=name,
        symbol=symbol,
    )

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  {symbol}: iShares request failed: {e}")
        return None, None

    text = resp.text
    date = parse_holdings_date(text)
    shares = parse_shares_outstanding(text)

    if date is None or shares is None:
        print(f"  {symbol}: Could not parse iShares data (date={date}, shares={shares})")
        return None, None

    return date, shares


def fetch_nav_from_page(ticker_config: dict) -> float | None:
    """Fetch NAV for a ticker from the iShares product page HTML.

    Parses NAV from text like: "NAV as of Mar 03, 2026 $133.40"
    Returns float or None on failure.
    """
    symbol = ticker_config["symbol"]
    product_id = ticker_config.get("ishares_product_id")
    name = ticker_config.get("ishares_name")

    if not product_id or not name:
        print(f"  {symbol}: No iShares config for NAV, skipping")
        return None

    url = ISHARES_PAGE_URL.format(product_id=product_id, name=name)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  {symbol}: iShares NAV request failed: {e}")
        return None

    match = re.search(r"NAV as of[^$]*\$([0-9,]+\.\d+)", resp.text)
    if not match:
        print(f"  {symbol}: Could not find NAV on iShares page")
        return None

    nav_str = match.group(1).replace(",", "")
    try:
        return float(nav_str)
    except ValueError:
        print(f"  {symbol}: Could not parse NAV value: {nav_str}")
        return None


def load_existing_history() -> dict[tuple[str, str], dict]:
    """Load existing shares history CSV into a dict keyed by (date, ticker).

    Each value is {"shares": int, "nav": float|None}.
    Handles backward compatibility with old CSV format (no nav column).
    """
    history = {}
    if not HISTORY_CSV.exists():
        return history

    with open(HISTORY_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row["date"], row["ticker"])
            nav_str = row.get("nav", "")
            nav = float(nav_str) if nav_str else None
            history[key] = {"shares": int(row["shares_outstanding"]), "nav": nav}
    return history


def save_history(history: dict[tuple[str, str], dict]) -> None:
    """Write the full shares history to CSV.

    Values can be dicts {"shares": int, "nav": float|None} (new format).
    """
    HISTORY_CSV.parent.mkdir(parents=True, exist_ok=True)

    # Sort by date then ticker
    sorted_entries = sorted(history.items(), key=lambda x: (x[0][0], x[0][1]))

    with open(HISTORY_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "ticker", "shares_outstanding", "nav"])
        for (date, ticker), value in sorted_entries:
            shares = value["shares"]
            nav = value["nav"]
            nav_str = str(nav) if nav is not None else ""
            writer.writerow([date, ticker, shares, nav_str])


def scrape_all() -> dict[str, tuple[str, int, float | None]]:
    """Scrape shares outstanding and NAV for all configured tickers.

    Returns dict of {symbol: (date, shares, nav)} for successfully scraped tickers.
    """
    tickers = load_config()
    history = load_existing_history()
    results = {}

    for ticker_config in tickers:
        symbol = ticker_config["symbol"]
        print(f"Scraping iShares data for {symbol}...")

        date, shares = fetch_ishares_shares(ticker_config)
        if date is None or shares is None:
            continue

        # Fetch NAV from product page
        nav = fetch_nav_from_page(ticker_config)
        if nav is not None:
            print(f"  {symbol}: NAV = ${nav:.2f}")

        key = (date, symbol)
        new_value = {"shares": shares, "nav": nav}
        if key in history:
            existing = history[key]
            if existing["shares"] == shares:
                print(f"  {symbol}: Already have {date} = {shares:,} (unchanged)")
            else:
                print(f"  {symbol}: Updating {date}: {existing['shares']:,} -> {shares:,}")
            # Always update to capture latest NAV even if shares unchanged
            history[key] = new_value
        else:
            print(f"  {symbol}: New entry {date} = {shares:,}")
            history[key] = new_value

        results[symbol] = (date, shares, nav)

    save_history(history)
    print(f"Shares history saved to {HISTORY_CSV} ({len(history)} entries)")
    return results


if __name__ == "__main__":
    results = scrape_all()
    if not results:
        print("WARNING: No shares data scraped from iShares")
        sys.exit(1)
    for symbol, (date, shares, nav) in results.items():
        nav_str = f", NAV=${nav:.2f}" if nav is not None else ""
        print(f"  {symbol}: {date} = {shares:,} shares outstanding{nav_str}")
