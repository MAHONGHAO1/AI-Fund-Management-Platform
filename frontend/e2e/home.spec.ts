import { expect, test } from '@playwright/test';

test('fund dashboard identifies its sample holdings', async ({ page }) => {
  await page.route('**/api/portfolio', (route) => route.fulfill({ json: { holdings: [], synthetic: true, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 } }));
  await page.route('**/api/analysis', (route) => route.fulfill({ json: { rows: [{ 基金名称: '演示科技基金', 代码: '000001', 基金类型: '股票型', 数据来源: '模拟数据', 最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 25, '综合评分(0-10)': 6.5, 近1年收益率: 3.2, 近1年最大回撤: -5.1, 基准可用: false }], summary: { fund_count: 1, total_amount: 1000, total_profit: 25, average_score: 6.5, source_counts: { 模拟数据: 1 }, as_of: '2026-01-01' } } }));
  await page.route('**/api/funds/000001/history**', (route) => route.fulfill({ json: { code: '000001', fund_name: '演示科技基金', nav: [{ date: '2026-01-01', nav: 1 }], benchmark: [], nav_provenance: { source: '模拟数据', data_date: '2026-01-01' }, benchmark_provenance: { source: '不可用', available: false }, benchmark_available: false } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '组合概览' })).toBeVisible();
  await expect(page.getByText('当前组合为虚构合成示例')).toBeVisible();
  await expect(page.getByText('演示科技基金')).toBeVisible();
  await page.getByRole('button', { name: '绩效分析' }).click();
  await expect(page.getByRole('heading', { name: '收益与风险' })).toBeVisible();
  await expect(page.getByText('模拟净值或基准源不可用')).toBeVisible();
  await expect(page.getByText('模拟数据').first()).toBeVisible();
});
