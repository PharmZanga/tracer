import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const periods = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8')).tracerReportingPeriods;
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('geographic filters include submitted units outside the frozen reporting register', () => {
  assert.match(app, /\.\.\.facilityReportingUniverse, \.\.\.fieldData\.facilities/);
  assert.match(app, /const scopedFacilityLevelRows = facilitySelectionUniverse/);
  assert.match(app, /const facilityOptions = selectedDistrict === "all" \? \[\] : facilitySelectionUniverse/);
});

test('every October period retains all twelve Western Level 1 hospital submissions', () => {
  for (const period of periods) {
    const hospitals = period.facilities.filter(row => row.province === 'WESTERN PROVINCE' && row.facilityLevel === 'LEVEL 1 HOSPITAL');
    assert.equal(hospitals.length, 12, period.id);
    assert.ok(hospitals.every(row => row.rows === 50 && row.quantity > 0));
    assert.equal(hospitals.filter(row => row.district === 'KAOMA').length, 2);
    const data = period.commodityFacilityData;
    const rows = data.rows.filter(row => data.dictionaries.provinces[row[0]] === 'WESTERN PROVINCE' && data.dictionaries.levels[row[2]] === 'LEVEL 1 HOSPITAL');
    assert.equal(rows.length, 600);
    assert.equal(new Set(rows.map(row => `${row[1]}|${row[3]}|${row[4]}`)).size, 600);
    assert.ok(rows.every(row => Number.isInteger(row[6]) && row[6] >= 0));
    if (period.id <= '2026-10-25') {
      assert.equal(period.dataQuality.sheetCoverageRepair.addedRows, 600);
      assert.equal(period.dataQuality.facilities.length, 62, 'retain existing named reporting evidence');
    } else {
      assert.ok(period.sourceWorkbooks.some(row => row.province === 'WESTERN PROVINCE'));
    }
  }
});
