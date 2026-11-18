"""Offline demo must use frozen public data without touching the network."""

from __future__ import annotations

import math

import pandas as pd
import pytest

import ai_investment_advisor as advisor


@pytest.fixture(autouse=True)
def _clear_caches():
    for name in ("load_benchmark_history", "load_nav_history_cached"):
        function = getattr(advisor, name, None)
        if function is not None and hasattr(function, "clear"):
            function.clear()
    yield
    for name in ("load_benchmark_history", "load_nav_history_cached"):
        function = getattr(advisor, name, None)
        if function is not None and hasattr(function, "clear"):
            function.clear()


def test_offline_demo_uses_verified_fixture_without_network(monkeypatch):
    monkeypatch.setenv("FUND_OFFLINE_DEMO", "1")
    monkeypatch.setattr(advisor.requests, "get", lambda *args, **kwargs: pytest.fail("offline mode must not call the network"))
    monkeypatch.setattr(advisor.requests, "Session", lambda: pytest.fail("offline mode must not create a session"))

    nav, provenance = advisor.fetch_nav_history_with_provenance("006887")
    assert provenance.source == "本地冻结样本"
    assert provenance.fallback_status == "fixture"
    assert provenance.available is True
    assert provenance.data_date == nav["date"].iloc[-1].strftime("%Y-%m-%d")
    assert len(nav) >= 200

    benchmark, benchmark_provenance = advisor.load_benchmark_history("沪深300")
    assert benchmark_provenance.source == "本地冻结样本"
    assert benchmark_provenance.available is True
    assert len(benchmark) >= 200


def test_offline_analysis_computes_metrics_from_fixture(monkeypatch):
    monkeypatch.setenv("FUND_OFFLINE_DEMO", "1")
    monkeypatch.setattr(advisor.requests, "get", lambda *args, **kwargs: pytest.fail("offline mode must not call the network"))
    row = advisor.analyze_fund(
        {"code": "006887", "name": "诺德新生活混合A"},
        {"006887": {"amount": 1000.0, "hold_ret": 5.2, "cum_profit": 49.5}},
        snapshot_date="2026-05-28",
        auto_update_holdings=False,
    )
    assert row["数据来源"] == "本地冻结样本"
    assert row["指标可用"] is True
    assert math.isfinite(row["近1年收益率"])
    assert math.isfinite(row["近1年最大回撤"])
    assert row["基准可用"] is True
    assert row["近1年基准收益率"] is not None


def test_offline_demo_falls_back_to_synthetic_only_when_fixture_is_missing(monkeypatch):
    monkeypatch.setenv("FUND_OFFLINE_DEMO", "1")
    monkeypatch.setattr(advisor.requests, "get", lambda *args, **kwargs: pytest.fail("offline mode must not call the network"))
    nav, provenance = advisor.fetch_nav_history_with_provenance("999999")
    assert isinstance(nav, pd.DataFrame) and not nav.empty
    assert provenance.source == "模拟数据"
    assert provenance.fallback_status == "synthetic"


def test_service_analysis_and_history_are_fixture_backed(monkeypatch):
    import fund_service

    monkeypatch.setenv("FUND_OFFLINE_DEMO", "1")
    monkeypatch.setattr(advisor.requests, "get", lambda *args, **kwargs: pytest.fail("offline mode must not call the network"))
    fund_service.reset_portfolio()
    rows = fund_service.analysis_rows()
    assert len(rows) == 10
    assert {row["数据来源"] for row in rows} == {"本地冻结样本"}
    assert all(row["指标可用"] is True for row in rows)
    assert all(math.isfinite(row["近1年收益率"]) for row in rows)
    assert all(row["基准可用"] is True for row in rows)
    summary = fund_service.analysis_summary(rows)
    assert summary["source_counts"] == {"本地冻结样本": 10}

    history = fund_service.fund_history("006887", days=365)
    assert history["synthetic"] is False
    assert history["metrics_available"] is True
    assert history["benchmark_available"] is True
    assert history["nav_provenance"]["source"] == "本地冻结样本"
    assert history["nav_provenance"]["fallback_status"] == "fixture"
    assert history["nav_provenance"]["data_date"] == "2026-11-17"
    assert len(history["nav"]) > 200
    assert history["truncated"] is False

