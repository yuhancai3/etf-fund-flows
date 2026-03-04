"""Tests for NAV scraping additions to scrape_ishares.py.

Tests cover:
1. ISHARES_PAGE_URL constant exists
2. fetch_nav_from_page() function parses NAV from HTML
3. load_existing_history() returns dict values with nav field
4. save_history() writes nav column to CSV
5. scrape_all() integrates NAV into the pipeline
6. __main__ block handles 3-tuple format
"""

import csv
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add scripts directory to path so we can import scrape_ishares
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts"))

import scrape_ishares


class TestIsharesPageUrlConstant:
    """Test that the ISHARES_PAGE_URL constant exists and is correct."""

    def test_constant_exists(self):
        assert hasattr(scrape_ishares, "ISHARES_PAGE_URL")

    def test_constant_has_product_id_placeholder(self):
        assert "{product_id}" in scrape_ishares.ISHARES_PAGE_URL

    def test_constant_has_name_placeholder(self):
        assert "{name}" in scrape_ishares.ISHARES_PAGE_URL

    def test_constant_is_product_page_url(self):
        url = scrape_ishares.ISHARES_PAGE_URL
        assert url.startswith("https://www.ishares.com/us/products/")


class TestFetchNavFromPage:
    """Test the fetch_nav_from_page() function."""

    def test_function_exists(self):
        assert hasattr(scrape_ishares, "fetch_nav_from_page")
        assert callable(scrape_ishares.fetch_nav_from_page)

    @patch("scrape_ishares.requests.get")
    def test_parses_nav_from_html(self, mock_get):
        """Should parse NAV value from iShares product page HTML."""
        mock_resp = MagicMock()
        mock_resp.text = """
        <html><body>
        <span>NAV as of Mar 03, 2026 $133.40</span>
        </body></html>
        """
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        ticker_config = {
            "symbol": "EWY",
            "ishares_product_id": "239681",
            "ishares_name": "ishares-msci-south-korea-capped-etf",
        }
        result = scrape_ishares.fetch_nav_from_page(ticker_config)
        assert result == pytest.approx(133.40)

    @patch("scrape_ishares.requests.get")
    def test_parses_nav_with_comma(self, mock_get):
        """Should handle NAV values with commas (e.g., $1,234.56)."""
        mock_resp = MagicMock()
        mock_resp.text = """
        <html><body>
        <span>NAV as of Mar 03, 2026 $1,234.56</span>
        </body></html>
        """
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        ticker_config = {
            "symbol": "EWY",
            "ishares_product_id": "239681",
            "ishares_name": "ishares-msci-south-korea-capped-etf",
        }
        result = scrape_ishares.fetch_nav_from_page(ticker_config)
        assert result == pytest.approx(1234.56)

    @patch("scrape_ishares.requests.get")
    def test_returns_none_when_nav_not_found(self, mock_get):
        """Should return None if NAV pattern not found in HTML."""
        mock_resp = MagicMock()
        mock_resp.text = "<html><body>No nav here</body></html>"
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        ticker_config = {
            "symbol": "EWY",
            "ishares_product_id": "239681",
            "ishares_name": "ishares-msci-south-korea-capped-etf",
        }
        result = scrape_ishares.fetch_nav_from_page(ticker_config)
        assert result is None

    @patch("scrape_ishares.requests.get")
    def test_returns_none_on_request_failure(self, mock_get):
        """Should return None if HTTP request fails."""
        import requests as req

        mock_get.side_effect = req.RequestException("Connection failed")

        ticker_config = {
            "symbol": "EWY",
            "ishares_product_id": "239681",
            "ishares_name": "ishares-msci-south-korea-capped-etf",
        }
        result = scrape_ishares.fetch_nav_from_page(ticker_config)
        assert result is None

    def test_returns_none_when_no_ishares_config(self):
        """Should return None if ticker has no iShares product_id or name."""
        ticker_config = {"symbol": "EWY"}
        result = scrape_ishares.fetch_nav_from_page(ticker_config)
        assert result is None


class TestLoadExistingHistoryWithNav:
    """Test that load_existing_history returns dict values with nav field."""

    def test_loads_new_format_with_nav(self, tmp_path):
        """Should load CSV with nav column into dict with nav field."""
        csv_file = tmp_path / "shares_history.csv"
        csv_file.write_text(
            "date,ticker,shares_outstanding,nav\n"
            "2025-07-01,EWY,68100000,55.23\n"
            "2025-07-02,EWY,68100000,55.80\n"
        )

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = scrape_ishares.load_existing_history()

        key = ("2025-07-01", "EWY")
        assert key in history
        assert isinstance(history[key], dict)
        assert history[key]["shares"] == 68100000
        assert history[key]["nav"] == pytest.approx(55.23)

    def test_loads_old_format_without_nav(self, tmp_path):
        """Should handle old CSV format without nav column (backward compat)."""
        csv_file = tmp_path / "shares_history.csv"
        csv_file.write_text(
            "date,ticker,shares_outstanding\n"
            "2025-07-01,EWY,68100000\n"
        )

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = scrape_ishares.load_existing_history()

        key = ("2025-07-01", "EWY")
        assert key in history
        assert isinstance(history[key], dict)
        assert history[key]["shares"] == 68100000
        assert history[key]["nav"] is None

    def test_loads_empty_nav_as_none(self, tmp_path):
        """Should handle empty nav values as None."""
        csv_file = tmp_path / "shares_history.csv"
        csv_file.write_text(
            "date,ticker,shares_outstanding,nav\n"
            "2025-07-01,EWY,68100000,\n"
        )

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = scrape_ishares.load_existing_history()

        key = ("2025-07-01", "EWY")
        assert history[key]["nav"] is None

    def test_returns_empty_dict_when_no_file(self, tmp_path):
        """Should return empty dict when CSV does not exist."""
        csv_file = tmp_path / "nonexistent.csv"
        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = scrape_ishares.load_existing_history()
        assert history == {}


class TestSaveHistoryWithNav:
    """Test that save_history writes the nav column."""

    def test_writes_nav_column_header(self, tmp_path):
        """Should write CSV with nav column in header."""
        csv_file = tmp_path / "shares_history.csv"

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = {
                ("2025-07-01", "EWY"): {"shares": 68100000, "nav": 55.23},
            }
            scrape_ishares.save_history(history)

        with open(csv_file) as f:
            reader = csv.reader(f)
            header = next(reader)
        assert header == ["date", "ticker", "shares_outstanding", "nav"]

    def test_writes_nav_values(self, tmp_path):
        """Should write NAV values in the nav column."""
        csv_file = tmp_path / "shares_history.csv"

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = {
                ("2025-07-01", "EWY"): {"shares": 68100000, "nav": 55.23},
            }
            scrape_ishares.save_history(history)

        with open(csv_file) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        assert row["nav"] == "55.23"
        assert row["shares_outstanding"] == "68100000"

    def test_writes_empty_nav_when_none(self, tmp_path):
        """Should write empty string for None nav values."""
        csv_file = tmp_path / "shares_history.csv"

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = {
                ("2025-07-01", "EWY"): {"shares": 68100000, "nav": None},
            }
            scrape_ishares.save_history(history)

        with open(csv_file) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        assert row["nav"] == ""

    def test_sorted_output(self, tmp_path):
        """Should sort entries by date then ticker."""
        csv_file = tmp_path / "shares_history.csv"

        with patch.object(scrape_ishares, "HISTORY_CSV", csv_file):
            history = {
                ("2025-07-02", "EWY"): {"shares": 100, "nav": 50.0},
                ("2025-07-01", "EWY"): {"shares": 200, "nav": 51.0},
            }
            scrape_ishares.save_history(history)

        with open(csv_file) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        assert rows[0]["date"] == "2025-07-01"
        assert rows[1]["date"] == "2025-07-02"


class TestScrapeAllWithNav:
    """Test that scrape_all integrates NAV into the pipeline."""

    @patch("scrape_ishares.fetch_nav_from_page")
    @patch("scrape_ishares.fetch_ishares_shares")
    @patch("scrape_ishares.save_history")
    @patch("scrape_ishares.load_existing_history")
    @patch("scrape_ishares.load_config")
    def test_returns_three_tuple(
        self, mock_config, mock_load, mock_save, mock_fetch, mock_nav
    ):
        """scrape_all results should be (date, shares, nav) tuples."""
        mock_config.return_value = [
            {
                "symbol": "EWY",
                "ishares_product_id": "239681",
                "ishares_name": "ishares-msci-south-korea-capped-etf",
            }
        ]
        mock_load.return_value = {}
        mock_fetch.return_value = ("2025-07-01", 68100000)
        mock_nav.return_value = 55.23

        results = scrape_ishares.scrape_all()
        assert "EWY" in results
        date, shares, nav = results["EWY"]
        assert date == "2025-07-01"
        assert shares == 68100000
        assert nav == pytest.approx(55.23)

    @patch("scrape_ishares.fetch_nav_from_page")
    @patch("scrape_ishares.fetch_ishares_shares")
    @patch("scrape_ishares.save_history")
    @patch("scrape_ishares.load_existing_history")
    @patch("scrape_ishares.load_config")
    def test_stores_nav_in_history(
        self, mock_config, mock_load, mock_save, mock_fetch, mock_nav
    ):
        """scrape_all should store nav in history dict values."""
        mock_config.return_value = [
            {
                "symbol": "EWY",
                "ishares_product_id": "239681",
                "ishares_name": "ishares-msci-south-korea-capped-etf",
            }
        ]
        mock_load.return_value = {}
        mock_fetch.return_value = ("2025-07-01", 68100000)
        mock_nav.return_value = 55.23

        scrape_ishares.scrape_all()

        # Check what was passed to save_history
        saved = mock_save.call_args[0][0]
        key = ("2025-07-01", "EWY")
        assert key in saved
        assert saved[key]["shares"] == 68100000
        assert saved[key]["nav"] == pytest.approx(55.23)

    @patch("scrape_ishares.fetch_nav_from_page")
    @patch("scrape_ishares.fetch_ishares_shares")
    @patch("scrape_ishares.save_history")
    @patch("scrape_ishares.load_existing_history")
    @patch("scrape_ishares.load_config")
    def test_handles_nav_failure(
        self, mock_config, mock_load, mock_save, mock_fetch, mock_nav
    ):
        """scrape_all should still work when NAV fetch fails (returns None)."""
        mock_config.return_value = [
            {
                "symbol": "EWY",
                "ishares_product_id": "239681",
                "ishares_name": "ishares-msci-south-korea-capped-etf",
            }
        ]
        mock_load.return_value = {}
        mock_fetch.return_value = ("2025-07-01", 68100000)
        mock_nav.return_value = None

        results = scrape_ishares.scrape_all()
        assert "EWY" in results
        date, shares, nav = results["EWY"]
        assert nav is None
