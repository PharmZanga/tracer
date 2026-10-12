import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTracerMonth,tracerReportingPeriods,availableTracerMonths} from '../src/tracerFacilityData.js';
await loadTracerMonth('2026-10');
test('October Week 1 includes all ten provincial submissions including Eastern',()=>{
  const period=tracerReportingPeriods.find(p=>p.id==='2026-10-11');
  assert.equal(period.month,'2026-10');assert.equal(period.week,'Week 1');
  assert.equal(period.counts.provinces,10);assert.ok(period.counts.rows>21564);
  assert.ok(period.facilities.some(f=>f.province==='CENTRAL PROVINCE'));
  assert.ok(period.dataQuality.provinces.find(p=>p.name==='CENTRAL PROVINCE').reported>0);
  assert.ok(availableTracerMonths.includes('2026-10'));
  assert.equal(period.dataQuality.districts.length,116);
  for(const province of ['EASTERN PROVINCE']){
    assert.ok(period.dataQuality.provinces.find(p=>p.name===province).reported>0);
    assert.ok(period.facilities.some(f=>f.province===province));
    assert.equal(period.dataQuality.districts.filter(d=>d.province===province).length,15);
  }
});
