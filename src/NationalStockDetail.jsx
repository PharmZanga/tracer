import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react';
import { nationalStockBands, stockBandRecords, summariseStockCommodities, stockStatusCsv } from './stockStatusDetails.js';
import './nationalStockDetail.css';

const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-';

export default function NationalStockDetail({ band, rows, period, expectedCount, scopeLabel, onBack }) {
  const heading = useRef(null), tabs = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [search, setSearch] = useState(''), [programme, setProgramme] = useState('all');
  const [view, setView] = useState('commodities'), [commodity, setCommodity] = useState('');
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const definition = nationalStockBands.find(row => row.id === band);
  const hasDetails = Boolean(period.commodityFacilityData?.dictionaries && Array.isArray(period.commodityFacilityData.rows));
  const bandRows = useMemo(() => stockBandRecords(rows, band), [rows, band]);
  const programmes = useMemo(() => [...new Set(bandRows.map(row => row.programme))].sort(), [bandRows]);
  const filtered = useMemo(() => stockBandRecords(bandRows, band, { search, programme, commodity: view === 'records' ? commodity : '' }), [bandRows, band, search, programme, commodity, view]);
  const commodities = useMemo(() => summariseStockCommodities(filtered), [filtered]);
  const displayed = view === 'commodities' ? commodities : filtered;
  const pageCount = Math.max(1, Math.ceil(displayed.length / pageSize)), currentPage = Math.min(page, pageCount);
  const visible = displayed.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const resetPage = update => { update(); setPage(1); };
  const showRecords = name => {
    resetPage(() => { setCommodity(name); setView('records'); });
    window.requestAnimationFrame(() => tabs.current?.querySelector('#stock-records-tab')?.focus());
  };
  function tabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 'commodities' : event.key === 'End' ? 'records' : view === 'commodities' ? 'records' : 'commodities';
    resetPage(() => { setView(target); if (target === 'commodities') setCommodity(''); });
    window.requestAnimationFrame(() => tabs.current?.querySelector('[aria-selected="true"]')?.focus());
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([stockStatusCsv(filtered, { view, period, band })], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `tracer-${band}-${view}-${period.reportDate}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="national-stock-detail" aria-labelledby="national-stock-detail-title">
    <div className="national-stock-detail-head">
      <div><button type="button" className="stock-detail-back" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />Back to stock status</button><p className="eyebrow dark">National Stock Status</p><h2 ref={heading} tabIndex={-1} id="national-stock-detail-title">{definition.label} commodities</h2><p>{period.label} | {scopeLabel}</p></div>
      <button type="button" className="stock-detail-export" onClick={exportCsv} disabled={!hasDetails || !filtered.length}><Download size={17} aria-hidden="true" />Export {view === 'commodities' ? 'commodities' : 'records'} (CSV)</button>
    </div>
    <p className="stock-detail-definition">{definition.definition} Based on submitted observations before quality-gate exclusions. Missing reports are not zero stock.</p>
    {!hasDetails ? <p className="empty-state" role="status">This period has summary data only. Detailed commodity records and exports are unavailable.</p> : <>
      {bandRows.length !== expectedCount && <p className="stock-detail-warning" role="status">{number(bandRows.length)} detailed records are available against {number(expectedCount)} published card observations. Only the available records are listed and exported.</p>}
      <div className="stock-detail-controls">
        <div ref={tabs} className="stock-detail-tabs" role="tablist" aria-label="Stock status detail view" onKeyDown={tabKey}>
          <button type="button" role="tab" tabIndex={view === 'commodities' ? 0 : -1} id="stock-commodities-tab" aria-selected={view === 'commodities'} aria-controls="stock-detail-results" onClick={() => resetPage(() => { setView('commodities'); setCommodity(''); })}>Commodities</button>
          <button type="button" role="tab" tabIndex={view === 'records' ? 0 : -1} id="stock-records-tab" aria-selected={view === 'records'} aria-controls="stock-detail-results" onClick={() => resetPage(() => setView('records'))}>Reporting records</button>
        </div>
        <label className="stock-detail-search"><span>Search</span><div><Search size={16} aria-hidden="true" /><input value={search} onChange={event => resetPage(() => setSearch(event.target.value))} placeholder="Commodity, district or reporting unit" /></div></label>
        <label><span>Programme / reporting stream</span><select value={programme} onChange={event => resetPage(() => setProgramme(event.target.value))}><option value="all">All programmes</option>{programmes.map(name => <option key={name}>{name}</option>)}</select></label>
        <label><span>Rows per page</span><select value={pageSize} onChange={event => resetPage(() => setPageSize(Number(event.target.value)))}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>
      {view === 'records' && commodity && <div className="stock-detail-product"><strong>{commodity}</strong><button type="button" onClick={() => resetPage(() => setCommodity(''))} title="Show all commodities" aria-label="Clear commodity selection"><X size={16} /></button></div>}
      <p className="stock-detail-count" role="status">{number(commodities.length)} {commodities.length === 1 ? 'commodity' : 'commodities'} | {number(filtered.length)} submitted {filtered.length === 1 ? 'record' : 'records'}</p>
      <div id="stock-detail-results" role="tabpanel" aria-labelledby={view === 'commodities' ? 'stock-commodities-tab' : 'stock-records-tab'} className="table-scroll stock-detail-table">
        <table><thead>{view === 'commodities' ? <tr><th>Commodity</th><th>Programmes / streams</th><th>Records</th><th>Reporting units</th><th>Provinces</th><th>Zero SOH records</th><th>Details</th></tr> : <tr><th>Commodity</th><th>Province</th><th>District</th><th>Reporting unit</th><th>Level of care</th><th>Programme / stream</th><th>SOH</th><th>AMC</th><th>Submitted MOS</th></tr>}</thead>
          <tbody>{view === 'commodities' ? visible.map(row => <tr key={row.name}><td><button type="button" className="table-link-button" onClick={() => showRecords(row.name)}>{row.name}</button></td><td>{row.programmes}</td><td>{number(row.records)}</td><td>{number(row.reportingUnits)}</td><td>{number(row.provinces)}</td><td>{number(row.zeroQuantity)}</td><td><button type="button" className="stock-detail-record-link" onClick={() => showRecords(row.name)} title={`View records for ${row.name}`} aria-label={`View records for ${row.name}`}><ArrowRight size={17} /></button></td></tr>) : visible.map((row, index) => <tr key={`${row.item}-${row.facility}-${index}`}><td>{row.item}</td><td>{row.province}</td><td>{row.district}</td><td>{row.facility}</td><td>{row.facilityLevel}</td><td>{row.programme}</td><td>{number(row.quantity)}</td><td>{number(row.amc)}</td><td>{number(row.mos)}</td></tr>)}
            {!visible.length && <tr><td colSpan={view === 'commodities' ? 7 : 9}>No submitted records match this stock band and the selected filters.</td></tr>}
          </tbody></table>
      </div>
      <div className="stock-detail-pagination"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous results page" title="Previous page"><ChevronLeft size={18} /></button><span>Page {currentPage} of {pageCount} | {number(displayed.length)} {view === 'commodities' ? 'commodities' : 'records'}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Next results page" title="Next page"><ChevronRight size={18} /></button></div>
    </>}
  </section>;
}
