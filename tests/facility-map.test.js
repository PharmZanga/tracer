import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {districtMapKey,groupMapFacilities} from '../src/facilityMapData.js';
test('all 116 tracer districts match the local geographic boundaries',()=>{
  const geo=JSON.parse(readFileSync(new URL('../public/data/maps/zambia-districts.geojson',import.meta.url)));
  assert.equal(geo.features.length,116);
  const keys=new Set(geo.features.map(f=>districtMapKey(f.properties.shapeName)));
  const p=JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json',import.meta.url))).tracerReportingPeriods.at(-1);
  for(const d of p.dataQuality.districts)assert.ok(keys.has(districtMapKey(d.name)),d.name);
});
test('district map counts non-reporting separately from stock-out records',()=>{
  const g=groupMapFacilities([{district:'Milenge',reportingStatus:'Facility did not report',stockoutItemCount:99},{district:'MILENGE',stockoutItemCount:2,lowStockItemCount:3}]).get('MILENGE');
  assert.equal(g.facilities.length,2);assert.equal(g.stockout,1);assert.equal(g.missing,1);assert.equal(g.color,'#cf322a');
});
