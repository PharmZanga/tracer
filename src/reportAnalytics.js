import {fitForecast} from './forecasting.js';
export function reportSeries(periods,scope,name) {
  return [...periods].sort((a,b)=>a.reportDate.localeCompare(b.reportDate)).map(period=>{
    const row=(period[scope]||[]).find(r=>r.name===name);
    return {date:period.reportDate,label:period.label,row:row||null};
  });
}
export function forecastAvailability(series) {
  const tail=[];
  for(let i=series.length-1;i>=0;i--){
    const point=series[i];
    if(!point.row||!Number.isFinite(point.row.availability)||!point.row.rows) break;
    if(tail.length&&(new Date(tail[0].date)-new Date(point.date))/86400000!==7) break;
    tail.unshift(point);
  }
  if(tail.length<4) return {status:'insufficient',observations:tail.length,points:[]};
  // Availability is not demand; use the existing non-seasonal Holt engine.
  const result=fitForecast(tail.map(p=>p.row.availability),{horizon:4,seasonalPeriod:0});
  const clamp=value=>Math.max(0,Math.min(1,value));
  return {...result,status:'estimated',observations:tail.length,points:result.points.map((p,i)=>{
    const date=new Date(`${tail.at(-1).date}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+7*(i+1));
    return {date:date.toISOString().slice(0,10),value:clamp(p.value),lower:clamp(p.lower),upper:clamp(p.upper)};
  })};
}
export function stockBands(row) {
  return [row.stockout||0,row.nearCritical||0,row.understocked||0,row.accordingToPlan||0,(row.abovePlan||0)+(row.overstock||0),row.dataGap||0];
}
