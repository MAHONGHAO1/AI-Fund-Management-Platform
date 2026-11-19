import { describe, expect, it } from 'vitest';
import { normalizedHistorySeries } from './history';

describe('normalizedHistorySeries', () => {
  it('rebases both series to 100 and aligns them by date', () => {
    const result = normalizedHistorySeries(
      [{ date: '2026-01-01', nav: 1.5 }, { date: '2026-01-02', nav: 1.8 }],
      [{ date: '2026-01-01', nav: 4500 }, { date: '2026-01-03', nav: 4950 }],
    );

    expect(result.dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(result.nav).toEqual([100, 120, null]);
    expect(result.benchmark).toEqual([100, null, 110]);
  });

  it('returns nulls rather than inventing a base for missing or zero data', () => {
    const result = normalizedHistorySeries([], [{ date: '2026-01-01', nav: 0 }, { date: '2026-01-02', nav: 10 }]);

    expect(result.nav).toEqual([null, null]);
    expect(result.benchmark).toEqual([null, null]);
  });
});
