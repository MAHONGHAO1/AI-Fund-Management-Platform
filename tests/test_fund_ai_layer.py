"""The AI layer may explain metrics, but it must not become a trading signal."""

from __future__ import annotations

import ai_investment_advisor as advisor


ROW = {
    "基金名称": "测试基金",
    "代码": "000001",
    "近1月收益率": 2.0,
    "近3月收益率": 4.0,
    "近1年收益率": 12.0,
    "近1年基准收益率": 8.0,
    "近1年超额收益率": 4.0,
    "近1年最大回撤": -8.0,
    "近1年年化波动率": 15.0,
    "最大回撤修复天数": 30,
    "近1年夏普比率": 0.8,
    "综合评分(0-10)": 7.2,
    "晨星评级": "四星",
    "当前持有收益率": 5.0,
}


def test_local_fallback_describes_data_without_trade_instructions() -> None:
    short = advisor.mock_short_advice("测试基金", 12.0, -8.0, 5.0)
    detail = advisor.mock_detailed_advice(ROW)
    text = f"{short}\n{detail}"

    assert advisor.advice_respects_boundaries(text)
    assert advisor.advice_numbers_are_consistent(text, ROW)
    assert advisor.AI_DISCLAIMER in advisor.ensure_ai_disclaimer(detail)


def test_all_declared_trade_terms_fall_back() -> None:
    import pytest

    fallback_short = advisor.mock_short_advice("测试基金", 12.0, -8.0, 5.0)
    fallback_detail = advisor.mock_detailed_advice(ROW)
    cases = [f"建议{term}。" for term in advisor.TRADE_INSTRUCTION_TERMS]
    cases += ["建议持有该基金。", "建议将仓位提高到 80%。", "可以考虑赎回一半。"]
    for text in cases:
        short, detail = advisor.validated_advice(
            text, text, ROW, fallback_short, fallback_detail, notify=False
        )
        assert short == fallback_short, text
        assert advisor.AI_DISCLAIMER in detail


def test_benign_boundary_language_is_not_a_trade_instruction() -> None:
    assert advisor.advice_respects_boundaries("本说明不构成买卖指令，也不提供交易方向。")
    assert not advisor.advice_respects_boundaries("建议将仓位提高到 80%。")


def test_ai_text_with_trade_instruction_falls_back() -> None:
    fallback_short = advisor.mock_short_advice("测试基金", 12.0, -8.0, 5.0)
    fallback_detail = advisor.mock_detailed_advice(ROW)
    short, detail = advisor.validated_advice(
        "建议卖出 30% 仓位。",
        "近1年收益率为 12.0%，最大回撤为 -8.0%。建议卖出 30%。",
        ROW,
        fallback_short,
        fallback_detail,
        notify=False,
    )

    assert short == fallback_short
    assert advisor.AI_DISCLAIMER in detail


def test_ai_text_with_metric_mismatch_falls_back() -> None:
    fallback_short = advisor.mock_short_advice("测试基金", 12.0, -8.0, 5.0)
    fallback_detail = advisor.mock_detailed_advice(ROW)
    short, detail = advisor.validated_advice(
        "近1年收益率为 99.0%。",
        "近1年收益率为 99.0%，最大回撤为 -8.0%。",
        ROW,
        fallback_short,
        fallback_detail,
        notify=False,
    )

    assert short == fallback_short
    assert advisor.AI_DISCLAIMER in detail


def test_ai_text_with_consistent_metrics_is_kept_and_disclaimed() -> None:
    short, detail = advisor.validated_advice(
        "近1年收益率为 12.0%。",
        "近1年收益率为 12.0%，最大回撤为 -8.0%。",
        ROW,
        "fallback",
        "fallback detail",
        notify=False,
    )

    assert short == "近1年收益率为 12.0%。"
    assert "近1年收益率为 12.0%" in detail
    assert advisor.AI_DISCLAIMER in detail
