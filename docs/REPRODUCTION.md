# 五分钟复现（外部验证用）

这份页面的目标只有一个：让第一次接触仓库的人，在**不联网、不接真实账户**的情况下，判断它能不能在自己机器上跑起来。反馈请按 [FEEDBACK.md](FEEDBACK.md) 记录；失败同样有效。

## 先决条件

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Node.js 24（只在跑前端时需要）

## Tier 1 · Python 与断网验收（约 2 分钟）

```bash
git clone https://github.com/MAHONGHAO1/AI-Fund-Management-Platform.git
cd AI-Fund-Management-Platform
uv sync --locked
uv run --locked python -m pytest -q
uv run --locked python scripts/verify_offline_fixtures.py --output work/offline-fixture-verification.json
```

期望结果：

- `pytest` 输出 `61 passed`；
- 断网验收输出 `"passed": true`、`"funds": 10`，HTTP 调用 0 次；
- 10 只基金都标记为「本地冻结样本」，指标与基准可用；报告同时披露冻结快照和虚构合成持仓。

脚本在进程内把 `requests.get` 与 `requests.Session` 替换为立即失败的函数，因此这里的“0 次”是执行时强制断网的结果，不是“没看到请求”。

## Tier 2 · 前端（约 3 分钟）

```bash
cd frontend
npm ci
npm test -- --run
npm run build
```

期望结果：`9 passed`，生产构建成功。想跑浏览器流程：

```bash
npx playwright install chromium
npm run test:e2e
```

期望 `3 passed`。浏览器流程使用路由 mock 覆盖界面状态，不等于真实后端全链路 E2E；真实 Python 路径由 Tier 1 的断网验收覆盖。

## Tier 3 · 本机服务（可选）

Windows PowerShell：

```powershell
$env:FUND_OFFLINE_DEMO='1'
uv run --locked python -m fund_web
```

macOS / Linux：

```bash
FUND_OFFLINE_DEMO=1 uv run --locked python -m fund_web
```

打开 [http://127.0.0.1:8766/](http://127.0.0.1:8766/)，应看到：

- 顶部「离线演示 · 虚构合成组合」；
- 侧栏「本地冻结样本 10」和数据日期；
- 表格来源列显示「本地冻结样本」，回退状态写明「本地冻结样本（非实时）」；
- 某只基金的绩效页显示归一化净值走势（起点=100），基金与基准都可见。

这是本机单用户、loopback 服务；不连接券商、不执行交易、不提供投资建议。

## 反馈时请只写可核对的事实

1. 操作系统、Python / Node.js / uv 版本；
2. 执行了哪一条命令（Tier 1 / Tier 2 / Tier 3）；
3. 成功还是失败；失败请贴完整报错，不要只写摘要；
4. 耗时；
5. 是否成功启动服务，界面显示的版本与数据日期。

不需要真实姓名或账号。记录规则见 [FEEDBACK.md](FEEDBACK.md)。
