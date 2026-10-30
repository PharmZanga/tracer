import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availabilityForRows, withSubmittedAvailability} from '../src/tracerAvailability.js';
import {assistantComparison, assistantSnapshot, emptyAssistantFocus} from '../src/tracerAssistant.js';
import {commodityRowsFromPeriod} from '../src/tracerRows.js';

const raw = JSON.parse(fs.readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url))).tracerReportingPeriods.find(p => p.id === '2026-10-25');
const restored = withSubmittedAvailability(raw);
const kafue = restored.facilities.find(row => row.province === 'LUSAKA PROVINCE' && row.district === 'KAFUE' && row.facilityLevel === 'HEALTH POST');
const scope = {...emptyAssistantFocus, province: 'LUSAKA PROVINCE', district: 'KAFUE', facilityLevel: 'HEALTH POST', facility: 'all'};
const matchesLevel = (level, selection) => selection === 'all' || level === selection;

test('Kafue HP restores positive SOH availability: 65 / 70, displayed 92.9%', () => {
  const detail = commodityRowsFromPeriod(raw).filter(row => row.province === scope.province && row.district === scope.district && row.facilityLevel === scope.facilityLevel);
  assert.equal(detail.length, 70);
  assert.equal(detail.filter(row => row.quantity > 0).length, 65);
  assert.ok(Math.abs(kafue.availability - 65 / 70) < .0001);
  assert.equal((kafue.availability * 100).toFixed(1), '92.9');
  assert.notEqual(kafue.availability, .78);
});

test('programme scopes retain district and reporting-unit identity, not the provincial 96.4%', () => {
  const rows = restored.programmeScopes.filter(row => row.province === scope.province && row.district === scope.district && row.name === 'HEALTH POST');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rows, 70);
  assert.equal(rows[0].availability, kafue.availability);
  assert.notEqual(rows[0].availability, .9642);
  assert.ok(rows[0].facility);
});

test('ART retains its own positive-SOH subset alongside the full HC/HP template', () => {
  const art = restored.programmeScopes.find(row => row.province === scope.province && row.district === scope.district && row.name === 'ART' && row.facilityLevel === scope.facilityLevel);
  assert.equal(art.rows, 3);
  assert.equal(art.availability, 2 / 3);
});

test('rollups restore record-count weights and remain associative', () => {
  const rows = [{rows: 70, availability: .9}, {rows: 50, availability: .5}, {rows: 20, availability: 1}];
  const expected = (70 * .9 + 50 * .5 + 20) / 140;
  assert.equal(availabilityForRows(rows).availability, expected);
  const first = {...availabilityForRows(rows.slice(0, 2)), rows: 120};
  assert.equal(availabilityForRows([first, rows[2]]).availability, expected);
  assert.equal(availabilityForRows([{rows: 70, availability: 0}]).availability, 0);
  assert.equal(availabilityForRows([]).availability, null);
});

test('entered footer evidence cannot replace stock-based availability or suppress it', () => {
  const projected = withSubmittedAvailability(raw, [{...kafue, availability: .78}]);
  assert.equal(projected.facilities, raw.facilities);
  assert.equal(projected.national, raw.national);
  assert.equal(projected.provinces, raw.provinces);
  assert.equal(projected.districts, raw.districts);
  assert.equal(projected.facilityLevels, raw.facilityLevels);
});

test('SOH, AMC, MOS, encoded stock rows and reporting evidence remain unchanged', () => {
  assert.equal(restored.commodityFacilityData, raw.commodityFacilityData);
  assert.equal(restored.counts, raw.counts);
  assert.equal(restored.facilities, raw.facilities);
  assert.deepEqual(withSubmittedAvailability(restored), restored);
});

test('assistant scoped to Kafue HP also shows 65 / 70 rather than 78%', () => {
  const answer = assistantSnapshot(restored, scope, matchesLevel);
  assert.equal(answer.facts.availability, 65 / 70);
  assert.match(answer.text, /92.9%/);
  assert.doesNotMatch(answer.text, /uses submitted district percentages/);
});

test('assistant comparison keeps the restored positive-SOH measure', () => {
  const answer = assistantComparison(restored, restored, scope, matchesLevel);
  assert.equal(answer.facts.current.availability, 65 / 70);
  assert.equal(answer.facts.previous.availability, 65 / 70);
  assert.match(answer.text, /positive stock-record share was unchanged/);
});

test('Level 1 Lusaka district retains its original 80.8% calculation', () => {
  const hospitals = restored.facilities.filter(row => row.province === 'LUSAKA PROVINCE' && row.district === 'LUSAKA' && row.facilityLevel === 'LEVEL 1 HOSPITAL');
  assert.equal(hospitals.length, 5);
  assert.ok(Math.abs(availabilityForRows(hospitals).availability - .808) < 1e-10);
});
