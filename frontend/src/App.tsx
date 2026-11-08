import { useEffect, useMemo, useState } from 'react';
import ReactECharts from './Chart';
import { Activity, ArrowDownToLine, BarChart3, Check, ChevronRight, CircleAlert, Database, RefreshCw, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from './api';
import type { Advice, Analysis, FundHistory, FundRow, Holding, Portfolio } from './types';

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

function SourceBadge({ value }: { value?: string }) {
  const synthetic = value === '模拟数据' || value === 'synthetic';
  const unavailable = value === '不可用' || value === 'unavailable';
  return <span className={`source-badge ${synthetic ? 'simulated' : unavailable ? 'unavailable' : 'live'}`}>{synthetic ? '模拟数据' : unavailable ? '不可用' : value || '来源未知'}</span>;
}

function CardChart({ option, height = 270 }: { option: object; height?: number }) {
  const colors = [cssToken('--color-chart-ink', '#477067'), cssToken('--color-chart-secondary', '#af7947'), cssToken('--color-accent', '#8c4a34')];
  return <ReactECharts option={{ color: colors, ...option }} style={{ width: '100%', height }} notMerge lazyUpdate />;
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
  const [selectedRow, setSelectedRow] = useState<FundRow | null>(null);
  const [history, setHistory] = useState<FundHistory | null>(null);
  const [period, setPeriod] = useState(365);
  const [fundType, setFundType] = useState('全部');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftHoldings, setDraftHoldings] = useState<Holding[]>([]);
  const [provider, setProvider] = useState<'glm' | 'dashscope'>('glm');
  const [apiKey, setApiKey] = useState('');
  const [advice, setAdvice] = useState<Advice | null>(null);

  const load = async (selectCode?: string) => {
    setLoading(true); setError('');
    try {
      const [portfolioResult, analysisResult] = await Promise.all([api.portfolio(), api.analysis()]);
      setPortfolio(portfolioResult);
      setAnalysis(analysisResult);
      setDraftHoldings(portfolioResult.holdings);
      const nextCode = selectCode || selectedCode || analysisResult.rows[0]?.代码 || '';
      setSelectedCode(nextCode);
      setSelectedRow(analysisResult.rows.find((row) => row.代码 === nextCode) || analysisResult.rows[0] || null);
      setAdvice(null);
    } catch (err) { setError(readableError(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load(initial.code);
    const handlePop = () => {
      const next = routeFromUrl();
      setView(next.view); setSelectedCode(next.code);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!selectedCode || view !== 'analysis') { setHistory(null); return; }
    setHistory(null);
    api.history(selectedCode, period).then((value) => { if (alive) setHistory(value); }).catch((err) => { if (alive) setError(readableError(err)); });
    return () => { alive = false; };
  }, [selectedCode, period, view]);

  const go = (next: ViewKey, code = selectedCode) => {
    setView(next); setSelectedCode(code); pushUrl(next, code); setError('');
  };

  const chooseFund = (row: FundRow) => {
    setSelectedCode(row.代码); setSelectedRow(row); setAdvice(null); pushUrl(view, row.代码);
  };

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

  const returnsOption = useMemo(() => ({
    tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => valueNumber(value) === null ? '不可用' : `${valueNumber(value)!.toFixed(2)}%` },
    grid: { left: 48, right: 16, top: 18, bottom: 54 },
    xAxis: { type: 'category', data: (analysis?.rows || []).map((row) => row.基金名称), axisLabel: { rotate: 28, interval: 0, color: cssToken('--color-muted', '#858b82') } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: cssToken('--color-muted', '#858b82') }, splitLine: { lineStyle: { color: cssToken('--color-line', '#e0ded4') } } },
    series: [{ type: 'bar', name: '近一年收益', barMaxWidth: 26, data: (analysis?.rows || []).map((row) => valueNumber(row.近1年收益率)), itemStyle: { color: cssToken('--color-chart-ink', '#477067'), borderRadius: [4, 4, 0, 0] } }],
  }), [analysis]);

  const savePortfolio = async () => {
    setBusy(true); setError('');
    try { await api.updatePortfolio(draftHoldings); setEditing(false); await load(selectedCode); setNotice('当前组合已在本次运行中更新。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const resetPortfolio = async () => {
    setBusy(true); setError('');
    try { await api.resetPortfolio(); await load(''); setNotice('已恢复虚构合成示例组合。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const refreshData = async () => {
    setBusy(true); setError('');
    try { await api.refresh(); await load(selectedCode); setNotice('已刷新数据；每项结果仍保留各自来源和日期。'); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const generateAdvice = async () => {
    if (!selectedRow) return;
    setBusy(true); setError('');
    try { setAdvice(await api.advice(selectedRow.代码, apiKey, provider)); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const updateDraft = (index: number, key: keyof Holding, value: string) => {
    setDraftHoldings((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, [key]: key === 'name' || key === 'code' ? value : (Number(value) || 0) } : row));
  };

  const sourceCounts = analysis?.summary.source_counts || {};
  const synthetic = portfolio?.synthetic ?? true;

  return <div className="fund-app">
    <header className="fund-topbar">
      <a className="fund-brand" href="/?view=portfolio" onClick={(event) => { event.preventDefault(); go('portfolio'); }}>
        <span className="brand-seal"><BarChart3 size={19} /></span>
        <span><strong>基金观察</strong><small>本地组合分析</small></span>
      </a>
      <nav className="fund-nav" aria-label="主导航">{(Object.keys(views) as ViewKey[]).map((key) => <button key={key} className={view === key ? 'fund-nav-link active' : 'fund-nav-link'} onClick={() => go(key)}>{views[key]}</button>)}</nav>
      <div className="fund-top-actions"><span className="local-pill"><ShieldCheck size={15} />仅本机</span><button className="fund-icon-button" aria-label="刷新净值" onClick={() => void refreshData()}><RefreshCw size={17} /></button></div>
    </header>

    <main className="fund-page">
      <section className="fund-heading">
        <div><p className="fund-breadcrumb">我的分析 <ChevronRight size={13} /> {views[view]}</p><h1>{view === 'portfolio' ? '组合概览' : view === 'analysis' ? '收益与风险' : '数据来源与计算口径'}</h1><p>{view === 'portfolio' ? '先看组合结构，再进入基金和数据明细。' : view === 'analysis' ? '历史表现与基准比较分开呈现，指标保留来源说明。' : '每项数据都显示来源、日期和回退状态。'}</p></div>
        <div className="fund-heading-actions"><a className="fund-button outline" href="/api/export/markdown"><ArrowDownToLine size={15} />导出分析报告</a><button className="fund-button outline" disabled={busy} onClick={() => void refreshData()}><RefreshCw size={15} />更新数据</button></div>
      </section>

      {synthetic && <div className="synthetic-banner"><span className="banner-mark">i</span><div><strong>当前组合为虚构合成示例</strong><span>持仓金额和收益只用于演示；净值来源会按每只基金单独标记。</span></div><button className="text-action" onClick={() => setEditing(true)}>编辑示例</button></div>}
      {(error || notice) && <div className={error ? 'fund-alert danger-alert' : 'fund-alert success-alert'} role={error ? 'alert' : 'status'}>{error ? <CircleAlert size={16} /> : <Check size={16} />}{error || notice}<button onClick={() => { setError(''); setNotice(''); }} aria-label="关闭提示">×</button></div>}

      {loading ? <div className="fund-loading"><Activity size={22} /><span>正在读取净值与来源信息…</span></div> : !analysis ? <div className="fund-empty"><Database size={26} /><strong>当前没有可显示的数据</strong><span>检查数据源状态后重试。</span><button className="fund-button filled" onClick={() => void load()}>重新加载</button></div> : <>
        {view === 'portfolio' && <section className="fund-stack">
          <div className="metric-row">
            <Metric label="当前持仓金额" value={formatMoney(analysis.summary.total_amount)} note={synthetic ? '合成持仓示例' : '由当前持仓计算'} />
            <Metric label="累计收益" value={formatMoney(analysis.summary.total_profit)} note="按当前持仓记录汇总" positive={(analysis.summary.total_profit || 0) >= 0} />
            <Metric label="基金数量" value={String(analysis.summary.fund_count)} note={`数据截至 ${analysis.summary.as_of || '日期未知'}`} />
            <Metric label="组合平均评分" value={analysis.summary.average_score?.toFixed(1) || '不可用'} note="基金池内相对评分" />
          </div>
          <div className="overview-panels">
            <section className="fund-panel allocation-panel"><PanelTitle title="持仓结构" note="按当前示例持仓金额汇总" /><CardChart option={allocationOption} height={265} /></section>
            <section className="fund-panel performance-panel"><PanelTitle title="基金近一年收益" note="数据不足一年或使用模拟净值时，指标显示不可用" />{(analysis.rows || []).some((row) => valueNumber(row.近1年收益率) !== null) ? <CardChart option={returnsOption} height={265} /> : <div className="chart-empty" role="status">近一年收益不可用：当前数据没有覆盖完整的一年区间。</div>}</section>
          </div>
          <section className="fund-panel table-panel">
            <div className="table-toolbar"><PanelTitle title="持有基金" note="选择一行查看绩效、来源和计算说明" /><div className="filters"><label className="search-box"><Search size={15} /><input aria-label="搜索基金" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或代码" /></label><select aria-label="基金类型筛选" value={fundType} onChange={(event) => setFundType(event.target.value)}><option>全部</option>{[...new Set(analysis.rows.map((row) => row.基金类型))].filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select><button className="fund-button outline small-button" onClick={() => setEditing(!editing)}><Settings2 size={14} />{editing ? '收起编辑' : '编辑持仓'}</button></div></div>
            {editing && <div className="holdings-editor"><div className="editor-heading"><strong>编辑当前会话的持仓</strong><span>刷新或重新打开应用后恢复合成示例，当前版本不写入本地文件。</span></div>
              <div className="table-overflow"><table className="holdings-table"><thead><tr><th>基金</th><th>代码</th><th>持有金额</th><th>持有收益率 %</th><th>累计收益</th></tr></thead><tbody>{draftHoldings.map((holding, index) => <tr key={`${holding.code}-${index}`}><td><input value={holding.name} onChange={(event) => updateDraft(index, 'name', event.target.value)} /></td><td><input value={holding.code} onChange={(event) => updateDraft(index, 'code', event.target.value)} /></td><td><input type="number" min="0" value={holding.amount} onChange={(event) => updateDraft(index, 'amount', event.target.value)} /></td><td><input type="number" value={holding.hold_ret} onChange={(event) => updateDraft(index, 'hold_ret', event.target.value)} /></td><td><input type="number" value={holding.cum_profit} onChange={(event) => updateDraft(index, 'cum_profit', event.target.value)} /></td></tr>)}</tbody></table></div>
              <div className="editor-actions"><button className="fund-button outline" onClick={() => setDraftHoldings([...draftHoldings, { code: '', name: '', amount: 0, hold_ret: 0, cum_profit: 0 }])}>添加一行</button><button className="fund-button outline" disabled={busy} onClick={() => void resetPortfolio()}>恢复示例</button><button className="fund-button filled" disabled={busy} onClick={() => void savePortfolio()}>保存到本次运行</button></div>
            </div>}
            <FundTable rows={filteredRows} selectedCode={selectedCode} onSelect={(row) => { chooseFund(row); go('analysis', row.代码); }} />
          </section>
        </section>}

        {view === 'analysis' && <section className="fund-stack">
          <section className="fund-panel fund-select-panel"><div><PanelTitle title={selectedRow?.基金名称 || '基金绩效分析'} note={selectedRow ? `${selectedRow.代码} · ${selectedRow.基金类型}` : '从持有基金中选择一只'} /></div>
            <div className="detail-selectors"><select aria-label="选择基金" value={selectedCode} onChange={(event) => { const row = analysis.rows.find((item) => item.代码 === event.target.value); if (row) chooseFund(row); }}>{analysis.rows.map((row) => <option value={row.代码} key={row.代码}>{row.基金名称}（{row.代码}）</option>)}</select><div className="period-switch">{periods.map((item) => <button key={item.days} className={period === item.days ? 'period-button active' : 'period-button'} onClick={() => setPeriod(item.days)}>{item.label}</button>)}</div></div>
          </section>
          {selectedRow && <>
            <div className="detail-metrics"><Metric label="区间收益" value={formatPercent(period === 30 ? selectedRow.近1月收益率 : period === 90 ? selectedRow.近3月收益率 : selectedRow.近1年收益率)} note={history?.nav_provenance?.data_date ? `净值截至 ${history.nav_provenance.data_date}` : '使用当前净值来源'} positive={valueNumber(selectedRow.近1年收益率) === null ? undefined : valueNumber(selectedRow.近1年收益率)! >= 0} /><Metric label="近一年最大回撤" value={formatPercent(selectedRow.近1年最大回撤)} note="按历史净值计算" /><Metric label="年化波动率" value={formatPercent(selectedRow.近1年年化波动率)} note="按日收益估算" /><Metric label="比较基准" value={history?.benchmark_available ? String(selectedRow.比较基准 || '已匹配') : '不可用'} note={history?.benchmark_available ? '显示于净值走势图' : '模拟净值或基准源不可用'} /></div>
            <section className="fund-panel history-panel"><div className="chart-header"><PanelTitle title="净值走势" note={history?.nav_provenance?.source ? `净值来源：${history.nav_provenance.source} · ${history.nav_provenance.data_date || '日期未知'}` : '正在加载净值来源'} /><SourceBadge value={history?.nav_provenance?.source} /></div>
              {history?.nav.length ? <CardChart height={340} option={{ tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { color: cssToken('--color-muted', '#858b82') } }, grid: { left: 52, right: 20, top: 18, bottom: 62 }, xAxis: { type: 'category', data: history.nav.map((point) => point.date), boundaryGap: false, axisLabel: { color: cssToken('--color-muted', '#858b82') } }, yAxis: { type: 'value', scale: true, axisLabel: { color: cssToken('--color-muted', '#858b82') }, splitLine: { lineStyle: { color: cssToken('--color-line', '#e0ded4') } } }, series: [
                { name: '基金净值', type: 'line', showSymbol: false, lineStyle: { width: 2.2, color: cssToken('--color-chart-ink', '#477067') }, data: history.nav.map((point) => point.nav) },
                ...(history.benchmark_available ? [{ name: '比较基准', type: 'line', showSymbol: false, lineStyle: { width: 1.6, type: 'dashed', color: cssToken('--color-chart-secondary', '#af7947') }, data: history.benchmark.map((point) => point.nav) }] : []),
              ] }} /> : <div className="chart-empty">{history ? '当前区间没有可绘制的净值记录。' : '正在读取历史净值…'}</div>}
              {!history?.benchmark_available && <div className="unavailable-note"><CircleAlert size={15} />比较基准不可用，页面不生成基准收益或超额结果。</div>}
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
          <div className="sources-grid"><section className="fund-panel"><PanelTitle title="基金净值来源" note="数据加载失败会明确记录回退原因" />{analysis.rows.map((row) => <ProvenanceCard key={row.代码} title={`${row.基金名称} · ${row.代码}`} provenance={row.净值来源信息} compact />)}</section>
            <section className="fund-panel"><PanelTitle title="计算口径与边界" note="用于理解演示输出，不构成投资建议" />
              <div className="method-list"><div><strong>收益率</strong><p>按可用净值序列和区间首尾净值计算；数据不足时显示不可用。</p></div><div><strong>最大回撤与波动</strong><p>依据基金历史净值计算。模拟净值会保留“模拟数据”标记。</p></div><div><strong>基准与超额</strong><p>只有基金净值与基准来源都可用时才计算；模拟净值不生成貌似真实的比较结果。</p></div><div><strong>持仓数据</strong><p>默认金额和收益为虚构示例；编辑内容仅保存在当前服务进程内存。</p></div><div><strong>API Key</strong><p>只由浏览器内存持有，随单次请求发送，不写入本地文件或服务日志。</p></div></div>
              <div className="compliance-box">{analysis.rows[0]?.净值来源信息?.source === '模拟数据' ? '当前净值使用模拟数据；所有比较基准和超额指标保持不可用。' : '本工具仅用于学习交流，不提供投资建议或交易执行。基金投资有风险。'}</div>
            </section></div>
        </section>}
      </>}
      <footer className="fund-footer"><span>基金观察 · 本地分析演示</span><span>不连接真实账户 · 不提供交易执行或投资建议</span></footer>
    </main>
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
  return <div className="table-overflow"><table className="fund-table"><thead><tr><th>基金</th><th>数据来源</th><th>最新净值日期</th><th>近一年收益</th><th>最大回撤</th><th>持有金额</th><th>评分</th></tr></thead><tbody>{rows.map((row) => <tr className={row.代码 === selectedCode ? 'selected-row' : ''} key={row.代码} onClick={() => onSelect(row)}>
    <td><strong>{row.基金名称}</strong><small>{row.代码} · {row.基金类型}</small></td><td><SourceBadge value={row.数据来源} /></td><td>{row.最新净值日期 || '不可用'}</td><td className={valueNumber(row.近1年收益率) === null ? '' : valueNumber(row.近1年收益率)! >= 0 ? 'return-up' : 'return-down'}>{formatPercent(row.近1年收益率)}</td><td>{formatPercent(row.近1年最大回撤)}</td><td>{formatMoney(row.当前持有金额)}</td><td>{valueNumber(row['综合评分(0-10)'])?.toFixed(1) || '不可用'}</td>
  </tr>)}</tbody></table></div>;
}

function ProvenanceCard({ title, provenance, compact = false }: { title: string; provenance?: Record<string, any>; compact?: boolean }) {
  const source = provenance?.source || '未知';
  return <div className={compact ? 'provenance-card compact' : 'provenance-card'}><div><strong>{title}</strong><SourceBadge value={source} /></div><span>请求：{provenance?.requested_source || '未记录'}</span><span>数据日期：{provenance?.data_date || '未知'}</span><span>回退状态：{provenance?.fallback_status || 'none'}</span>{provenance?.failure_reason && <small>失败原因：{provenance.failure_reason}</small>}</div>;
}

export default App;
