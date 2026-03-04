# NAV-Based Fund Flow Accuracy Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch fund flow calculations from close price to NAV, fix stale AUM, and re-run the pipeline.

**Architecture:** Add NAV scraping from iShares product page HTML (regex-based), store NAV alongside shares in CSV, use NAV in fund flow formula with close-price fallback for historical dates.

**Tech Stack:** Python, requests, pandas, regex (no new dependencies), beautifulsoup4 added for robust HTML parsing.

---

### Task 1: Add NAV Scraping to iShares Scraper

**Files:**
- Modify: `scripts/scrape_ishares.py`
- Modify: `scripts/requirements.txt`

**Step 1: Add beautifulsoup4 dependency**

Add to `scripts/requirements.txt`:
```
beautifulsoup4>=4.12.0
```

**Step 2: Add NAV fetch function to `scrape_ishares.py`**

Add after line 24 (after ISHARES_CSV_URL):

```python
ISHARES_PAGE_URL = (
    "https://www.ishares.com/us/products/{product_id}/{name}"
)
```

Add new function after `parse_holdings_date` (after line 111):

```python
def fetch_nav_from_page(ticker_config: dict) -> float | None:
    """Fetch current NAV from iShares product page.

    Parses the rendered HTML for the pattern: 'NAV as of <date> $<value>'
    Returns NAV as float or None on failure.
    """
    import re

    product_id = ticker_config.get("ishares_product_id")
    name = ticker_config.get("ishares_name")

    if not product_id or not name:
        return None

    url = ISHARES_PAGE_URL.format(product_id=product_id, name=name)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  NAV fetch failed: {e}")
        return None

    # Pattern: "NAV as of Mar 03, 2026 $133.40"
    match = re.search(r'NAV as of[^$]*\$([0-9,]+\.\d+)', resp.text)
    if match:
        nav_str = match.group(1).replace(',', '')
        try:
            return float(nav_str)
        except ValueError:
            pass

    print(f"  Could not parse NAV from iShares page")
    return None
```

**Step 3: Update `scrape_all()` to also fetch NAV**

In `scrape_all()`, after line 208 (`results[symbol] = (date, shares)`), add NAV fetching:

```python
        # Also fetch NAV from product page
        nav = fetch_nav_from_page(ticker_config)
        if nav is not None:
            print(f"  {symbol}: NAV = ${nav:.2f}")
        else:
            print(f"  {symbol}: WARNING - Could not fetch NAV")

        results[symbol] = (date, shares, nav)
```

Update the return type annotation and all callers accordingly.

**Step 4: Update CSV format to include NAV column**

In `save_history()`, update the header and row writing:

```python
def save_history(history: dict[tuple[str, str], dict]) -> None:
    """Write the full shares history to CSV."""
    HISTORY_CSV.parent.mkdir(parents=True, exist_ok=True)

    sorted_entries = sorted(history.items(), key=lambda x: (x[0][0], x[0][1]))

    with open(HISTORY_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "ticker", "shares_outstanding", "nav"])
        for (date, ticker), data in sorted_entries:
            if isinstance(data, dict):
                writer.writerow([date, ticker, data["shares"], data.get("nav", "")])
            else:
                # Backward compat: old format was just int
                writer.writerow([date, ticker, data, ""])
```

In `load_existing_history()`, update to load NAV:

```python
def load_existing_history() -> dict[tuple[str, str], dict]:
    """Load existing shares history CSV into a dict keyed by (date, ticker)."""
    history = {}
    if not HISTORY_CSV.exists():
        return history

    with open(HISTORY_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row["date"], row["ticker"])
            nav_val = row.get("nav", "")
            history[key] = {
                "shares": int(row["shares_outstanding"]),
                "nav": float(nav_val) if nav_val else None,
            }
    return history
```

In `scrape_all()`, update how entries are stored:

```python
        if key in history:
            existing = history[key]
            existing_shares = existing["shares"] if isinstance(existing, dict) else existing
            if existing_shares == shares:
                print(f"  {symbol}: Already have {date} = {shares:,} (unchanged)")
                # Still update NAV if we have a new one
                if nav is not None and isinstance(existing, dict):
                    existing["nav"] = nav
            else:
                print(f"  {symbol}: Updating {date}: {existing_shares:,} -> {shares:,}")
                history[key] = {"shares": shares, "nav": nav}
        else:
            print(f"  {symbol}: New entry {date} = {shares:,}")
            history[key] = {"shares": shares, "nav": nav}
```

**Step 5: Run scraper to verify**

Run: `cd scripts && python scrape_ishares.py`
Expected: Should print NAV value and save CSV with nav column.

**Step 6: Commit**

```bash
git add scripts/scrape_ishares.py scripts/requirements.txt public/data/shares_history.csv
git commit -m "feat: add NAV scraping from iShares product page"
```

---

### Task 2: Update Fund Flow Formula to Use NAV

**Files:**
- Modify: `scripts/fetch_flows.py:47-71` (load_shares_history)
- Modify: `scripts/fetch_flows.py:97-115` (fund flow calculation)
- Modify: `scripts/fetch_flows.py:166-176` (AUM metadata)

**Step 1: Update `load_shares_history()` to also return NAV**

Replace the function with:

```python
def load_shares_history(ticker: str) -> tuple[pd.Series, pd.Series]:
    """Load accumulated shares and NAV history from CSV for a given ticker.

    Returns (shares_series, nav_series) both indexed by DatetimeIndex.
    """
    if not SHARES_HISTORY_CSV.exists():
        return pd.Series(dtype=float), pd.Series(dtype=float)

    rows = []
    with open(SHARES_HISTORY_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["ticker"] == ticker:
                nav_val = row.get("nav", "")
                rows.append({
                    "date": pd.Timestamp(row["date"]),
                    "shares": int(row["shares_outstanding"]),
                    "nav": float(nav_val) if nav_val else None,
                })

    if not rows:
        return pd.Series(dtype=float), pd.Series(dtype=float)

    df = pd.DataFrame(rows)
    idx = pd.DatetimeIndex(df["date"])
    shares = pd.Series(df["shares"].values, index=idx, name="shares_outstanding")
    nav = pd.Series(df["nav"].values, index=idx, name="nav")
    return shares, nav
```

**Step 2: Update `fetch_etf_data()` to use NAV**

Update the shares loading call (around line 82):

```python
    # 1. Get shares outstanding and NAV from iShares history
    shares, nav_history = load_shares_history(ticker)
```

Update the merge section (around lines 97-108):

```python
    # 3. Merge on date and forward-fill
    df = pd.DataFrame({"close": hist["Close"]})
    df["shares"] = shares
    df["shares"] = df["shares"].ffill()

    # NAV: use iShares NAV where available, fall back to close price
    df["nav"] = nav_history
    df["nav"] = df["nav"].ffill()
    df["nav"] = df["nav"].fillna(df["close"])

    df = df.dropna(subset=["shares"])
    df = df.sort_index()

    # 4. Calculate daily fund flows using NAV (industry standard)
    df["shares_change"] = df["shares"].diff()
    df["daily_flow"] = df["shares_change"] * df["nav"]
```

**Step 3: Fix AUM calculation**

Update the metadata section (around line 170-176):

```python
    # Compute AUM from shares * NAV (more accurate than yfinance totalAssets)
    computed_aum = None
    if latest is not None:
        computed_aum = int(latest["shares"]) * float(latest["nav"])

    output = {
        "ticker": ticker,
        "name": info.get("longName", info.get("shortName", ticker)),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "metadata": {
            "aum": int(computed_aum) if computed_aum else info.get("totalAssets", None),
            "nav": round(float(latest["nav"]), 2) if latest is not None else round(float(info.get("navPrice", info.get("previousClose", 0))), 2),
            "expense_ratio": info.get("annualReportExpenseRatio", None),
            "shares_outstanding": int(latest["shares"]) if latest is not None else None,
            "currency": info.get("currency", "USD"),
        },
```

**Step 4: Verify locally**

Run: `cd scripts && python fetch_flows.py`
Expected: Should complete without errors. Check `public/data/EWY.json`:
- `metadata.aum` should be ~$15-18B (not $12.2B)
- `metadata.nav` should reflect iShares NAV
- Recent `daily_flow` values should be slightly larger than before (NAV > close for discount days)

**Step 5: Commit**

```bash
git add scripts/fetch_flows.py public/data/EWY.json
git commit -m "feat: use NAV instead of close price for fund flow calculations"
```

---

### Task 3: Update Backfill Script for New CSV Format

**Files:**
- Modify: `scripts/backfill_ishares.py`

**Step 1: Update backfill to handle new dict-based history format**

The backfill script imports `load_existing_history` and `save_history` from `scrape_ishares.py`, so it will automatically use the new format. But we need to update how it stores new entries (line 96):

```python
        history[(returned_date, symbol)] = {"shares": shares, "nav": None}
```

Instead of:
```python
        history[(returned_date, symbol)] = shares
```

**Step 2: Verify backfill still works**

Run: `cd scripts && python backfill_ishares.py --start 2026-02-27 --end 2026-03-03 --delay 2`
Expected: Should fetch any missing dates and save with nav column (nav will be None for backfilled entries).

**Step 3: Commit**

```bash
git add scripts/backfill_ishares.py
git commit -m "fix: update backfill script for new CSV format with NAV column"
```

---

### Task 4: Run Full Pipeline and Verify Accuracy

**Step 1: Install updated dependencies**

Run: `pip install -r scripts/requirements.txt`

**Step 2: Run the full pipeline**

Run: `cd scripts && python fetch_flows.py`

**Step 3: Verify output**

Check `public/data/EWY.json`:
1. `metadata.aum` should be ~$15-18B
2. `metadata.nav` should match iShares product page NAV
3. Most recent `flows` entry date should be today or yesterday
4. `close` values in flows should reflect current market prices (~$126-132 range)
5. Fund flow values should be slightly higher than before for recent dates

**Step 4: Spot-check one day's calculation**

Pick the most recent day with a shares change. Verify:
```
daily_flow = shares_change * nav  (not close)
```

**Step 5: Compare against etfdb.com**

Check https://etfdb.com/etf/EWY/#etf-fund-flow for current flow values.
Our 3-month and 6-month numbers should be closer to theirs than before.

**Step 6: Final commit**

```bash
git add public/data/
git commit -m "data: update ETF fund flows with NAV-based calculations"
```

---

### Summary of All Changes

| File | Change |
|------|--------|
| `scripts/requirements.txt` | Add beautifulsoup4 |
| `scripts/scrape_ishares.py` | Add NAV scraping from product page, update CSV format to include nav column |
| `scripts/fetch_flows.py` | Use NAV in fund flow formula (with close fallback), fix AUM computation |
| `scripts/backfill_ishares.py` | Update to handle new dict-based history format |
| `public/data/shares_history.csv` | New `nav` column added |
| `public/data/EWY.json` | Regenerated with NAV-based flows and corrected AUM |
