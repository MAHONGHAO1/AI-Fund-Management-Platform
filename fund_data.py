"""Pure data-source helpers shared by the fund app and its tests."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Callable, Iterable

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class DataProvenance:
    requested_source: str
    source: str
    data_date: str | None
    fallback_status: str = "none"
    failure_reason: str = ""
    available: bool = True

    def as_dict(self) -> dict:
        return asdict(self)


def normalize_nav_history(df: pd.DataFrame, source: str) -> pd.DataFrame:
    """Validate and deterministically normalize a date/nav history."""
    if not isinstance(df, pd.DataFrame) or df.empty:
        raise ValueError(f"{source} 返回空净值数据")
    missing = {"date", "nav"} - set(df.columns)
    if missing:
        raise ValueError(f"{source} 缺少必要字段：{', '.join(sorted(missing))}")

    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out["nav"] = pd.to_numeric(out["nav"], errors="coerce")
    out = out.dropna(subset=["date", "nav"])
    if out.empty:
        raise ValueError(f"{source} 清洗后无有效净值")
    out = out.sort_values("date").drop_duplicates("date", keep="last").reset_index(drop=True)
    values = out["nav"].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError(f"{source} 净值存在非正数或无效值")
    if "acc_nav" in out.columns:
        out["acc_nav"] = pd.to_numeric(out["acc_nav"], errors="coerce")
    return out


def _data_date(df: pd.DataFrame) -> str | None:
    if df.empty or "date" not in df:
        return None
    value = pd.to_datetime(df["date"], errors="coerce").max()
    return None if pd.isna(value) else value.strftime("%Y-%m-%d")


def load_nav_series(
    code: str,
    fetchers: Iterable[tuple[str, Callable[[str], pd.DataFrame]]],
    mock_factory: Callable[[str], pd.DataFrame],
) -> tuple[pd.DataFrame, DataProvenance]:
    """Try public sources in order and retain each failure in fallback evidence."""
    errors: list[str] = []
    requested = "、".join(name for name, _ in fetchers)
    for source, fetcher in fetchers:
        try:
            data = normalize_nav_history(fetcher(code), source)
            return data, DataProvenance(requested, source, _data_date(data))
        except Exception as exc:
            errors.append(f"{source}: {exc}")
    reason = "；".join(errors)
    mock = normalize_nav_history(mock_factory(code), "模拟数据")
    return mock, DataProvenance(requested, "模拟数据", _data_date(mock),
                                "synthetic", reason, True)


def load_benchmark_series(
    requested_key: str,
    primary_fetcher: Callable[[str], pd.DataFrame],
    fallback_key: str,
    fallback_fetcher: Callable[[str], pd.DataFrame],
) -> tuple[pd.DataFrame, DataProvenance]:
    """Load a benchmark with an explicit fallback, or return unavailable evidence."""
    errors: list[str] = []
    try:
        data = normalize_nav_history(primary_fetcher(requested_key), requested_key)
        return data, DataProvenance(requested_key, requested_key, _data_date(data))
    except Exception as exc:
        errors.append(f"{requested_key}: {exc}")
    if fallback_key != requested_key:
        try:
            data = normalize_nav_history(fallback_fetcher(fallback_key), fallback_key)
            return data, DataProvenance(requested_key, fallback_key, _data_date(data),
                                        "fallback", "；".join(errors), True)
        except Exception as exc:
            errors.append(f"{fallback_key}: {exc}")
    return pd.DataFrame(columns=["date", "nav"]), DataProvenance(
        requested_key, "不可用", None, "unavailable", "；".join(errors), False
    )
