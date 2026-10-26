import {useId} from 'react';
import {formatReportPercent} from './reportNarrative.js';
import {rankedReportRows, reportChartLabels, reportGroupName, reportMosMaximum, reportAvailabilityGap, reportImbalanceRows} from './reportChartData.js';

const palette = ['#c00000', '#e87500', '#f2bb2d', '#2f8b57', '#2e75b6', '#9a9a9a'];
const mosColour = '#c55a00';
const width = 1200;
const sourceNote = 'Source: selected provincial tracer submissions. Missing values are not zero stock.';

function Chart({title, children, height, note = sourceNote}) {
  return <figure className="national-report-chart report-reference-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    <title>{title}</title><text className="chart-title" x="72" y="32">{title}</text>{children}
    <text className="chart-source" x="20" y={height-12}>{note}</text>
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
  const ranked = rankedReportRows(rows, true);
  if (!ranked.length) return <p>No care-level observations are available for this chart.</p>;
  const left=85, right=1080, top=76, plot=410, step=(right-left)/ranked.length;
  const gap=reportAvailabilityGap(ranked);
  const observed=ranked.filter(row=>Number.isFinite(row.availability));
  return <Chart title="Commodity Availability by Level of Care" height={610}>
    <PercentAxis {...{left,right,top,plot}}/>
    {ranked.map((row,i)=>{
      const x=left+step*(i+.2), barWidth=step*.6;
      const y=top+plot*(1-(row.availability||0));
      const lines=reportChartLabels(row);
      return <g key={row.label||row.name}>
        {Number.isFinite(row.availability)?<><rect x={x} y={y} width={barWidth} height={top+plot-y} fill={i===0?'#1f4e79':i===observed.length-1?'#bf570c':'#2e75b6'}/><text className="chart-value" x={x+barWidth/2} y={y-12} textAnchor="middle">{formatReportPercent(row.availability)}</text></>:<text x={x+barWidth/2} y={top+plot/2} textAnchor="middle">Not reported</text>}
        <text x={x+barWidth/2} y={top+plot+23} textAnchor="middle">{lines.map((line,j)=><tspan x={x+barWidth/2} dy={j?18:0} key={j}>{line}</tspan>)}<tspan x={x+barWidth/2} dy="20">MOS: {Number.isFinite(row.mos)?row.mos.toFixed(1):'N/R'}</tspan></text>
      </g>;
    })}
    {gap>0&&(()=>{
      const x=right-12, high=top+plot*(1-observed[0].availability), low=top+plot*(1-observed.at(-1).availability);
      return <g className="chart-gap"><line x1={x} x2={x} y1={high} y2={low} stroke="#555"/><path d={`M${x-4},${high+7} L${x},${high} L${x+4},${high+7} M${x-4},${low-7} L${x},${low} L${x+4},${low-7}`} fill="none" stroke="#555"/><text x={x+12} y={(high+low)/2-2}>{gap.toFixed(1)} pp<tspan x={x+12} dy="19">gap</tspan></text></g>;
    })()}
  </Chart>;
}

export function ReportPerformanceChart({rows, subject}) {
  const province=subject==='Provincial';
  const ranked=rankedReportRows(rows, province);
  if (!ranked.length) return <p>No observations are available for this chart.</p>;
  const left=85, right=1110, top=92, plot=410, step=(right-left)/ranked.length, maximum=reportMosMaximum(ranked);
  const labelLines=Math.max(...ranked.map(row=>reportChartLabels(row,province).length));
  const height=top+plot+labelLines*18+55;
  const points=ranked.map((row,i)=>Number.isFinite(row.mos)?{x:left+step*(i+.5),y:top+plot*(1-row.mos/maximum)}:null);
  const segments=[];
  points.forEach((point,i)=>{if(point){if(!i||!points[i-1])segments.push([]);segments.at(-1).push(`${point.x},${point.y}`);}});
  return <Chart title={`Commodity Availability and Months of Stock by ${province?'Province':'Programme/Facility Type'}`} height={height}>
    <g className="chart-legend"><rect x={left} y="53" width="17" height="12" fill="#2e75b6"/><text x={left+24} y="64">Availability (%)</text><line x1={left+190} x2={left+220} y1="59" y2="59" stroke={mosColour} strokeWidth="3"/><circle cx={left+205} cy="59" r="5" fill="white" stroke={mosColour} strokeWidth="2"/><text x={left+230} y="64">Months of stock (MOS)</text></g>
    <PercentAxis {...{left,right,top,plot}}/>
    <line x1={right} x2={right} y1={top} y2={top+plot} stroke="#222"/>
    {Array.from({length:7},(_,i)=>i*maximum/6).map((tick,i)=><text key={i} x={right+10} y={top+plot*(1-i/6)+5}>{Number.isInteger(tick)?tick:tick.toFixed(1)}</text>)}
    <text className="chart-axis-title" transform={`translate(1174 ${top+plot/2}) rotate(-90)`} textAnchor="middle">Months of stock (MOS)</text>
    {ranked.map((row,i)=>{
      const x=left+step*(i+.22), barWidth=step*.56, y=top+plot*(1-(row.availability||0));
      return <g key={row.label||row.name}>
        {Number.isFinite(row.availability)?<><rect x={x} y={y} width={barWidth} height={top+plot-y} fill="#2e75b6"/><text className="chart-bar-label" x={x+barWidth/2} y={row.availability<.1?top+plot-50:province?y+22:top+plot-12} textAnchor="middle" style={{fill:row.availability<.1?'#111':'white'}}>{formatReportPercent(row.availability)}</text></>:<text x={x+barWidth/2} y={top+plot/2} textAnchor="middle">N/R</text>}
        <text className="chart-category" x={x+barWidth/2} y={top+plot+22} textAnchor="middle">{reportChartLabels(row,province).map((line,j)=><tspan key={j} x={x+barWidth/2} dy={j?18:0}>{line}</tspan>)}</text>
      </g>;
    })}
    {segments.map((segment,i)=><polyline key={i} points={segment.join(' ')} fill="none" stroke={mosColour} strokeWidth="3"/>)}
    {ranked.map((row,i)=>{
      if(!points[i])return null;
      const above=province||points[i].y>top+plot-50;
      return <g key={row.label||row.name}><circle {...{cx:points[i].x,cy:points[i].y}} r="6" fill="white" stroke={mosColour} strokeWidth="2.5"/><rect x={points[i].x-19} y={points[i].y+(above?-31:13)} width="38" height="22" rx="2" fill="#fff"/><text className="chart-mos-label" x={points[i].x} y={points[i].y+(above?-14:29)} textAnchor="middle">{row.mos.toFixed(1)}</text></g>;
    })}
  </Chart>;
}

export function ReportProvincialStockChart({rows}) {
  const id=useId().replaceAll(':','_');
  const ranked=reportImbalanceRows(rows);
  if (!ranked.length) return <p>No provincial stock observations are available.</p>;
  const labels=['Zero / near-zero MOS','Emergency + understocked','According to plan','Above 4 MOS','MOS gaps'];
  const colours=[palette[0],palette[1],palette[4],'#26ad40',palette[5]];
  const left=155,right=1130,top=75,plot=400,step=(right-left)/ranked.length;
  return <Chart title="Provincial Stock Imbalance" height={730} note="Percentages use all submitted observations. Grey caps show missing MOS; these are not zero stock.">
    <defs>{colours.map((colour,i)=><linearGradient key={i} id={`${id}-${i}`}><stop offset="0" stopColor="#000" stopOpacity=".25"/><stop offset=".15" stopColor={colour}/><stop offset=".38" stopColor={colour}/><stop offset=".8" stopColor={colour}/><stop offset="1" stopColor="#000" stopOpacity=".25"/></linearGradient>)}</defs>
    <PercentAxis {...{left,right,top,plot}} every={10} label="Submitted observations (%)"/>
    {ranked.map((row,i)=>{
      let offset=0;
      return <g key={row.name}>{row.shares.map((share,j)=>{
        if(!Number.isFinite(share)||share<=0)return null;
        const x=left+step*(i+.3), w=step*.4, h=share*plot, y=top+plot*(1-offset-share);offset+=share;
        const bevel=Math.min(5,h/4);
        return <g key={j}><rect x={x} y={y} width={w} height={h} fill={colours[j]}/><rect x={x} y={y} width={w} height={h} fill={`url(#${id}-${j})`}/><path d={`M${x},${y} H${x+w} L${x+w-bevel},${y+bevel} H${x+bevel} Z`} fill="white" opacity=".65"/>{h>=24&&j!==4&&<><rect x={x+w/2-25} y={y+h/2-11} width="50" height="22" fill="#fff" stroke="#245675" strokeWidth="2"/><text className="chart-stack-label" x={x+w/2} y={y+h/2+5} textAnchor="middle">{formatReportPercent(share)}</text></>}</g>;
      })}{row.shares[4]>0&&<text className="chart-gap-share" x={left+step*(i+.5)} y={top-12} textAnchor="middle">{formatReportPercent(row.shares[4])}</text>}<text className="chart-category" transform={`translate(${left+step*(i+.5)} ${top+plot+24}) rotate(-45)`} textAnchor="end">{reportGroupName(row).toUpperCase()}</text></g>;
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
