import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterComparisonRows,hasComparisonScope} from '../src/comparisonScope.js';
const all={province:'all',district:'all',facilityLevel:'all',commodity:'all',program:'all'};
test('published October records yield only Central programmes when Central is selected',()=>{
  const p=JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json',import.meta.url))).tracerReportingPeriods.at(-1);
  const d=p.commodityFacilityData.dictionaries;
  const rows=p.commodityFacilityData.rows.map(r=>({province:d.provinces[r[0]],district:d.districts[r[1]],facilityLevel:d.levels[r[2]],item:d.items[r[4]],programme:d.programmes[r[5]]}));
  const central=filterComparisonRows(rows,{...all,province:'CENTRAL PROVINCE'});
  assert.ok(central.length>0);assert.ok(central.every(r=>r.province==='CENTRAL PROVINCE'));
  assert.ok(!central.some(r=>r.programme==='NATIONAL HEART HOSPITAL'));
  assert.equal(central.length,rows.filter(r=>r.province==='CENTRAL PROVINCE').length);
});
test('Central programme comparison excludes National Heart and Lusaka records',()=>{
  const rows=[{province:'CENTRAL PROVINCE',district:'KABWE',programme:'LEVEL 1 HOSPITAL',item:'A'},{province:'LUSAKA PROVINCE',district:'LUSAKA',programme:'NATIONAL HEART HOSPITAL',item:'A'}];
  const filtered=filterComparisonRows(rows,{...all,province:'CENTRAL PROVINCE'});
  assert.equal(filtered.length,1);assert.equal(filtered[0].programme,'LEVEL 1 HOSPITAL');
  assert.equal(filterComparisonRows(rows,{...all,province:'CENTRAL PROVINCE',program:'NATIONAL HEART HOSPITAL'}).length,0);
});
test('all comparison filters intersect rather than falling back to national data',()=>{
  const rows=[{province:'P',district:'D',facilityLevel:'L1',programme:'TB',item:'A'},{province:'P',district:'E',facilityLevel:'L2',programme:'TB',item:'A'}];
  assert.equal(filterComparisonRows(rows,{...all,province:'P',district:'D',facilityLevel:'L1',program:'TB',commodity:'A'},(a,b)=>b==='all'||a===b).length,1);
  assert.equal(hasComparisonScope(all),false);assert.equal(hasComparisonScope({...all,province:'P'}),true);
});
