"""Verify the complete Fund Lens analysis path against frozen public NAV fixtures.

Runs with the network disabled at the process boundary: every HTTP call fails
immediately. It does not start a browser; it verifies the Python data/analysis
path that the local API serves.

    uv run --locked python scripts/verify_offline_fixtures.py
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

os.environ["FUND_OFFLINE_DEMO"] = "1"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import requests  # noqa: E402

import fund_service  # noqa: E402

BOUNDARIES = [
    "Fixtures are dated snapshots of public NAV pages, not live market data.",
    "Holdings are fictional samples; no real account or trade is involved.",
    "This verifies the Python API path, not browser rendering or model quality.",
    "It does not prove future returns, strategy success or production availability.",
]


def fail_network(*args, **kwargs):
    raise RuntimeError("offline verification must not call the network")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=ROOT / "work" / "offline-fixture-verification.json")
    args = parser.parse_args()
    requests.get = fail_network
    requests.Session = fail_network

    report = {"schema_version": 1, "verification": "fund-offline-fixtures",
              "started_at_utc": now(), "environment": {
                  "python": sys.version.split()[0], "platform": platform.platform()},
              "boundaries": BOUNDARIES}
    started = time.perf_counter()
    try:
        fund_service.reset_portfolio()
        rows = fund_service.analysis_rows()
        summary = fund_service.analysis_summary(rows)
        if len(rows) != 10:
            raise ValueError(f"expected 10 default funds, got {len(rows)}")
        if {row["数据来源"] for row in rows} != {"本地冻结样本"}:
            raise ValueError(f"unexpected sources: {sorted({row['数据来源'] for row in rows})}")
        if summary["source_counts"] != {"本地冻结样本": 10}:
            raise ValueError(f"unexpected source counts: {summary['source_counts']}")
        for row in rows:
            for key in ("近1年收益率", "近1年最大回撤", "近1年年化波动率", "近1年夏普比率"):
                value = row.get(key)
                if value is None or not isinstance(value, (int, float)):
                    raise ValueError(f"{row['代码']} missing finite {key}: {value}")
            if row.get("基准可用") is not True:
                raise ValueError(f"{row['代码']} benchmark unavailable")
            provenance = row.get("净值来源信息") or {}
            if provenance.get("source") != "本地冻结样本" or provenance.get("fallback_status") != "fixture":
                raise ValueError(f"{row['代码']} provenance is not fixture-backed: {provenance}")
            if not provenance.get("data_date"):
                raise ValueError(f"{row['代码']} provenance has no data date")

        histories = {}
        for code in ("006887", "012920", "024642"):
            history = fund_service.fund_history(code, days=365)
            if history["synthetic"] or not history["metrics_available"]:
                raise ValueError(f"{code} is not treated as fixture-backed")
            if not history["benchmark_available"]:
                raise ValueError(f"{code} benchmark unavailable")
            if len(history["nav"]) < 200:
                raise ValueError(f"{code} has too few fixture points: {len(history['nav'])}")
            if history["nav_provenance"].get("source") != "本地冻结样本":
                raise ValueError(f"{code} history provenance mismatch")
            histories[code] = {
                "nav_points": len(history["nav"]),
                "benchmark_points": len(history["benchmark"]),
                "data_date": history["nav_provenance"].get("data_date"),
                "coverage_days": history["available_days"],
            }

        markdown = fund_service.advisor.build_markdown_report(rows, synthetic_portfolio=True)
        if "冻结的公开净值快照" not in markdown:
            raise ValueError("markdown report does not disclose frozen fixtures")
        if "虚构合成示例" not in markdown:
            raise ValueError("markdown report does not disclose synthetic holdings")

        report["checks"] = {
            "fund_count": len(rows),
            "sources": summary["source_counts"],
            "average_score": summary["average_score"],
            "as_of": summary["as_of"],
            "metrics_finite_for_all_rows": True,
            "benchmarks_available_for_all_rows": True,
            "provenance_dates_present": True,
            "markdown_discloses_fixture_and_synthetic_holdings": True,
            "network_calls": 0,
        }
        report["histories"] = histories
        report["summary"] = {"passed": True, "funds": len(rows),
                             "scope": "Python analysis path with FUND_OFFLINE_DEMO=1; network disabled"}
    except Exception as exc:
        report["summary"] = {"passed": False, "error": f"{type(exc).__name__}: {exc}"}
        report["finished_at_utc"] = now()
        report["seconds"] = round(time.perf_counter() - started, 3)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
        return 1

    report["finished_at_utc"] = now()
    report["seconds"] = round(time.perf_counter() - started, 3)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
                           encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"report: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
