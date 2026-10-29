import assert from 'node:assert/strict';
import test from 'node:test';
import {loadHistoricalTracerYear, tracerReportingPeriods} from '../src/tracerFacilityData.js';
import {facilityReportingRows, facilityReportingSummary, primaryCareDistrictSummary} from '../src/reportingQuality.js';
import {fixedReportingRegister as register, fixedReportingEvidence, outsideRegisterRows} from '../src/fixedReportingRoster.js';
import {matchesReportingSelection, reportingUnitKey} from '../src/reportingIdentity.js';

await loadHistoricalTracerYear('2026');
const october = tracerReportingPeriods.filter(p => p.id >= '2026-10-11');
const fixture = facilities => ({id: '2026-10-25', reportDate: '2026-10-25',
  dataQuality: {facilityRosterRule: 'Versioned reporting evidence', facilities: []}, facilities});
const hospital = register.units.find(row => row.district === 'MUFUMBWE' && row.facilityLevel === 'LEVEL 1 HOSPITAL');

test('register freezes 403 obligations, 116 districts, and service-specific identities', () => {
  assert.equal(register.units.length, 403);
  assert.equal(register.districts.length, 116);
  assert.equal(new Set(register.units.map(row => row.id)).size, 403);
  assert.equal(register.units.filter(row => row.isAggregate).length, 232);
  assert.equal(register.hospitalAndServiceUnits, 171);
  const levy = register.units.filter(row => row.name.includes('LEVY MWANAWASA'));
  assert.ok(levy.some(row => row.facilityLevel === 'LEVEL 3 HOSPITAL'));
  assert.ok(levy.some(row => row.facilityLevel === 'RENAL UNITS'));
  assert.ok(levy.some(row => row.facilityLevel === 'TB-DS/TB-MDR UNITS'));
});

test('every January-October week and every geographic subset retain the same denominator', () => {
  assert.equal(tracerReportingPeriods.length, 43);
  for (const period of tracerReportingPeriods) {
    assert.equal(facilityReportingRows(period).length, 403, period.id);
    assert.equal(primaryCareDistrictSummary(period).expected, 116, period.id);
    for (const d of register.districts) {
      const expected = register.units.filter(row => row.province === d.province && row.district === d.name).length;
      const scoped = facilityReportingSummary(period, {province: d.province, district: d.name});
      assert.equal(scoped.expected, expected, `${period.id}: ${d.name}`);
      assert.equal(scoped.reported + scoped.missing, expected);
    }
  }
});

test('October library retains missing units rather than shrinking the denominator', () => {
  assert.deepEqual(october.map(p => {
    const s = facilityReportingSummary(p); return [s.reported, s.expected, s.missing];
  }), [[401, 403, 2], [387, 403, 16], [386, 403, 17]]);
  const nakonde = facilityReportingSummary(october[2], {province: 'MUCHINGA PROVINCE', district: 'NAKONDE'});
  assert.equal(nakonde.missingRows.filter(row => row.isAggregate).length, 2);
});

test('all-zero blocks and stale roster flags do not establish receipt', () => {
  const p = fixture([{...hospital, quantity: 0}]);
  p.dataQuality.facilities = [{...hospital, reported: true}];
  assert.equal(facilityReportingSummary(p).reported, 0);
  const real = facilityReportingRows(october[1]);
  assert.equal(real.find(row => row.district === 'CHAMA' && row.facilityLevel === 'HEALTH POST').reported, false);
  assert.equal(real.find(row => row.name.includes('LEVY') && row.facilityLevel === 'TB-DS/TB-MDR UNITS').reported, false);
});

test('a positive block qualifies even with zero commodity rows; encoded SOH takes precedence', () => {
  const p = fixture([{...hospital, quantity: 100}]);
  p.commodityFacilityData = {dictionaries: {provinces: [hospital.province], districts: [hospital.district],
    levels: [hospital.facilityLevel], facilities: [hospital.name]}, rows: [[0,0,0,0,0,0,0]]};
  assert.equal(facilityReportingSummary(p).reported, 0);
  const received = structuredClone(p);
  received.commodityFacilityData.rows.push([0,0,0,0,1,0,1]);
  assert.equal(facilityReportingSummary(received).reported, 1);
});

test('scoped spelling variants reconcile but other districts and specialties do not merge', () => {
  assert.ok(hospital);
  const alias = {...hospital, name: 'MUFUMBWE DH', quantity: 12};
  const result = facilityReportingRows(fixture([{...hospital, name: 'MUFUMBWE DISTTCT HOSPITAL', quantity: 3}, alias]));
  assert.equal(result.filter(row => row.reported).length, 1);
  const row = result.find(row => row.id === hospital.id);
  assert.equal(row.sourceNames.length, 2);
  assert.ok(matchesReportingSelection(alias, `${hospital.province}|${hospital.district}|${hospital.facilityLevel}|${hospital.name}`));
  assert.notEqual(reportingUnitKey(alias), reportingUnitKey({...alias, district: 'KASEMPA'}));
  assert.notEqual(reportingUnitKey(alias), reportingUnitKey({...alias, facilityLevel: 'RENAL UNITS'}));
  assert.equal(reportingUnitKey({...alias, name: 'Kabwe Hospital 22/10/2026'}), reportingUnitKey({...alias, name: 'Kabwe Hospital'}));
});

test('combined primary care meets two obligations and hospitals do not satisfy district reporting', () => {
  const d = register.districts[0];
  const p = fixture([{province: d.province, district: d.name, name: 'Combined source',
    facilityLevel: 'PRIMARY CARE - NOT SPECIFIED', quantity: 1}]);
  assert.equal(facilityReportingSummary(p).reported, 2);
  assert.equal(primaryCareDistrictSummary(p, {district: d.name}).reported, 1);
  assert.equal(primaryCareDistrictSummary(fixture([{...hospital, quantity: 10}]), {district: hospital.district}).reported, 0);
});

test('new names are reviewable but cannot silently expand the reporting universe', () => {
  const p = fixture([{...hospital, name: 'Uncertified New Hospital', quantity: 10}]);
  assert.equal(facilityReportingSummary(p).expected, 403);
  assert.equal(facilityReportingSummary(p).reported, 0);
  assert.equal(outsideRegisterRows(p).length, 1);
  assert.equal(outsideRegisterRows(p, {province: 'LUSAKA PROVINCE'}).length, 0);
  assert.equal(fixedReportingEvidence(p), fixedReportingEvidence(p), 'reuse immutable period evidence on clicks');
});

test('legacy years and custom fixture rosters are not silently backfilled with the 2026 register', () => {
  const old = {...fixture([{...hospital, quantity: 10}]), id: '2025-10-25', reportDate: '2025-10-25'};
  assert.equal(fixedReportingEvidence(old), null);
  assert.equal(facilityReportingRows(old).length, 1);
  assert.equal(fixedReportingEvidence({id: '2026-10-25', facilities: []}), null);
});
