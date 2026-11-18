"""Frozen NAV fixtures must be real, dated snapshots, not editable numbers."""

from __future__ import annotations

import json
import shutil

import pytest

import fund_fixtures

CODES = ["006887", "012920", "023895", "008585", "270042",
         "010990", "014881", "009478", "002611", "024642"]
BENCHMARKS = ["沪深300", "科创50", "纳斯达克100", "中证银行", "中证有色金属"]


def test_every_default_fund_has_a_verified_fixture():
    for code in CODES:
        loaded = fund_fixtures.load_nav_fixture(code)
        assert loaded is not None, code
        frame, metadata = loaded
        assert metadata["code"] == code
        assert len(frame) == metadata["row_count"] >= 200
        assert frame["date"].is_monotonic_increasing
        assert (frame["nav"] > 0).all()
        assert metadata["as_of"] == frame["date"].iloc[-1].strftime("%Y-%m-%d")
        assert metadata["source"]["provider"] == "东方财富"
        assert metadata["source"]["response_sha256"]


def test_every_declared_benchmark_has_a_verified_fixture():
    for key in BENCHMARKS:
        loaded = fund_fixtures.load_benchmark_fixture(key)
        assert loaded is not None, key
        frame, metadata = loaded
        assert metadata["key"] == key
        assert len(frame) == metadata["row_count"] >= 200
        assert (frame["nav"] > 0).all()


def test_tampered_fixture_is_rejected(tmp_path, monkeypatch):
    source = fund_fixtures.DEFAULT_FIXTURE_ROOT / "nav" / "006887.json"
    target = tmp_path / "nav" / "006887.json"
    target.parent.mkdir(parents=True)
    shutil.copy2(source, target)
    payload = json.loads(target.read_text(encoding="utf-8"))
    payload["rows"][-1]["nav"] = round(payload["rows"][-1]["nav"] + 0.01, 4)
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("FUND_FIXTURE_DIR", str(tmp_path))
    with pytest.raises(fund_fixtures.FixtureError, match="哈希"):
        fund_fixtures.load_nav_fixture("006887")


def test_unknown_code_is_not_a_fixture():
    loaded = fund_fixtures.load_nav_fixture("999999")
    assert loaded is None
