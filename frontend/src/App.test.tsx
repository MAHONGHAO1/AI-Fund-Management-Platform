import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('区间收益跟随所选区间，而不是永远显示近一年', async () => {
    window.history.replaceState(null, '', '/?view=analysis&fund=000001');
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '东方财富',
      最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 25, '综合评分(0-10)': 6.5, 指标可用: true,
      近1月收益率: 2.5, 近3月收益率: 5, 近1年收益率: 12.5, 近1年最大回撤: -5, 基准可用: false }];
    const buildHistory = (days: number, firstNav: number, lastNav: number) => ({
      code: '000001', fund_name: '示例基金',
      nav: [{ date: '2025-01-01', nav: firstNav }, { date: '2026-01-01', nav: lastNav }],
      benchmark: [], nav_provenance: { source: '东方财富', data_date: '2026-01-01' },
      benchmark_provenance: { source: '不可用' }, benchmark_available: false,
      synthetic: false, metrics_available: true,
      requested_days: days, available_days: 3650, coverage_start: '2016-01-01', coverage_end: '2026-01-01', truncated: false,
    });
    // 每个区间返回不同的净值跨度：只有真按区间算，数字才会不一样。
    const navByDays: Record<string, [number, number]> = { '30': [1.0, 1.05], '90': [1.0, 1.08], '365': [1.0, 1.1], '1095': [1.0, 1.2], '0': [1.0, 1.5] };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const days = new URL(url, 'http://127.0.0.1').searchParams.get('days') ?? '365';
      const spans = navByDays[days] ?? navByDays['365'];
      const body = url.endsWith('/api/portfolio')
        ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: true, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 }
        : url.includes('/history')
          ? buildHistory(Number(days), spans[0], spans[1])
          : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 25, average_score: 6.5, source_counts: { 东方财富: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByText('近 1 年收益')).toBeInTheDocument();
    expect(await screen.findByText('+10.00%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '近 1 月' }));
    expect(await screen.findByText('近 1 月收益')).toBeInTheDocument();
    expect(await screen.findByText('+5.00%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '近 3 年' }));
    expect(await screen.findByText('近 3 年收益')).toBeInTheDocument();
    expect(await screen.findByText('+20.00%')).toBeInTheDocument();
  });

  it('模拟净值下四个指标全部显示不可用，不由前端自行计算收益', async () => {
    window.history.replaceState(null, '', '/?view=analysis&fund=000001');
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '模拟数据',
      最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 0, '综合评分(0-10)': null, 指标可用: false,
      近1年收益率: null, 近1年最大回撤: null, 近1年年化波动率: null, 基准可用: false }];
    const history = {
      code: '000001', fund_name: '示例基金',
      // 即便净值序列本身长得像能算出 +21.30%，也不允许前端自己算。
      nav: [{ date: '2025-01-01', nav: 1.0 }, { date: '2026-01-01', nav: 1.213 }],
      benchmark: [], nav_provenance: { source: '模拟数据', data_date: '2026-01-01' },
      benchmark_provenance: { source: '不可用' }, benchmark_available: false,
      synthetic: true, metrics_available: false,
      requested_days: 365, available_days: 365, coverage_start: '2025-01-01', coverage_end: '2026-01-01', truncated: false,
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio')
        ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: false, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 1 }
        : url.includes('/history')
          ? history
          : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 0, average_score: null, source_counts: { 模拟数据: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByText('近 1 年收益')).toBeInTheDocument();
    expect(await screen.findByText('模拟净值不计算收益')).toBeInTheDocument();
    expect(screen.queryByText('+21.30%')).not.toBeInTheDocument();
    expect(screen.getByText('模拟净值不计算回撤')).toBeInTheDocument();
    expect(screen.getByText('模拟净值不计算波动率')).toBeInTheDocument();
  });

  it('真实组合里出现模拟净值时仍然给出提示', async () => {    window.history.replaceState(null, '', '/?view=portfolio');
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '模拟数据',
      最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 0, '综合评分(0-10)': null,
      近1年收益率: null, 近1年最大回撤: null, 基准可用: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio')
        ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: false, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 1 }
        : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 0, average_score: null, source_counts: { 模拟数据: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByText('有 1 / 1 只基金使用模拟净值')).toBeInTheDocument();
    expect(screen.getByText('组合平均评分')).toBeInTheDocument();
  });

  it('数据与说明页按来源展示跨次健康记录，并标出降级原因', async () => {
    window.history.replaceState(null, '', '/?view=sources');
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '东方财富',
      最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 0, '综合评分(0-10)': null,
      近1年收益率: null, 近1年最大回撤: null, 基准可用: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio')
        ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: false, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 }
        : url.endsWith('/api/data-sources')
          ? { sources: [
              { source: '东方财富', attempts: 5, succeeded: 4, failed: 1, last_succeeded_at: '2026-11-15T01:00:00Z', last_failed_at: '2026-11-14T01:00:00Z', consecutive_failures: 0, degraded: false, last_reason: '' },
              { source: 'AkShare', attempts: 3, succeeded: 0, failed: 3, last_succeeded_at: null, last_failed_at: '2026-11-15T01:00:00Z', consecutive_failures: 3, degraded: true, last_reason: 'AkShare 返回空数据' },
            ], record_count: 8, note: '连续失败达到 2 次标为 degraded' }
          : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 0, average_score: null, source_counts: { 东方财富: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: '数据源健康' })).toBeInTheDocument();
    expect(await screen.findByText('降级')).toBeInTheDocument();
    expect(screen.getByText(/AkShare 返回空数据/)).toBeInTheDocument();
    expect(screen.getByText('2026-11-15')).toBeInTheDocument();
    window.history.replaceState(null, '', '/');
  });

  it('数据源接口还没有记录时给出空状态，不把空表当全部正常', async () => {
    window.history.replaceState(null, '', '/?view=sources');
    const rows = [{ 基金名称: '示例基金', 代码: '000001', 基金类型: '科技', 数据来源: '东方财富',
      最新净值日期: '2026-01-01', 当前持有金额: 1000, 累计收益: 0, '综合评分(0-10)': null,
      近1年收益率: null, 近1年最大回撤: null, 基准可用: false }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/portfolio')
        ? { holdings: [{ code: '000001', name: '示例基金', amount: 1000, hold_ret: 0, cum_profit: 0 }], synthetic: false, snapshot_date: '2026-01-01', auto_update_holdings: false, refresh_token: 0 }
        : url.endsWith('/api/data-sources')
          ? { sources: [], record_count: 0, note: '' }
          : { rows, summary: { fund_count: 1, total_amount: 1000, total_profit: 0, average_score: null, source_counts: { 东方财富: 1 }, as_of: '2026-01-01' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    render(<App />);
    expect(await screen.findByText(/还没有跨次的取数记录/)).toBeInTheDocument();
    expect(screen.queryByText('降级')).not.toBeInTheDocument();
    window.history.replaceState(null, '', '/');
  });
});
