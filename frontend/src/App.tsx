import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from './Chart';
import { Activity, ArrowDownToLine, BarChart3, Check, ChevronRight, CircleAlert, Database, RefreshCw, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from './api';
import { normalizedHistorySeries } from './history';
import type { Advice, Analysis, DataSourceHealthResponse, FundHistory, FundRow, Holding, Portfolio } from './types';

type ViewKey = 'portfolio' | 'analysis' | 'sources';
const views: Record<ViewKey, string> = { portfolio: '组合总览', analysis: '绩效分析', sources: '数据与说明' };
const periods = [{ label: '近 1 月', days: 30 }, { label: '近 3 月', days: 90 }, { label: '近 1 年', days: 365 }, { label: '近 3 年', days: 1095 }, { label: '全部', days: 0 }];
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });

function routeFromUrl(): { view: ViewKey; code: string } {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('view') as ViewKey | null;
  return { view: value && value in views ? value : 'portfolio', code: params.get('fund') || '' };
}

function pushUrl(view: ViewKey, code: string) {
  const params = new URLSearchParams({ view });
  if (code) params.set('fund', code);
  window.history.pushState({}, '', `${window.location.pathname}?${params}`);
}

function readableError(error: unknown) { return error instanceof Error ? error.message : '数据暂时无法读取'; }
function valueNumber(value: unknown) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function formatPercent(value: unknown) { const parsed = valueNumber(value); return parsed === null ? '不可用' : `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`; }
function formatMoney(value: unknown) { const parsed = valueNumber(value); return parsed === null ? '不可用' : money.format(parsed); }

// 回退状态是后端枚举（none/synthetic/fallback/unavailable），英文直出用户看不懂。
const fallbackLabels: Record<string, string> = {
  none: '正常（未回退）',
  synthetic: '已回退到模拟数据',
  fixture: '本地冻结样本（非实时）',
  fallback: '已回退到备用来源',
  unavailable: '不可用',
};
function fallbackLabel(value: unknown) {
  const key = String(value ?? '').trim();
  if (!key) return '正常（未回退）';
  return fallbackLabels[key.toLowerCase()] || key;
}

function SourceBadge({ value }: { value?: string }) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  const synthetic = raw === '模拟数据' || lower === 'synthetic';
  const fixture = raw === '本地冻结样本';
  const unavailable = raw === '不可用' || lower === 'unavailable';
  // 未知来源不能落进绿色「实时」分支，否则等于给缺失数据盖章。
  const unknown = !synthetic && !fixture && !unavailable && (raw === '' || raw === '未知' || lower === 'unknown' || raw === '—');
  const tone = synthetic ? 'simulated' : fixture ? 'fixture' : unavailable ? 'unavailable' : unknown ? 'unknown' : 'live';
  const text = synthetic ? '模拟数据' : fixture ? '本地冻结样本' : unavailable ? '不可用' : raw || '来源未知';
  return <span className={`source-badge ${tone}`}>{text}</span>;
}

function healthDate(value: string | null | undefined) {
  if (!value) return '无记录';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function SourceHealthPanel({ payload }: { payload: DataSourceHealthResponse | null }) {
  // 接口没数据、或返回结构不是预期的，都要给出可读的空状态，不能整页崩掉。
  const sources = Array.isArray(payload?.sources) ? payload!.sources : [];
  const degraded = sources.filter((item) => item.degraded && item.last_reason);
  return <section className="fund-panel">
    <PanelTitle title="数据源健康" note="每次取数都留痕，连续失败两次标为降级" />
    {sources.length === 0
      ? <p className="insp-warn">还没有跨次的取数记录。跑一次分析后，这里会按来源累计成功与失败。</p>
      : <div className="table-overflow">
          <table className="holdings-table">
            <thead><tr><th>来源</th><th>尝试</th><th>成功 / 失败</th><th>连续失败</th><th>最近成功</th><th>状态</th></tr></thead>
            <tbody>{sources.map((item) => <tr key={item.source}>
              <td><strong>{item.source}</strong></td>
              <td>{item.attempts}</td>
              <td>{item.succeeded} / {item.failed}</td>
              <td>{item.consecutive_failures}</td>
              <td>{healthDate(item.last_succeeded_at)}</td>
              <td>{item.degraded
                ? <span className="source-badge unavailable">降级</span>
                : <span className="source-badge live">正常</span>}</td>
            </tr>)}</tbody>
          </table>
          {degraded.length > 0 && <p className="insp-warn">降级原因：{degraded.map((item) => `${item.source}：${item.last_reason}`).join('；')}</p>}
        </div>}
  </section>;
}

// 颜色只读一次 CSS 变量；option 合并结果按 option 引用缓存，避免每次渲染都 setOption 全量重绘。
function CardChart({ option, height = 270, label, summary }: { option: object; height?: number; label?: string; summary?: string }) {
  const colors = useMemo(() => [
    cssToken('--color-chart-ink', '#477067'),
    cssToken('--color-chart-secondary', '#af7947'),
    cssToken('--color-accent', '#8c4a34'),
  ], []);
  const merged = useMemo(() => ({ color: colors, ...option }), [colors, option]);
  return <>
    <ReactECharts option={merged} label={label} style={useMemo(() => ({ width: '100%', height }), [height])} lazyUpdate />
    {summary && <p className="sr-only">{summary}</p>}
  </>;
}

function cssToken(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function App() {
  const initial = routeFromUrl();
  const [view, setView] = useState<ViewKey>(initial.view);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedCode, setSelectedCode] = useState(initial.code);
  const [history, setHistory] = useState<FundHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyReload, setHistoryReload] = useState(0);
  const [period, setPeriod] = useState(365);
  const [fundType, setFundType] = useState('全部');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftHoldings, setDraftHoldings] = useState<Holding[]>([]);
  // 数字输入框必须保留原始文本：否则用户第一下敲「-」就被 Number('-')||0 吞成 0，负数根本输不进去。
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<'glm' | 'dashscope'>('glm');
  const [apiKey, setApiKey] = useState('');
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [inspectorHidden, setInspectorHidden] = useState(false);
  const [sourceHealth, setSourceHealth] = useState<DataSourceHealthResponse | null>(null);

  const analysisRef = useRef<Analysis | null>(null);
  const selectedCodeRef = useRef(initial.code);
  selectedCodeRef.current = selectedCode;

  const load = async (selectCode?: string) => {
    setLoading(true); setError('');
    try {
      const [portfolioResult, analysisResult] = await Promise.all([api.portfolio(), api.analysis()]);
      setPortfolio(portfolioResult);
      setAnalysis(analysisResult);
      analysisRef.current = analysisResult;
      setDraftHoldings(portfolioResult.holdings);
      setDraftText({});
      setDirty(false);
      const preferred = selectCode ?? selectedCodeRef.current;
      const nextCode = analysisResult.rows.some((row) => row.代码 === preferred)
        ? preferred : analysisResult.rows[0]?.代码 || '';
      setSelectedCode(nextCode);
      setAdvice(null);
    } catch (err) { setError(readableError(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load(initial.code);
    const handlePop = () => {
      const next = routeFromUrl();
      setView(next.view);
      const rows = analysisRef.current?.rows || [];
      const resolved = rows.some((row) => row.代码 === next.code) ? next.code : rows[0]?.代码 || '';
      setSelectedCode(resolved);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    if (view !== 'sources') return;
    let alive = true;
    api.sourceHealth()
      .then((result) => { if (alive) setSourceHealth(result); })
      .catch(() => { if (alive) setSourceHealth(null); });
    return () => { alive = false; };
  }, [view, portfolio?.refresh_token]);

  useEffect(() => {
    let alive = true;
    if (!selectedCode || view !== 'analysis') {
      setHistory(null); setHistoryError(''); setHistoryLoading(false); return;
    }
    setHistory(null); setHistoryError(''); setHistoryLoading(true);
    api.history(selectedCode, period)
      .then((value) => { if (alive) { setHistory(value); setHistoryLoading(false); } })
      .catch((err) => { if (alive) { setHistoryError(readableError(err)); setHistoryLoading(false); } });
    return () => { alive = false; };
  }, [selectedCode, period, view, historyReload]);

  const go = (next: ViewKey, code = selectedCode) => {
    if (!confirmDiscardDraft()) return;
    setView(next); setSelectedCode(code); pushUrl(next, code); setError('');
  };

  const chooseFund = (row: FundRow) => {
    if (!confirmDiscardDraft()) return;
    setSelectedCode(row.代码); setAdvice(null); pushUrl(view, row.代码);
  };

  // 持仓编辑只保存在内存：切基金/切视图/刷新前必须让用户知道草稿会丢。
  const confirmDiscardDraft = () => {
    if (!editing || !dirty || typeof window.confirm !== 'function') return true;
    return window.confirm('持仓编辑还没有保存，继续操作会丢弃这些改动。\n\n确定继续吗？');
  };

  // 选中行始终由代码派生：刷新、前进/后退、切视图都不会出现「左侧选中 A、右侧显示 B」。
  const selectedRow = useMemo<FundRow | null>(() => {
    const rows = analysis?.rows || [];
    return rows.find((row) => row.代码 === selectedCode) || rows[0] || null;
  }, [analysis, selectedCode]);

  const filteredRows = useMemo(() => (analysis?.rows || []).filter((row) => {
    const typeMatches = fundType === '全部' || row.基金类型 === fundType;
    const searchMatches = !query || `${row.基金名称} ${row.代码}`.toLowerCase().includes(query.toLowerCase());
    return typeMatches && searchMatches;
  }), [analysis, fundType, query]);

  const allocationOption = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of analysis?.rows || []) totals.set(row.基金类型, (totals.get(row.基金类型) || 0) + (valueNumber(row.当前持有金额) || 0));
    return { tooltip: { trigger: 'item', valueFormatter: (value: number) => money.format(value) }, legend: { bottom: 0, textStyle: { color: cssToken('--color-muted', '#858b82') } }, series: [{ type: 'pie', radius: ['54%', '78%'], center: ['50%', '45%'], itemStyle: { borderColor: cssToken('--color-paper', '#fbfaf6'), borderWidth: 3 }, label: { show: false }, data: [...totals].map(([name, value]) => ({ name, value })) }] };
  }, [analysis]);

  const allocationSummary = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of analysis?.rows || []) totals.set(row.基金类型, (totals.get(row.基金类型) || 0) + (valueNumber(row.当前持有金额) || 0));
    if (!totals.size) return '持仓结构暂无数据。';
    return `持仓结构：${[...totals].map(([name, value]) => `${name} ${money.format(value)}`).join('，')}。`;
  }, [analysis]);

  const returnsSummary = useMemo(() => {
    const rows = (analysis?.rows || []).filter((row) => valueNumber(row.近1年收益率) !== null);
    if (!rows.length) return '各基金近一年收益均不可用。';
    return `各基金近一年收益：${rows.map((row) => `${row.基金名称} ${formatPercent(row.近1年收益率)}`).join('，')}。`;
  }, [analysis]);

  const returnsOption = useMemo(() => ({
    tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => valueNumber(value) === null ? '不可用' : `${valueNumber(value)!.toFixed(2)}%` },
    grid: { left: 48, right: 16, top: 18, bottom: 54 },
    xAxis: { type: 'category', data: (analysis?.rows || []).map((row) => row.基金名称), axisLabel: { rotate: 28, interval: 0, color: cssToken('--color-muted', '#858b82') } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: cssToken('--color-muted', '#858b82') }, splitLine: { lineStyle: { color: cssToken('--color-line', '#e0ded4') } } },
    series: [{ type: 'bar', name: '近一年收益', barMaxWidth: 26, data: (analysis?.rows || []).map((row) => valueNumber(row.近1年收益率)), itemStyle: { color: cssToken('--color-chart-ink', '#477067'), borderRadius: [4, 4, 0, 0] } }],
  }), [analysis]);

  const savePortfolio = async () => {
    setBusy(true); setError('');
    try { await api.updatePortfolio(effectiveHoldings()); setEditing(false); await load(selectedCode); setNotice('当前组合已在本次运行中更新。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const resetPortfolio = async () => {
    if (editing && !confirmDiscardDraft()) return;
    if (!window.confirm('恢复示例会覆盖本次会话录入的全部持仓，确定继续吗？')) return;
    setBusy(true); setError('');
    try { await api.resetPortfolio(); await load(''); setNotice('已恢复虚构合成示例组合。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const refreshData = async () => {
    if (!confirmDiscardDraft()) return;
    setBusy(true); setError('');
    try { await api.refresh(); await load(selectedCode); setNotice('已刷新数据；每项结果仍保留各自来源和日期。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const exportReport = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/export/markdown');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `导出失败（${response.status}）`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'fund-analysis.md';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      setNotice('分析报告已导出（Markdown）。');
    } catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const generateAdvice = async () => {
    if (!selectedRow) return;
    setBusy(true); setError('');
    try { setAdvice(await api.advice(selectedRow.代码, apiKey, provider)); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const draftKey = (index: number, key: keyof Holding) => `${index}:${String(key)}`;

  const updateDraft = (index: number, key: keyof Holding, value: string) => {
    setDirty(true);
    if (key === 'name' || key === 'code') {
      setDraftHoldings((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
      return;
    }
    setDraftText((current) => ({ ...current, [draftKey(index, key)]: value }));
    const parsed = Number(value);
    if (value.trim() !== '' && Number.isFinite(parsed)) {
      setDraftHoldings((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: parsed } : row));
    }
  };

  // 提交前把「还在编辑中」的文本收敛成数字：空串按 0 处理，非法文本保留上一次合法值。
  const effectiveHoldings = () => draftHoldings.map((row, index) => {
    const next: Holding = { ...row };
    for (const key of ['amount', 'hold_ret', 'cum_profit'] as const) {
      const text = draftText[draftKey(index, key)];
      if (text === undefined) continue;
      if (text.trim() === '') { next[key] = 0; continue; }
      const parsed = Number(text);
      if (Number.isFinite(parsed)) next[key] = parsed;
    }
    return next;
  });

  // 模拟净值一律不产出指标：可用性以后端契约为准，前端不自己比对来源字符串。
  const simulatedRow = selectedRow?.数据来源 === '模拟数据' || Boolean(history?.synthetic);
  const metricsUsable = Boolean(selectedRow) && !simulatedRow && history?.metrics_available !== false && selectedRow?.指标可用 !== false;

  // 区间收益必须跟着按钮走：此前无论选「近 1 月 / 近 3 年」都显示近一年数字。
  const intervalReturn = useMemo(() => {
    if (!metricsUsable) return null;
    const nav = history?.nav || [];
    if (nav.length >= 2) {
      const first = Number(nav[0].nav);
      const last = Number(nav[nav.length - 1].nav);
      if (Number.isFinite(first) && Number.isFinite(last) && first > 0) return (last / first - 1) * 100;
      return null;
    }
    if (!selectedRow) return null;
    const fallback = period === 30 ? selectedRow.近1月收益率 : period === 90 ? selectedRow.近3月收益率 : period === 365 ? selectedRow.近1年收益率 : null;
    return valueNumber(fallback);
  }, [history, period, selectedRow, metricsUsable]);
  const periodLabel = periods.find((item) => item.days === period)?.label || '当前区间';

  // 区间注脚分三种情况：所选区间没取满 / 「全部」顶到回看上限 / 数据本身就是全的。
  const coverageNote = (() => {
    if (!history) return '使用当前净值来源';
    if (history.truncated) return `数据源仅覆盖 ${history.available_days} 天（${history.coverage_start} 起），未满所选区间`;
    if (period === 0 && history.history_capped) return `已取满 ${history.lookback_days} 天回看上限（${history.coverage_start} 起），可能还有更早记录`;
    if (period === 0) return `数据自 ${history.coverage_start} 起，共 ${history.available_days} 天`;
    return history.nav_provenance?.data_date ? `净值截至 ${history.nav_provenance.data_date}` : '使用当前净值来源';
  })();

  const historyOption = useMemo(() => {
    const nav = history?.nav || [];
    if (!nav.length) return null;
    const series = normalizedHistorySeries(nav, history?.benchmark || []);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: cssToken('--color-muted', '#858b82') } },
      grid: { left: 52, right: 20, top: 34, bottom: 62 },
      xAxis: { type: 'category', data: series.dates, boundaryGap: false, axisLabel: { color: cssToken('--color-muted', '#858b82') } },
      yAxis: {
        type: 'value', scale: true, name: '起点=100', nameGap: 10,
        nameTextStyle: { color: cssToken('--color-muted', '#858b82') },
        axisLabel: { color: cssToken('--color-muted', '#858b82') },
        splitLine: { lineStyle: { color: cssToken('--color-line', '#e0ded4') } },
      },
      series: [
        { name: '基金净值', type: 'line', showSymbol: false, connectNulls: true, lineStyle: { width: 2.2, color: cssToken('--color-chart-ink', '#477067') }, data: series.nav },
        ...(history?.benchmark_available ? [{ name: '比较基准', type: 'line', showSymbol: false, connectNulls: true, lineStyle: { width: 1.6, type: 'dashed', color: cssToken('--color-chart-secondary', '#af7947') }, data: series.benchmark }] : []),
      ],
    };
  }, [history]);

  const historySummary = useMemo(() => {
    const nav = history?.nav || [];
    if (!nav.length) return '';
    const first = nav[0];
    const last = nav[nav.length - 1];
    const parts = [`净值走势：${first.date} 至 ${last.date} 共 ${nav.length} 个净值点，从 ${first.nav} 变到 ${last.nav}`];
    parts.push('走势图按各序列起点归一化为 100，仅比较相对走势');
    if (history?.benchmark_available) parts.push('同时显示比较基准曲线');
    else parts.push('比较基准不可用，未生成基准与超额结果');
    return `${parts.join('；')}。`;
  }, [history]);

  const sourceCounts = analysis?.summary.source_counts || {};
  const synthetic = portfolio?.synthetic ?? true;
  const mockRowCount = (analysis?.rows || []).filter((row) => row.数据来源 === '模拟数据').length;
  const dataMode = analysis ? (analysis.offline_demo ? '离线冻结样本' : '实时数据源') : '数据模式未知';

  return <div className={inspectorHidden ? 'fund-app no-inspector' : 'fund-app'}>
    <header className="fund-topbar">
      <a className="fund-brand" href="/?view=portfolio" onClick={(event) => { event.preventDefault(); go('portfolio'); }}>
        <span className="brand-seal"><BarChart3 size={17} /></span>
        <span><strong>基金观察</strong><small>本地组合分析</small></span>
      </a>
      <span className="shell-chip version-chip">v0.6.0 · React 工作台</span>
      <span className="shell-crumb">我的分析 <ChevronRight size={13} /> {views[view]}</span>
      {synthetic && <span className={`shell-chip ${analysis?.offline_demo ? 'demo' : ''}`}>{dataMode} · 虚构合成组合</span>}
      <span className="shell-chip">{analysis?.summary.as_of ? `数据日期 ${analysis.summary.as_of}` : '数据日期不可用'}</span>
      <div className="fund-top-actions"><button className="shell-toggle" onClick={() => setInspectorHidden(!inspectorHidden)}>{inspectorHidden ? '展开检视' : '收起检视'}</button><span className="local-pill"><ShieldCheck size={15} />仅本机</span><button className="fund-icon-button" aria-label="刷新净值" onClick={() => void refreshData()}><RefreshCw size={17} /></button></div>
    </header>

    <aside className="sidenav">
      <div className="nav-group">工作区</div>
      <nav className="fund-nav" aria-label="主导航">{(Object.keys(views) as ViewKey[]).map((key) => <button key={key} className={view === key ? 'fund-nav-link active' : 'fund-nav-link'} onClick={() => go(key)}>{views[key]}</button>)}</nav>
      <div className="nav-group">视图</div>
      <div className="nav-meta">{analysis ? <>{analysis.summary.fund_count} 只基金<br />{Object.entries(sourceCounts).map(([key, count]) => `${key} ${count}`).join(' · ') || '来源读取中'}<br />数据日期 {analysis.summary.as_of || '不可用'}</> : '正在读取分析结果'}</div>
      <div className="nav-foot">固定布局 · 局部滚动<br />缺失指标一律显示不可用<br />不以零值代替空数据<br />仅本机运行，不提供公网服务</div>
    </aside>

    <main className="fund-page">
      <section className="fund-heading">
        <div><p className="fund-breadcrumb">我的分析 <ChevronRight size={13} /> {views[view]}</p><h1>{view === 'portfolio' ? '组合概览' : view === 'analysis' ? '收益与风险' : '数据来源与计算口径'}</h1><p>{view === 'portfolio' ? '先看组合结构，再进入基金和数据明细。' : view === 'analysis' ? '历史表现与基准比较分开呈现，指标保留来源说明。' : '每项数据都显示来源、日期和回退状态。'}</p></div>
        <div className="fund-heading-actions"><button className="fund-button outline" disabled={busy} onClick={() => void exportReport()}><ArrowDownToLine size={15} />导出分析报告</button><button className="fund-button outline" disabled={busy} onClick={() => void refreshData()}><RefreshCw size={15} />更新数据</button></div>
      </section>

      {synthetic && <div className="synthetic-banner"><span className="banner-mark">i</span><div><strong>当前组合为虚构合成示例</strong><span>持仓金额和收益只用于演示；每只基金的净值来源、日期与指标可用性以表格和来源卡为准。</span></div><button className="text-action" onClick={() => setEditing(true)}>编辑示例</button></div>}
      {!synthetic && mockRowCount > 0 && <div className="synthetic-banner"><span className="banner-mark">i</span><div><strong>有 {mockRowCount} / {analysis?.rows.length || 0} 只基金使用模拟净值</strong><span>这些行的收益、回撤、波动、夏普与评分显示为不可用，持仓金额按你录入的快照保留，不按模拟净值推算。</span></div></div>}
      {(error || notice) && <div className={error ? 'fund-alert danger-alert' : 'fund-alert success-alert'} role={error ? 'alert' : 'status'}>{error ? <CircleAlert size={16} /> : <Check size={16} />}{error || notice}{error && <button onClick={() => { void load(); setHistoryReload((value) => value + 1); }} disabled={busy}>重新读取</button>}<button onClick={() => { setError(''); setNotice(''); }} aria-label="关闭提示">×</button></div>}

      {loading ? <div className="fund-loading"><Activity size={22} /><span>正在读取净值与来源信息…</span></div> : !analysis ? <div className="fund-empty"><Database size={26} /><strong>当前没有可显示的数据</strong><span>检查数据源状态后重试。</span><button className="fund-button filled" onClick={() => void load()}>重新加载</button></div> : <>
        {view === 'portfolio' && <section className="fund-stack">
          <div className="metric-row">
            <Metric label="当前持仓金额" value={formatMoney(analysis.summary.total_amount)} note={synthetic ? '合成持仓示例' : '由当前持仓计算'} />
            <Metric label="累计收益" value={formatMoney(analysis.summary.total_profit)} note="按当前持仓记录汇总" positive={(analysis.summary.total_profit || 0) >= 0} />
            <Metric label="基金数量" value={String(analysis.summary.fund_count)} note={`数据截至 ${analysis.summary.as_of || '日期未知'}`} />
            <Metric label="组合平均评分" value={analysis.summary.average_score === null || analysis.summary.average_score === undefined ? '不可用' : analysis.summary.average_score.toFixed(1)} note="四项风险指标齐全的基金池内相对评分" />
          </div>
          <div className="overview-panels">
            <section className="fund-panel allocation-panel"><PanelTitle title="持仓结构" note={synthetic ? '按当前示例持仓金额汇总' : '按本次会话录入的持仓金额汇总'} /><CardChart option={allocationOption} height={212} label="持仓结构环形图" summary={allocationSummary} /></section>
            <section className="fund-panel performance-panel"><PanelTitle title="基金近一年收益" note="数据不足一年或使用模拟净值时，指标显示不可用" />{(analysis.rows || []).some((row) => valueNumber(row.近1年收益率) !== null) ? <CardChart option={returnsOption} height={212} label="各基金近一年收益柱状图" summary={returnsSummary} /> : <div className="chart-empty" role="status"><div className="unavailable-detail"><strong>近一年收益不可用：当前数据没有覆盖完整的一年区间。</strong><div className="insp-row"><span>模拟净值</span><span className="spacer" /><span className="insp-v">逐只标记</span></div><div className="insp-row"><span>比较基准</span><span className="spacer" /><span className="insp-v">不生成</span></div><div className="insp-row"><span>超额收益</span><span className="spacer" /><span className="insp-v">不计算</span></div><small>缺失指标保持显示「不可用」，不以零值替代。</small></div></div>}</section>
          </div>
          <section className="fund-panel table-panel">
            <div className="table-toolbar"><PanelTitle title="持有基金" note="选择一行查看绩效、来源和计算说明" /><div className="filters"><label className="search-box"><Search size={15} /><input aria-label="搜索基金" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或代码" /></label><select aria-label="基金类型筛选" value={fundType} onChange={(event) => setFundType(event.target.value)}><option>全部</option>{[...new Set(analysis.rows.map((row) => row.基金类型))].filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select><button className="fund-button outline small-button" onClick={() => setEditing(!editing)}><Settings2 size={14} />{editing ? '收起编辑' : '编辑持仓'}</button></div></div>
            {editing && <div className="holdings-editor"><div className="editor-heading"><strong>编辑当前会话的持仓</strong><span>刷新或重新打开应用后恢复合成示例，当前版本不写入本地文件。</span></div>
              <div className="table-overflow"><table className="holdings-table"><thead><tr><th>基金</th><th>代码</th><th>持有金额</th><th>持有收益率 %</th><th>累计收益</th></tr></thead><tbody>{draftHoldings.map((holding, index) => <tr key={`${holding.code}-${index}`}>
                <td><input aria-label={`第 ${index + 1} 行基金名称`} value={holding.name} onChange={(event) => updateDraft(index, 'name', event.target.value)} /></td>
                <td><input aria-label={`第 ${index + 1} 行基金代码`} value={holding.code} onChange={(event) => updateDraft(index, 'code', event.target.value)} /></td>
                <td><input aria-label={`第 ${index + 1} 行持有金额`} type="text" inputMode="decimal" value={draftText[draftKey(index, 'amount')] ?? String(holding.amount)} onChange={(event) => updateDraft(index, 'amount', event.target.value)} /></td>
                <td><input aria-label={`第 ${index + 1} 行持有收益率`} type="text" inputMode="decimal" value={draftText[draftKey(index, 'hold_ret')] ?? String(holding.hold_ret)} onChange={(event) => updateDraft(index, 'hold_ret', event.target.value)} /></td>
                <td><input aria-label={`第 ${index + 1} 行累计收益`} type="text" inputMode="decimal" value={draftText[draftKey(index, 'cum_profit')] ?? String(holding.cum_profit)} onChange={(event) => updateDraft(index, 'cum_profit', event.target.value)} /></td>
              </tr>)}</tbody></table></div>
              <div className="editor-actions"><button className="fund-button outline" onClick={() => { setDirty(true); setDraftHoldings([...draftHoldings, { code: '', name: '', amount: 0, hold_ret: 0, cum_profit: 0 }]); }}>添加一行</button><button className="fund-button outline" disabled={busy} onClick={() => void resetPortfolio()}>恢复示例</button><button className="fund-button filled" disabled={busy} onClick={() => void savePortfolio()}>保存到本次运行</button></div>
            </div>}
            <FundTable rows={filteredRows} selectedCode={selectedCode} onSelect={(row) => chooseFund(row)} />
          </section>
        </section>}

        {view === 'analysis' && <section className="fund-stack">
          <section className="fund-panel fund-select-panel"><div><PanelTitle title={selectedRow?.基金名称 || '基金绩效分析'} note={selectedRow ? `${selectedRow.代码} · ${selectedRow.基金类型}` : '从持有基金中选择一只'} /></div>
            <div className="detail-selectors"><select aria-label="选择基金" value={selectedCode} onChange={(event) => { const row = analysis.rows.find((item) => item.代码 === event.target.value); if (row) chooseFund(row); }}>{!analysis.rows.some((row) => row.代码 === selectedCode) && <option value="">请选择基金</option>}{analysis.rows.map((row) => <option value={row.代码} key={row.代码}>{row.基金名称}（{row.代码}）</option>)}</select><div className="period-switch" role="group" aria-label="统计区间">{periods.map((item) => <button key={item.days} type="button" aria-pressed={period === item.days} className={period === item.days ? 'period-button active' : 'period-button'} onClick={() => setPeriod(item.days)}>{item.label}</button>)}</div></div>
          </section>
          {selectedRow && <>
            <div className="detail-metrics"><Metric label={`${periodLabel}收益`} value={formatPercent(intervalReturn)} note={simulatedRow ? '模拟净值不计算收益' : coverageNote} positive={intervalReturn === null ? undefined : intervalReturn >= 0} /><Metric label="近一年最大回撤" value={formatPercent(metricsUsable ? selectedRow.近1年最大回撤 : null)} note={simulatedRow ? '模拟净值不计算回撤' : '按历史净值计算'} /><Metric label="年化波动率" value={formatPercent(metricsUsable ? selectedRow.近1年年化波动率 : null)} note={simulatedRow ? '模拟净值不计算波动率' : '按日收益估算'} /><Metric label="比较基准" value={history?.benchmark_available ? String(selectedRow.比较基准 || '已匹配') : '不可用'} note={history?.benchmark_available ? '显示于净值走势图' : '模拟净值或基准源不可用'} /></div>
            <section className="fund-panel history-panel"><div className="chart-header"><PanelTitle title="净值走势" note={history?.nav_provenance?.source ? `净值来源：${history.nav_provenance.source} · ${history.nav_provenance.data_date || '日期未知'} · 图表起点=100` : '正在加载净值来源'} /><SourceBadge value={history?.nav_provenance?.source} /></div>
              {historyLoading ? <div className="chart-empty" role="status">正在读取历史净值…</div> : historyError ? <div className="chart-empty fund-history-error" role="alert"><CircleAlert size={15} /><span>{historyError}</span><button type="button" className="fund-button outline small-button" onClick={() => setHistoryReload((value) => value + 1)}>重新读取</button></div> : historyOption ? <CardChart height={340} option={historyOption} label={`${selectedRow?.基金名称 || '所选基金'} 净值走势图`} summary={historySummary} /> : <div className="chart-empty">{history ? '当前区间没有可绘制的净值记录。' : '正在读取历史净值…'}</div>}
              {history && !historyLoading && !history.benchmark_available && <div className="unavailable-note"><CircleAlert size={15} />比较基准不可用，页面不生成基准收益或超额结果。</div>}
            </section>
            <div className="analysis-bottom">
              <section className="fund-panel provenance-panel"><PanelTitle title="数据来源" note="基金净值和基准分别追踪" />
                <ProvenanceCard title="基金净值" provenance={history?.nav_provenance || selectedRow.净值来源信息} />
                <ProvenanceCard title="比较基准" provenance={history?.benchmark_provenance || selectedRow.基准来源信息} />
              </section>
              <section className="fund-panel advice-panel"><div className="chart-header"><PanelTitle title="AI 辅助说明" note="只对当前选择的基金生成" /><Sparkles size={17} /></div>
                <div className="key-form"><label>AI 服务商<select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="glm">智谱 GLM</option><option value="dashscope">阿里云百炼</option></select></label><label>本次会话 API Key<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="留空使用本地说明" /></label><button className="fund-button filled" disabled={busy} onClick={() => void generateAdvice()}>{busy ? '正在生成…' : apiKey ? '生成辅助说明' : '查看本地回退说明'}</button></div>
                {advice && <div className="advice-result"><div className="advice-mode"><span>{advice.mode === 'ai' ? 'AI 生成' : '本地规则回退'}</span><SourceBadge value={advice.mode === 'ai' ? 'AI' : '模拟数据'} /></div><strong>{advice.short}</strong><p>{advice.detail}</p><small>{advice.disclaimer}</small></div>}
              </section>
            </div>
          </>}
        </section>}

        {view === 'sources' && <section className="fund-stack">
          <section className="source-overview"><div><span>当前净值数据</span><strong>{Object.entries(sourceCounts).map(([key, count]) => `${key} ${count}`).join(' · ') || '读取中'}</strong><small>每只基金单独记录使用的数据源</small></div><div><span>最新数据日期</span><strong>{analysis.summary.as_of || '不可用'}</strong><small>数据日期以各条净值记录为准</small></div><div><span>当前组合类型</span><strong>{synthetic ? '合成示例' : '本次会话自定义'}</strong><small>应用不会写入真实账户信息</small></div></section>
          <SourceHealthPanel payload={sourceHealth} />
          <div className="sources-grid"><section className="fund-panel"><PanelTitle title="基金净值来源" note="数据加载失败会明确记录回退原因" />{analysis.rows.map((row) => <ProvenanceCard key={row.代码} title={`${row.基金名称} · ${row.代码}`} provenance={row.净值来源信息} compact />)}</section>
            <section className="fund-panel"><PanelTitle title="计算口径与边界" note="用于理解演示输出，不构成投资建议" />
              <div className="method-list"><div><strong>收益率</strong><p>按可用净值序列和区间首尾净值计算；数据不足时显示不可用。</p></div><div><strong>最大回撤与波动</strong><p>依据基金历史净值计算。模拟净值会保留“模拟数据”标记。</p></div><div><strong>基准与超额</strong><p>只有基金净值与基准来源都可用时才计算；模拟净值不生成貌似真实的比较结果。</p></div><div><strong>持仓数据</strong><p>默认金额和收益为虚构示例；编辑内容仅保存在当前服务进程内存。</p></div><div><strong>API Key</strong><p>只由浏览器内存持有，随单次请求发送，不写入本地文件或服务日志。</p></div></div>
              <div className="compliance-box">{analysis.rows[0]?.净值来源信息?.source === '模拟数据' ? '当前净值使用模拟数据；所有比较基准和超额指标保持不可用。' : '本工具仅用于学习交流，不提供投资建议或交易执行。基金投资有风险。'}</div>
            </section></div>
        </section>}
      </>}
      <footer className="fund-footer"><span>基金观察 · 本地分析演示</span><span>不连接真实账户 · 不提供交易执行或投资建议</span></footer>
    </main>

    <aside className="inspector">
      <div className="insp-h"><strong>基金明细</strong><span className="insp-chip">点击表格行切换</span></div>
      <div className="insp-body">
        <div><div className="insp-t">组合上下文</div>
          <dl className="insp-kv">
            <dt>基金数量</dt><dd>{analysis?.summary.fund_count ?? '—'}</dd>
            <dt>持仓金额</dt><dd>{formatMoney(analysis?.summary.total_amount)}</dd>
            <dt>累计收益</dt><dd>{formatMoney(analysis?.summary.total_profit)}</dd>
            <dt>数据日期</dt><dd>{analysis?.summary.as_of || '不可用'}</dd>
            <dt>组合类型</dt><dd>{synthetic ? '合成示例' : '本次会话自定义'}</dd>
          </dl>
        </div>
        {selectedRow && <div><div className="insp-t">当前选中 · {selectedRow.代码}</div>
          <dl className="insp-kv">
            <dt>净值日期</dt><dd>{selectedRow.最新净值日期 || '不可用'}</dd>
            <dt>数据来源</dt><dd>{selectedRow.数据来源 || '不可用'}</dd>
            <dt>近一年收益</dt><dd>{formatPercent(selectedRow.近1年收益率)}</dd>
            <dt>最大回撤</dt><dd>{formatPercent(selectedRow.近1年最大回撤)}</dd>
            <dt>持有金额</dt><dd>{formatMoney(selectedRow.当前持有金额)}</dd>
            <dt>相对评分</dt><dd>{valueNumber(selectedRow['综合评分(0-10)'])?.toFixed(1) || '不可用'} / 10</dd>
          </dl>
          <button className="fund-button outline small-button" style={{ marginTop: 9 }} onClick={() => go('analysis', selectedRow.代码)}>查看收益与风险</button>
        </div>}
        <div><div className="insp-t">来源回退状态</div>
          <dl className="insp-kv">
            <dt>请求源</dt><dd>{String(selectedRow?.净值来源信息?.requested_source || '未记录')}</dd>
            <dt>生效源</dt><dd>{String(selectedRow?.净值来源信息?.source || '未知')}</dd>
            <dt>数据日期</dt><dd>{String(selectedRow?.净值来源信息?.data_date || '不可用')}</dd>
            <dt>回退状态</dt><dd>{fallbackLabel(selectedRow?.净值来源信息?.fallback_status)}</dd>
          </dl>
          {selectedRow?.净值来源信息?.failure_reason && <p className="insp-warn">失败原因：{String(selectedRow.净值来源信息.failure_reason)}</p>}
        </div>
        <div><div className="insp-t">计算口径与边界</div>
          <p className="insp-warn">收益率按可得净值区间计算；区间不足时显示不可用。基准与超额收益在模拟数据下不生成。评分是相对排序，不是收益预测。</p>
        </div>
        <div><div className="insp-t">接口与凭据</div>
          <dl className="insp-kv">
            <dt>API Key</dt><dd>不落盘 · 不写日志</dd>
            <dt>交易</dt><dd>不执行</dd>
            <dt>投资建议</dt><dd>不提供</dd>
            <dt>服务范围</dt><dd>127.0.0.1</dd>
          </dl>
        </div>
        <p className="insp-note">数值沿用本机服务返回的分析结果。缺失数据一律标注不可用，不用零值替代；空值不画成 0.00%。</p>
      </div>
    </aside>

    <footer className="statusbar">
      <span><b>不可用字段保持显示：</b>近一年收益与基准比较在区间不足或模拟净值下显示「不可用」，不以零值替代。</span>
      <span className="spacer" />
      <span>{filteredRows.length} / {analysis?.rows.length || 0} 条 · 行高 32px · 固定表头</span>
    </footer>
  </div>;
}

function Metric({ label, value, note, positive }: { label: string; value: string; note: string; positive?: boolean }) {
  return <div className="metric-card"><span>{label}</span><strong className={positive === undefined ? '' : positive ? 'value-positive' : 'value-negative'}>{value}</strong><small>{note}</small></div>;
}

function PanelTitle({ title, note }: { title: string; note: string }) {
  return <div className="panel-title"><h2>{title}</h2><p>{note}</p></div>;
}

function FundTable({ rows, selectedCode, onSelect }: { rows: FundRow[]; selectedCode: string; onSelect: (row: FundRow) => void }) {
  if (!rows.length) return <div className="chart-empty">没有符合当前筛选条件的基金。</div>;
  return <div className="table-overflow"><table className="fund-table"><thead><tr><th>基金</th><th>数据来源</th><th>最新净值日期</th><th>近一年收益</th><th>最大回撤</th><th>持有金额</th><th>评分</th></tr></thead><tbody>{rows.map((row) => <tr className={row.代码 === selectedCode ? 'selected-row' : ''} key={row.代码} tabIndex={0} aria-current={row.代码 === selectedCode ? 'true' : undefined} aria-label={`查看 ${row.基金名称} ${row.代码} 的绩效分析`}
    onClick={() => onSelect(row)}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row); } }}>
    <td><strong>{row.基金名称}</strong><small>{row.代码} · {row.基金类型}</small></td><td><SourceBadge value={row.数据来源} /></td><td>{row.最新净值日期 || '不可用'}</td><td className={valueNumber(row.近1年收益率) === null ? '' : valueNumber(row.近1年收益率)! >= 0 ? 'return-up' : 'return-down'}>{formatPercent(row.近1年收益率)}</td><td>{formatPercent(row.近1年最大回撤)}</td><td>{formatMoney(row.当前持有金额)}</td><td>{valueNumber(row['综合评分(0-10)'])?.toFixed(1) || '不可用'}</td>
  </tr>)}</tbody></table></div>;
}

function ProvenanceCard({ title, provenance, compact = false }: { title: string; provenance?: Record<string, any>; compact?: boolean }) {
  const source = provenance?.source || '未知';
  return <div className={compact ? 'provenance-card compact' : 'provenance-card'}><div><strong>{title}</strong><SourceBadge value={source} /></div><span>请求：{provenance?.requested_source || '未记录'}</span><span>数据日期：{provenance?.data_date || '未知'}</span><span>回退状态：{fallbackLabel(provenance?.fallback_status)}</span>{provenance?.failure_reason && <small>失败原因：{provenance.failure_reason}</small>}</div>;
}

export default App;
