"""Local, in-memory portfolio state backed by the existing Python analysis code."""

from __future__ import annotations

import importlib
import math
import os
import threading
from copy import deepcopy
from typing import Any

import numpy as np
import pandas as pd


os.environ.setdefault("STREAMLIT_BOOTSTRAPPED", "1")
advisor = importlib.import_module("ai_investment_advisor")

_LOCK = threading.RLock()
_PORTFOLIO = {
    "holdings": advisor.default_holdings(),
    "synthetic": True,
    "snapshot_date": advisor.default_snapshot_date(),
    "auto_update_holdings": True,
    "refresh_token": 0,
}


def public_value(value: Any):
    if isinstance(value, dict):
        return {str(key): public_value(item) for key, item in value.items() if key != "评分回测样本"}
    if isinstance(value, (list, tuple)):
        return [public_value(item) for item in value]
    if isinstance(value, np.ndarray):
        return public_value(value.tolist())
    if isinstance(value, np.generic):
        return public_value(value.item())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is pd.NA or value is pd.NaT:
        return None
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def get_portfolio() -> dict:
    with _LOCK:
        return public_value(deepcopy(_PORTFOLIO))


def update_portfolio(holdings: Any) -> dict:
    normalized = advisor.normalize_holdings(holdings)
    if not normalized:
        raise ValueError("组合至少需要一只基金")
    with _LOCK:
        _PORTFOLIO["holdings"] = normalized
        _PORTFOLIO["synthetic"] = False
        _PORTFOLIO["refresh_token"] += 1
        return get_portfolio()


def reset_portfolio() -> dict:
    with _LOCK:
        _PORTFOLIO["holdings"] = advisor.default_holdings()
        _PORTFOLIO["synthetic"] = True
        _PORTFOLIO["snapshot_date"] = advisor.default_snapshot_date()
        _PORTFOLIO["refresh_token"] += 1
        return get_portfolio()


def refresh_data() -> int:
    with _LOCK:
        _PORTFOLIO["refresh_token"] += 1
        return _PORTFOLIO["refresh_token"]


def analysis_rows() -> list[dict]:
    state = get_portfolio()
    rows = advisor.load_data(
        refresh_token=state["refresh_token"],
        holdings_json=advisor.holdings_to_json(state["holdings"]),
        snapshot_date=state["snapshot_date"],
        auto_update_holdings=state["auto_update_holdings"],
        include_advice=False,
    )
    return public_value(rows)


def analysis_summary(rows: list[dict]) -> dict:
    finite_amounts = [float(row.get("当前持有金额") or 0) for row in rows]
    finite_profits = [float(row.get("累计收益") or 0) for row in rows]
    scores = [float(row["综合评分(0-10)"]) for row in rows if row.get("综合评分(0-10)") is not None]
    sources: dict[str, int] = {}
    for row in rows:
        source = str(row.get("数据来源") or "未知")
        sources[source] = sources.get(source, 0) + 1
    return {
        "fund_count": len(rows),
        "total_amount": round(sum(finite_amounts), 2),
        "total_profit": round(sum(finite_profits), 2),
        "average_score": round(sum(scores) / len(scores), 2) if scores else None,
        "source_counts": sources,
        "as_of": max((str(row.get("最新净值日期") or "") for row in rows), default="") or None,
    }


def fund_history(code: str, days: int = 365) -> dict:
    code = advisor.normalize_fund_code(code)
    state = get_portfolio()
    row = next((item for item in analysis_rows() if item["代码"] == code), None)
    if row is None:
        raise KeyError("当前组合中没有该基金")
    nav, nav_source = advisor.fetch_nav_history_with_provenance(code)
    benchmark = pd.DataFrame(columns=["date", "nav"])
    benchmark_source = row.get("基准来源信息", {})
    if nav_source.source != "模拟数据":
        fund_type = advisor.classify_fund(row["基金名称"])
        benchmark_key = advisor.benchmark_for_fund(row["基金名称"], fund_type)
        benchmark, benchmark_provenance = advisor.load_benchmark_history(benchmark_key, state["refresh_token"])
        benchmark_source = benchmark_provenance.as_dict()
    if days > 0 and not nav.empty:
        cutoff = nav["date"].max() - pd.Timedelta(days=days)
        nav = nav.loc[nav["date"] >= cutoff]
        if not benchmark.empty:
            benchmark = benchmark.loc[benchmark["date"] >= cutoff]
    return public_value({
        "code": code,
        "fund_name": row["基金名称"],
        "nav": nav[["date", "nav"]].to_dict(orient="records"),
        "benchmark": benchmark[["date", "nav"]].to_dict(orient="records") if not benchmark.empty else [],
        "nav_provenance": nav_source.as_dict(),
        "benchmark_provenance": benchmark_source,
        "benchmark_available": not benchmark.empty and bool(benchmark_source.get("available", True)),
    })


def advice(code: str, api_key: str, provider: str) -> dict:
    code = advisor.normalize_fund_code(code)
    row = next((item for item in analysis_rows() if item["代码"] == code), None)
    if row is None:
        raise KeyError("当前组合中没有该基金")
    short, detail, mode = advisor.call_qwen_advice_pair(
        row,
        api_key_override=api_key,
        provider_override=provider,
        return_status=True,
    )
    return {"code": code, "short": short, "detail": detail,
            "mode": mode, "disclaimer": advisor.COMPLIANCE_DISCLOSURE}
