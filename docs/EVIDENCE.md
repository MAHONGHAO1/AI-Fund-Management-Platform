# 证据总表 · v0.5.0

本文件是 README 中版本、测试数量和验证范围的统一出处。数字只写在这一处；README 只负责指向这里。

最后更新：2026-11-18。环境：Windows 11、Python 3.12.10、Node.js 24、本地单用户。

## 1. 版本链

| 位置 | 值 | 校验方式 |
| --- | --- | --- |
| README 版本行 | 0.5.0 | `tests/test_version_consistency.py` |
| README release 徽章 | 0.5.0 | 同上 |
| `pyproject.toml` | 0.5.0 | 同上 |
| `fund_web.py` FastAPI | 0.5.0 | 同上 |
| `frontend/package.json` | 0.5.0 | 同上 |
| `frontend/src/App.tsx` 版本条 | 0.5.0 | 同上 |
| `RELEASE_NOTES_v0.5.0.md` | 存在 | 同上 |

## 2. 自动化测试

```powershell
uv sync --locked
uv run --locked python -m pytest -q
Push-Location frontend
npm ci
npm test
npx playwright install chromium
npm run test:e2e
Pop-Location
```

本机本轮结果：

| 套件 | 结果 |
| --- | --- |
| Python（`pytest -q`） | **47 passed** |
| 前端单测（Vitest） | **7 passed** |
| 浏览器关键流程（Playwright，Chromium） | **1 passed** |
| 生产构建（`npm run build`） | 通过 |

Python 测试覆盖：公开数据源成功 / 失败 / 回退、无效净值、收益与回撤区间口径、模拟数据不算指标、离线模式不联网、报告标识、API 契约、AI 边界、版本一致性。

CI 在 `ubuntu-latest` 上运行 Python 测试，前端在 Node.js 24 上运行单测、构建和 Chromium 流程；CI 使用合成响应，不依赖外网基金数据。

## 3. 数据与截图来源

- 持仓是**虚构合成样例**，不连接真实账户。
- 默认离线演示使用模拟净值；模拟净值不参与收益、回撤、波动率和评分计算，界面显示「不可用」。
- `docs/screenshots/app_v0.3.0.png` 与 `app_v0.3.0-analysis.png` 来自本机 FastAPI 服务（`127.0.0.1:8766`）的 1920×1080 截图，不是设计稿。
- v0.2.x 截图与 WebM 对应旧长页布局，保留作迭代对照。
- 公开数据源回退路径有自动化测试与留痕字段；**没有真实历史故障记录**，不宣称经历过生产级数据源事故。

## 4. AI 层

AI 是可选文字解释层，不参与选基、评分和指标计算。两道输出校验：

1. 引用的收益率、超额收益、回撤、波动率必须与当前表格一致（容差 0.35 个百分点）。
2. 不得出现买入、卖出、加仓、减仓、止盈、止损、清仓、目标价等交易指令词。

任一条件不满足，整段回退本地模板。四个固定用例在 `tests/test_fund_ai_layer.py`，边界与失败路径见 [AI_LAYER.md](AI_LAYER.md)。这不是模型质量评测，也不构成投资收益证明。

## 5. 未验证 / 不宣称

- 不宣称公网多用户可用；服务只监听 loopback，单用户。
- 不宣称真实账户收益、交易执行或投资建议能力。
- 不宣称大模型输出的稳定性或事实正确性；只保证上述两条硬边界和回退路径。
- 没有真实券商账户、真实持仓或历史故障库；合成持仓不能外推为真实组合表现。
- 没有做移动端真机测试；浏览器流程在 Chromium 桌面视口运行。
