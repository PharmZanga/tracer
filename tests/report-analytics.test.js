import test from 'node:test';
import assert from 'node:assert/strict';
import {reportSeries,forecastAvailability,stockBands,provincialReporting} from '../src/reportAnalytics.js';
test('provincial reporting counts district-week opportunities and preserves unknown denominator',()=>{
  const rows=[{province:'A',submitted:true},{province:'A',submitted:false,partial:true},{province:'B',submitted:true}];
  assert.deepEqual(provincialReporting(rows,'A'),{expected:2,reported:1,rate:.5,partial:1});
  assert.equal(provincialReporting(rows,'C').rate,null);
});
test('report trends retain gaps without substituting zero',()=>{
  const series=reportSeries([{reportDate:'2026-10-11',commodities:[]},{reportDate:'2026-10-04',commodities:[{name:'A',rows:5,availability:.8}]}],'commodities','A');
  assert.equal(series[0].date,'2026-10-04');assert.equal(series[1].row,null);
  assert.equal(forecastAvailability(series).status,'insufficient');
  assert.deepEqual(stockBands({stockout:1,nearCritical:2,understocked:3,accordingToPlan:4,abovePlan:5,overstock:6,dataGap:7}),[1,2,3,4,11,7]);
});
test('forecast requires four consecutive observations and bounds estimated availability',()=>{
  const series=['2026-09-20','2026-09-27','2026-10-04','2026-10-11'].map((date,i)=>({date,row:{rows:10,availability:.6+i*.1}}));
  const forecast=forecastAvailability(series);
  assert.equal(forecast.status,'estimated');assert.equal(forecast.points.length,4);
  assert.equal(forecast.points[0].date,'2026-10-18');
  assert.ok(forecast.points.every(p=>p.lower>=0&&p.upper<=1&&p.value>=0&&p.value<=1));
  assert.equal(forecastAvailability(series.slice(1)).status,'insufficient');
  assert.equal(forecastAvailability(series.map((p,i)=>i===2?{...p,row:null}:p)).status,'insufficient');
});
