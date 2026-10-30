import {useMemo,useState} from 'react';
import './reportAnalytics.css';
import {reportSeries,forecastAvailability,stockBands,provincialReporting,allReportDistricts} from './reportAnalytics.js';
import {formatReportPercent,performanceNarrative,reportingRateNarrative,imbalanceNarrative,reportingWeeks} from './reportNarrative.js';
import {ReportPerformanceChart,ReportProvincialStockChart,ReportNationalStockChart} from './ReportCharts.jsx';
const colours=['#d32620','#c86c00','#d6a126','#278150','#2365ad','#777'];
const bands=['Zero / near-zero MOS','Emergency','Understocked','According to plan','Overstocked','MOS data gap'];
const percent=value=>Number.isFinite(value)?formatReportPercent(value):'Not reported';
const paragraphs = texts => texts.map(text => <p className="national-report-narrative" key={text}>{text}</p>);
function AvailabilityBars({rows,label='Reported drug availability by geography'}) {
  return <div className="report-stock-bars" role="img" aria-label={label}>{rows.map(row=><div className="report-stock-bar" key={`${row.province||''}|${row.name}`}><strong>{row.name}</strong><div className="report-bar-track"><i style={{width:`${Math.max(0,Math.min(1,row.availability||0))*100}%`,background:'#2365ad'}}/></div><span>{percent(row.availability)}</span></div>)}</div>;
}
export function ReportPerformanceBars({rows,subject}) {
  return <ReportPerformanceChart rows={rows} subject={subject}/>;
}
function ImbalanceChart({rows}) {
  return <ReportProvincialStockChart rows={rows}/>;
}
export function ReportGeography({summary,mode}) {
  const [chosen,setChosen]=useState('');
  const names=useMemo(()=>[...new Set([...summary.provinces.map(r=>r.name),...summary.reportingDistricts.map(r=>r.province)])].sort(),[summary]);
  const province=names.includes(chosen)?chosen:names[0];
  const districts=summary.districts.filter(r=>r.province===province).sort((a,b)=>a.availability-b.availability);
  const row=summary.provinces.find(r=>r.name===province);
  const expectedDistricts=summary.expectedDistrictRoster?.[province]||[];
  const coverage=provincialReporting(summary.reportingDistricts,province,expectedDistricts);
  const last=summary.selectedPeriods.at(-1);
  const latestCoverage=provincialReporting(summary.reportingDistricts.filter(r=>r.periodId===last.id),province,expectedDistricts);
  const selector=<><label className="report-trend-selector">Province<select value={province} onChange={e=>setChosen(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></label><h3>{province}</h3></>;
  const imbalance=mode==='imbalance';
  const reportingRates=names.map(name=>({name,...provincialReporting(summary.reportingDistricts,name,summary.expectedDistrictRoster?.[name]||[])}));
  if(mode==='district-availability') {
    const all=allReportDistricts(summary);
    const provinces=[...new Set(all.map(r=>r.province))];
    return <><p>All {all.length} expected districts, grouped by province. Availability covers submitted observations across the selected period; reporting status refers to the final week. Missing stock submissions are shown as not reported, not zero availability.</p>{provinces.map(name=>{const rows=all.filter(r=>r.province===name);return <div key={name}><h3>{name}</h3><AvailabilityBars rows={rows}/><table><thead><tr><th>District</th><th>Observations</th><th>Availability</th><th>Average MOS</th><th>Final-week DHO reporting</th></tr></thead><tbody>{rows.map(r=><tr key={r.name}><td>{r.name}</td><td>{r.rows??'Not reported'}</td><td>{percent(r.availability)}</td><td>{Number.isFinite(r.mos)?r.mos.toFixed(1):'Unavailable'}</td><td>{r.detailStatus}</td></tr>)}</tbody></table></div>;})}</>;
  }
  if(mode==='province-availability') return <>{paragraphs(performanceNarrative(summary.provinces,'Provincial'))}<AvailabilityBars rows={summary.provinces}/><p>HC/HP availability uses the submitted district percentages, averaged across district reports, not recalculated from combined stock. Other levels use their own report templates. Missing percentages are unavailable, not zero.</p></>;
  if(mode==='reporting-rate') return <>
    {paragraphs(reportingRateNarrative(reportingRates))}
    <table><thead><tr><th>Province</th><th>Complete / expected district-weeks</th><th>Rate</th><th>Partial district-weeks</th></tr></thead><tbody>{reportingRates.map(r=><tr key={r.name}><td>{r.name}</td><td>{r.reported}/{r.expected}</td><td>{percent(r.rate)}</td><td>{r.partial}</td></tr>)}</tbody></table>
    <p>Reporting rate is complete district-week submissions divided by expected district-weeks ({reportingWeeks(summary.selectedPeriods.length)}). Both Health Centre and Health Post evidence are required; hospital-only and all-zero template blocks do not count. A missing denominator is shown as not reported.</p>
  </>;
  if(imbalance) return <>
    {paragraphs(imbalanceNarrative(summary.provinces))}<ImbalanceChart rows={summary.provinces}/>
    <p>Each percentage uses all submitted commodity observations for that province as its denominator, including MOS gaps. Zero/near-zero MOS may include positive quantities. Grey percentages above the columns identify missing MOS. Multi-week totals are repeated observations, not cumulative stock balances or unique commodities.</p>
  </>;
  return <>{selector}{mode==='profile'&&<><p>{row?`${row.rows.toLocaleString()} submitted commodity observations; availability ${percent(row.availability)}; average MOS ${Number.isFinite(row.mos)?row.mos.toFixed(1):'unavailable'}.`:'No stock observations were submitted for this province.'}</p><p>Complete district reports in the final week ({last.reportDate}): {latestCoverage.reported}/{latestCoverage.expected} ({percent(latestCoverage.rate)}). Across the selected period: {coverage.reported}/{coverage.expected} district-week submissions ({percent(coverage.rate)}).</p></>}<AvailabilityBars rows={districts}/><table><thead><tr><th>District</th><th>Observations</th><th>Availability</th><th>Average MOS</th><th>Final-week DHO reporting</th></tr></thead><tbody>{summary.reportingDistricts.filter(r=>r.province===province&&r.periodId===last.id).map(d=>{const r=districts.find(r=>r.name===d.name);return <tr key={d.name}><td>{d.name}</td><td>{r?.rows??'Not reported'}</td><td>{percent(r?.availability)}</td><td>{Number.isFinite(r?.mos)?r.mos.toFixed(1):'Unavailable'}</td><td>{d.detailStatus}</td></tr>;})}</tbody></table><p>District availability includes submitted facility levels within the district; DHO reporting measures primary-care submission completeness separately. No facility roster size is inferred from aggregate reporting units.</p></>;
}
export function ReportStockBars({rows}) {
  return <ReportNationalStockChart rows={rows}/>;
}
function SeriesChart({series,stock=false}) {
  const width=760,height=310,left=48,top=24,plot=210,step=(width-80)/Math.max(1,series.length);
  return <div className="national-report-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={stock?'Weekly commodity stock-band shares':'Weekly reported availability'}>
    {[0,25,50,75,100].map(value=><g key={value}><line x1={left} x2={width-20} y1={top+plot*(1-value/100)} y2={top+plot*(1-value/100)} stroke="#ddd"/><text x={left-5} y={top+plot*(1-value/100)+4} textAnchor="end">{value}%</text></g>)}
    {series.map((p,i)=>{let offset=0;return <g key={p.date}>{p.row&&p.row.rows>0&&(stock||Number.isFinite(p.row.availability))?(stock?stockBands(p.row):[p.row.availability*p.row.rows]).map((count,j)=>{const share=count/p.row.rows;const bar=<rect key={j} x={left+step*i+step*.2} y={top+plot*(1-offset-share)} width={step*.6} height={plot*share} fill={stock?colours[j]:'#2365ad'}><title>{`${p.label}: ${stock?bands[j]:'Availability'} ${percent(share)}`}</title></rect>;offset+=share;return bar;}):<text x={left+step*(i+.5)} y={top+plot/2} textAnchor="middle">N/A</text>}<text x={left+step*(i+.5)} y={top+plot+20} textAnchor="middle">{p.date.slice(5)}</text></g>;})}
    {stock&&bands.map((label,i)=><g key={label}><rect x={left+(i%3)*235} y={264+Math.floor(i/3)*19} width="10" height="10" fill={colours[i]}/><text x={left+15+(i%3)*235} y={273+Math.floor(i/3)*19}>{label}</text></g>)}
  </svg></div>;
}
export function ReportTrendSection({periods,scope,predictive=false}) {
  const names=useMemo(()=>[...new Set(periods.flatMap(p=>(p[scope]||[]).map(r=>r.name)))].sort(),[periods,scope]);
  const [chosen,setChosen]=useState('');
  const name=names.includes(chosen)?chosen:names[0];
  const series=useMemo(()=>reportSeries(periods,scope,name),[periods,scope,name]);
  const forecast=useMemo(()=>predictive?forecastAvailability(series):null,[series,predictive]);
  if(!names.length) return <p>No reported observations are available for this section.</p>;
  return <><label className="report-trend-selector">{scope==='provinces'?'Province':'Commodity'}<select value={name} onChange={e=>setChosen(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select></label><h3>{name}</h3><p>History: {series[0]?.date} to {series.at(-1)?.date}. Missing reports are gaps, not zero stock. Reporting coverage and commodity mix can affect comparisons.</p>
    <SeriesChart series={series} stock={scope==='commodities'&&!predictive}/>
    {predictive?<>{forecast.status==='insufficient'?<p>Prediction unavailable: at least four consecutive reported weeks ending in the selected period are required ({forecast.observations} available).</p>:<><p>Exploratory four-week availability forecast using non-seasonal Holt smoothing, based on {forecast.observations} consecutive observations. This is not a demand forecast or a confirmed stock-out prediction. Approximate 95% model intervals do not account for changes in reporting coverage, deliveries or consumption.</p><table><thead><tr><th>Week ending</th><th>Estimated availability</th><th>Approximate 95% interval</th></tr></thead><tbody>{forecast.points.map(p=><tr key={p.date}><td>{p.date}</td><td>{percent(p.value)}</td><td>{percent(p.lower)} - {percent(p.upper)}</td></tr>)}</tbody></table></>}</>:<table><thead><tr><th>Week ending</th><th>Observations</th><th>Availability</th><th>Average MOS</th><th>Zero/near-zero MOS</th><th>Emergency + understocked</th><th>Overstocked</th></tr></thead><tbody>{series.map(p=><tr key={p.date}><td>{p.date}</td><td>{p.row?.rows??'Not reported'}</td><td>{percent(p.row?.availability)}</td><td>{Number.isFinite(p.row?.mos)?p.row.mos.toFixed(1):'Unavailable'}</td><td>{p.row?.stockout??'-'}</td><td>{p.row?(p.row.nearCritical||0)+(p.row.understocked||0):'-'}</td><td>{p.row?(p.row.abovePlan||0)+(p.row.overstock||0):'-'}</td></tr>)}</tbody></table>}
  </>;
}
