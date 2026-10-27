import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyseRepeatedSoh, classifyRepeatedSohReport, repeatedSohCsv, repeatedSohReportsCsv, repeatedSohWindow } from '../src/repeatedSoh.js';
import { planAssistantRequest } from '../src/tracerAssistant.js';

const dates = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'];
const makePeriod = (reportDate, rows, overrides = {}) => ({
  id: reportDate, reportDate, month: reportDate === dates[0] ? '2026-09' : '2026-10', label: reportDate,
  sourceWorkbooks: [{ province: 'MUCHINGA PROVINCE', filename: `${reportDate}.xlsx`, sha256: reportDate }],
  facilities: [{ province: 'MUCHINGA PROVINCE', district: 'CHINSALI', facilityLevel: 'HEALTH POST', name: 'All health post facilities', isAggregate: true }],
  commodityFacilityData: { dictionaries: { provinces: ['MUCHINGA PROVINCE', 'LUSAKA PROVINCE'], districts: ['CHINSALI', 'LUSAKA'], levels: ['LEVEL 1 HOSPITAL', 'HEALTH POST'], facilities: ['Hospital', 'All health post facilities'], items: ['Normal Saline 500ml', 'Normal Saline 1000ml', 'Paracetamol 500mg Tablet (1000)'], programmes: ['LEVEL 1 HOSPITAL', 'ART'] }, rows }, ...overrides,
});
const row = (qty, { item = 0, unit = 0, programme = 0, province = 0, amc = 10, mos = 2 } = {}) => [province, province, unit, unit, item, programme, qty, amc, mos];

test('three weeks ago means four explicit weekly observations, including cross-month reporting metadata', () => {
  const catalogue = dates.map(date => makePeriod(date, []));
  const window = repeatedSohWindow(catalogue, dates[3], 3);
  assert.deepEqual(window.map(period => period.reportDate), dates);
  assert.equal(window[0].month, '2026-09');
  assert.equal(repeatedSohWindow(catalogue, 'unknown').length, 0);
  assert.equal(repeatedSohWindow(catalogue, dates[3], 9).length, 0);
});

test('positive SOH alone is tested, without requiring unchanged AMC or MOS', () => {
  const periods = dates.map((date, index) => makePeriod(date, [row(120, { amc: index * 10, mos: index })]));
  const result = analyseRepeatedSoh(periods, { dates });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].kind, 'positive');
  assert.equal(result.comparable, 1);
  assert.equal(result.units[0].positive, 1);
  assert.deepEqual(result.records[0].observations.map(observation => observation.quantity), [120, 120, 120, 120]);
});

test('strict report-level threshold flags more than 50%, never exactly 50% or lower', () => {
  const scenarios = [
    { quantities: index => [100, 200 + index], count: 1, total: 2, flagged: false },
    { quantities: index => [100, 200 + index, 300 + index], count: 1, total: 3, flagged: false },
    { quantities: index => [100, 200, 300 + index], count: 2, total: 3, flagged: true },
    { quantities: () => [100, 200, 300], count: 3, total: 3, flagged: true },
  ];
  for (const scenario of scenarios) {
    const periods = dates.map((date, index) => makePeriod(date, scenario.quantities(index).map((quantity, item) => row(quantity, { item }))));
    const unit = analyseRepeatedSoh(periods, { dates }).units[0];
    assert.equal(unit.repeated, scenario.count); assert.equal(unit.reportRows, scenario.total);
    assert.equal(unit.repeatRate, scenario.count / scenario.total);
    assert.equal(unit.isRepeatedReport, scenario.flagged);
  }
  assert.equal(classifyRepeatedSohReport({ reportRows: 20000, comparable: 20000, positive: 10001, zero: 0 }).isRepeatedReport, true);
  assert.equal(classifyRepeatedSohReport({ reportRows: 0, comparable: 0, positive: 0, zero: 0 }).repeatRate, null);
});

test('missing previous records do not shrink the denominator and inflate a repeated-report flag', () => {
  const periods = dates.map((date, index) => makePeriod(date, index === 0 ? [row(100)] : [row(100), row(200, { item: 1 }), row(300, { item: 2 })]));
  const unit = analyseRepeatedSoh(periods, { dates }).units[0];
  assert.equal(unit.comparable, 1); assert.equal(unit.reportRows, 3);
  assert.equal(unit.repeatRate, 1 / 3); assert.equal(unit.isRepeatedReport, false);
  assert.equal(unit.reportStatus, 'Not flagged - incomplete comparison');
});

test('report threshold counts positive and explicit zero repeats, but excludes invalid current SOH', () => {
  const periods = dates.map((date, index) => makePeriod(date, [row(0), row(20, { item: 1 }), row(30 + index, { item: 2 })]));
  const unit = analyseRepeatedSoh(periods, { dates }).units[0];
  assert.equal(unit.positive, 1); assert.equal(unit.zero, 1); assert.equal(unit.repeatRate, 2 / 3);
  assert.equal(unit.isRepeatedReport, true);
  const invalid = dates.map(date => makePeriod(date, [row(20), row(null, { item: 1 }), row(-1, { item: 2 })]));
  const valid = analyseRepeatedSoh(invalid, { dates }).units[0];
  assert.equal(valid.assessed, 3); assert.equal(valid.reportRows, 1); assert.equal(valid.repeated, 1);
});

test('missing calendar weeks and absent, invalid, negative or duplicate records never count as repeats', () => {
  const periods = dates.map(date => makePeriod(date, [row(120)]));
  for (const replacement of [[], [row(null)], [row(-1)], [row(Number.NaN)], [row(120), row(120)], [row(120), row(121)]]) {
    assert.equal(analyseRepeatedSoh([periods[0], makePeriod(dates[1], replacement), ...periods.slice(2)], { dates }).records.length, 0);
  }
  const missing = analyseRepeatedSoh(periods.filter(period => period.reportDate !== dates[1]), { dates });
  assert.deepEqual(missing.unavailableDates, [dates[1]]);
  assert.equal(missing.records.length, 0);
  assert.equal(repeatedSohWindow(periods.filter(period => period.reportDate !== dates[1]), dates[3], 3)[1].missing, true);
});

test('matching endpoints do not claim intermediate SOH was unchanged', () => {
  const periods = dates.map((date, index) => makePeriod(date, [row(index === 1 ? 200 : 100)]));
  assert.equal(analyseRepeatedSoh(periods, { dates }).records.length, 0);
  const endpoint = analyseRepeatedSoh([periods[0], periods[3]], { dates, mode: 'endpoints' });
  assert.equal(endpoint.records.length, 1);
  assert.equal(endpoint.records[0].observations.length, 2);
  assert.equal(endpoint.unavailableDates.length, 0);
});

test('zero repeats remain distinct, and district aggregates are not labelled individual facilities', () => {
  const periods = dates.map(date => makePeriod(date, [row(0), row(50, { item: 2 }), row(40, { unit: 1 })]));
  const result = analyseRepeatedSoh(periods, { dates });
  assert.equal(result.records.filter(record => record.kind === 'zero').length, 1);
  assert.equal(result.units.find(unit => unit.isAggregate).positive, 1);
  assert.equal(result.units.find(unit => !unit.isAggregate).zero, 1);
  const zeroOnly = dates.map(date => makePeriod(date, [row(0)]));
  assert.equal(analyseRepeatedSoh(zeroOnly, { dates }).records.length, 0);
});

test('strength, programme, level, geography and reporting-unit identities cannot be mixed', () => {
  const periods = dates.map((date, index) => makePeriod(date, [row(100, { item: index === 1 ? 1 : 0 })]));
  assert.equal(analyseRepeatedSoh(periods, { dates }).records.length, 0);
  for (const override of [{ programme: 1 }, { unit: 1 }, { province: 1 }]) {
    const changed = dates.map((date, index) => makePeriod(date, [row(100, index === 1 ? override : {})]));
    assert.equal(analyseRepeatedSoh(changed, { dates }).records.length, 0);
  }
  const scoped = dates.map(date => makePeriod(date, [row(100), row(100, { province: 1 })]));
  const result = analyseRepeatedSoh(scoped, { dates, accepts: row => row.province === 'MUCHINGA PROVINCE' });
  assert.equal(result.records.length, 1);
  assert.equal(result.units.length, 1);
});

test('evidence export preserves weekly quantities, source hashes and formula safety', () => {
  const periods = dates.map(date => makePeriod(date, [row(123.5)], { sourceWorkbooks: [{ province: 'MUCHINGA PROVINCE', filename: '=DANGER.xlsx', sha256: 'abc123' }] }));
  const result = analyseRepeatedSoh(periods, { dates });
  const csv = repeatedSohCsv(result.records, { mode: 'consecutive', start: dates[0], end: dates[3] });
  assert.equal(csv.split('\r\n').length, 5);
  assert.match(csv, /"123.5"/); assert.match(csv, /"abc123"/); assert.match(csv, /"'=DANGER.xlsx"/);
  assert.match(csv, /not proof of a copied report/);
  assert.match(repeatedSohCsv(result.records, { mode: 'endpoints' }), /Matching endpoints only/);
  const summaryCsv = repeatedSohReportsCsv(result.units, { mode: 'consecutive', start: dates[0], end: dates[3] });
  assert.equal(summaryCsv.split('\r\n').length, 2);
  assert.match(summaryCsv, /Repeated report/); assert.match(summaryCsv, /"100.00"/);
  assert.match(summaryCsv, /Strictly more than 50%/);
  assert.match(repeatedSohCsv(result.records, { mode: 'consecutive', units: result.units }), /"Repeated report"/);
});

test('assistant routes same-report and repeated SOH questions to data quality without losing geography', () => {
  const scope = { periodId: dates[3], province: 'MUCHINGA PROVINCE', district: 'all', facilityLevel: 'all', facility: 'all', programme: 'all', commodity: 'all', status: 'overstock' };
  const options = { scope, directory: [{ province: 'MUCHINGA PROVINCE', name: 'CHINSALI' }], catalogue: dates.map(date => makePeriod(date, [])), role: 'viewer', activePage: 'facilities' };
  for (const question of ['which facility reported the same report', 'Facilities repeating SOH', 'Compare identical stock on hand with 3 weeks ago', 'same figures in Chinsali']) {
    const plan = planAssistantRequest(question, options);
    assert.equal(plan.page, 'quality'); assert.equal(plan.qualityCheck, 'repeated-soh'); assert.equal(plan.lookback, 3);
    assert.equal(plan.scope.province, scope.province); assert.equal(plan.scope.status, 'all');
    assert.match(plan.text, /strictly more than 50%/);
  }
  assert.equal(planAssistantRequest('repeated SOH 2 weeks ago', options).lookback, 2);
  assert.equal(planAssistantRequest('Recurring stock-outs', options).kind, 'trend');
});

test('published October evidence reconciles exactly to underlying decoded weekly SOH', () => {
  const periods = [
    ...JSON.parse(readFileSync(new URL('../public/data/tracer/2026/sep.json', import.meta.url))).tracerReportingPeriods,
    ...JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url))).tracerReportingPeriods,
  ];
  const result = analyseRepeatedSoh(periods.filter(period => dates.includes(period.reportDate)), { dates });
  assert.ok(result.records.length > 0);
  assert.ok(result.units.some(unit => unit.isAggregate));
  assert.ok(result.units.some(unit => !unit.isAggregate));
  assert.equal(result.records.length, result.units.reduce((total, unit) => total + unit.positive + unit.zero, 0));
  for (const unit of result.units) {
    assert.equal(unit.isRepeatedReport, unit.reportRows > 0 && (unit.positive + unit.zero) * 2 > unit.reportRows);
    assert.ok(unit.comparable <= unit.reportRows);
  }
  for (const record of result.records) {
    assert.equal(record.observations.length, 4);
    assert.ok(record.observations.every(observation => observation.quantity === record.quantity));
  }
});
