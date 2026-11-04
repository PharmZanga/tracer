import {useEffect, useMemo, useState} from 'react';
import {FileText, RotateCcw} from 'lucide-react';
import {reportOptions} from './reportPeriods.js';
import {comparisonSections, defaultComparisonPeriods, comparisonGroups, comparisonNarrative, comparisonChanges, comparisonChange, comparisonPercent, comparisonMos} from './reportComparison.js';
import './comparisonReport.css';
import {buildReportFeedback} from './reportFeedback.js';
import {ReportKeyFindings, ReportInterventions, ReportConclusion} from './ReportFeedback.jsx';
import {ReportAvailabilityBar, ReportMosPoint, reportAvailabilityColour, reportMosColour} from './ReportChartMarks.jsx';

const shortName = name => name.replace(/ PROVINCE$/i, '').replace(/\s+/g, ' ').trim();
const wrap = text => {
  const lines = [''];
  for (const word of shortName(text).split(' ')) {
    if (lines.at(-1).length + word.length > 24) lines.push(word);
    else lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${word}`;
  }
  return lines;
};

export function ComparisonReportChart({periods, groups, title}) {
  const left = 78, right = 1100, top = 105, plot = 345, bottom = top + plot;
  const groupWidth = (right - left) / Math.max(1, groups.length), step = groupWidth * .78 / Math.max(1, periods.length);
  const centre = (groupIndex, index) => left + groupWidth * (groupIndex + .11) + step * (index + .5);
  const maximum = Math.max(4, Math.ceil(Math.max(0, ...groups.flatMap(group => group.values.map(row => Number.isFinite(row.mos) ? row.mos : 0)))));
  const labelLines = Math.max(1, ...groups.map(group => wrap(group.name).length));
  const height = bottom + 115 + labelLines * 18;
  const yMos = value => bottom - value / maximum * plot;
  return <figure className="national-report-chart report-reference-chart comparison-report-chart"><svg viewBox={`0 0 1200 ${height}`} role="img" aria-label={title}>
    <title>{title}</title><text className="chart-title" x={left} y="30">{title}</text>
    <g className="chart-legend"><rect x="350" y={height - 49} width="22" height="14" fill={reportAvailabilityColour}/><text x="382" y={height - 37}>Availability (%)</text>
    <line x1="610" x2="645" y1={height - 42} y2={height - 42} stroke={reportMosColour} strokeWidth="3"/><text x="658" y={height - 37}>Months of stock (MOS)</text></g>
    <text x={left} y="88">Availability (%)</text><text x={right} y="88" textAnchor="end">Months of stock (MOS)</text>
    {[0, 20, 40, 60, 80, 100].map(value => <g key={value}><line x1={left} x2={right} y1={bottom - value / 100 * plot} y2={bottom - value / 100 * plot} stroke="#ddd" strokeDasharray="4 3"/><text x={left - 10} y={bottom - value / 100 * plot + 5} textAnchor="end">{value}%</text></g>)}
    <line x1={left} x2={left} y1={top} y2={bottom} stroke="#333"/><line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#333"/><line x1={right} x2={right} y1={top} y2={bottom} stroke="#333"/>
    {Array.from({length: 6}, (_, i) => <text key={i} x={right + 12} y={bottom - i / 5 * plot + 5}>{(i * maximum / 5).toFixed(1)}</text>)}
    {groups.map((group, groupIndex) => {
      const points = group.values.map((row, i) => Number.isFinite(row.mos) ? {x: centre(groupIndex, i), y: yMos(row.mos)} : null);
      const segments = [];
      points.forEach((point, i) => {if (point) {if (!i || !points[i - 1]) segments.push([]); segments.at(-1).push(`${point.x},${point.y}`);}});
      return <g key={group.name} data-comparison-group={group.name}>
        {group.values.map((row, i) => {
          const x = centre(groupIndex, i), h = Number.isFinite(row.availability) ? row.availability * plot : 0;
          return <g key={periods[i].id} data-comparison-period={periods[i].id}>
            {Number.isFinite(row.availability) ? <ReportAvailabilityBar x={x - step * .4} y={bottom - h} width={step * .8} height={h} label={comparisonPercent(row.availability)}/> : <text x={x} y={bottom - 20} textAnchor="middle">N/R</text>}
            <text x={x} y={bottom + 23} textAnchor="middle">{periods[i].shortLabel}</text>
          </g>;
        })}
        {segments.map((segment, i) => <polyline key={i} points={segment.join(' ')} fill="none" stroke={reportMosColour} strokeWidth="3.5"/>)}
        {points.map((point, i) => point && <ReportMosPoint key={i} {...point} value={group.values[i].mos} top={top} bottom={bottom} className="comparison-mos-label"/>)}
        <text x={left + groupWidth * (groupIndex + .5)} y={bottom + 48} textAnchor="middle">{wrap(group.name).map((line, i) => <tspan key={i} x={left + groupWidth * (groupIndex + .5)} dy={i ? 18 : 0}>{line}</tspan>)}</text>
      </g>;
    })}
    <text className="chart-source" x={left} y={height - 10}>Source: dashboard tracer submissions. Missing values are N/R; availability and MOS use different axes.</text>
  </svg></figure>;
}

function ComparisonTable({periods, groups}) {
  return <div className="comparison-report-table"><table><thead><tr><th>Group</th>{periods.map(period => <th key={period.id}>{period.shortLabel}: availability; MOS</th>)}<th>{periods[0].shortLabel} to {periods.at(-1).shortLabel} availability change</th></tr></thead><tbody>{groups.map(group => <tr key={group.name}><td>{group.name}</td>{group.values.map((row, i) => <td key={periods[i].id}>{comparisonPercent(row.availability)}; {comparisonMos(row.mos)} MOS</td>)}<td>{comparisonChange(comparisonChanges([group.values[0], group.values.at(-1)], 'availability', 100)[0]?.value)}</td></tr>)}</tbody></table></div>;
}

function ComparisonChangeTable({periods, groups}) {
  return <><h3>Changes between reporting periods</h3><table><thead><tr><th>Group</th><th>Comparison</th><th>Availability change (pp)</th><th>MOS change (months)</th></tr></thead><tbody>{groups.flatMap(group => {
    const mos = comparisonChanges(group.values, 'mos');
    return comparisonChanges(group.values, 'availability', 100).map((change, i) => <tr key={`${group.name}-${change.from}-${change.to}`}><td>{group.name}</td><td>{periods[change.from].shortLabel} to {periods[change.to].shortLabel}</td><td>{comparisonChange(change.value)}</td><td>{comparisonChange(mos[i]?.value, 'months')}</td></tr>);
  })}</tbody></table></>;
}

export function ComparisonReportDocument({periods, year, sections, exporting}) {
  const selected = comparisonSections.filter(([id]) => sections.includes(id));
  const labelled = selected.map(([id, title], i) => [id, `${String.fromCharCode(65 + i)}. ${title}`]);
  const feedback = buildReportFeedback({periods});
  return <article className="national-weekly-report" id="comparison-report-document" inert={exporting || undefined} aria-busy={exporting || undefined}>
    <header className="national-report-cover"><img src="/zambia-coat-of-arms.svg" alt="Republic of Zambia coat of arms" width="80" height="80"/><p>MINISTRY OF HEALTH</p><h1>Tracer Comparison Report</h1><p className="national-report-cover-description">Comparative analysis of tracer commodity availability and months of stock across the selected reporting periods, using dashboard data.</p><span>Report periods: {periods.map(period => period.label).join(' | ')}</span><strong>Prepared by: Zanga Musakuzi</strong><small>Principal Pharmacist - Data Analytics</small><b className="national-report-cover-year">{year}</b></header>
    <section className="national-report-section"><h2>Contents</h2>{labelled.map(([id, title]) => <p key={id}>{title}</p>)}</section>
    {labelled.map(([id, title]) => <section className="national-report-section" data-report-section={id} key={id}>
      <div className="national-report-section-head"><p>{title}</p></div>
      {id === 'actions' ? <ReportInterventions feedback={feedback}/> : id === 'conclusion' ? <ReportConclusion feedback={feedback}/> : id === 'coverage' ? <>
        <table><thead><tr><th>Period</th><th>Submission months</th><th>Weeks loaded</th><th>Commodity observations</th><th>Last reporting date</th></tr></thead><tbody>{periods.map(period => <tr key={period.id}><td>{period.label}</td><td>{period.months.join(', ')}</td><td>{period.weeks}</td><td>{period.national.rows.toLocaleString('en-GB')}</td><td>{period.lastDate}</td></tr>)}</tbody></table>
        <p>Availability and MOS use the same aggregation functions as the dashboard Comparison view, with all provinces, districts, care levels, commodities and programmes included. Availability is weighted by submitted commodity observations; it is not the simple mean of quarter percentages. MOS uses the dashboard row-weighted summary method. No published report percentages have been substituted.</p>
        <p>Periods follow the dashboard submission month rather than the calendar month of the reporting date. Quarter labels marked partial lack one or more submission months; the coverage table also shows the number of available reporting weeks. Available months do not guarantee that every expected weekly or facility submission was received. Totals across weeks are repeated observations, not unique facilities or cumulative stock balances.</p>
        <p>Changes in availability are percentage points (pp); changes in MOS are months. N/R means no verified observation, not zero stock. Positive SOH indicates reported stock presence, not assured service continuity. Different facility and commodity coverage can influence period comparisons; verify commodity-level evidence before deciding on replenishment or redistribution.</p>
      </> : <>
        {id === 'national' ? <ReportKeyFindings feedback={feedback}/> : comparisonNarrative(periods, comparisonGroups(periods, id), comparisonSections.find(([key]) => key === id)[1]).map(text => <p className="national-report-narrative" key={text}>{text}</p>)}
        {Array.from({length: Math.ceil(comparisonGroups(periods, id).length / (id === 'levels' ? 4 : 3))}, (_, i) => <ComparisonReportChart key={i} periods={periods} groups={comparisonGroups(periods, id).slice(i * (id === 'levels' ? 4 : 3), (i + 1) * (id === 'levels' ? 4 : 3))} title={`${title.slice(3)}${i ? ` (continued ${i + 1})` : ''}`}/>)}
        <ComparisonTable periods={periods} groups={comparisonGroups(periods, id)}/>
        <ComparisonChangeTable periods={periods} groups={comparisonGroups(periods, id)}/>
      </>}
    </section>)}
  </article>;
}

export default function ComparisonReport({catalogue, years, year, onYearChange, onTypeChange, loadReport}) {
  const [frequency, setFrequency] = useState('quarterly');
  const options = useMemo(() => reportOptions(catalogue, frequency, year), [catalogue, frequency, year]);
  const scope = `${year}-${frequency}`;
  const [selection, setSelection] = useState({scope, ids: defaultComparisonPeriods(options)});
  const ids = selection.scope === scope ? selection.ids : defaultComparisonPeriods(options);
  const chosen = options.filter(option => ids.includes(option.id));
  const key = chosen.map(option => option.id).join('|');
  const [result, setResult] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [sections, setSections] = useState(comparisonSections.map(([id]) => id));
  const [exporting, setExporting] = useState(''), [exportError, setExportError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (chosen.length < 2) return;
    loadReport(chosen).then(periods => {if (!cancelled) setResult({key, periods});}).catch(() => {if (!cancelled) setError('Comparison data could not be loaded. Please try again.');});
    return () => {cancelled = true;};
  }, [key, retry, loadReport]);
  const ready = chosen.length >= 2 && result?.key === key && !error;
  async function download(format) {
    if (!ready || exporting || !sections.length) return;
    setExporting(format); setExportError('');
    try {
      const {exportNationalReport} = await import('./reportExport.js');
      await exportNationalReport(format, document.getElementById('comparison-report-document'), {periodId: chosen.map(option => option.id).join('-vs-')});
    } catch (failure) {setExportError(failure.message || 'The comparison report could not be downloaded.');}
    finally {setExporting('');}
  }
  return <section className="national-report-workspace">
    <div className="national-report-tools comparison-report-tools">
      <label><span>Report type</span><select value="comparison" disabled={Boolean(exporting)} onChange={event => onTypeChange(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="comparison">Comparison Report</option></select></label>
      <label><span>Compare periods</span><select value={frequency} disabled={Boolean(exporting)} onChange={event => setFrequency(event.target.value)}><option value="quarterly">Quarters</option><option value="monthly">Months</option><option value="weekly">Weeks</option></select></label>
      <label><span>Year</span><select value={year} disabled={Boolean(exporting)} onChange={event => onYearChange(event.target.value)}>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <div className="national-report-tool-actions"><button type="button" disabled={!ready || !sections.length || Boolean(exporting)} onClick={() => download('docx')}><FileText size={16}/> {exporting === 'docx' ? 'Preparing Word...' : 'Download Word (.docx)'}</button><button type="button" disabled={!ready || !sections.length || Boolean(exporting)} onClick={() => download('pdf')}><FileText size={16}/> {exporting === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</button></div>
      <fieldset className="national-report-section-picker" disabled={Boolean(exporting)}><legend>Reporting periods (2-4)</legend>{options.map(option => <label key={option.id}><input type="checkbox" checked={ids.includes(option.id)} disabled={ids.length >= 4 && !ids.includes(option.id)} onChange={event => setSelection({scope, ids: event.target.checked ? [...ids, option.id] : ids.filter(id => id !== option.id)})}/><span>{option.label}</span></label>)}</fieldset>
      <fieldset className="national-report-section-picker" disabled={Boolean(exporting)}><legend>Report sections</legend>{comparisonSections.map(([id, title]) => <label key={id}><input type="checkbox" checked={sections.includes(id)} onChange={event => setSections(current => event.target.checked ? [...current, id] : current.filter(value => value !== id))}/><span>{title}</span></label>)}</fieldset>
      {exportError && <p role="alert">{exportError}</p>}{exporting && <p role="status">Preparing comparison report and charts...</p>}
    </div>
    {chosen.length < 2 ? <p role="status">Select at least two reporting periods.</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw size={16}/> Try again</button></p> : !ready ? <p role="status">Loading selected comparison periods...</p> : !sections.length ? <p role="status">Select at least one report section.</p> : <ComparisonReportDocument periods={result.periods} year={year} sections={sections} exporting={Boolean(exporting)}/>}
  </section>;
}
