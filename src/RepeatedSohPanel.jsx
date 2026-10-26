import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, RotateCcw } from 'lucide-react';
import { loadTracerMonth, tracerReportingPeriods } from './tracerFacilityData.js';
import { commodityRowsFromPeriod } from './tracerRows.js';
import { analyseRepeatedSoh, repeatedSohCsv, repeatedSohWindow } from './repeatedSoh.js';
import { assistantProgrammeMatches } from './tracerAssistant.js';
import './repeatedSoh.css';

const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : 'Not supplied';
const dateLabel = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function RepeatedSohPanel({ catalogue, periodId, scope, matchesLevel, lookback, onLookbackChange }) {
  const [endId, setEndId] = useState(periodId), [mode, setMode] = useState('consecutive');
  const [province, setProvince] = useState(scope.province), [district, setDistrict] = useState(scope.district);
  const [level, setLevel] = useState(scope.facilityLevel), [kind, setKind] = useState('positive');
  const [search, setSearch] = useState(''), [unitKey, setUnitKey] = useState(''), [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState({ key: '', periods: [], error: '' }), [retry, setRetry] = useState(0);
  useEffect(() => { setEndId(periodId); }, [periodId]);
  useEffect(() => { setProvince(scope.province); setDistrict(scope.district); setLevel(scope.facilityLevel); }, [scope.province, scope.district, scope.facilityLevel]);
  const window = useMemo(() => repeatedSohWindow(catalogue, endId, lookback), [catalogue, endId, lookback]);
  const windowKey = window.map(period => period.id).join('|');
  const loadKey = `${windowKey}|${mode}|${retry}`;
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const required = mode === 'endpoints' ? [window[0], window.at(-1)] : window;
      for (const month of new Set(required.filter(period => period && !period.missing).map(period => period.month))) await loadTracerMonth(month);
      if (!cancelled) setLoaded({ key: loadKey, periods: required.filter(Boolean).map(meta => tracerReportingPeriods.find(period => period.id === meta.id)).filter(Boolean), error: '' });
    };
    load().catch(() => { if (!cancelled) setLoaded({ key: loadKey, periods: [], error: 'The selected weekly data could not be loaded. No results have been substituted.' }); });
    return () => { cancelled = true; };
  }, [loadKey]);
  const loading = loaded.key !== loadKey;
  const allRows = useMemo(() => loaded.periods.flatMap(commodityRowsFromPeriod), [loaded.periods]);
  const provinces = useMemo(() => [...new Set(allRows.map(row => row.province))].sort(), [allRows]);
  const districts = useMemo(() => [...new Set(allRows.filter(row => province === 'all' || row.province === province).map(row => row.district))].sort(), [allRows, province]);
  const levels = useMemo(() => [...new Set(allRows.filter(row => (province === 'all' || row.province === province) && (district === 'all' || row.district === district)).map(row => row.facilityLevel))].sort(), [allRows, province, district]);
  const result = useMemo(() => analyseRepeatedSoh(loaded.periods, { dates: window.map(period => period.reportDate), mode,
    accepts: row => (province === 'all' || row.province === province) && (district === 'all' || row.district === district)
      && (level === 'all' || row.facilityLevel === level || matchesLevel(row.facilityLevel, level))
      && (scope.facility === 'all' || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === scope.facility)
      && (scope.commodity === 'all' || row.item === scope.commodity) && assistantProgrammeMatches(row.programme, scope.programme),
  }), [loaded.periods, windowKey, mode, province, district, level, scope.facility, scope.commodity, scope.programme, matchesLevel]);
  useEffect(() => { setPage(1); setUnitKey(''); }, [endId, lookback, mode, province, district, level, kind, search, scope.facility, scope.commodity, scope.programme]);
  const filtered = useMemo(() => result.records.filter(row => (kind === 'all' || row.kind === kind)
    && (!search.trim() || [row.facility, row.district, row.province, row.item, row.programme].join(' ').toLowerCase().includes(search.trim().toLowerCase()))), [result, kind, search]);
  const unitCounts = useMemo(() => {
    const counts = new Map();
    for (const row of filtered) counts.set(row.unitKey, (counts.get(row.unitKey) || 0) + 1);
    return counts;
  }, [filtered]);
  const units = result.units.filter(unit => unitCounts.has(unit.key));
  const selectedUnit = result.units.find(unit => unit.key === unitKey);
  const records = selectedUnit ? filtered.filter(row => row.unitKey === unitKey) : filtered;
  const displayed = selectedUnit ? records : units;
  const pages = Math.max(1, Math.ceil(displayed.length / 20)), currentPage = Math.min(page, pages);
  const visible = displayed.slice((currentPage - 1) * 20, currentPage * 20);
  const ready = !loading && !loaded.error;
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([repeatedSohCsv(records, { mode, start: window[0]?.reportDate, end: window.at(-1)?.reportDate })], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `repeated-soh-${window[0]?.reportDate}-to-${window.at(-1)?.reportDate}.csv`; link.click();
    globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="repeated-soh" aria-labelledby="repeated-soh-title">
    <div className="repeat-head"><div><h3 id="repeated-soh-title">Repeated stock on hand</h3><p>Unchanged reported SOH is a verification flag, not proof of a copied report. AMC and MOS may change while SOH stays the same.</p></div><button type="button" onClick={exportCsv} disabled={!ready || !records.length}><Download size={17} aria-hidden="true" />Export weekly evidence (CSV)</button></div>
    <div className="repeat-controls">
      <label><span>Week ending</span><select value={endId} onChange={event => setEndId(event.target.value)}>{[...catalogue].sort((a, b) => b.reportDate.localeCompare(a.reportDate)).map(period => <option key={period.id} value={period.id}>{period.label}</option>)}</select></label>
      <label><span>Look back</span><select value={lookback} onChange={event => onLookbackChange(Number(event.target.value))}>{[1, 2, 3, 4, 6, 8].map(weeks => <option key={weeks} value={weeks}>{weeks} {weeks === 1 ? 'week' : 'weeks'} ago</option>)}</select></label>
      <label><span>Comparison rule</span><select value={mode} onChange={event => setMode(event.target.value)}><option value="consecutive">Unchanged every week</option><option value="endpoints">Matching endpoints only</option></select></label>
      <label><span>Province</span><select value={province} onChange={event => { setProvince(event.target.value); setDistrict('all'); }}><option value="all">All provinces</option>{province !== 'all' && !provinces.includes(province) && <option>{province}</option>}{provinces.map(name => <option key={name}>{name}</option>)}</select></label>
      <label><span>District</span><select value={district} onChange={event => setDistrict(event.target.value)}><option value="all">All districts</option>{district !== 'all' && !districts.includes(district) && <option>{district}</option>}{districts.map(name => <option key={name}>{name}</option>)}</select></label>
      <label><span>Level / reporting stream</span><select value={level} onChange={event => setLevel(event.target.value)}><option value="all">All levels</option>{level !== 'all' && !levels.includes(level) && <option value={level}>{level}</option>}{levels.map(name => <option key={name}>{name}</option>)}</select></label>
      <label><span>SOH flag</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="positive">Repeated positive SOH</option><option value="zero">Repeated zero SOH</option><option value="all">Positive and zero repeats</option></select></label>
      <label className="repeat-search"><span>Search reporting unit or commodity</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <p className="repeat-method">{window[0] && `${dateLabel(window[0].reportDate)} to ${dateLabel(window.at(-1).reportDate)}`} | {mode === 'consecutive' ? `${lookback + 1} consecutive weekly observations required` : 'Two endpoint observations; intervening changes are not tested'}. Missing, negative, non-numeric and duplicate-identity observations are excluded, as are reporting units with no positive SOH anywhere in their weekly block. District HC/HP totals remain aggregate reporting streams, not individual clinics.</p>
    {(scope.facility !== 'all' || scope.commodity !== 'all' || scope.programme !== 'all') && <p className="repeat-method">Retained assistant / dashboard scope: {[scope.facility !== 'all' ? 'Selected reporting unit' : null, scope.commodity !== 'all' ? scope.commodity : null, scope.programme !== 'all' ? scope.programme : null].filter(Boolean).join(' | ')}</p>}
    {loading ? <p role="status" className="empty-state">Loading selected weekly evidence...</p> : loaded.error ? <div role="alert" className="empty-state">{loaded.error}<button type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} />Retry</button></div> : <>
      {result.unavailableDates.length > 0 && <p role="status" className="repeat-warning">Detailed data unavailable for: {result.unavailableDates.map(dateLabel).join(', ')}. These gaps cannot count as repeated SOH.</p>}
      <dl className="repeat-totals"><div><dt>Flagged reporting units</dt><dd>{number(units.length)}</dd></div><div><dt>District aggregate streams</dt><dd>{number(units.filter(unit => unit.isAggregate).length)}</dd></div><div><dt>Flagged commodity / unit pairs</dt><dd>{number(filtered.length)}</dd></div><div><dt>Comparable pairs in scope</dt><dd>{number(result.comparable)}</dd></div></dl>
      <p className="repeat-method">{number(result.excluded)} end-week commodity / unit pairs lack an unambiguous, valid observation in every required week. Counts are records, not stock quantities. Repeated zeros may represent persistent stock-outs.</p>
      {selectedUnit && <div className="repeat-unit-head"><button type="button" onClick={() => { setUnitKey(''); setPage(1); }}><ArrowLeft size={17} />Back to reporting units</button><h4>{selectedUnit.facility}</h4><p>{selectedUnit.province} | {selectedUnit.district} | {selectedUnit.facilityLevel}</p></div>}
      <div className="table-scroll repeat-table"><table><thead>{selectedUnit ? <tr><th>Commodity / programme</th><th>Flag</th>{(mode === 'endpoints' ? [window[0], window.at(-1)] : window).map(period => <th key={period.id}>{dateLabel(period.reportDate)}<small>SOH</small></th>)}<th>Evidence</th></tr> : <tr><th>Reporting unit</th><th>Province / district</th><th>Level / stream</th><th>Flagged pairs</th><th>Comparable / end-week pairs</th><th>Details</th></tr>}</thead>
        <tbody>{selectedUnit ? visible.map(row => <tr key={row.key}><td><strong>{row.item}</strong><small>{row.programme}</small></td><td>{row.kind === 'positive' ? 'Positive SOH' : 'Zero SOH'}</td>{row.observations.map(observation => <td key={observation.reportDate}>{number(observation.quantity)}</td>)}<td><details><summary>AMC, MOS and sources</summary><div className="repeat-evidence">{row.observations.map(observation => <p key={observation.reportDate}><b>{dateLabel(observation.reportDate)}</b><br />AMC: {number(observation.amc)} | Submitted MOS: {number(observation.mos)}<br />{observation.source || 'Source filename unavailable'}</p>)}</div></details></td></tr>) : visible.map(unit => <tr key={unit.key}><td><button type="button" className="table-link-button" onClick={() => { setUnitKey(unit.key); setPage(1); }}>{unit.facility}</button><small>{unit.isAggregate ? 'District aggregate reporting stream' : 'Named facility / reporting unit'}</small></td><td>{unit.province}<small>{unit.district}</small></td><td>{unit.facilityLevel}</td><td>{number(unitCounts.get(unit.key))}</td><td>{number(unit.comparable)} / {number(unit.assessed)}</td><td><button type="button" title={`View repeated SOH for ${unit.facility}`} aria-label={`View repeated SOH for ${unit.facility}`} onClick={() => { setUnitKey(unit.key); setPage(1); }}><ArrowRight size={17} /></button></td></tr>)}
          {!visible.length && <tr><td colSpan={selectedUnit ? lookback + 4 : 6}>No repeated SOH matches the selected weeks and filters. Missing observations have not been treated as zero.</td></tr>}
        </tbody></table></div>
      <div className="repeat-pagination"><button type="button" title="Previous page" aria-label="Previous repeated SOH page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>Page {currentPage} of {pages} | {number(displayed.length)} {selectedUnit ? 'commodity / unit pairs' : 'reporting units'}</span><button type="button" title="Next page" aria-label="Next repeated SOH page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>
    </>}
  </section>;
}
