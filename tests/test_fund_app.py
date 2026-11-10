import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fund_data import DataProvenance, load_benchmark_series, load_nav_series

os.environ["STREAMLIT_BOOTSTRAPPED"] = "1"
MODULE_PATH = Path(__file__).resolve().parents[1] / "ai_investment_advisor.py"
spec = importlib.util.spec_from_file_location("fund_app", MODULE_PATH)
fund = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = fund
spec.loader.exec_module(fund)


def nav(values):
    return pd.DataFrame({"date": pd.date_range("2025-01-01", periods=len(values)), "nav": values})


def test_default_holdings_are_synthetic_and_normalized():
    holdings = fund.default_holdings()
    assert len(holdings) == 10
    assert all(item["amount"] > 0 for item in holdings)
    assert fund.holdings_to_map(holdings)["006887"]["amount"] == 1000.0


def test_normalize_holdings_skips_duplicate_and_invalid_codes():
    result = fund.normalize_holdings([
        {"code": "006887", "name": "A", "amount": "12.5"},
        {"code": "6887", "name": "duplicate normalized code", "amount": 20},
        {"code": "bad", "name": "invalid"},
    ])
    assert result == [{"code": "006887", "name": "A", "amount": 12.5, "hold_ret": 0.0, "cum_profit": 0.0}]


def test_nav_validation_rejects_non_positive_values():
    invalid = nav([1.0, 0.0])
    with pytest.raises(ValueError, match="非正数或无效值"):
        fund.validate_nav_history(invalid, "000001", "test")


def test_return_drawdown_and_score_calculations():
    history = nav([1.0, 1.1, 0.9, 1.2])
    assert fund.calc_period_return(history, 1) == pytest.approx(33.3333333)
    assert fund.calc_max_drawdown(history) == pytest.approx(-18.181818)
    assert fund.grade_from_score(8.5) == "五星"
    assert fund.normalize_weights({"收益能力": 2, "风险控制": 2})["收益能力"] == pytest.approx(0.5)


def test_insufficient_history_backtest_uses_default_weights():
    rows = [{"评分回测样本": []}]
    weights, method = fund.calculate_predictive_weights(rows, {})
    assert weights == fund.DEFAULT_SCORE_WEIGHTS
    assert "默认审慎权重" in method


def test_missing_ai_key_uses_local_advice(monkeypatch):
    monkeypatch.setattr(fund, "get_ai_config", lambda: ("", "", ""))
    row = {"基金名称": "合成基金", "近1年收益率": 4.0, "近1年最大回撤": -8.0,
           "当前持有收益率": 2.0, "综合评分(0-10)": 5.0, "晨星评级": "三星",
           "近1月收益率": 1.0, "近3月收益率": 2.0, "基金类型": "科技"}
    short, detail = fund.call_qwen_advice_pair(row)
    assert short
    assert "不构成投资建议" in detail


def test_data_source_failures_fall_back_to_mock(monkeypatch):
    def fail(code):
        raise RuntimeError("offline")
    monkeypatch.setattr(fund, "fetch_nav_with_eastmoney", fail)
    monkeypatch.setattr(fund, "fetch_nav_with_akshare", fail)
    data, source, error = fund.fetch_nav_history("006887")
    assert source == "模拟数据"
    assert "offline" in error
    assert len(data) >= 2 and np.isfinite(data["nav"]).all()


def test_nav_source_fallback_keeps_actual_source_date_and_failure(monkeypatch):
    good = nav([1.0, 1.1])
    data, provenance = load_nav_series(
        "000001",
        [("东方财富", lambda code: (_ for _ in ()).throw(RuntimeError("HTTP 503"))),
         ("AkShare", lambda code: good)],
        lambda code: pytest.fail("synthetic fallback should not be used"),
    )

    assert data["nav"].tolist() == [1.0, 1.1]
    assert provenance.source == "AkShare"
    assert provenance.data_date == "2025-01-02"
    assert provenance.fallback_status == "none"


def test_benchmark_fallback_and_total_failure_are_explicit():
    good = nav([1.0, 1.02])
    calls = []

    def fetch(key):
        calls.append(key)
        if key == "科创50":
            raise RuntimeError("primary unavailable")
        return good

    data, provenance = load_benchmark_series("科创50", fetch, "沪深300", fetch)
    assert not data.empty
    assert calls == ["科创50", "沪深300"]
    assert provenance.source == "沪深300"
    assert provenance.fallback_status == "fallback"
    assert "primary unavailable" in provenance.failure_reason

    unavailable, failed = load_benchmark_series(
        "科创50", lambda key: (_ for _ in ()).throw(RuntimeError("offline")),
        "沪深300", lambda key: (_ for _ in ()).throw(RuntimeError("offline too")),
    )
    assert unavailable.empty and not failed.available
    assert failed.fallback_status == "unavailable"
    assert "offline too" in failed.failure_reason


def test_akshare_adapter_maps_public_response_columns(monkeypatch):
    raw = pd.DataFrame({"净值日期": ["2025-01-02", "2025-01-01"],
                        "单位净值": ["1.2", "1.1"], "累计净值": ["1.4", "1.3"]})
    fake_ak = SimpleNamespace(fund_open_fund_info_em=lambda **kwargs: raw)
    monkeypatch.setitem(sys.modules, "akshare", fake_ak)
    monkeypatch.setattr(fund.importlib.util, "find_spec", lambda name: object())

    result = fund.fetch_nav_with_akshare("000001")

    assert result["date"].dt.strftime("%Y-%m-%d").tolist() == ["2025-01-01", "2025-01-02"]
    assert result["nav"].tolist() == [1.1, 1.2]
    assert result["acc_nav"].tolist() == [1.3, 1.4]


def test_akshare_adapter_rejects_unexpected_schema(monkeypatch):
    fake_ak = SimpleNamespace(fund_open_fund_info_em=lambda **kwargs: pd.DataFrame({"bad": [1]}))
    monkeypatch.setitem(sys.modules, "akshare", fake_ak)
    monkeypatch.setattr(fund.importlib.util, "find_spec", lambda name: object())
    with pytest.raises(ValueError, match="字段不符合预期"):
        fund.fetch_nav_with_akshare("000001")


def test_eastmoney_adapter_maps_response_fields_and_reports_http_failure(monkeypatch):
    monkeypatch.setattr(fund.time, "sleep", lambda seconds: None)
    raw = pd.DataFrame({"净值日期": ["2025-01-01"], "单位净值": ["1.25"], "累计净值": ["1.5"]})

    class Response:
        text = 'var x={content:"<table></table>",records:1,pages:1}'

        def raise_for_status(self):
            return None

    class Session:
        def __init__(self):
            self.headers = {}

        def get(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr(fund.requests, "Session", Session)
    monkeypatch.setattr(fund.pd, "read_html", lambda *args, **kwargs: [raw])
    parsed = fund.fetch_nav_with_eastmoney("000001")
    assert parsed["nav"].tolist() == [1.25]
    assert parsed["acc_nav"].tolist() == [1.5]

    class FailedSession(Session):
        def get(self, *args, **kwargs):
            raise RuntimeError("connection reset")

    monkeypatch.setattr(fund.requests, "Session", FailedSession)
    with pytest.raises(ValueError, match="东方财富请求失败"):
        fund.fetch_nav_with_eastmoney("000001")


def test_simulated_nav_never_requests_benchmark_and_comparison_is_unavailable(monkeypatch):
    monkeypatch.setattr(fund, "load_benchmark_history", lambda *args: pytest.fail("synthetic NAV must skip benchmark"))
    history = nav([1.0 + index * 0.001 for index in range(260)])
    monkeypatch.setattr(
        fund, "fetch_nav_history_with_provenance",
        lambda code: (history, DataProvenance("东方财富、AkShare", "模拟数据", "2025-09-17", "synthetic", "network offline")),
    )
    row = fund.analyze_fund({"code": "000001", "name": "合成测试基金"}, {}, 0)

    assert row["比较基准"] == "不可用"
    assert row["基准可用"] is False
    assert np.isnan(row["近1年基准收益率"])
    assert np.isnan(row["近1月超额收益率"])
    assert np.isnan(row["近1年超额收益率"])
    assert row["基准来源信息"]["fallback_status"] == "unavailable"


def test_offline_demo_mode_skips_external_data_sources(monkeypatch):
    monkeypatch.setenv("FUND_OFFLINE_DEMO", "true")
    monkeypatch.setattr(fund, "fetch_nav_history", lambda code: pytest.fail("network path called"))
    monkeypatch.setattr(fund, "load_benchmark_history", lambda *args: pytest.fail("benchmark path called"))

    holdings = fund.holdings_to_json([{"code": "006887", "name": "合成科技基金", "amount": 1000}])
    rows = fund.load_data.__wrapped__(0, holdings, "2026-05-28", False)

    assert len(rows) == 1
    assert rows[0]["数据来源"] == "模拟数据"
    assert "FUND_OFFLINE_DEMO" in rows[0]["错误信息"]

    backtest_nav, backtest_source, backtest_error = fund.load_nav_for_backtest.__wrapped__("006887")
    assert len(backtest_nav) >= 60
    assert backtest_source == "模拟数据"
    assert "FUND_OFFLINE_DEMO" in backtest_error


def test_reports_mark_synthetic_portfolio():
    row = {"基金名称": "合成基金", "代码": "000001", "基金类型": "科技", "比较基准": "沪深300",
           "最新净值日期": "2025-01-01", "单位净值": 1.0, "持仓快照日期": "2025-01-01",
           "近1月收益率": 1.0, "近3月收益率": 2.0, "近1年收益率": 2.0,
           "近1年基准收益率": 1.0, "近1月超额收益率": 0.3, "近1年超额收益率": 0.5,
           "近1年最大回撤": -3.0, "综合评分(0-10)": 5.0, "晨星评级": "三星",
           "数据来源": "模拟数据", "AI建议": "本地示例", "详细AI建议": "仅用于测试",
           "净值来源信息": {"requested_source": "东方财富、AkShare", "source": "模拟数据",
                            "data_date": "2025-01-01", "fallback_status": "synthetic",
                            "failure_reason": "接口不可用", "available": True},
           "基准来源信息": {"requested_source": "模拟净值不可比较", "source": "不可用",
                            "data_date": None, "fallback_status": "unavailable",
                            "failure_reason": "基金净值来自模拟数据", "available": False},
           "收益能力得分": 5.0, "风险控制得分": 6.0, "风险调整收益得分": 5.0,
           "稳定性得分": 5.0, "相对排名得分": 5.0,
           "当前持有金额": 100.0, "当前持有收益率": 1.0, "快照持有金额": 100.0,
           "持仓快照日期": "2025-01-01", "近1年夏普比率": 0.5, "近1年年化波动率": 1.0,
           "最大回撤修复天数": 5, "评分权重": {}, "评分方法": "test", "累计收益": 1.0,
           "快照持有收益率": 1.0, "快照累计收益": 1.0,
           "快照净值日期": "2025-01-01",
           "快照单位净值": 1.0, "持仓已自动更新": False, "持仓更新说明": "", "错误信息": "",
           "维度分数": {"收益能力": 5.0, "风险控制": 6.0, "风险调整收益": 5.0,
                       "稳定性": 5.0, "相对排名": 5.0}}
    assert "虚构合成示例" in fund.build_markdown_report([row])
    assert "虚构合成示例" in fund.build_html_report([row])
    markdown = fund.build_markdown_report([row])
    html = fund.build_html_report([row])
    assert "回退状态：synthetic" in markdown and "接口不可用" in markdown
    assert "数据日期：2025-01-01" in html and "unavailable" in html
    assert "虚构合成示例" not in fund.build_markdown_report([row], synthetic_portfolio=False)
