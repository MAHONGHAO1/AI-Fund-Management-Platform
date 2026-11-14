"""上线级审计新增用例：指标口径、模拟数据边界与接口失败态。"""

import importlib.util
import math
import os
import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

os.environ["STREAMLIT_BOOTSTRAPPED"] = "1"
MODULE_PATH = Path(__file__).resolve().parents[1] / "ai_investment_advisor.py"
spec = importlib.util.spec_from_file_location("fund_audit", MODULE_PATH)
fund = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = fund
spec.loader.exec_module(fund)

import fund_service  # noqa: E402
from fund_data import DataProvenance  # noqa: E402
from fund_web import create_app, _safe_error  # noqa: E402


def nav_frame(dates, values):
    return pd.DataFrame({"date": pd.to_datetime(dates), "nav": values})


def test_max_drawdown_counts_peak_before_the_window():
    """基金仍比一年前高点低 50% 时，近一年回撤不能算成 0%。"""
    dates = list(pd.date_range("2024-01-01", periods=200, freq="D")) + list(
        pd.date_range("2025-01-01", periods=300, freq="D")
    )
    values = [1.0] * 100 + [2.0] * 50 + [1.0] * 50 + [1.0] * 300
    history = nav_frame(dates, values)
    assert fund.calc_max_drawdown(history) == pytest.approx(-50.0)


def test_max_drawdown_within_window_still_uses_full_history_peak():
    dates = pd.date_range("2024-06-01", periods=400, freq="D")
    values = [1.0] * 200 + [1.5] * 40 + [1.2] * 160
    history = nav_frame(dates, values)
    # 窗口内从 1.5 跌到 1.2 → -20%，峰值来自窗口内部
    assert fund.calc_max_drawdown(history) == pytest.approx(-20.0)
    assert fund.calc_max_drawdown_until(history, dates[-1], 200) == pytest.approx(-20.0)


def test_period_returns_use_nearest_available_nav():
    dates = pd.date_range("2024-01-01", periods=390, freq="D")
    values = [1.0] * 300 + [1.2] * 60 + [1.32] * 30
    history = nav_frame(dates, values)
    assert fund.calc_period_return(history, 30) == pytest.approx(10.0, abs=0.6)
    assert fund.calc_period_return(history, 90) == pytest.approx(32.0, abs=0.6)


def test_recovery_days_is_unavailable_when_never_recovered():
    dates = pd.date_range("2025-01-01", periods=200, freq="D")
    values = [1.0] * 40 + [1.5] * 20 + [0.9] * 140
    history = nav_frame(dates, values)
    assert math.isnan(fund.calc_drawdown_recovery_days(history))


def test_recovery_days_counts_only_after_trough():
    dates = pd.date_range("2025-01-01", periods=120, freq="D")
    values = [1.0] * 20 + [1.5] * 10 + [1.0] * 10 + [1.5] * 80
    history = nav_frame(dates, values)
    assert fund.calc_drawdown_recovery_days(history) == pytest.approx(10.0)


def test_mock_nav_reports_no_metrics_and_never_projects_holdings():
    mock_nav = fund.make_mock_nav("000001")
    row = fund.analyze_fund_with_mock(
        {"code": "000001", "name": "测试基金"},
        mock_nav,
        "数据源不可用",
        {"000001": {"amount": 1000.0, "hold_ret": 10.0, "cum_profit": 100.0}},
        snapshot_date="2025-01-01",
        auto_update_holdings=True,
    )
    assert row["数据来源"] == "模拟数据"
    assert row["指标可用"] is False
    for key in ("近1月收益率", "近3月收益率", "近1年收益率", "近1年最大回撤", "近1年夏普比率", "近1年年化波动率"):
        assert math.isnan(row[key]), key
    # 模拟净值不得把 1000 元本金“涨”成别的数字
    assert row["当前持有金额"] == pytest.approx(1000.0)
    assert row["当前持有收益率"] == pytest.approx(10.0)
    assert "未按净值推算" in row["持仓更新说明"]


def test_composite_scores_skip_rows_without_full_metrics():
    rows = [
        {"代码": "000001", "近1年收益率": 12.0, "近1年最大回撤": -8.0,
         "近1年年化波动率": 15.0, "近1年夏普比率": 1.1, "近1年超额收益率": 3.0, "最大回撤修复天数": 30.0},
        {"代码": "000002", "近1年收益率": 6.0, "近1年最大回撤": -20.0,
         "近1年年化波动率": 25.0, "近1年夏普比率": 0.4, "近1年超额收益率": 1.0, "最大回撤修复天数": 90.0},
        {"代码": "000003", "近1年收益率": float("nan"), "近1年最大回撤": float("nan"),
         "近1年年化波动率": float("nan"), "近1年夏普比率": float("nan"),
         "近1年超额收益率": float("nan"), "最大回撤修复天数": float("nan"), "数据来源": "模拟数据"},
    ]
    fund.apply_composite_scores(rows)
    assert math.isnan(rows[2]["综合评分(0-10)"])
    assert rows[2]["晨星评级"].startswith("不可用")
    assert all(rows[index]["综合评分(0-10)"] is not None for index in (0, 1))
    # 只有两只基金参与排名时，收益更高、风险更低的那只必须排前面
    assert rows[0]["综合评分(0-10)"] > rows[1]["综合评分(0-10)"]


def test_fund_history_reports_truncation_and_coverage(monkeypatch):
    dates = pd.date_range("2024-01-01", periods=740, freq="D")
    series = pd.DataFrame({"date": dates, "nav": [1.0 + index * 0.0005 for index in range(740)]})
    provenance = DataProvenance("东方财富、AkShare", "东方财富", "2025-12-31")

    monkeypatch.setattr(fund_service.advisor, "load_nav_history_cached",
                        lambda code, lookback, token: (series, provenance))
    monkeypatch.setattr(fund_service.advisor, "load_benchmark_history",
                        lambda key, token, lookback: (pd.DataFrame(columns=["date", "nav"]),
                                                      DataProvenance(key, "不可用", None, "unavailable", "", False)))
    monkeypatch.setattr(fund_service, "analysis_rows", lambda: [{"代码": "000001", "基金名称": "测试基金",
                                                                "基准来源信息": {}}])
    long_window = fund_service.fund_history("000001", 1095)
    assert long_window["truncated"] is True
    assert long_window["available_days"] == pytest.approx(739, abs=1)
    assert long_window["requested_days"] == 1095
    assert long_window["coverage_start"] == "2024-01-01"
    assert len(long_window["nav"]) == 740

    one_year = fund_service.fund_history("000001", 365)
    assert one_year["truncated"] is False
    assert long_window["requested_days"] == 1095

    # 「全部」不承诺固定区间：requested_days 必须为空，否则所有成立不足 10 年的基金都会误报截断。
    everything = fund_service.fund_history("000001", 0)
    assert everything["requested_days"] is None
    assert everything["truncated"] is False
    # 740 天远没顶到 3650 天回看上限，说明数据本身就是全的，不能报 history_capped
    assert everything["history_capped"] is False
    assert everything["lookback_days"] == 3650
    # 指标可用性由后端裁决，前端不再自己比对来源字符串
    assert everything["metrics_available"] is True
    assert everything["synthetic"] is False


def test_all_range_flags_history_cap_only_when_window_is_full(monkeypatch):
    """数据正好顶满 10 年回看上限时才提示「可能还有更早记录」。"""
    dates = pd.date_range("2016-01-01", periods=3700, freq="D")
    series = pd.DataFrame({"date": dates, "nav": [1.0] * 3700})
    provenance = DataProvenance("东方财富、AkShare", "东方财富", "2026-02-13")

    monkeypatch.setattr(fund_service.advisor, "load_nav_history_cached",
                        lambda code, lookback, token: (series, provenance))
    monkeypatch.setattr(fund_service.advisor, "load_benchmark_history",
                        lambda key, token, lookback: (pd.DataFrame(columns=["date", "nav"]),
                                                      DataProvenance(key, "不可用", None, "unavailable", "", False)))
    monkeypatch.setattr(fund_service, "analysis_rows", lambda: [{"代码": "000001", "基金名称": "测试基金",
                                                                "基准来源信息": {}}])
    everything = fund_service.fund_history("000001", 0)
    assert everything["history_capped"] is True
    assert everything["truncated"] is False


def test_fund_history_marks_synthetic_nav_as_unusable(monkeypatch):
    """模拟净值必须在契约里显式标注，前端据此把四个指标全部置为不可用。"""
    dates = pd.date_range("2025-01-01", periods=200, freq="D")
    series = pd.DataFrame({"date": dates, "nav": [1.0] * 200})
    provenance = DataProvenance("东方财富、AkShare", "模拟数据", "2025-07-19", "synthetic", "network offline", True)

    monkeypatch.setattr(fund_service.advisor, "load_nav_history_cached",
                        lambda code, lookback, token: (series, provenance))
    monkeypatch.setattr(fund_service, "analysis_rows", lambda: [{"代码": "000001", "基金名称": "测试基金",
                                                                "指标可用": False, "基准来源信息": {}}])
    history = fund_service.fund_history("000001", 365)
    assert history["synthetic"] is True
    assert history["metrics_available"] is False
    assert history["benchmark_available"] is False


def test_fund_detail_failure_returns_503_without_local_paths(monkeypatch):
    def boom():
        raise RuntimeError(r"读取 C:\Users\MA\secret\fund.csv 失败")

    monkeypatch.setattr(fund_service, "analysis_rows", boom)
    client = TestClient(create_app())
    result = client.get("/api/funds/000001")
    assert result.status_code == 503
    detail = result.json()["detail"]
    assert "C:\\Users" not in detail and "<本机路径>" in detail


def test_export_failure_is_reported_as_503(monkeypatch):
    monkeypatch.setattr(fund_service, "analysis_rows", lambda: (_ for _ in ()).throw(RuntimeError("导出失败")))
    result = TestClient(create_app()).get("/api/export/markdown")
    assert result.status_code == 503
    assert "报告导出暂不可用" in result.json()["detail"]


def test_safe_error_strips_windows_and_posix_paths():
    message = _safe_error(RuntimeError(r"open C:\data\funds.xlsx and /Users/ma/fund.csv failed"), "读取失败")
    assert "C:\\data" not in message
    assert "/Users/ma" not in message
    assert message.count("<本机路径>") == 2


def test_reports_never_print_nan_literal():
    """不可评分行的 NaN 内部哨兵不得漏进 Markdown / HTML 报告文本。"""
    rows = []
    for index in range(3):
        row = fund.analyze_fund_with_mock(
            {"code": f"00000{index}", "name": f"模拟基金{index}"},
            fund.make_mock_nav(f"00000{index}"),
            "数据源不可用",
            {f"00000{index}": {"amount": 1000.0, "hold_ret": 0.0, "cum_profit": 0.0}},
            snapshot_date="2025-01-01",
            auto_update_holdings=False,
        )
        rows.append(row)
    for row in rows:
        row["AI建议"] = "本地规则回退说明"
        row["详细AI建议"] = "模拟净值不生成收益与风险指标。"
    fund.apply_composite_scores(rows)

    markdown = fund.build_markdown_report(rows)
    html = fund.build_html_report(rows)
    assert "nan" not in markdown.lower()
    assert "nan" not in html.lower()
    assert "不可用" in markdown and "不可用" in html


def test_fmt_score_turns_non_finite_into_unavailable():
    assert fund.fmt_score(float("nan")) == "不可用"
    assert fund.fmt_score(None) == "不可用"
    assert fund.fmt_score("") == "不可用"
    assert fund.fmt_score(6.25) == "6.2"
