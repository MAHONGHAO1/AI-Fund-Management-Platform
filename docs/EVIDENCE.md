# 证据总表 · v0.6.0

本文件是 README 中版本、测试数量和验证范围的统一出处。数字只写在这一处；README 只负责指向这里。

最后更新：2026-11-19。环境：Windows 11、Python 3.12.10、Node.js 24、本地单用户。

## 1. 版本链

| 位置 | 值 | 校验方式 |
| --- | --- | --- |
| README 版本行 | 0.6.0 | `tests/test_version_consistency.py` |
| README release 徽章 | 0.6.0 | 同上 |
| `pyproject.toml` | 0.6.0 | 同上 |
| `fund_web.py` FastAPI | 0.6.0 | 同上 |
| `frontend/package.json` | 0.6.0 | 同上 |
| `frontend/src/App.tsx` 版本条 | 0.6.0 | 同上 |
| `RELEASE_NOTES_v0.6.0.md` | 存在 | 同上 |

## 2. 自动化测试

```powershell
uv sync --locked
uv run --locked python -m pytest -q
uv run --locked python scripts/verify_offline_fixtures.py
Push-Location frontend
npm ci
npm test -- --run
npx playwright install chromium
npm run test:e2e
Pop-Location
```

本机本轮结果：

| 套件 | 结果 |
| --- | --- |
| Python（`pytest -q`） | **57 passed** |
| 断网冻结样本验收 | **通过：10 只基金 / HTTP 调用 0 次** |
| 前端单测（Vitest） | **9 passed** |
| 浏览器流程（Playwright，Chromium） | **3 passed** |
| 生产构建（`npm run build`） | 通过 |

Python 测试覆盖：公开数据源成功 / 失败 / 回退、无效净值、收益与回撤区间口径、模拟数据不算指标、离线模式不联网、冻结样本哈希校验、冻结样本缺失回退、报告标识、API 契约、AI 边界、版本一致性。前端新增 `history.test.ts`，覆盖基金与基准按日期对齐、各自归一化到起点=100，以及缺失或零起点不造数。净值走势图在 v0.6.0 之后修正了这一比例问题，尚未随新版本发布。

五分钟复现命令与预期输出见 [REPRODUCTION.md](REPRODUCTION.md)。

CI 在 `ubuntu-latest` 上运行 Python 测试与断网冻结样本验收；前端在 Node.js 24 上运行单测、构建和 Chromium 流程。浏览器流程中的冻结样本与失败恢复使用路由 mock，不代表真实后端全链路 E2E；真实 Python 路径由 `verify_offline_fixtures.py` 单独验证。

本分支实际 CI：[tests #26](https://github.com/MAHONGHAO1/AI-Fund-Management-Platform/actions/runs/44324559104)、合并后的 [main tests #29](https://github.com/MAHONGHAO1/AI-Fund-Management-Platform/actions/runs/44325504684) 与图表修复后的 [main tests #32](https://github.com/MAHONGHAO1/AI-Fund-Management-Platform/actions/runs/44455631467) 均通过，`frontend-tests` 与 `python-tests` 两个 job 均为 success，含 `Verify offline fixtures without network` 步骤。CI 只证明该次提交在这些 job 上通过，不替代本机结果或真实后端链路。`v0.6.0` tag 指向 `4a38c26`；图表归一化修复在 `af148f6` 上，属于 tag 之后的未发布变更。

## 3. 数据与截图来源

- 持仓是**虚构合成样例**，不连接真实账户。
- 默认离线演示读取 `fixtures/nav/` 与 `fixtures/benchmarks/` 的公开净值快照：10 只基金 / 9,943 行，5 个基准 / 6,097 行，15 个文件 / 1,124,931 字节；快照日期 2026-11-16 至 2026-11-18。它是公开数据的带日期快照，**不是实时行情**。
- 每个样本读取时校验规范行哈希；被改动的样本会失败关闭。样本缺失时才退回合成净值，并明确标记 `synthetic`。
- `docs/screenshots/app_v0.6.0.png` 来自本机 FastAPI 离线演示服务的 1920×1080 截图，不是设计稿；组合图显示「本地冻结样本」与数据日期。`app_main-analysis.png` 来自 v0.6.0 之后的 `main`，显示归一化到起点=100 的净值走势；该修复尚未随新版本发布。`app_v0.3.0.png` 与 `app_v0.3.0-analysis.png` 保留作迭代对照。
- v0.2.x 截图与 WebM 对应旧长页布局，保留作迭代对照。
- 公开数据源回退路径有自动化测试与留痕字段；**没有真实历史故障记录**，不宣称经历过生产级数据源事故。

## 4. AI 层

AI 是可选文字解释层，不参与选基、评分和指标计算。两道输出校验：

1. 引用的收益率、超额收益、回撤、波动率必须与当前表格一致（容差 0.35 个百分点）。
2. 不得出现 28 个交易指令词，也不得出现「建议持有 / 配置 / 投入 / 赎回 / 申购」「建议仓位提高到 N%」等模式。

任一条件不满足，整段回退本地模板。测试在 `tests/test_fund_ai_layer.py` 逐个遍历声明的交易词，并验证边界语句不误伤；边界与失败路径见 [AI_LAYER.md](AI_LAYER.md)。这不是模型质量评测，也不构成投资收益证明。

## 5. 未验证 / 不宣称

- 不宣称公网多用户可用；服务只监听 loopback，单用户。
- 不宣称真实账户收益、交易执行或投资建议能力。
- 不宣称大模型输出的稳定性或事实正确性；只保证上述两条硬边界和回退路径。
- 没有真实券商账户、真实持仓或历史故障库；合成持仓不能外推为真实组合表现。
- 冻结样本会过期，`as_of` 是数据日期，不是当前市场状态；不宣称它代表实时行情或未来收益。
- 浏览器流程使用路由 mock 覆盖界面状态；真实后端路径由 Python 断网验收覆盖，两者不能互相替代。
- 没有做移动端真机测试；浏览器流程在 Chromium 桌面视口运行。
- 外部复现记录为 **0 条**，见 [FEEDBACK.md](FEEDBACK.md)；陌生环境能否跑通仍未被外部验证。
