# AI 智选基金助手

**v0.2.0 · React + TypeScript · FastAPI · Python 3.12 · Node.js 24 · 本地单用户**

在线作品集展示页（无需安装即可查看两个项目的真实截图、验收证据与能力边界）：https://mahonghao1.github.io/Embodied-AI-Data-Processing-Platform/

把组合表现、风险指标、基金明细和数据来源放进一套本地分析工作台。Python 继续负责净值处理、指标计算与 AI 回退；浏览器只呈现本机 API 返回的分析结果。

![基金观察工作台：离线演示中的合成组合、收益风险视图和来源标签](docs/screenshots/app_v0.2.0.png)

> 截图于 2026-11-09 从 FastAPI 本地服务生成。持仓是虚构合成样例，净值标为模拟数据；由于区间不足一年，近一年收益明确显示为不可用，基准比较也不可用。截图仅展示界面和数据来源呈现。

[观看 7 秒工作台交互演示（WebM）](docs/screenshots/demo-v0.2.0.webm) · 使用离线合成数据，无真实账户或投资数据。

## 能力与验证

- **组合总览**：持仓金额、累计收益、基金数量、组合评分、结构图和可筛选持仓表。
- **绩效与风险**：收益、回撤、波动率和净值历史；缺失或样本不足的指标显示不可用，不用零值代替。
- **来源说明**：基金净值和基准分别记录来源、数据日期、回退状态与失败原因，并显示在页面和 Markdown / HTML 报告中。
- **Python 核心**：继续复用既有数据加载、净值标准化、风险计算、相对评分和 AI 文本生成逻辑。
- **本地 AI 回退**：无密钥时使用本地规则并显示模式与免责声明；有密钥时只随当前建议请求传递，不落盘、不写日志。
- **验证证据**：测试覆盖公开数据源响应和异常、无效净值、回退、收益与回撤、离线不联网、报告标识和 API 行为；前端包含单测与浏览器流程测试。

默认持仓是合成数据，不连接真实账户、不提交交易，也不提供投资建议。离线模拟净值只用于演示产品流程；任何图表、评分、收益数字或 AI 文本都不能视为投资结论。

## 本地启动

需要 Windows、Python 3.12、Node.js 24 LTS 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。克隆仓库后，在 PowerShell 执行：

```powershell
git clone https://github.com/MAHONGHAO1/AI-Fund-Management-Platform.git
cd AI-Fund-Management-Platform
py -3.12 -m pip install uv
uv sync --locked
Push-Location frontend
npm ci
npm run build
Pop-Location
$env:FUND_OFFLINE_DEMO = "true"
uv run --locked python -m fund_web
```

服务只监听本机。默认使用离线演示数据，确保合成持仓、模拟净值和不可用基准的展示可重复；启动后在浏览器打开 [http://127.0.0.1:8766](http://127.0.0.1:8766)。也可在安装好 Node.js 24 LTS 与 uv 后双击 `启动基金助手.cmd`；启动脚本会用 `npm ci` 安装锁定前端依赖、构建页面并启动 FastAPI。它不会自动打开浏览器。

如需开发热更新，可在一个终端运行 `uv run --locked python -m fund_web`，再在另一个终端运行：

```powershell
cd frontend
npm ci
npm run dev
```

Vite 开发页面地址为 `http://127.0.0.1:5173`，API 请求转发到本机 8766 端口。

### 离线作品演示

离线模式下，应用不请求公开净值数据源，页面会分别标记合成持仓和模拟净值；无 API Key 时继续使用本地建议回退。启动脚本默认打开该模式；手工启动后端时也应设置：

```powershell
$env:FUND_OFFLINE_DEMO = "true"
.\启动基金助手.cmd
```

若要检查公开数据源及其回退流程，把变量设为 `false` 后再启动。该设置只影响当前终端启动的进程。

## 测试与锁定依赖

使用与 GitHub Actions 相同的 Python 3.12、Node.js 24 和锁定文件：

```powershell
uv sync --locked
uv run --locked python -m pytest -q
Push-Location frontend
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run build
Pop-Location
```

本机验收环境为 Python 3.12.10 / Node.js 24.15.0；Python 测试 19 项通过，前端单测与浏览器关键流程通过，`npm ci` 安全审计为 0 项漏洞。CI 使用合成响应，不依赖外网基金数据。

## 架构

```mermaid
flowchart LR
  UI[React + TypeScript 工作台] -->|同源 /api| API[FastAPI · 127.0.0.1:8766]
  API --> CORE[Python 分析服务]
  CORE --> DATA[东方财富 / AkShare / 离线合成数据]
  CORE --> METRICS[收益、回撤、风险与相对评分]
  CORE --> AI[当前请求的 AI 文本或本地回退]
  CORE --> REPORT[Markdown / HTML 报告]
```

## 文档与发布状态

- [数据来源与计算状态](docs/STATUS_v0.2.0.md)
- [v0.2.0 发布说明](RELEASE_NOTES_v0.2.0.md)
- [变更记录](CHANGELOG.md)

v0.2.0 已合并到 `main` 并发布为 [GitHub Release](https://github.com/MAHONGHAO1/AI-Fund-Management-Platform/releases/tag/v0.2.0)；两个项目的在线展示见[作品集展示页](https://mahonghao1.github.io/Embodied-AI-Data-Processing-Platform/)。

## English

A local portfolio analytics demo with a React and TypeScript frontend, a loopback-only FastAPI bridge, and Python analysis logic. It records NAV and benchmark provenance, labels synthetic holdings and simulated NAV, and keeps benchmark comparisons unavailable when the data does not support them. No account connection, trading, or investment advice is provided.
