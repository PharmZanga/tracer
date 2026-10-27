import { useMemo } from 'react';
import { ArrowUpRight, ScanSearch } from 'lucide-react';
import { analyseRepeatedSoh, summariseRepeatedSohScope } from './repeatedSoh.js';
import useRepeatedSohHistory from './useRepeatedSohHistory.js';

export default function ExecutiveRepeatedReportsCard({ catalogue, periodId, lookback, province, district, facilityLevel, facility, matchesLevel, onOpen }) {
  const { window, windowKey, loaded, loading, retry } = useRepeatedSohHistory(catalogue, periodId, lookback);
  // Analyse the weekly history once; geography clicks only filter its reporting units.
  const analysis = useMemo(() => analyseRepeatedSoh(loaded.periods, { dates: window.map(period => period.reportDate) }), [loaded.periods, windowKey]);
  const summary = useMemo(() => summariseRepeatedSohScope(analysis, { province, district, facilityLevel, facility }, matchesLevel), [analysis, province, district, facilityLevel, facility, matchesLevel]);
  const unavailable = !window.length || summary.count === null;
  const value = loading ? 'Checking...' : loaded.error || unavailable ? 'Unavailable' : summary.count.toLocaleString();
  const sub = loading ? 'Loading weekly SOH evidence'
    : loaded.error ? 'Weekly history could not load. Retry check.'
      : unavailable ? 'Required weekly SOH detail is unavailable'
        : `More than 50% unchanged SOH across ${lookback + 1} weekly reports; ${summary.assessed} reports assessed`;
  const range = window.length ? `${window[0].reportDate} to ${window.at(-1).reportDate}` : 'No comparison window';
  return <button type="button" className="tone-amber" disabled={loading} aria-busy={loading || undefined}
    onClick={loaded.error ? retry : onOpen} title={`${sub}. ${range}. Missing earlier records cannot inflate the percentage. District HC/HP groups are aggregate reporting streams.`}
    aria-label={`Repeated reports: ${value}. ${sub}. ${range}`}>
    <span className="executive-kpi-icon"><ScanSearch size={22} strokeWidth={2.2} aria-hidden="true" /></span>
    <div><span>Repeated reports</span><strong aria-live="polite" aria-atomic="true">{value}</strong><small>{sub}</small></div>
    <ArrowUpRight className="executive-kpi-drilldown" size={16} aria-hidden="true" />
  </button>;
}
