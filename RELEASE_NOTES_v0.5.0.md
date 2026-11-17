# v0.5.0 · 命名、版本链与 AI 边界收口

**这一版不加基金功能。** 修的是「同一件事在不同地方有不同名字和不同数字」——产品叫「AI 智选基金助手」、界面叫「基金观察」、API 叫「AI Fund」；README 一处写 41 项测试，另一处写 34 项。面试官只要打开两个文件就能看见这些裂缝，先把它们补上。

## 产品命名

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| README 标题 | 基金观察 · AI 智选基金助手 | **基金观察 · Fund Lens** |
| FastAPI 标题 / 健康检查 | AI Fund local workbench / AI 智选基金助手 | Fund Lens local workbench / 基金观察 · Fund Lens |
| 旧 Streamlit 入口 | AI 智选基金助手 | 基金观察 · Fund Lens（旧版 Streamlit，明确冻结） |
| 前端 | 已使用基金观察 | 保持，版本号同步到 0.5.0 |

「AI 智选」这个名字承诺了产品没有做的事：AI 不选基、不排序、不改评分，只把已经算好的指标改写成一段说明。继续用这个名字，等于把最容易被追问的部分主动放到标题里。

## 版本链

README、`pyproject.toml`、`fund_web.py`、`frontend/package.json`、`frontend/src/App.tsx` 和发布说明统一到 **0.5.0**。新增 `tests/test_version_consistency.py`，任一位置漂移或缺少对应发布说明都会失败。

## AI 边界

- 本地模板不再给出「卖出 20%-30%」「止损清仓」「分批止盈」这类交易指令，改为描述历史指标并明确说明不构成操作理由。
- 模型提示词改为「数据解释」而非「投资建议」，禁止预测未来走势和给出买卖比例、目标价、择时判断。
- 新增输出校验：出现交易指令词，或引用的收益率 / 回撤 / 波动率与表格不一致，整段回退本地模板。
- 新增 `tests/test_fund_ai_layer.py` 四个固定用例，覆盖本地模板边界、交易指令拦截、数值不一致拦截、合规文本保留。

## 一个真实的启动缺陷

`ai_investment_advisor.py` 在模块导入时调用 `bootstrap_streamlit()`：任何 `import` 都会递归启动一个 Streamlit 服务并开始抓取真实净值，测试收集阶段因此挂起。现在只在 `if __name__ == "__main__"` 下引导，导入恢复为无副作用；旧 Streamlit 直接运行的行为不变。

## 验证

| 项 | 结果 |
| --- | --- |
| 后端 | **47 passed / exit 0**（Python 3.12.10） |
| 前端单测 | **7 passed / exit 0**（Node.js 24） |
| 浏览器关键流程 | **1 passed / exit 0** |
| 版本一致性 | README / pyproject / FastAPI / package.json / App.tsx 全部 0.5.0 |
| 离线模式 | 不发起公开数据源请求 |

完整命令、环境与本轮边界见 [docs/EVIDENCE.md](docs/EVIDENCE.md)。本版仍只监听 `127.0.0.1`，不连接真实账户、不执行交易，也不宣称任何投资收益。
