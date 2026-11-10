export type FundRow = Record<string, any> & {
  基金名称: string;
  代码: string;
  基金类型: string;
  数据来源: string;
  最新净值日期: string;
  当前持有金额: number;
  累计收益: number;
  "综合评分(0-10)": number;
  近1年收益率: number | null;
  近1年最大回撤: number | null;
  基准可用: boolean;
};

export interface Holding {
  code: string;
  name: string;
  amount: number;
  hold_ret: number;
  cum_profit: number;
}

export interface Portfolio {
  holdings: Holding[];
  synthetic: boolean;
  snapshot_date: string;
  auto_update_holdings: boolean;
  refresh_token: number;
}

export interface Analysis {
  rows: FundRow[];
  summary: { fund_count: number; total_amount: number; total_profit: number; average_score: number | null; source_counts: Record<string, number>; as_of: string | null };
}

export interface FundHistory {
  code: string;
  fund_name: string;
  nav: Array<{ date: string; nav: number }>;
  benchmark: Array<{ date: string; nav: number }>;
  nav_provenance: Record<string, any>;
  benchmark_provenance: Record<string, any>;
  benchmark_available: boolean;
}

export interface Advice {
  code: string;
  short: string;
  detail: string;
  mode: 'ai' | 'local_fallback';
  disclaimer: string;
}
