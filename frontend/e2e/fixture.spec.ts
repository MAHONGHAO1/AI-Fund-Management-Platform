import { expect, test } from '@playwright/test';

const portfolio = {
  holdings: [{ code: '006887', name: '诺德新生活混合A', amount: 1000, hold_ret: 5.2, cum_profit: 49.5 }],
  synthetic: true,
  snapshot_date: '2026-05-28',
  auto_update_holdings: false,
  refresh_token: 0,
};

const provenance = {
  requested_source: '东方财富（冻结）',
  source: '本地冻结样本',
  data_date: '2026-11-17',
  fallback_status: 'fixture',
  failure_reason: 'FUND_OFFLINE_DEMO 已启用：使用冻结的公开数据快照，非实时行情。',
  available: true,
};

const row = {
  基金名称: '诺德新生活混合A', 代码: '006887', 基金类型: '混合型', 数据来源: '本地冻结样本',
  最新净值日期: '2026-11-17', 当前持有金额: 1000, 累计收益: 49.5, 指标可用: true,
  '综合评分(0-10)': 7.4, 近1年收益率: 12.34, 近1年最大回撤: -8.1, 近1年年化波动率: 15.2,
  近1月收益率: 2.1, 近3月收益率: 4.2, 近1年夏普比率: 0.92, 基准可用: true, 比较基准: '沪深300',
  净值来源信息: provenance, 基准来源信息: provenance,
};

const history = {
  code: '006887', fund_name: '诺德新生活混合A',
  nav: [{ date: '2026-09-01', nav: 1.2 }, { date: '2026-10-01', nav: 1.25 }, { date: '2026-11-17', nav: 1.34 }],
  benchmark: [{ date: '2026-09-01', nav: 4.2 }, { date: '2026-10-01', nav: 4.3 }, { date: '2026-11-17', nav: 4.4 }],
  nav_provenance: provenance, benchmark_provenance: provenance,
  benchmark_available: true, synthetic: false, metrics_available: true,
  requested_days: 365, available_days: 1826, coverage_start: '2021-11-18', coverage_end: '2026-11-17',
  truncated: false, history_capped: false, lookback_days: 410,
};

test('frozen NAV fixture is shown as dated non-live data', async ({ page }) => {
  await page.route('**/api/portfolio', (route) => route.fulfill({ json: portfolio }));
  await page.route('**/api/analysis', (route) => route.fulfill({ json: {
    rows: [row],
    summary: { fund_count: 1, total_amount: 1000, total_profit: 49.5, average_score: 7.4,
      source_counts: { 本地冻结样本: 1 }, as_of: '2026-11-17' },
  } }));
  await page.route('**/api/funds/006887/history**', (route) => route.fulfill({ json: history }));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '组合概览' })).toBeVisible();
  await expect(page.getByText('当前组合为虚构合成示例')).toBeVisible();
  await expect(page.getByText('本地冻结样本', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('+12.34%').first()).toBeVisible();
  // 冻结样本不能落入「模拟数据」的指标禁用文案。
  await expect(page.getByText('模拟净值不计算收益')).toHaveCount(0);

  await page.getByRole('button', { name: '绩效分析' }).click();
  await expect(page.getByRole('heading', { name: '收益与风险' })).toBeVisible();
  await expect(page.getByText('净值来源：本地冻结样本 · 2026-11-17')).toBeVisible();
  await expect(page.getByText('本地冻结样本（非实时）').first()).toBeVisible();
  await expect(page.getByText('模拟净值不计算收益')).toHaveCount(0);
});

test('analysis failure is recoverable without a page reload', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/portfolio', (route) => route.fulfill({ json: portfolio }));
  await page.route('**/api/analysis', (route) => {
    attempts += 1;
    // React StrictMode may mount the effect twice in dev; fail both initial reads,
    // then succeed only after the explicit retry action.
    if (attempts <= 2) return route.fulfill({ status: 503, json: { detail: '数据分析暂不可用：冻结样本读取失败' } });
    return route.fulfill({ json: {
      rows: [row],
      summary: { fund_count: 1, total_amount: 1000, total_profit: 49.5, average_score: 7.4,
        source_counts: { 本地冻结样本: 1 }, as_of: '2026-11-17' },
    } });
  });
  await page.route('**/api/funds/006887/history**', (route) => route.fulfill({ json: history }));
  await page.goto('/');

  await expect(page.getByText(/数据分析暂不可用/)).toBeVisible();
  await page.getByRole('button', { name: '重新读取' }).click();
  await expect(page.getByText('诺德新生活混合A', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/数据分析暂不可用/)).toHaveCount(0);
});
