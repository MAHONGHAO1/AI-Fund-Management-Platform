import type { Advice, Analysis, FundHistory, FundRow, Holding, Portfolio } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof payload === 'string' ? payload : payload.detail || `请求失败（${response.status}）`);
  return payload as T;
}

export const api = {
  health: () => request<{ status: string; version: string }>('/api/health'),
  portfolio: () => request<Portfolio>('/api/portfolio'),
  analysis: () => request<Analysis>('/api/analysis'),
  updatePortfolio: (holdings: Holding[]) => request<Portfolio>('/api/portfolio', { method: 'PUT', body: JSON.stringify({ holdings }) }),
  resetPortfolio: () => request<Portfolio>('/api/portfolio/reset', { method: 'POST' }),
  refresh: () => request<{ refresh_token: number }>('/api/data/refresh', { method: 'POST' }),
  fund: (code: string) => request<FundRow>(`/api/funds/${encodeURIComponent(code)}`),
  history: (code: string, days: number) => request<FundHistory>(`/api/funds/${encodeURIComponent(code)}/history?days=${days}`),
  advice: (code: string, apiKey: string, provider: string) => request<Advice>(`/api/funds/${encodeURIComponent(code)}/advice`, { method: 'POST', body: JSON.stringify({ api_key: apiKey, provider }) }),
};
