import {useId} from 'react';

export const reportAvailabilityColour = '#ff7f23';
export const reportMosColour = '#4472c4';

export function ReportAvailabilityBar({x, y, width, height, label, className, title}) {
  const id = `availability-${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const bevel = Math.min(12, height / 4, width / 9);
  const fontSize = Math.min(17, Math.max(9, (width - 3) / (label.length * .58)));
  const inside = height >= 45;
  return <g className="report-bevel-bar">
    <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#ff6a08"/><stop offset=".52" stopColor="#ff982b"/><stop offset="1" stopColor="#ff7010"/></linearGradient></defs>
    <rect {...{x, y, width, height, className}} fill={reportAvailabilityColour}>{title && <title>{title}</title>}</rect>
    {height > 0 && <><rect {...{x, y, width, height}} fill={`url(#${id})`}/><path className="report-bar-bevel" d={`M${x},${y} H${x + width} L${x + width - bevel},${y + bevel} H${x + bevel} Z`} fill="#ffc17b"/><path d={`M${x + width},${y} V${y + height} H${x + width - Math.min(2, width / 12)} V${y + bevel} Z`} fill="#ed6100" opacity=".55"/></>}
    {inside && <rect className="report-bar-value-band" x={x + 1} y={y + height - 30} width={Math.max(0, width - 2)} height="24" fill="#ffdfb4"/>}
    <text className="chart-bar-label" x={x + width / 2} y={inside ? y + height - 12 : y - 9} textAnchor="middle" style={{fill: '#333', fontSize}}>{label}</text>
  </g>;
}

export function ReportMosPoint({x, y, value, top, bottom, className = 'chart-mos-label', pointClassName}) {
  const labelY = Math.min(y - 40 < top + 3 ? y + 12 : y - 40, bottom - 70);
  const labelWidth = Math.max(35, value.toFixed(1).length * 10 + 12);
  return <g className="report-boxed-mos">
    <circle className={pointClassName} cx={x} cy={y} r="4.5" fill={reportMosColour} stroke={reportMosColour}/>
    <rect className="report-mos-value-box" x={x - labelWidth / 2} y={labelY} width={labelWidth} height="28" fill="#dcecf8" stroke="#8eb9df" strokeWidth="2.5"/>
    <text className={className} x={x} y={labelY + 19} textAnchor="middle" style={{fill: '#294c68', fontSize: 17, fontWeight: 400}}>{value.toFixed(1)}</text>
  </g>;
}
