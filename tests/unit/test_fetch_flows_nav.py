"""Tests for NAV-based fund flow calculation in fetch_flows.py.

Tests cover:
1. load_shares_history() returns (shares_series, nav_series) tuple
2. NAV values are correctly parsed from CSV (including missing/empty NAV)
3. fetch_etf_data() uses NAV instead of close price for daily_flow
4. NAV falls back to close price when NAV is unavailable
5. AUM is computed from shares * NAV instead of yfinance totalAssets
6. Output JSON includes NAV in metadata
"""

import csv
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pandas as pd
import pytest

# Add scripts directory to path so we can import fetch_flows
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts"))

import fetch_flows


# ---------------------------------------------------------------------------
# Helper to create temp CSV files
# ---------------------------------------------------------------------------

def write_shares_csv(tmp_path, rows, include_nav=True):
    """Write a shares_history.csv file for testing.

    Args:
        tmp_path: pytest tmp_path fixture
        rows: list of dicts with keys: date, ticker, shares_outstanding, nav (optional)
        include_nav: if True, include the nav column in header
    """
    csv_file = tmp_path / "shares_history.csv"
    if include_nav:
        header = "date,ticker,shares_outstanding,nav\n"
    else:
        header = "date,ticker,shares_outstanding\n"

    lines = [header]
    for r in rows:
        if include_nav:
            nav_val = r.get("nav", "")
            if nav_val is None:
                nav_val = ""
            lines.append(f"{r['date']},{r['ticker']},{r['shares_outstanding']},{nav_val}\n")
        else:
            lines.append(f"{r['date']},{r['ticker']},{r['shares_outstanding']}\n")

    csv_file.write_text("".join(lines))
    return csv_file


# ===========================================================================
# Tests for load_shares_history returning NAV
# ===========================================================================

class TestLoadSharesHistoryReturnsNav:
    """load_shares_history should return a tuple of (shares_series, nav_series)."""

    def test_returns_tuple_of_two_series(self, tmp_path):
        """Should return a tuple of two pandas Series."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": 55.23},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.load_shares_history("EWY")

        assert isinstance(result, tuple)
        assert len(result) == 2
        shares, nav = result
        assert isinstance(shares, pd.Series)
        assert isinstance(nav, pd.Series)

    def test_shares_values_correct(self, tmp_path):
        """Shares series should contain correct integer values."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": 55.23},
            {"date": "2025-07-02", "ticker": "EWY", "shares_outstanding": 69000000, "nav": 55.80},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert len(shares) == 2
        assert shares.iloc[0] == 68100000
        assert shares.iloc[1] == 69000000

    def test_nav_values_correct(self, tmp_path):
        """NAV series should contain correct float values."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": 55.23},
            {"date": "2025-07-02", "ticker": "EWY", "shares_outstanding": 69000000, "nav": 55.80},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert len(nav) == 2
        assert nav.iloc[0] == pytest.approx(55.23)
        assert nav.iloc[1] == pytest.approx(55.80)

    def test_nav_none_for_empty_values(self, tmp_path):
        """NAV should be None/NaN when CSV has empty nav column."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": ""},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert len(nav) == 1
        assert pd.isna(nav.iloc[0])

    def test_backward_compat_no_nav_column(self, tmp_path):
        """Should work with old CSV format that has no nav column."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000},
        ], include_nav=False)
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert len(shares) == 1
        assert shares.iloc[0] == 68100000
        assert len(nav) == 1
        assert pd.isna(nav.iloc[0])

    def test_empty_result_when_ticker_not_found(self, tmp_path):
        """Should return empty series pair when ticker not in CSV."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "SPY", "shares_outstanding": 1000000, "nav": 500.0},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert shares.empty
        assert nav.empty

    def test_empty_result_when_no_file(self, tmp_path):
        """Should return empty series pair when CSV does not exist."""
        csv_file = tmp_path / "nonexistent.csv"
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert shares.empty
        assert nav.empty

    def test_filters_by_ticker(self, tmp_path):
        """Should only return data for the requested ticker."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": 55.23},
            {"date": "2025-07-01", "ticker": "SPY", "shares_outstanding": 1000000, "nav": 500.0},
            {"date": "2025-07-02", "ticker": "EWY", "shares_outstanding": 69000000, "nav": 55.80},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert len(shares) == 2
        assert len(nav) == 2

    def test_index_is_datetimeindex(self, tmp_path):
        """Both series should have DatetimeIndex."""
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "EWY", "shares_outstanding": 68100000, "nav": 55.23},
        ])
        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            shares, nav = fetch_flows.load_shares_history("EWY")

        assert isinstance(shares.index, pd.DatetimeIndex)
        assert isinstance(nav.index, pd.DatetimeIndex)


# ===========================================================================
# Tests for NAV-based flow calculation in fetch_etf_data
# ===========================================================================

def _make_mock_etf(hist_data, info_data=None):
    """Create a mock yfinance Ticker with given history and info."""
    mock_etf = MagicMock()

    # History DataFrame
    idx = pd.DatetimeIndex(hist_data["dates"])
    hist_df = pd.DataFrame({"Close": hist_data["closes"]}, index=idx)
    hist_df.index = hist_df.index.tz_localize(None)
    mock_etf.history.return_value = hist_df

    # Info dict
    default_info = {
        "longName": "Test ETF",
        "totalAssets": 5000000000,
        "navPrice": 55.0,
        "previousClose": 54.0,
        "annualReportExpenseRatio": 0.0059,
        "currency": "USD",
    }
    if info_data:
        default_info.update(info_data)
    mock_etf.info = default_info

    # Funds data (empty for simplicity)
    mock_funds = MagicMock()
    mock_funds.top_holdings = None
    mock_funds.sector_weightings = {}
    mock_etf.get_funds_data.return_value = mock_funds

    return mock_etf


class TestFetchEtfDataUsesNav:
    """fetch_etf_data should use NAV for daily flow calculation."""

    @patch("fetch_flows.yf.Ticker")
    def test_daily_flow_uses_nav_not_close(self, mock_ticker_cls, tmp_path):
        """daily_flow = shares_change * nav, NOT shares_change * close."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
            pd.Timestamp("2025-07-03"),
        ]
        # Close prices differ from NAV
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0, 62.0],
        })
        mock_ticker_cls.return_value = mock_etf

        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": 55.0},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": 56.0},
            {"date": "2025-07-03", "ticker": "TEST", "shares_outstanding": 1200000, "nav": 57.0},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # Day 2: shares_change = 100000, nav = 56.0 -> flow = 5,600,000
        # Day 3: shares_change = 100000, nav = 57.0 -> flow = 5,700,000
        # If it used close price instead: 100000 * 61 = 6,100,000 (wrong)
        flows = result["flows"]
        # Find the flow for 2025-07-02
        day2 = next(f for f in flows if f["date"] == "2025-07-02")
        assert day2["daily_flow"] == pytest.approx(5600000, abs=1)

        day3 = next(f for f in flows if f["date"] == "2025-07-03")
        assert day3["daily_flow"] == pytest.approx(5700000, abs=1)

    @patch("fetch_flows.yf.Ticker")
    def test_nav_falls_back_to_close_when_missing(self, mock_ticker_cls, tmp_path):
        """When NAV is not available, should fall back to close price."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
            pd.Timestamp("2025-07-03"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0, 62.0],
        })
        mock_ticker_cls.return_value = mock_etf

        # No NAV values in CSV
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": ""},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": ""},
            {"date": "2025-07-03", "ticker": "TEST", "shares_outstanding": 1200000, "nav": ""},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # Should fall back to close: 100000 * 61.0 = 6,100,000
        flows = result["flows"]
        day2 = next(f for f in flows if f["date"] == "2025-07-02")
        assert day2["daily_flow"] == pytest.approx(6100000, abs=1)

    @patch("fetch_flows.yf.Ticker")
    def test_nav_forward_fills(self, mock_ticker_cls, tmp_path):
        """NAV should be forward-filled for trading days without NAV data."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
            pd.Timestamp("2025-07-03"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0, 62.0],
        })
        mock_ticker_cls.return_value = mock_etf

        # Only first day has NAV
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": 55.0},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": ""},
            {"date": "2025-07-03", "ticker": "TEST", "shares_outstanding": 1200000, "nav": ""},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # Day 2: nav should be forward-filled from day 1 = 55.0
        # flow = 100000 * 55.0 = 5,500,000
        flows = result["flows"]
        day2 = next(f for f in flows if f["date"] == "2025-07-02")
        assert day2["daily_flow"] == pytest.approx(5500000, abs=1)

    @patch("fetch_flows.yf.Ticker")
    def test_close_price_still_in_output(self, mock_ticker_cls, tmp_path):
        """close field in output JSON should still be the market close price, not NAV."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0],
        })
        mock_ticker_cls.return_value = mock_etf

        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": 55.0},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": 56.0},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        flows = result["flows"]
        day2 = next(f for f in flows if f["date"] == "2025-07-02")
        assert day2["close"] == pytest.approx(61.0, abs=0.01)


# ===========================================================================
# Tests for AUM computation from shares * NAV
# ===========================================================================

class TestAumComputation:
    """AUM should be computed from shares * NAV, not yfinance totalAssets."""

    @patch("fetch_flows.yf.Ticker")
    def test_aum_from_shares_times_nav(self, mock_ticker_cls, tmp_path):
        """AUM = latest shares * latest NAV."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0],
        }, info_data={"totalAssets": 9999999999})  # yfinance value should be ignored
        mock_ticker_cls.return_value = mock_etf

        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": 55.0},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": 56.0},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # AUM = 1100000 * 56.0 = 61,600,000
        assert result["metadata"]["aum"] == 61600000

    @patch("fetch_flows.yf.Ticker")
    def test_aum_uses_close_as_nav_when_no_nav_column(self, mock_ticker_cls, tmp_path):
        """When no NAV in CSV, NAV falls back to close price, so AUM = shares * close."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0],
        }, info_data={"totalAssets": 5000000000})
        mock_ticker_cls.return_value = mock_etf

        # Old format CSV without NAV column
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000},
        ], include_nav=False)

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # NAV falls back to close price (61.0), so AUM = 1100000 * 61.0 = 67,100,000
        assert result["metadata"]["aum"] == 67100000


# ===========================================================================
# Tests for NAV in metadata output
# ===========================================================================

class TestNavInMetadata:
    """metadata.nav should use iShares NAV when available."""

    @patch("fetch_flows.yf.Ticker")
    def test_nav_from_ishares_data(self, mock_ticker_cls, tmp_path):
        """metadata.nav should be the latest NAV from iShares data."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0],
        }, info_data={"navPrice": 99.99})  # yfinance NAV should be ignored
        mock_ticker_cls.return_value = mock_etf

        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000, "nav": 55.0},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000, "nav": 56.0},
        ])

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        assert result["metadata"]["nav"] == pytest.approx(56.0, abs=0.01)

    @patch("fetch_flows.yf.Ticker")
    def test_nav_uses_close_as_fallback(self, mock_ticker_cls, tmp_path):
        """metadata.nav should use close price as fallback when no iShares NAV."""
        dates = [
            pd.Timestamp("2025-07-01"),
            pd.Timestamp("2025-07-02"),
        ]
        mock_etf = _make_mock_etf({
            "dates": dates,
            "closes": [60.0, 61.0],
        }, info_data={"navPrice": 99.99})
        mock_ticker_cls.return_value = mock_etf

        # No NAV in CSV
        csv_file = write_shares_csv(tmp_path, [
            {"date": "2025-07-01", "ticker": "TEST", "shares_outstanding": 1000000},
            {"date": "2025-07-02", "ticker": "TEST", "shares_outstanding": 1100000},
        ], include_nav=False)

        with patch.object(fetch_flows, "SHARES_HISTORY_CSV", csv_file):
            result = fetch_flows.fetch_etf_data("TEST")

        # NAV falls back to close price (61.0), not yfinance navPrice
        assert result["metadata"]["nav"] == pytest.approx(61.0, abs=0.01)
