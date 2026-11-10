import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
vi.mock('./Chart', () => ({ default: () => <div data-testid="chart" /> }));
import App from './App';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Fund dashboard', () => {
  it('marks the example portfolio as synthetic and shows portfolio metrics', async () => {
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '模拟数据', 最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 25, '综合评分(0-10)': 6.5, 近1年收益率: 3, 近1年最大回撤: -5, 基准可用: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio') ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: true, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 }
        : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 25, average_score: 6.5, source_counts: { 模拟数据: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByText('当前组合为虚构合成示例')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '组合概览' })).toBeInTheDocument();
  });

  it('keeps unavailable annual returns unavailable in the table and chart', async () => {
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '模拟数据', 最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 25, '综合评分(0-10)': 6.5, 近1年收益率: null, 近1年最大回撤: null, 基准可用: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio') ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: true, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 }
        : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 25, average_score: 6.5, source_counts: { 模拟数据: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByRole('status')).toHaveTextContent('近一年收益不可用');
    const dataRow = screen.getAllByRole('row')[1];
    expect(dataRow.children[3]).toHaveTextContent('不可用');
  });
});
