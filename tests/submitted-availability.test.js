import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availabilityForRows, withSubmittedAvailability} from '../src/tracerAvailability.js';
import {assistantComparison, assistantSnapshot, emptyAssistantFocus} from '../src/tracerAssistant.js';

const raw = JSON.parse(fs.readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url))).tracerReportingPeriods.find(p => p.id === '2026-10-25');
const corrected = withSubmittedAvailability(raw);
const lusaka = corrected.facilities.filter(row => row.province === 'LUSAKA PROVINCE');
const average = level => availabilityForRows(lusaka.filter(row => row.facilityLevel === level));

test('Lusaka HC averages submitted district percentages: 78.4%, rounded 78%', () => {
  assert.equal(average('HEALTH CENTRE').availability, .784);
  assert.equal(Math.round(average('HEALTH CENTRE').availability * 100), 78);
  assert.equal(average('HEALTH CENTRE').availabilityReports, 5);
  assert.equal(average('HEALTH CENTRE').availabilityMissingReports, 0);
});

test('Kafue HP retains the submitted 78%, not 65 positive combined quantities / 70', () => {
  const row = lusaka.find(row => row.district === 'KAFUE' && row.facilityLevel === 'HEALTH POST');
  assert.equal(row.availability, .78);
  assert.equal(row.availabilitySource.cell, 'M76');
  assert.equal(row.availabilitySource.sheet, 'HP');
  assert.notEqual(row.availability, row.stockPresenceAvailability);
  assert.equal(average('HEALTH POST').availability, .75);
});

test('programme scopes carry district and facility identity; HP uses all 70 tracer lines', () => {
  const row = corrected.programmeScopes.find(row => row.province === 'LUSAKA PROVINCE' && row.district === 'KAFUE' && row.name === 'HEALTH POST');
  assert.equal(row.availability, .78);
  assert.equal(row.rows, 70);
  assert.ok(row.facility);
  assert.ok(corrected.programmes.some(row => row.name === 'ART'));
  const art = corrected.programmeScopes.find(row => row.province === 'LUSAKA PROVINCE' && row.district === 'KAFUE' && row.name === 'ART' && row.facilityLevel === 'HEALTH POST');
  assert.equal(art.availability, null, 'ART-specific facility average cannot be recovered from the full-template percentage');
});

test('averaging is associative and not weighted by stock rows or invented facility counts', () => {
  const hc = lusaka.filter(row => row.facilityLevel === 'HEALTH CENTRE');
  const weighted = hc.map((row, i) => ({...row, rows: i ? 1 : 10000}));
  assert.equal(availabilityForRows(weighted).availability, .784);
  const parts = [availabilityForRows(hc.slice(0, 2)), availabilityForRows(hc.slice(2))];
  assert.equal(availabilityForRows(parts).availability, .784);
});

test('missing percentages are unavailable, valid zero is retained, all-zero blocks are not reports', () => {
  const facility = lusaka.find(row => row.facilityLevel === 'HEALTH CENTRE');
  const input = {...raw, facilities: [{...facility, availability: .95}], national: {rows: 70}};
  assert.equal(withSubmittedAvailability(input, []).national.availability, null);
  const zero = withSubmittedAvailability(input, [{...facility, availability: 0}]);
  assert.equal(zero.national.availability, 0);
  assert.equal(zero.national.availabilityReports, 1);
  const blank = withSubmittedAvailability({...input, facilities: [{...facility, quantity: 0}]}, []);
  assert.equal(blank.national.availabilityMissingReports, 0);
  assert.equal(blank.national.availabilityReports, 0);
});

test('SOH, AMC, MOS, encoded stock rows and reporting denominator evidence remain unchanged', () => {
  assert.equal(corrected.commodityFacilityData, raw.commodityFacilityData);
  assert.deepEqual(corrected.counts, raw.counts);
  for (let i = 0; i < raw.facilities.length; i++) for (const key of ['quantity', 'amc', 'mos', 'rows'])
    assert.equal(corrected.facilities[i][key], raw.facilities[i][key]);
  assert.equal(withSubmittedAvailability(corrected), corrected);
});

test('assistant scoped to Kafue HP uses the same submitted percentage', () => {
  const scope = {...emptyAssistantFocus, province: 'LUSAKA PROVINCE', district: 'KAFUE', facilityLevel: 'HEALTH POST', facility: 'all'};
  const answer = assistantSnapshot(corrected, scope, (level, selection) => selection === 'all' || level === selection);
  assert.equal(answer.facts.availability, .78);
  assert.match(answer.text, /submitted-report average availability is 78.0%/);
});

test('assistant comparison preserves district-average evidence rather than aggregate-stock ratios', () => {
  const scope = {...emptyAssistantFocus, province: 'LUSAKA PROVINCE', district: 'KAFUE', facilityLevel: 'HEALTH POST', facility: 'all'};
  const answer = assistantComparison(corrected, corrected, scope, (level, selection) => level === selection);
  assert.equal(answer.facts.current.availability, .78);
  assert.equal(answer.facts.previous.availability, .78);
  assert.match(answer.text, /submitted-report average availability was unchanged/);
});

test('shifted Central HP footer uses the percentage row, not the MOS row or header label', () => {
  const row = corrected.facilities.find(row => row.province === 'CENTRAL PROVINCE' && row.district === 'CHITAMBO' && row.facilityLevel === 'HEALTH POST');
  assert.equal(row.availabilitySource?.cell, 'M77');
  assert.ok(Math.abs(row.availability - 69 / 70) < 1e-10);
});
