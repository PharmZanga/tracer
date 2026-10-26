import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { commodityRowsFromPeriod } from '../src/tracerRows.js';
import { canonicalCommodityName } from '../src/commodityNormalization.js';
import { primaryCareDistrictRows } from '../src/reportingQuality.js';
import { reportCatalogue } from '../src/reportCatalogue.js';
import { tracerBootstrapPeriod } from '../src/tracerBootstrap.js';

const dataset = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8'));
const period = dataset.tracerReportingPeriods.find(p => p.id === '2026-10-25');
const audit = JSON.parse(readFileSync(new URL('../outputs/october-week3-province-audit/source-audit.json', import.meta.url), 'utf8'));
const rows = commodityRowsFromPeriod(period);

test('Week 3 has all ten source workbooks and is the latest selectable report', () => {
  assert.ok(period); assert.equal(period.week, 'Week 3'); assert.equal(period.month, '2026-10');
  assert.equal(period.counts.provinces, 10); assert.equal(period.sourceWorkbooks.length, 10);
  assert.equal(new Set(period.sourceWorkbooks.map(source => source.province)).size, 10);
  assert.ok(period.sourceWorkbooks.every(source => /^[a-f0-9]{64}$/.test(source.sha256) && source.bytes > 0));
  assert.equal(reportCatalogue.at(-1).id, period.id); assert.equal(tracerBootstrapPeriod.id, period.id);
  assert.deepEqual(dataset.tracerReportingPeriods.map(p => p.id), ['2026-10-11', '2026-10-18', '2026-10-25']);
});

test('Week 3 stock rows reconcile and preserve SOH versus AMC definitions', () => {
  assert.ok(rows.length > 0); assert.equal(rows.length, period.counts.rows);
  assert.equal(rows.length, period.national.rows);
  assert.ok(Math.abs(rows.filter(row => row.quantity > 0).length / rows.length - period.national.availability) <= 0.000051);
  for (const row of rows) {
    assert.ok(row.quantity === null || (Number.isInteger(row.quantity) && row.quantity >= 0));
    assert.equal(row.mos, row.quantity !== null && row.amc > 0 ? row.quantity / row.amc : null);
  }
  for (const province of period.provinces) assert.equal(rows.filter(row => row.province === province.name).length, province.rows);
});

test('unreadable Muchinga SOH cells remain missing rather than becoming stock-outs', () => {
  const missing = rows.filter(row => row.quantity === null);
  assert.equal(missing.length, 3);
  assert.ok(missing.every(row => row.province === 'MUCHINGA PROVINCE' && row.district === 'ISOKA' && row.mos === null));
  assert.equal(period.dataQuality.stockCalculationAudit.invalidSOHRecords.length, 3);
});

test('all-zero blocks do not become submissions and HC plus HP are both required', () => {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.province, row.district, row.facilityLevel, row.facility]);
    groups.set(key, Boolean(groups.get(key) || row.quantity > 0));
  }
  assert.ok([...groups.values()].every(Boolean));
  assert.equal(period.dataQuality.facilityBlockReportingReview.allZeroSOHBlocksExcludedFromStockMetrics, true);
  const districts = primaryCareDistrictRows(period);
  assert.equal(districts.length, 116);
  for (const district of districts) assert.equal(district.submitted, Boolean(district.combinedPrimaryCareReported || (district.healthCentreReported && district.healthPostReported)));
  assert.equal(districts.filter(row => row.submitted).length, period.counts.districts);
});

test('source-cell spot checks match published rows for every province', () => {
  assert.equal(new Set(audit.sourceCellSamples.map(sample => sample.province)).size, 10);
  for (const sample of audit.sourceCellSamples) {
    assert.equal(sample.matched, true);
    const matching = rows.filter(row => row.province === sample.province && row.district === sample.district && row.facility === sample.facility && row.item === canonicalCommodityName(sample.commodity));
    assert.ok(matching.some(row => row.quantity === sample.publishedSOH && row.amc === sample.publishedAMC && row.mos === sample.publishedMOS), `${sample.workbook}/${sample.sheet}/${sample.quantityCell}`);
  }
});

test('North-Western HC data is retained despite its separated description and metric headers', () => {
  const source = audit.primaryCareSourceCoverage.find(row => row.province === 'NORTH-WESTERN PROVINCE' && row.sheet === 'HC');
  assert.ok(source.positiveSourceSOHCells > 0 && source.normalizedRecords > 0);
  assert.ok(rows.some(row => row.province === 'NORTH-WESTERN PROVINCE' && row.district === 'CHAVUMA' && row.facilityLevel === 'HEALTH CENTRE' && row.quantity > 0));
  const district = primaryCareDistrictRows(period).find(row => row.province === 'NORTH-WESTERN PROVINCE' && row.name === 'CHAVUMA');
  assert.equal(district.submitted, true);
  assert.equal(primaryCareDistrictRows(period).find(row => row.province === 'NORTH-WESTERN PROVINCE' && row.name === 'MUFUMBWE').submitted, true);
});

test('the January-September datasets and earlier October totals are unchanged', () => {
  for (const [path, expected] of Object.entries(audit.historicalDatasetHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex'), expected, path);
  }
  assert.equal(dataset.tracerReportingPeriods.find(p => p.id === '2026-10-11').counts.rows, 24653);
  assert.equal(dataset.tracerReportingPeriods.find(p => p.id === '2026-10-18').counts.rows, 23824);
});
