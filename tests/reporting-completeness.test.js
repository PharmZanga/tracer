import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {facilityReportingSummary, primaryCareDistrictSummary} from '../src/reportingQuality.js';
import {assistantReporting} from '../src/tracerAssistant.js';

const period = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8')).tracerReportingPeriods.find(p => p.id === '2026-11-01');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('Southern overall completeness includes its missing hospitals and specialist units', () => {
  const units = facilityReportingSummary(period, {province: 'SOUTHERN PROVINCE'});
  const dho = primaryCareDistrictSummary(period, {province: 'SOUTHERN PROVINCE'});
  assert.deepEqual([units.reported, units.expected, units.missing], [52, 57, 5]);
  assert.equal(units.rate, 52 / 57);
  assert.deepEqual([dho.reported, dho.expected, dho.rate], [15, 15, 1]);
});

test('Southern Level 1 retains both missing hospitals in the scoped denominator', () => {
  const units = facilityReportingSummary(period, {province: 'SOUTHERN PROVINCE', matchesFacility: row => row.facilityLevel === 'LEVEL 1 HOSPITAL'});
  assert.deepEqual([units.reported, units.expected, units.missing], [9, 11, 2]);
  assert.equal(units.rate, 9 / 11);
  assert.deepEqual(units.missingRows.map(row => row.name).sort(), ['Munymbwe', 'Siavonga']);
});

test('district and empty care-level selections retain their own reporting obligations', () => {
  const units = facilityReportingSummary(period, {province: 'SOUTHERN PROVINCE', district: 'GWEMBE'});
  assert.deepEqual([units.reported, units.expected, units.rate], [3, 4, .75]);
  const empty = facilityReportingSummary(period, {province: 'SOUTHERN PROVINCE', district: 'GWEMBE', matchesFacility: row => row.facilityLevel === 'LEVEL 3 HOSPITAL'});
  assert.equal(empty.expected, 0);
  assert.equal(empty.rate, null);
});

test('province completeness totals reconcile against the fixed national register', () => {
  const national = facilityReportingSummary(period);
  const provinces = [...new Set(national.rows.map(row => row.province))];
  const summaries = provinces.map(province => facilityReportingSummary(period, {province}));
  assert.deepEqual([national.reported, national.expected, national.missing], [393, 403, 10]);
  for (const key of ['reported', 'expected', 'missing']) assert.equal(summaries.reduce((sum, row) => sum + row[key], 0), national[key]);
});

test('the overall chart and headline use status-independent reporting units while DHO stays separate', () => {
  assert.match(app, /const reportingProvinceRows = aggregateQualityRows\(reportingFacilityScopeRows, "province"/);
  assert.match(app, /const reportingUnitDistrictRows = aggregateQualityRows\(reportingFacilityScopeRows/);
  assert.doesNotMatch(app, /const reportingProvinceRows = aggregateQualityRows\(reportingRows,/);
  assert.match(app, /label="Reporting-unit completeness" value=\{formatPercent\(reportingFacilityKpis.rate\)\}/);
  assert.match(app, /label="Expected reporting units"/);
  assert.match(app, /aria-label="DHO primary-care reporting"/);
  assert.match(app, /isDhoReportingDetail \? reportingRows.map/);
  assert.match(app, /reportingUnitDetailRows.map/);
});

test('assistant reporting leads with overall completeness and keeps missing-status denominators intact', () => {
  const scope = {province: 'SOUTHERN PROVINCE', district: 'all', facility: 'all', facilityLevel: 'all', programme: 'all', commodity: 'all', status: 'missing'};
  const matches = (value, level) => level === 'all' || value === level;
  const all = assistantReporting(period, scope, matches);
  assert.match(all.text, /^Reporting-unit completeness is 91.2%: 52 of 57 expected units submitted/);
  assert.match(all.text, /Separately, 15 of 15 districts/);
  assert.equal(all.total, 5);
  const level1 = assistantReporting(period, {...scope, facilityLevel: 'LEVEL 1 HOSPITAL'}, matches);
  assert.match(level1.text, /^Reporting-unit completeness is 81.8%: 9 of 11 expected units submitted/);
  assert.equal(level1.total, 2);
});
