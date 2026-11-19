export interface NavPoint {
  date: string;
  nav: number;
}

/**
 * Align NAV and benchmark by date and rebase each series to 100 at its first
 * point. Raw NAV (~1.9) and index levels (~4500) cannot share one axis without
 * making the fund curve look flat; normalized values keep both readable.
 * A series with a missing or zero starting point stays null instead of being
 * silently rebased to a different date.
 */
export function normalizedHistorySeries(nav: NavPoint[], benchmark: NavPoint[]) {
  const navByDate = new Map(nav.map((point) => [point.date, Number(point.nav)]));
  const benchmarkByDate = new Map(benchmark.map((point) => [point.date, Number(point.nav)]));
  const dates = [...new Set([...navByDate.keys(), ...benchmarkByDate.keys()])].sort();

  const baseOf = (points: NavPoint[]) => {
    const value = points.length ? Number(points[0].nav) : NaN;
    return Number.isFinite(value) && value !== 0 ? value : null;
  };
  const navBase = baseOf(nav);
  const benchmarkBase = baseOf(benchmark);
  const rebase = (value: number | undefined, base: number | null) => {
    if (value === undefined || base === null || !Number.isFinite(value)) return null;
    return Number(((value / base) * 100).toFixed(4));
  };

  return {
    dates,
    nav: dates.map((date) => rebase(navByDate.get(date), navBase)),
    benchmark: dates.map((date) => rebase(benchmarkByDate.get(date), benchmarkBase)),
  };
}
