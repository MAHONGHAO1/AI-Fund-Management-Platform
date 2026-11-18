"""Freeze public NAV history into deterministic offline fixtures.

The output is a dated snapshot of public data, not a live feed. Runtime loaders
verify the canonical row hash before using a fixture, so editing a JSON file
without updating its hash fails closed.

Usage (network required only while freezing):

    uv run --locked python scripts/freeze_nav_fixtures.py --years 5
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = ROOT / "fixtures"
FUNDS = {
    "006887": "东方红睿泽三年定开混合",
    "012920": "易方达全球成长精选混合(QDII)",
    "023895": "国泰君安中证港股通高股息投资指数",
    "008585": "华夏安阳6个月持有期混合",
    "270042": "广发纳斯达克100ETF联接",
    "010990": "南方中证新能源ETF联接",
    "014881": "天弘中证红利低波动100ETF联接",
    "009478": "中银全球策略(QDII-FOF)",
    "002611": "诺安进取回报混合",
    "024642": "华夏中证港股通内地金融ETF发起式联接",
}
BENCHMARKS = {
    "沪深300": ("hs300", "1.000300"),
    "科创50": ("star50", "1.000688"),
    "纳斯达克100": ("ndx100", "100.NDX100"),
    "中证银行": ("csi_bank", "0.399986"),
    "中证有色金属": ("csi_nonferrous", "1.000819"),
}
HEADERS = {"User-Agent": "Mozilla/5.0 robodata-portfolio-fixture"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def rows_hash(rows: list[dict]) -> str:
    canonical = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def parse_fund_js(text: str, code: str, years: int) -> tuple[str, list[dict], str]:
    name_match = re.search(r'var fS_name = "(.*?)";', text)
    trend_match = re.search(r"var Data_netWorthTrend = (\[.*?\]);", text)
    acc_match = re.search(r"var Data_ACWorthTrend = (\[\[.*?\]\]);", text)
    if not trend_match:
        raise ValueError(f"{code}: Data_netWorthTrend not found")
    name = name_match.group(1) if name_match else FUNDS.get(code, code)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=365 * years)).date().isoformat()
    acc = {}
    if acc_match:
        for item in json.loads(acc_match.group(1)):
            if isinstance(item, list) and len(item) >= 2:
                date = datetime.fromtimestamp(int(item[0]) / 1000, tz=timezone.utc).date().isoformat()
                acc[date] = float(item[1])
    rows = []
    for item in json.loads(trend_match.group(1)):
        date = datetime.fromtimestamp(int(item["x"]) / 1000, tz=timezone.utc).date().isoformat()
        if date < cutoff:
            continue
        nav = float(item["y"])
        if nav <= 0:
            continue
        row = {"date": date, "nav": nav}
        if date in acc:
            row["acc_nav"] = acc[date]
        rows.append(row)
    rows.sort(key=lambda item: item["date"])
    if not rows:
        raise ValueError(f"{code}: no rows after filtering")
    return name, rows, text


def freeze_fund(code: str, years: int) -> dict:
    url = f"https://fund.eastmoney.com/pingzhongdata/{code}.js"
    response = requests.get(url, timeout=30, headers=HEADERS)
    response.raise_for_status()
    text = response.content.decode("gbk", errors="replace")
    name, rows, _ = parse_fund_js(text, code, years)
    fixture = {
        "schema_version": 1,
        "kind": "fund_nav",
        "code": code,
        "name": name,
        "as_of": rows[-1]["date"],
        "row_count": len(rows),
        "rows_sha256": rows_hash(rows),
        "source": {
            "provider": "东方财富",
            "url": url,
            "fetched_at_utc": now(),
            "response_sha256": hashlib.sha256(response.content).hexdigest(),
            "note": "公开净值历史页面的冻结快照，仅用于离线界面演示，不构成投资建议。",
        },
        "rows": rows,
    }
    path = FIXTURE_ROOT / "nav" / f"{code}.json"
    write_json(path, fixture)
    return {"kind": "fund_nav", "code": code, "name": name, "rows": len(rows),
            "as_of": fixture["as_of"], "path": str(path)}


def freeze_benchmark(key: str, secid: str, years: int) -> dict:
    end = datetime.now()
    start = end - timedelta(days=365 * years)
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": secid, "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56", "klt": "101", "fqt": "1",
        "beg": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"),
    }
    response = requests.get(url, params=params, timeout=30, headers=HEADERS)
    response.raise_for_status()
    payload = response.json()
    klines = ((payload.get("data") or {}).get("klines") or [])
    rows = []
    for item in klines:
        parts = str(item).split(",")
        if len(parts) < 3:
            continue
        date = datetime.strptime(parts[0], "%Y-%m-%d").date().isoformat()
        close = float(parts[2])
        if close > 0:
            rows.append({"date": date, "nav": close})
    rows.sort(key=lambda item: item["date"])
    if not rows:
        raise ValueError(f"{key}: benchmark rows empty")
    fixture = {
        "schema_version": 1,
        "kind": "benchmark_nav",
        "key": key,
        "as_of": rows[-1]["date"],
        "row_count": len(rows),
        "rows_sha256": rows_hash(rows),
        "source": {
            "provider": "东方财富",
            "url": response.url,
            "fetched_at_utc": now(),
            "response_sha256": hashlib.sha256(response.content).hexdigest(),
            "note": "公开指数日线的冻结快照，仅用于离线界面演示。",
        },
        "rows": rows,
    }
    slug = BENCHMARKS[key][0]
    path = FIXTURE_ROOT / "benchmarks" / f"{slug}.json"
    write_json(path, fixture)
    return {"kind": "benchmark_nav", "key": key, "rows": len(rows),
            "as_of": fixture["as_of"], "path": str(path)}


def main() -> int:
    try:
        # Windows 控制台默认 GBK；样本名可能含 GBK 之外的字符，打印不能反过来把采集搞失败。
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, default=5)
    parser.add_argument("--skip-benchmarks", action="store_true")
    args = parser.parse_args()
    summary = []
    for code in FUNDS:
        summary.append(freeze_fund(code, args.years))
        print(f"fund {code}: {summary[-1]['rows']} rows -> {summary[-1]['as_of']}")
    if not args.skip_benchmarks:
        for key, (_, secid) in BENCHMARKS.items():
            summary.append(freeze_benchmark(key, secid, args.years))
            print(f"benchmark {key}: {summary[-1]['rows']} rows -> {summary[-1]['as_of']}")
    print(json.dumps({"fixtures": summary, "years": args.years}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
