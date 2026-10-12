import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTracerMonth,tracerReportingPeriods,availableTracerMonths} from '../src/tracerFacilityData.js';
await loadTracerMonth('2026-10');
test('October Week 1 includes eight sources and no carried-forward Central/Eastern reports',()=>{
  const period=tracerReportingPeriods.find(p=>p.id==='2026-10-11');
  assert.equal(period.month,'2026-10');assert.equal(period.week,'Week 1');
  assert.equal(period.counts.provinces,8);assert.equal(period.counts.rows,19365);
  assert.ok(availableTracerMonths.includes('2026-10'));
  assert.equal(period.dataQuality.districts.length,116);
  for(const province of ['CENTRAL PROVINCE','EASTERN PROVINCE']){
    assert.equal(period.dataQuality.provinces.find(p=>p.name===province).reported,0);
    assert.ok(!period.facilities.some(f=>f.province===province));
    assert.ok(period.dataQuality.districts.filter(d=>d.province===province).every(d=>!d.reported));
  }
});
