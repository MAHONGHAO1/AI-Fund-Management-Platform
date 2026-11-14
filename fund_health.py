"""跨次的数据源健康记录。

`provenance` 只说清「这一次」取数的结果。这个模块把每次尝试留下来，
才能回答「AkShare 这周挂了几次」这类问题——见 docs/DATA_SOURCES.md 的缺口说明。

记录是追加写的一行一条 JSON，默认落在 work/fund_health.jsonl。
测试或嵌入方可以用环境变量 FUND_HEALTH_LOG 换到别处，避免污染正式记录。
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LOG = Path(__file__).resolve().parent / "work" / "fund_health.jsonl"
_LOCK = threading.Lock()

# 连续失败达到这个次数，就把来源标成降级。
DEGRADED_AFTER = 2


def log_path() -> Path:
    override = os.environ.get("FUND_HEALTH_LOG")
    return Path(override) if override else DEFAULT_LOG


def record(source: str, code: str, ok: bool, reason: str = "") -> dict:
    """记一次取数尝试。返回写入的条目，方便调用方接着用。"""
    entry = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": str(source),
        "code": str(code),
        "ok": bool(ok),
        "reason": str(reason)[:500],
    }
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def load_entries(limit: int = 5000) -> list[dict]:
    """读最近 limit 条记录；文件不存在或为空都返回空表。"""
    path = log_path()
    if not path.is_file():
        return []
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    entries = []
    for line in lines[-limit:]:
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if isinstance(value, dict) and "source" in value:
            entries.append(value)
    return entries


def summarize(entries: list[dict] | None = None) -> list[dict]:
    """按来源汇总：次数、成功失败、最近一次成败、连续失败数、是否降级。"""
    rows = load_entries() if entries is None else entries
    grouped: dict[str, list[dict]] = {}
    for entry in rows:
        grouped.setdefault(str(entry.get("source")), []).append(entry)

    result = []
    for source, items in sorted(grouped.items()):
        items = sorted(items, key=lambda item: item.get("at", ""))
        attempts = len(items)
        ok_count = sum(1 for item in items if item.get("ok"))
        failed_count = attempts - ok_count
        last_ok = next((item.get("at") for item in reversed(items) if item.get("ok")), None)
        last_failed = next((item.get("at") for item in reversed(items) if not item.get("ok")), None)

        consecutive_failures = 0
        for item in reversed(items):
            if item.get("ok"):
                break
            consecutive_failures += 1

        result.append({
            "source": source,
            "attempts": attempts,
            "succeeded": ok_count,
            "failed": failed_count,
            "last_succeeded_at": last_ok,
            "last_failed_at": last_failed,
            "consecutive_failures": consecutive_failures,
            "degraded": consecutive_failures >= DEGRADED_AFTER,
            "last_reason": next((item.get("reason", "") for item in reversed(items)
                                 if not item.get("ok")), ""),
        })
    return result
