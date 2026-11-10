# v0.2.0 状态

更新日期：2026-11-10。状态：v0.2.0 已发布，PR #1 已合并到 `main`，GitHub Release 已创建。

## 已实现

- 净值与基准来源分别记录来源名称、数据日期、回退状态和失败原因。
- 模拟净值不触发基准请求，基准收益与超额收益保持不可用；Markdown / HTML 报告保留来源证据和模拟数据说明。
- React + TypeScript + Vite 前端由 FastAPI 同源本地服务托管，Python 继续负责数据加载、标准化、计算与 AI 回退；旧 Streamlit 入口保留。
- 组合总览、绩效与风险、基金明细和数据来源界面分别显示合成持仓、模拟净值和比较基准可用性。
- API Key 只在当前页面内存和当前建议请求中使用，不写入配置、缓存或日志。
- `uv.lock` 与 `package-lock.json` 锁定依赖；CI 使用 Python 3.12 和 Node.js 24，并运行 Python、前端单测、Chromium 浏览器流程及生产构建。
- 测试覆盖公开源字段与异常、无效净值、基准回退、离线不联网、收益回撤、报告来源、API 和合成组合关键流程。
- 前端保留 API 返回的 `null` 指标为不可用；无完整一年区间时显示说明，不会把空值渲染成 `0.00%`。

## 本机验收

- 环境：Windows、Python 3.12.10、Node.js 24.15.0、uv 0.12.3。
- Python 全套测试：19 passed；`uv lock --check` 通过。
- 前端：干净执行 `npm ci`、2 项单测、浏览器流程与生产构建通过；新增回归测试确认 null 年收益显示为不可用。
- FastAPI：离线合成模式下健康检查通过，返回 10 条合成持仓和模拟净值，页面由 `127.0.0.1:8766` 实际托管。
- README 截图和 WebM 来自上述服务的 Chromium 实际运行页面，已核对合成组合提示、模拟数据标签、不可用年收益和不可用基准说明。

## 发布前检查

```powershell
uv lock --check
uv run --locked python -m pytest -q
Push-Location frontend
npm ci
npm test
npm run test:e2e
npm run build
Pop-Location
```

公开净值接口的实时可用性仍取决于上游服务，不由离线测试证明。合成持仓、模拟净值和本地 AI 回退必须继续清晰标注。PR、合并和正式 Release 仍按审阅流程处理。
