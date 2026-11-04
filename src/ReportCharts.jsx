import {useId} from 'react';
import {formatReportPercent} from './reportNarrative.js';
import {rankedReportRows, reportChartLabels, reportGroupName, reportMosMaximum, reportImbalanceRows} from './reportChartData.js';
import {ReportAvailabilityBar, ReportMosPoint, reportAvailabilityColour, reportMosColour} from './ReportChartMarks.jsx';

const palette = ['#c00000', '#e87500', '#f2bb2d', '#2f8b57', '#2e75b6', '#9a9a9a'];
const mosColour = reportMosColour;
const width = 1200;
const sourceNote = 'Source: selected provincial tracer submissions. Missing values are not zero stock.';

function Chart({title, children, height, note = sourceNote, subtitle, className = '', ariaLabel = title}) {
  const notes = Array.isArray(note) ? note : [note];
  return <figure className={`national-report-chart report-reference-chart ${className}`.trim()}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <title>{title}</title><text className="chart-title" x="72" y="32">{title}</text>{children}
    {subtitle && <text className="chart-subtitle" x="72" y="64">{subtitle}</text>}
    {notes.map((line, i) => <text className="chart-source" x={subtitle ? 72 : 20} y={height-12-(notes.length-1-i)*21} key={i}>{line}</text>)}
  </svg></figure>;
}

function PercentAxis({left, right, top, plot, every = 20, label = 'Commodity availability (%)'}) {
  return <>{Array.from({length:100/every+1}, (_, i) => i*every).map(value => {
    const y = top+plot*(1-value/100);
    return <g key={value}><line x1={left} x2={right} y1={y} y2={y} stroke="#d8d8d8" strokeDasharray="4 3"/><text x={left-12} y={y+5} textAnchor="end">{value}%</text></g>;
  })}<line x1={left} x2={left} y1={top} y2={top+plot} stroke="#222"/><line x1={left} x2={right} y1={top+plot} y2={top+plot} stroke="#222"/>
  <text className="chart-axis-title" transform={`translate(23 ${top+plot/2}) rotate(-90)`} textAnchor="middle">{label}</text></>;
}

export function ReportCareChart({rows}) {
  return <ReportPerformanceChart rows={rows} subject="Care" descending title="Commodity Availability by Level of Care"/>;
}

export function ReportPerformanceChart({rows, subject, title, descending, preserveOrder = false}) {
  const province=subject==='Provincial';
  const district=subject==='District';
  const ranked=preserveOrder ? rows : rankedReportRows(rows, descending ?? province);
  if (!ranked.length) return <p>No observations are available for this chart.</p>;
  const left=85, right=1110, top=92, plot=410, step=(right-left)/ranked.length, maximum=reportMosMaximum(ranked);
  const labelLines=Math.max(...ranked.map(row=>reportChartLabels(row,province).length));
  const labelSpace=district ? Math.max(115,...ranked.map(row=>row.name.length*5.6+32)) : labelLines*18+20;
  const height=top+plot+labelSpace+35;
  const points=ranked.map((row,i)=>Number.isFinite(row.mos)?{x:left+step*(i+.5),y:top+plot*(1-row.mos/maximum)}:null);
  const segments=[];
  points.forEach((point,i)=>{if(point){if(!i||!points[i-1])segments.push([]);segments.at(-1).push(`${point.x},${point.y}`);}});
  return <Chart title={title || `Commodity Availability and Months of Stock by ${province?'Province':'Programme/Facility Type'}`} height={height} className="report-availability-combo">
    <g className="chart-legend"><rect x={left} y="53" width="17" height="12" fill={reportAvailabilityColour}/><text x={left+24} y="64">Availability (%)</text><line x1={left+190} x2={left+220} y1="59" y2="59" stroke={mosColour} strokeWidth="3"/><text x={left+230} y="64">Months of stock (MOS)</text></g>
    <PercentAxis {...{left,right,top,plot}}/>
    <line x1={right} x2={right} y1={top} y2={top+plot} stroke="#222"/>
    {Array.from({length:7},(_,i)=>i*maximum/6).map((tick,i)=><text key={i} x={right+10} y={top+plot*(1-i/6)+5}>{Number.isInteger(tick)?tick:tick.toFixed(1)}</text>)}
    <text className="chart-axis-title" transform={`translate(1174 ${top+plot/2}) rotate(-90)`} textAnchor="middle">Months of stock (MOS)</text>
    {ranked.map((row,i)=>{
      const x=left+step*(i+.22), barWidth=step*.56, y=top+plot*(1-(row.availability||0));
      return <g key={row.label||row.name}>
        {Number.isFinite(row.availability)?<ReportAvailabilityBar x={x} y={y} width={barWidth} height={top+plot-y} label={formatReportPercent(row.availability)}/>:<text x={x+barWidth/2} y={top+plot/2} textAnchor="middle">N/R</text>}
        {district ? <text className="chart-category" transform={`translate(${x+barWidth/2} ${top+plot+25}) rotate(-38)`} textAnchor="end">{row.name}</text> : <text className="chart-category" x={x+barWidth/2} y={top+plot+22} textAnchor="middle">{reportChartLabels(row,province).map((line,j)=><tspan key={j} x={x+barWidth/2} dy={j?18:0}>{line}</tspan>)}</text>}
      </g>;
    })}
    {segments.map((segment,i)=><polyline key={i} points={segment.join(' ')} fill="none" stroke={mosColour} strokeWidth="3"/>)}
    {ranked.map((row,i)=>{
      if(!points[i])return null;
      return <ReportMosPoint key={row.label||row.name} {...points[i]} value={row.mos} top={top} bottom={top+plot}/>;
    })}
  </Chart>;
}

function chartNoteLines(text) {
  const lines = [];
  for (const word of text.split(/\s+/)) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 135) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}

export function ReportDistrictChart({rows, province, periodLabel, reportingNote}) {
  const ranked = rankedReportRows(rows);
  if (!ranked.length) return <p>No expected districts are available for this province.</p>;
  const left=85, right=1110, top=135, plot=410, base=top+plot;
  const step=(right-left)/ranked.length, maximum=Math.max(7, reportMosMaximum(ranked));
  const names=ranked.map(row => row.name.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase()));
  const labelSpace=Math.max(115, ...names.map(name => name.length*5.6+32));
  const notes=[...chartNoteLines('Source: selected provincial tracer observations. Districts ordered by availability; the two axes use different units.'),
    ...chartNoteLines(`${reportingNote} Missing values are not zero stock. N/R = no stock observations.`)];
  const height=base+labelSpace+notes.length*21+40;
  const points=ranked.map((row,i) => Number.isFinite(row.mos) ? {x:left+step*(i+.5), y:top+plot*(1-row.mos/maximum)} : null);
  const segments=[];
  points.forEach((point,i) => {if(point){if(!i||!points[i-1])segments.push([]);segments.at(-1).push(`${point.x},${point.y}`);}});
  const periodText=periodLabel.replace(/^(Week \d+) - /,'$1 ending ');
  return <Chart title={province} subtitle={`District tracer availability and stock coverage | ${periodText}`}
    ariaLabel={`District drug availability and months of stock in ${province}`} className="report-district-chart" height={height} note={notes}>
    <g className="chart-legend"><rect x={left} y="94" width="26" height="12" fill={reportAvailabilityColour}/><text x={left+38} y="106">Availability (%)</text>
      <line x1={left+225} x2={left+260} y1="100" y2="100" stroke={mosColour} strokeWidth="3"/><text x={left+273} y="106">Months of stock (MOS)</text></g>
    <PercentAxis {...{left,right,top,plot}}/>
    <line x1={right} x2={right} y1={top} y2={base} stroke="#555"/>
    {Array.from({length: maximum+1}, (_,i) => <g key={i}><line x1={right} x2={right+5} y1={base-plot*i/maximum} y2={base-plot*i/maximum} stroke="#555"/><text x={right+12} y={base-plot*i/maximum+5}>{i}</text></g>)}
    <text className="chart-axis-title" transform={`translate(1170 ${top+plot/2}) rotate(-90)`} textAnchor="middle">Months of stock (MOS)</text>
    {ranked.map((row,i) => {
      const x=left+step*(i+.15), barWidth=step*.7, centre=left+step*(i+.5), available=Number.isFinite(row.availability);
      const y=available ? base-plot*Math.max(0,Math.min(1,row.availability)) : base;
      const label=available ? formatReportPercent(row.availability) : 'N/R';
      return <g key={row.name} data-district={row.name}>
        {available ? <ReportAvailabilityBar className="district-availability-bar" x={x} y={y} width={barWidth} height={base-y} label={label} title={`${names[i]}: ${label} availability`}/> :
          <text className="district-not-reported" x={centre} y={top+plot/2} textAnchor="middle">N/R</text>}
        <text className="chart-category" transform={`translate(${centre} ${base+25}) rotate(-38)`} textAnchor="end">{names[i]}</text>
      </g>;
    })}
    {segments.map((segment,i) => <polyline className="district-mos-line" key={i} points={segment.join(' ')} fill="none" stroke={mosColour} strokeWidth="3"/>)}
    {ranked.map((row,i) => {
      const point=points[i];
      if (!point) return null;
      return <g key={row.name} data-mos-district={row.name}><ReportMosPoint {...point} value={row.mos} top={top} bottom={base} pointClassName="district-mos-point"/></g>;
    })}
  </Chart>;
}

export function ReportProvincialStockChart({rows, national}) {
  const id=useId().replaceAll(':','_');
  const ranked=reportImbalanceRows(rows, national);
  if (!ranked.length) return <p>No provincial stock observations are available.</p>;
  const labels=['Zero / near-zero MOS','Emergency + understocked','According to plan','Above 4 MOS','MOS gaps'];
  const colours=[palette[0],palette[1],palette[4],'#26ad40',palette[5]];
  const left=155,right=1130,top=75,plot=400,step=(right-left)/ranked.length;
  return <Chart title="Provincial Stock Imbalance" height={730} note={`Percentages use all submitted observations. Grey caps show missing MOS, not zero stock.${national ? ' National uses total counts, not average provincial percentages.' : ''}`}>
    <defs>{colours.map((colour,i)=><linearGradient key={i} id={`${id}-${i}`}><stop offset="0" stopColor="#000" stopOpacity=".25"/><stop offset=".15" stopColor={colour}/><stop offset=".38" stopColor={colour}/><stop offset=".8" stopColor={colour}/><stop offset="1" stopColor="#000" stopOpacity=".25"/></linearGradient>)}</defs>
    <PercentAxis {...{left,right,top,plot}} every={10} label="Submitted observations (%)"/>
    {ranked.map((row,i)=>{
      let offset=0;
      return <g key={row.name} data-stock-geography={row.name} data-national={row.isNational ? 'true' : undefined}>
        {row.isNational && i > 0 && <line x1={left+step*i} x2={left+step*i} y1={top} y2={top+plot} stroke="#777" strokeDasharray="4 4"/>}
        {row.shares.every(share=>share===null) && <text x={left+step*(i+.5)} y={top+plot/2} textAnchor="middle">N/R</text>}
        {row.shares.map((share,j)=>{
        if(!Number.isFinite(share)||share<=0)return null;
        const x=left+step*(i+.3), w=step*.4, h=share*plot, y=top+plot*(1-offset-share);offset+=share;
        const bevel=Math.min(5,h/4);
        return <g key={j} data-stock-band={labels[j]} data-share={share}><rect x={x} y={y} width={w} height={h} fill={colours[j]}/><rect x={x} y={y} width={w} height={h} fill={`url(#${id}-${j})`}/><path d={`M${x},${y} H${x+w} L${x+w-bevel},${y+bevel} H${x+bevel} Z`} fill="white" opacity=".65"/>{h>=24&&j!==4&&<><rect x={x+w/2-25} y={y+h/2-11} width="50" height="22" fill="#fff" stroke="#245675" strokeWidth="2"/><text className="chart-stack-label" x={x+w/2} y={y+h/2+5} textAnchor="middle">{formatReportPercent(share)}</text></>}</g>;
      })}{row.shares[4]>0&&<text className="chart-gap-share" x={left+step*(i+.5)} y={top-12} textAnchor="middle">{formatReportPercent(row.shares[4])}</text>}<text className="chart-category" transform={`translate(${left+step*(i+.5)} ${top+plot+24}) rotate(-45)`} textAnchor="end" style={row.isNational ? {fontWeight: 700} : undefined}>{reportGroupName(row).toUpperCase()}</text></g>;
    })}
    {labels.map((label,i)=><g className="chart-legend" key={label}><rect x={85+(i%3)*360} y={650+Math.floor(i/3)*26} width="14" height="14" fill={colours[i]}/><text x={106+(i%3)*360} y={662+Math.floor(i/3)*26}>{label}</text></g>)}
  </Chart>;
}

export function ReportNationalStockChart({rows}) {
  const left=345, right=1120, total=right-left, top=93;
  let offset=0;
  const first=rows.slice(0,5).map((row,i)=>{const entry={...row,x:left+offset*total,colour:palette[i]};offset+=row.rate||0;return entry;});
  const gap=rows[5]?.rate||0;
  const below=first.slice(0,3).reduce((sum,row)=>sum+(row.rate||0),0);
  const maximum=Math.max(.000001,...first.map(row=>row.rate||0));
  const actions=['Verify quantities; near-zero MOS is not necessarily zero stock.','Prioritise replenishment before stock-out.','Monitor AMC and replenish before the next cycle.','Maintain the two-to-four-month stock band.','Review excess stock against verified shortages.'];
  return <Chart title="National Stock Status: Share of Tracer Observations by Stock Level" height={590} note={`MOS unavailable: ${formatReportPercent(gap)}. All observations are included; rounded percentages may not add exactly.`}>
    {first.map((row,i)=><g key={row.label}><rect x={row.x} y={top} width={total*(row.rate||0)} height="38" fill={row.colour} stroke="white"/>{row.rate>.04&&<text className="chart-bar-label" x={row.x+total*row.rate/2} y={top+25} textAnchor="middle" style={{fill:i===2?'#333':'white'}}>{formatReportPercent(row.rate)}</text>}</g>)}
    {gap>0&&<rect x={left+offset*total} y={top} width={gap*total} height="38" fill={palette[5]}><title>{`MOS gaps: ${formatReportPercent(gap)}`}</title></rect>}
    {[{start:0,share:below,label:'Below plan',colour:'#c55a00'},{start:below,share:first[3]?.rate||0,label:'On plan',colour:palette[3]},{start:below+(first[3]?.rate||0),share:first[4]?.rate||0,label:'Above plan',colour:palette[4]}].filter(group=>group.share>0).map(group=><g key={group.label}><path d={`M${left+group.start*total},${top-8} v-7 h${group.share*total} v7`} fill="none" stroke={group.colour} strokeWidth="2"/><text x={left+(group.start+group.share/2)*total} y={top-22} textAnchor="middle" style={{fill:group.colour,fontWeight:700}}>{group.label}: {formatReportPercent(group.share)}</text></g>)}
    {first.map((row,i)=>{
      const y=175+i*73;
      const barWidth=total*(row.rate||0)/maximum;
      return <g key={row.label}><text className="chart-value" x={left-14} y={y+14} textAnchor="end">{row.label}</text><text className="chart-action" x={left-14} y={y+34} textAnchor="end">{actions[i]}</text><rect x={left} y={y-5} width={barWidth} height="35" fill={row.colour}/><text className="chart-value" x={left+barWidth+9} y={y+19}>{formatReportPercent(row.rate)}</text></g>;
    })}
  </Chart>;
}
