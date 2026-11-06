# AI 智选基金助手

**本地运行的基金数据分析与组合演示工具 · v0.1.0**

本项目将公开净值数据、风险收益指标、基金池相对评分与 AI 文本解释放在一个 Streamlit 页面中，适合作为个人产品工程展示。默认持仓为醒目标注的虚构合成组合；数据源全部不可用时会转为模拟净值，无密钥时 AI 建议使用本地规则。

> This local Streamlit app combines public fund NAV data, risk and return metrics, relative scoring, and AI generated explanations. Its default portfolio is synthetic and clearly labeled. It is an engineering demonstration, not investment advice or a trading system.

## 能力与验证

- 东方财富与 AkShare 净值数据源；失败后显示模拟数据来源和错误原因。
- 净值合理性检查、收益率、最大回撤、风险调整指标和五维基金池评分。
- 会话级 GLM / DashScope Key；不配置 Key 时使用带免责声明的本地建议。
- 持仓只保存在当前会话；Markdown 和 HTML 报告对虚构组合与模拟净值分别标记。
- 自动化测试覆盖持仓归一化、净值拒绝规则、收益与回撤、评分回退、数据源失败、无密钥 AI 和报告标识。

数据来自公开接口，服务可用性和字段会变化。模拟净值只验证产品流程，任何评分、历史表现和 AI 文本都不构成投资建议。

## 本地启动

需要 Python 3.12。Windows PowerShell 示例：

```powershell
git clone https://github.com/MAHONGHAO1/AI-Fund-Management-Platform.git
cd AI-Fund-Management-Platform
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
streamlit run ai_investment_advisor.py
```

macOS / Linux 可将虚拟环境激活命令换成 `source .venv/bin/activate`。应用默认监听本机 `localhost:8501`。运行测试：

```bash
pip install pytest
python -m pytest -q
```

可在侧栏设置中临时输入 GLM 或 DashScope Key。Key 仅留在当前 Streamlit 会话中；不要提交 `.env`、Secrets 或密钥文件。

## 展示边界

展示图表和报告时，先确认数据来源标签。示例持仓是合成数据，接口故障时的净值是模拟数据，二者用途不同。仓库不保存真实账户、不提交交易，也不提供公开在线交互服务。

## 版本

- [变更记录](CHANGELOG.md)
- [v0.1.0 Release Notes](RELEASE_NOTES_v0.1.0.md)

## English

A local portfolio analysis demo built with Streamlit. It uses public NAV sources with an explicit mock-data fallback, portfolio metrics, relative scoring, and optional session-only AI keys. The bundled holdings are synthetic. No account connection, trading, or investment advice is provided.
