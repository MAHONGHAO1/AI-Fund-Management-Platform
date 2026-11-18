"""Verified offline NAV fixtures frozen from public pages.

Runtime never learns from these files how to fetch: they are read-only snapshots
with a canonical row hash. A missing or edited fixture is rejected, not silently
repaired.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
DEFAULT_FIXTURE_ROOT = ROOT / "fixtures"
BENCHMARK_SLUGS = {
    "沪深300": "hs300",
    "科创50": "star50",
    "纳斯达克100": "ndx100",
    "中证银行": "csi_bank",
    "中证有色金属": "csi_nonferrous",
}


class FixtureError(ValueError):
    """Raised when a fixture is missing metadata or its content was edited."""


def fixture_root() -> Path:
    return Path(os.getenv("FUND_FIXTURE_DIR") or DEFAULT_FIXTURE_ROOT)


def _rows_hash(rows: list[dict]) -> str:
    canonical = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _read(path: Path, kind: str) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise FixtureError(f"{path.name}: 不支持的冻结样本版本")
    if payload.get("kind") != kind:
        raise FixtureError(f"{path.name}: 样本类型不是 {kind}")
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise FixtureError(f"{path.name}: 缺少净值行")
    if payload.get("rows_sha256") != _rows_hash(rows):
        raise FixtureError(f"{path.name}: 行哈希与记录不一致，样本可能被手工修改")
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["nav"] = pd.to_numeric(frame["nav"], errors="coerce")
    frame = frame.dropna(subset=["date", "nav"]).sort_values("date").reset_index(drop=True)
    if frame.empty or (frame["nav"] <= 0).any():
        raise FixtureError(f"{path.name}: 净值行清洗后为空或存在非正数")
    return {"frame": frame, "metadata": payload}


def load_nav_fixture(code: str) -> tuple[pd.DataFrame, dict] | None:
    """Return a verified fund fixture, or None when this code was not frozen."""
    path = fixture_root() / "nav" / f"{code}.json"
    if not path.is_file():
        return None
    value = _read(path, "fund_nav")
    if value["metadata"].get("code") != code:
        raise FixtureError(f"{path.name}: 基金代码与文件名不一致")
    return value["frame"], value["metadata"]


def load_benchmark_fixture(key: str) -> tuple[pd.DataFrame, dict] | None:
    """Return a verified benchmark fixture, or None when this key was not frozen."""
    slug = BENCHMARK_SLUGS.get(key)
    if slug is None:
        return None
    path = fixture_root() / "benchmarks" / f"{slug}.json"
    if not path.is_file():
        return None
    value = _read(path, "benchmark_nav")
    if value["metadata"].get("key") != key:
        raise FixtureError(f"{path.name}: 基准名称与文件名不一致")
    return value["frame"], value["metadata"]
