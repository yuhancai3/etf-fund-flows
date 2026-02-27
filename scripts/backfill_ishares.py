#!/usr/bin/env python3
"""
iShares Historical Backfill

Fetches historical shares outstanding from iShares.com by iterating
business days with the asOfDate parameter. Only stores dates where
iShares returns data for the exact requested date (no interpolation).

Usage:
    python scripts/backfill_ishares.py
    python scripts/backfill_ishares.py --start 2025-07-01 --end 2026-02-26
"""

import argparse
import time
from datetime import datetime, timedelta

import pandas as pd

from scrape_ishares import (
    HEADERS,
    ISHARES_CSV_URL,
    load_config,
    load_existing_history,
    parse_holdings_date,
    parse_shares_outstanding,
    save_history,
)

import requests


def business_days(start: str, end: str) -> list[str]:
    """Generate business day dates (Mon-Fri) between start and end inclusive."""
    dates = pd.bdate_range(start=start, end=end)
    return [d.strftime("%Y%m%d") for d in dates]


def backfill_ticker(ticker_config: dict, start: str, end: str, history: dict, delay: float = 1.5) -> int:
    """Backfill shares outstanding for a single ticker.

    Returns the number of new data points added.
    """
    symbol = ticker_config["symbol"]
    product_id = ticker_config.get("ishares_product_id")
    name = ticker_config.get("ishares_name")

    if not product_id or not name:
        print(f"  {symbol}: No iShares config, skipping")
        return 0

    dates = business_days(start, end)
    added = 0
    skipped_existing = 0
    skipped_no_data = 0
    skipped_date_mismatch = 0

    print(f"  {symbol}: Fetching {len(dates)} business days ({start} to {end})")

    for i, date_str in enumerate(dates):
        # Skip dates we already have
        iso_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        if (iso_date, symbol) in history:
            skipped_existing += 1
            continue

        url = ISHARES_CSV_URL.format(
            product_id=product_id,
            name=name,
            symbol=symbol,
        ) + f"&asOfDate={date_str}"

        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"    {iso_date}: Request failed: {e}")
            time.sleep(delay)
            continue

        text = resp.text
        returned_date = parse_holdings_date(text)
        shares = parse_shares_outstanding(text)

        if returned_date is None or shares is None:
            skipped_no_data += 1
            time.sleep(delay)
            continue

        # Dedup: only store if iShares returned data for the exact date we asked
        if returned_date != iso_date:
            skipped_date_mismatch += 1
            time.sleep(delay)
            continue

        history[(returned_date, symbol)] = shares
        added += 1

        # Progress update every 20 new entries
        if added % 20 == 0:
            print(f"    ... {added} new entries so far (at {iso_date})")

        time.sleep(delay)

    print(f"  {symbol}: +{added} new | {skipped_existing} already had | {skipped_no_data} no data | {skipped_date_mismatch} date mismatch")
    return added


def main():
    parser = argparse.ArgumentParser(description="Backfill iShares shares outstanding history")
    parser.add_argument("--start", default="2025-07-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default=(datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
                        help="End date (YYYY-MM-DD)")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between requests in seconds")
    args = parser.parse_args()

    print(f"=== iShares Backfill: {args.start} to {args.end} ===")

    tickers = load_config()
    history = load_existing_history()
    print(f"Existing history: {len(history)} entries")

    total_added = 0
    for ticker_config in tickers:
        added = backfill_ticker(ticker_config, args.start, args.end, history, args.delay)
        total_added += added

    if total_added > 0:
        save_history(history)
        print(f"\nSaved {len(history)} total entries to shares_history.csv (+{total_added} new)")
    else:
        print("\nNo new data to save.")

    print("Done!")


if __name__ == "__main__":
    main()
