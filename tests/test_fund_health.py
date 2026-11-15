"""Data source health accumulates across runs and must not drift from docs/DATA_SOURCES.md."""
import json
from pathlib import Path

import pytest

import fund_health
from fund_data import DataProvenance, load_nav_series


@pytest.fixture(autouse=True)
def isolated_log(tmp_path, monkeypatch):
    monkeypatch.setenv("FUND_HEALTH_LOG", str(tmp_path / "health.jsonl"))
    yield tmp_path / "health.jsonl"


def test_record_appends_one_json_line_per_attempt(isolated_log):
    fund_health.record("AkShare", "000001", False, "AkShare 返回空数据")
    fund_health.record("东方财富", "000001", True)
    lines = isolated_log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["source"] == "AkShare" and first["ok"] is False
    assert first["code"] == "000001" and "空数据" in first["reason"]
    assert first["at"].endswith("Z") or "+" in first["at"]


def test_summarize_counts_and_degrades_after_two_consecutive_failures():
    fund_health.record("AkShare", "1", True)
    fund_health.record("AkShare", "2", False, "a")
    fund_health.record("AkShare", "3", False, "b")
    fund_health.record("东方财富", "1", False, "c")
    rows = {row["source"]: row for row in fund_health.summarize()}

    ak = rows["AkShare"]
    assert (ak["attempts"], ak["succeeded"], ak["failed"]) == (3, 1, 2)
    assert ak["consecutive_failures"] == 2
    assert ak["degraded"] is True
    assert ak["last_reason"] == "b"

    east = rows["东方财富"]
    assert east["consecutive_failures"] == 1
    assert east["degraded"] is False, "只挂一次不该标降级"


def test_a_success_clears_the_degraded_flag():
    fund_health.record("AkShare", "1", False, "a")
    fund_health.record("AkShare", "2", False, "b")
    fund_health.record("AkShare", "3", True)
    row = fund_health.summarize()[0]
    assert row["consecutive_failures"] == 0
    assert row["degraded"] is False
    assert row["last_succeeded_at"] is not None


def test_empty_log_summarizes_to_nothing():
    assert fund_health.summarize() == []
    assert fund_health.load_entries() == []


def test_api_data_sources_returns_the_shape_the_frontend_reads(isolated_log):
    from fastapi.testclient import TestClient
    from fund_web import create_app

    fund_health.record("东方财富", "000001", True)
    fund_health.record("AkShare", "000001", False, "接口 500")
    fund_health.record("AkShare", "000002", False, "字段不符预期")

    payload = TestClient(create_app()).get("/api/data-sources").json()
    assert payload["record_count"] == 3
    rows = {row["source"]: row for row in payload["sources"]}
    assert set(rows) == {"东方财富", "AkShare"}
    assert rows["AkShare"]["degraded"] is True
    assert rows["AkShare"]["consecutive_failures"] == 2
    assert rows["东方财富"]["degraded"] is False
    for row in payload["sources"]:
        assert {"attempts", "succeeded", "failed", "last_succeeded_at",
                "consecutive_failures", "degraded", "last_reason"} <= set(row)


def test_load_nav_series_records_every_attempt(isolated_log):
    calls = []

    def boom(code):
        calls.append(code)
        raise ValueError("接口 500")

    data, provenance = load_nav_series("123456", [("东方财富", boom), ("AkShare", boom)],
                                       lambda code: _mock_frame())
    assert provenance.source == "模拟数据"
    assert provenance.fallback_status == "synthetic"

    rows = fund_health.load_entries()
    assert [(item["source"], item["ok"]) for item in rows] == [
        ("东方财富", False), ("AkShare", False), ("模拟数据", False)]
    assert all(item["code"] == "123456" for item in rows)
    assert rows[0]["reason"] == "接口 500"


def test_load_nav_series_records_success(isolated_log):
    def good(code):
        return _mock_frame()

    data, provenance = load_nav_series("000001", [("东方财富", good)], lambda code: _mock_frame())
    assert provenance.source == "东方财富"
    rows = fund_health.load_entries()
    assert len(rows) == 1 and rows[0]["ok"] is True and rows[0]["source"] == "东方财富"


def _mock_frame():
    import pandas as pd
    return pd.DataFrame({"date": ["2026-01-01", "2026-01-02"], "nav": [1.0, 1.01]})
