import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commodityRowsFromPeriod } from '../src/tracerRows.js';
import { canonicalCommodityName, isCommodityName } from '../src/commodityNormalization.js';

const data = () => ({ dictionaries: { provinces: ['P'], districts: ['D'], levels: ['HEALTH CENTRE'], facilities: ['F'], items: ['Normal Saline 500ml'], programmes: ['EM'] }, rows: [[0, 0, 0, 0, 0, 0, 10, 5, 2]] });

test('decoded commodity rows are reused across clicks and period wrappers', () => {
  const period = { commodityFacilityData: data() };
  assert.strictEqual(commodityRowsFromPeriod(period), commodityRowsFromPeriod(period));
  assert.strictEqual(commodityRowsFromPeriod(period), commodityRowsFromPeriod({ ...period }));
  const replacement = { commodityFacilityData: { ...period.commodityFacilityData, rows: [[0, 0, 0, 0, 0, 0, 20, 5, 4]] } };
  assert.equal(commodityRowsFromPeriod(replacement)[0].quantity, 20);
  assert.equal(commodityRowsFromPeriod(period)[0].quantity, 10);
});

test('cache is bounded and eviction does not change decoded values', () => {
  const period = { commodityFacilityData: data() };
  const original = commodityRowsFromPeriod(period);
  for (let index = 0; index < 12; index++) commodityRowsFromPeriod({ commodityFacilityData: data() });
  const decoded = commodityRowsFromPeriod(period);
  assert.notStrictEqual(decoded, original);
  assert.deepEqual(decoded, original);
});

test('published October decoding preserves original values and normalization exactly', () => {
  const dataset = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8'));
  for (const period of dataset.tracerReportingPeriods) {
    const { dictionaries: d, rows } = period.commodityFacilityData;
    const expected = rows.map(([p, district, level, facility, item, programme, quantity, amc, mos]) => ({
      province: d.provinces[p], district: d.districts[district], facilityLevel: d.levels[level], facility: d.facilities[facility], item: canonicalCommodityName(d.items[item]), programme: d.programmes[programme],
      quantity: quantity === null || quantity === undefined || quantity === '' ? null : Number(quantity),
      amc: amc === null || amc === undefined || amc === '' ? null : Number(amc),
      mos: mos === null || mos === undefined || mos === '' || !Number.isFinite(Number(mos)) ? null : Number(mos),
    })).filter(row => isCommodityName(row.item));
    assert.deepEqual(commodityRowsFromPeriod(period), expected);
  }
});

test('missing data is empty and numeric zero remains distinct from missing quantities', () => {
  assert.deepEqual(commodityRowsFromPeriod(null), []);
  const source = data();
  source.rows = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, null, '', 'invalid'],
  ];
  const rows = commodityRowsFromPeriod({ commodityFacilityData: source });
  assert.equal(rows[0].quantity, 0);
  assert.equal(rows[0].mos, 0);
  assert.equal(rows[1].quantity, null);
  assert.equal(rows[1].amc, null);
  assert.equal(rows[1].mos, null);
});

test('closed dashboard pages are not mounted merely to be hidden with CSS', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const sections = { national: 'tracer-overview', stock: 'weekly-stock-section', provincial: 'field-visibility', facilities: 'facility-alerts', commodities: 'table-panel', comparison: 'comparison-section', vaccines: 'vaccine-stock-section', programmes: 'weekly-section', quality: 'concerns-section', reporting: 'reporting-rate-section', gate: 'data-quality-gate', predictive: 'predictive-analysis', alerts: 'commodity-alert-centre', actions: 'action-tracker' };
  for (const [page, section] of Object.entries(sections)) assert.ok(source.includes(`{activePage === "${page}" && <section className="${section}"`), page);
  assert.ok(source.includes('isDashboardAdmin && activePage === "reports" && <NationalWeeklyReport'));
  assert.ok(source.includes('activePage === "reports" ? buildNationalReportSummary'));
  assert.ok(source.includes('const needsComparison = activePage === "comparison"'));
});
