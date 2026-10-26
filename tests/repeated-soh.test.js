import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyseRepeatedSoh, repeatedSohCsv, repeatedSohWindow } from '../src/repeatedSoh.js';
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
});

test('assistant routes same-report and repeated SOH questions to data quality without losing geography', () => {
  const scope = { periodId: dates[3], province: 'MUCHINGA PROVINCE', district: 'all', facilityLevel: 'all', facility: 'all', programme: 'all', commodity: 'all', status: 'overstock' };
  const options = { scope, directory: [{ province: 'MUCHINGA PROVINCE', name: 'CHINSALI' }], catalogue: dates.map(date => makePeriod(date, [])), role: 'viewer', activePage: 'facilities' };
  for (const question of ['which facility reported the same report', 'Facilities repeating SOH', 'Compare identical stock on hand with 3 weeks ago', 'same figures in Chinsali']) {
    const plan = planAssistantRequest(question, options);
    assert.equal(plan.page, 'quality'); assert.equal(plan.qualityCheck, 'repeated-soh'); assert.equal(plan.lookback, 3);
    assert.equal(plan.scope.province, scope.province); assert.equal(plan.scope.status, 'all');
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
  for (const record of result.records) {
    assert.equal(record.observations.length, 4);
    assert.ok(record.observations.every(observation => observation.quantity === record.quantity));
  }
});
