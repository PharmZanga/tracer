import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const periods = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8')).tracerReportingPeriods;

test('geography tables receive complete filtered rows without a province or district display cap', () => {
  const section = source.slice(source.indexOf('{activePage === "provincial" &&'), source.indexOf('{activePage === "facilities" &&'));
  assert.match(section, /title="Province availability" rows=\{scopedProvinceRows\}/);
  assert.match(section, /rows=\{districtsInScope\} onSelect=\{\(row\) => selectDistrict\(row.name\)\}/);
  assert.doesNotMatch(section, /(?:districtsInScope|scopedProvinceRows)\.slice\(/);
  assert.match(section, /"District availability"/);
  const table = source.slice(source.indexOf('function TopRowsTable('), source.indexOf('function TopRowsTable(') + 1900);
  assert.match(table, /rows\.map\(/);
  assert.doesNotMatch(table, /rows\.slice\(/);
});

test('complete October district groups include Kaoma and all provinces without changing the source rows', () => {
  for (const period of periods) {
    const provinces = new Map();
    for (const row of period.facilities) {
      const districts = provinces.get(row.province) || new Set();
      districts.add(row.district);
      provinces.set(row.province, districts);
    }
    assert.equal(provinces.size, period.sourceWorkbooks?.length || period.counts.provinces);
    assert.equal(provinces.get('WESTERN PROVINCE').size, 16);
    assert.ok(provinces.get('WESTERN PROVINCE').has('KAOMA'));
  }
});
