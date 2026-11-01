import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {commodityRowsFromPeriod} from '../src/tracerRows.js';
import {canonicalCommodityName} from '../src/commodityNormalization.js';
import {facilityReportingSummary, primaryCareDistrictSummary} from '../src/reportingQuality.js';
import {reportCatalogue} from '../src/reportCatalogue.js';
import {tracerBootstrapPeriod} from '../src/tracerBootstrap.js';

const dataset = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8'));
const period = dataset.tracerReportingPeriods.find(p => p.id === '2026-11-01');
const rows = commodityRowsFromPeriod(period);
const audit = JSON.parse(readFileSync(new URL('../outputs/october-week4-province-audit/source-audit.json', import.meta.url), 'utf8'));
const missing = ['MUCHINGA PROVINCE'];

test('1 November is selectable as October Week 4 with exactly nine source submissions', () => {
  assert.equal(period.month, '2026-10');
  assert.equal(period.week, 'Week 4');
  assert.equal(period.label, 'Week 4 - 1 November 2026');
  assert.equal(reportCatalogue.at(-1).id, period.id);
  assert.equal(tracerBootstrapPeriod.id, period.id);
  assert.equal(tracerBootstrapPeriod.month, '2026-10');
  assert.equal(period.counts.provinces, 9);
  assert.equal(period.sourceWorkbooks.length, 9);
  assert.equal(new Set(period.sourceWorkbooks.map(s => s.province)).size, 9);
  assert.ok(period.sourceWorkbooks.every(s => /^[a-f0-9]{64}$/.test(s.sha256) && s.bytes > 0));
  assert.deepEqual(period.dataQuality.provincialSubmissionCoverage, {expected: 10, submitted: 9, missingProvinces: missing, carriedForward: false});
  for (const province of missing) assert.ok(!rows.some(row => row.province === province));
});

test('Week 4 retains SOH-based availability and recalculates MOS without switching to the mirror indicator', () => {
  assert.equal(rows.length, 23197);
  assert.equal(rows.length, period.counts.rows);
  assert.equal(period.national.rows, rows.length);
  assert.ok(Math.abs(rows.filter(row => row.quantity > 0).length / rows.length - period.national.availability) < .000051);
  assert.equal(period.national.availability, .8647);
  for (const row of rows) {
    assert.ok(row.quantity === null || (Number.isInteger(row.quantity) && row.quantity >= 0));
    assert.equal(row.mos, row.quantity !== null && row.amc > 0 ? row.quantity / row.amc : null);
  }
  for (const province of period.provinces) assert.equal(rows.filter(row => row.province === province.name).length, province.rows);
});

test('fixed reporting denominators retain missing Muchinga and respond to geography', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /const provinceOptions = \[\.\.\.new Set\(\[\s*\.\.\.fieldData.provinces.map\([\s\S]*?\.\.\.districtDirectory.map\(\(district\) => district.province\)/);
  const f = facilityReportingSummary(period);
  const d = primaryCareDistrictSummary(period);
  assert.deepEqual([f.reported, f.expected, f.missing], [368, 403, 35]);
  assert.deepEqual([d.reported, d.expected, d.missing], [107, 116, 9]);
  for (const [province, units, districts] of [['MUCHINGA PROVINCE', 24, 8]]) {
    const scoped = facilityReportingSummary(period, {province});
    assert.deepEqual([scoped.reported, scoped.expected, scoped.missing], [0, units, units]);
    const dhos = primaryCareDistrictSummary(period, {province});
    assert.deepEqual([dhos.reported, dhos.expected, dhos.missing], [0, districts, districts]);
  }
  const copperbelt = facilityReportingSummary(period, {province: 'COPPERBELT PROVINCE'});
  assert.deepEqual([copperbelt.reported, copperbelt.expected, copperbelt.missing], [47, 48, 1]);
  assert.equal(primaryCareDistrictSummary(period, {province: 'COPPERBELT PROVINCE'}).reported, 10);
  const western = primaryCareDistrictSummary(period, {province: 'WESTERN PROVINCE'});
  assert.deepEqual([western.reported, western.expected], [16, 16]);
  assert.equal(primaryCareDistrictSummary(period, {province: 'WESTERN PROVINCE', district: 'KAOMA'}).reported, 1);
});

test('all nine provinces have matching source-cell evidence and primary-care worksheet coverage', () => {
  assert.equal(audit.sourceCellSamples.length, 50);
  assert.equal(new Set(audit.sourceCellSamples.map(s => s.province)).size, 9);
  for (const sample of audit.sourceCellSamples) {
    assert.ok(sample.matched);
    assert.ok(rows.some(row => row.province === sample.province && row.district === sample.district && row.facility === sample.facility && row.item === canonicalCommodityName(sample.commodity) && row.quantity === sample.publishedSOH && row.amc === sample.publishedAMC && row.mos === sample.publishedMOS), `${sample.workbook}/${sample.sheet}/${sample.quantityCell}`);
  }
  for (const source of period.sourceWorkbooks) for (const sheet of ['HC', 'HP']) {
    const coverage = audit.primaryCareSourceCoverage.find(r => r.province === source.province && r.sheet === sheet);
    assert.ok(coverage?.positiveSourceSOHCells > 0 && coverage.normalizedRecords > 0);
  }
  const western = rows.filter(row => row.province === 'WESTERN PROVINCE' && row.facilityLevel === 'LEVEL 1 HOSPITAL');
  assert.equal(western.length, 600);
  assert.equal(new Set(western.map(row => `${row.district}|${row.facility}`)).size, 12);
  assert.ok(period.facilities.filter(f => / Health (Centre|Post) facilities$/.test(f.name)).every(f => f.isAggregate), 'district aggregates must not become individual facilities');
});

test('North-Western replaces the old workbook rather than appending a second provincial submission', () => {
  const manifest = period.sourceWorkbooks.filter(s => s.province === 'NORTH-WESTERN PROVINCE');
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].filename, '01-11-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx');
  assert.ok(!period.sourceWorkbooks.some(s => s.filename === 'NW TRACER WEEKLY REPORT PROVINCES (1).xlsx'));
  const revised = rows.filter(r => r.province === 'NORTH-WESTERN PROVINCE');
  assert.equal(revised.length, 2411);
  assert.equal(period.provinces.find(p => p.name === 'NORTH-WESTERN PROVINCE').availability, .8171);
  const revision = period.sourceRevisions.find(r => r.province === 'NORTH-WESTERN PROVINCE' && r.change === 'replaced');
  assert.equal(revision.previousWorkbook.filename, 'NW TRACER WEEKLY REPORT PROVINCES (1).xlsx');
  assert.equal(revision.currentWorkbook.sha256, manifest[0].sha256);
  assert.ok(period.sourceRevisions.some(r => r.province === 'COPPERBELT PROVINCE' && r.change === 'added'));
  assert.equal(audit.unchangedSourceProvincesVerified.length, 7);
  assert.ok(!audit.unchangedSourceProvincesVerified.some(p => ['COPPERBELT PROVINCE', 'NORTH-WESTERN PROVINCE'].includes(p)));
});

test('earlier periods and all source workbooks remain unchanged during import', () => {
  assert.ok(audit.sourceWorkbooksUnchanged);
  for (const [path, hash] of Object.entries(audit.historicalDatasetHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex'), hash, path);
  }
  assert.deepEqual(audit.preservedOctoberPeriods, ['2026-10-11', '2026-10-18', '2026-10-25']);
  assert.deepEqual(dataset.tracerReportingPeriods.filter(p => p.id < period.id).map(p => p.counts.rows), [25253, 24424, 24261]);
  assert.ok(Object.values(audit.preservedOctoberPeriodHashes).every(hash => /^[a-f0-9]{64}$/.test(hash)));
  assert.equal(period.dataQuality.facilityBlockReportingReview.allZeroSOHBlocksExcludedFromStockMetrics, true);
});
