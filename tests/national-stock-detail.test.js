import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { loadLiveTracerData, tracerReportingPeriods } from '../src/tracerFacilityData.js';
import { commodityRowsFromPeriod } from '../src/tracerRows.js';
import { nationalStockBands, nationalStockBand, stockBandRecords, summariseStockCommodities, stockStatusCsv } from '../src/stockStatusDetails.js';

const row = (item, mos, extra = {}) => ({ item, mos, province: 'P', district: 'D', facilityLevel: 'HEALTH CENTRE', facility: 'F', programme: 'Primary care', quantity: 10, amc: 5, ...extra });
const period = { reportDate: '2026-10-11', label: 'Week 1 - 11 October 2026' };

test('national stock details retain the published submitted-MOS boundaries, including missing values', () => {
  for (const [mos, expected] of [[0, 'stockout'], [.1, 'stockout'], [.10001, 'nearCritical'], [.5, 'nearCritical'], [.999, 'nearCritical'], [1, 'understocked'], [1.999, 'understocked'], [2, 'accordingToPlan'], [4, 'accordingToPlan'], [4.001, 'overstock'], [12, 'overstock'], [13, 'overstock'], [null, 'dataGap'], [undefined, 'dataGap'], [NaN, 'dataGap']]) assert.equal(nationalStockBand(mos), expected);
  assert.equal(stockBandRecords([row('Positive SOH', .1), row('No MOS', null)], 'stockout').length, 1);
  assert.deepEqual(stockBandRecords([row('A', 3)], 'unknown'), []);
});

test('every October card reconciles to its detail list and scoped province and district counts', async () => {
  await loadLiveTracerData();
  for (const p of tracerReportingPeriods.filter(p => p.month === '2026-10')) {
    const rows = commodityRowsFromPeriod(p);
    for (const band of nationalStockBands) {
      const expected = summary => band.id === 'overstock' ? summary.abovePlan + summary.overstock : summary[band.id];
      assert.equal(stockBandRecords(rows, band.id).length, expected(p.national), `${p.id} ${band.id}`);
      const central = rows.filter(row => row.province === 'CENTRAL PROVINCE');
      assert.equal(stockBandRecords(central, band.id).length, expected(p.provinces.find(row => row.name === 'CENTRAL PROVINCE')));
      const kabwe = central.filter(row => row.district === 'KABWE');
      const facilities = p.facilities.filter(row => row.province === 'CENTRAL PROVINCE' && row.district === 'KABWE');
      assert.equal(stockBandRecords(kabwe, band.id).length, facilities.reduce((sum, row) => sum + expected(row), 0));
    }
  }
});

test('search, programme and commodity filters intersect without merging or summing products', () => {
  const rows = [row('Saline 500ml', 3), row('Saline 1000ml', 3), row('Saline 500ml', 3, { facility: 'G', programme: 'Renal' }), row('Saline 500ml', .8)];
  const selected = stockBandRecords(rows, 'accordingToPlan', { search: 'saline', programme: 'Renal', commodity: 'Saline 500ml' });
  assert.equal(selected.length, 1); assert.equal(selected[0].facility, 'G');
  const summary = summariseStockCommodities(stockBandRecords(rows, 'accordingToPlan'));
  assert.equal(summary.length, 2); assert.equal(summary.find(row => row.name === 'Saline 500ml').records, 2);
  assert.equal(summary[0].quantity, undefined);
  assert.equal(stockBandRecords(rows, 'accordingToPlan', { search: 'no match' }).length, 0);
});

test('exports contain all filtered records, retain numeric values and blank missing values, and escape CSV and formula labels', () => {
  const rows = Array.from({ length: 31 }, (_, i) => row('Medicine, "500mg"', 0.05, { facility: `Facility ${i}`, quantity: i === 0 ? null : i, amc: i === 0 ? null : 12.34567 }));
  rows.push(row('=HYPERLINK("unsafe")', 0.1, { facility: '+Facility', programme: '@Programme', quantity: 0 }));
  const csv = stockStatusCsv(rows, { view: 'records', period, band: 'stockout' });
  const sheet = XLSX.read(csv, { type: 'string', raw: true }).Sheets.Sheet1;
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  assert.equal(table.length, rows.length + 1);
  assert.equal(table[1][7], 'Medicine, "500mg"'); assert.equal(table[1][9], ''); assert.equal(table[1][10], ''); assert.equal(table[2][10], '12.34567');
  assert.equal(table.at(-1)[7], '\'=HYPERLINK("unsafe")'); assert.equal(table.at(-1)[5], "'+Facility"); assert.equal(table.at(-1)[8], "'@Programme");
  const summarySheet = XLSX.read(stockStatusCsv(rows, { view: 'commodities', period, band: 'stockout' }), { type: 'string', raw: true }).Sheets.Sheet1;
  const summary = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });
  assert.equal(summary.length, 3); assert.equal(Number(summary[1][5]), 31);
});

test('national cards are buttons and detail export uses the complete filtered set rather than pagination', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/NationalStockDetail.jsx', import.meta.url), 'utf8');
  assert.match(app, /id=\{`national-stock-\$\{row.id\}`\}.*onClick=/);
  assert.match(app, /rows=\{filteredCommodityRows\}/);
  assert.match(detail, /stockStatusCsv\(filtered,/);
  assert.doesNotMatch(detail, /stockStatusCsv\(visible,/);
  assert.match(detail, /Back to stock status/);
  assert.match(detail, /summary data only/);
  const css = readFileSync(new URL('../src/nationalStockDetail.css', import.meta.url), 'utf8');
  assert.match(css, /\.page-national > \.national-stock-detail \{ display:block; \}/);
});
