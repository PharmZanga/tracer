import { useEffect, useMemo, useState } from 'react';
import { loadTracerMonth, tracerReportingPeriods } from './tracerFacilityData.js';
import { repeatedSohWindow } from './repeatedSoh.js';

export default function useRepeatedSohHistory(catalogue, endId, lookback, mode = 'consecutive') {
  const window = useMemo(() => repeatedSohWindow(catalogue, endId, lookback), [catalogue, endId, lookback]);
  const windowKey = window.map(period => period.id).join('|');
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState({ key: '', periods: [], error: '' });
  const loadKey = `${windowKey}|${mode}|${attempt}`;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const required = mode === 'endpoints' ? [window[0], window.at(-1)] : window;
      for (const month of new Set(required.filter(period => period && !period.missing).map(period => period.month))) await loadTracerMonth(month);
      if (!cancelled) setLoaded({ key: loadKey, periods: required.filter(Boolean).map(meta => tracerReportingPeriods.find(period => period.id === meta.id)).filter(Boolean), error: '' });
    }
    load().catch(() => { if (!cancelled) setLoaded({ key: loadKey, periods: [], error: 'The selected weekly data could not be loaded. No results have been substituted.' }); });
    return () => { cancelled = true; };
  }, [loadKey]);
  return { window, windowKey, loaded, loading: loaded.key !== loadKey, retry: () => setAttempt(value => value + 1) };
}
