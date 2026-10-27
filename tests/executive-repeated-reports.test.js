import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyseRepeatedSoh, summariseRepeatedSohScope } from '../src/repeatedSoh.js';

const periods = ['sep', 'oct'].flatMap(month => JSON.parse(readFileSync(new URL(`../public/data/tracer/2026/${month}.json`, import.meta.url))).tracerReportingPeriods);
const dates = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'];
const analysis = analyseRepeatedSoh(periods, { dates });

test('executive repeated-report count follows province and district rather than the national total', () => {
  assert.equal(summariseRepeatedSohScope(analysis).count, 76);
  const muchinga = summariseRepeatedSohScope(analysis, { province: 'MUCHINGA PROVINCE' });
  assert.equal(muchinga.count, 1); assert.equal(muchinga.assessed, 22);
  assert.equal(muchinga.repeatedUnits[0].facility, 'MUYOMBE DISTRICT HOSPITAL');
  assert.equal(muchinga.repeatedUnits[0].repeatRate, 0.56);
  assert.equal(summariseRepeatedSohScope(analysis, { province: 'MUCHINGA PROVINCE', district: 'MAFINGA' }).count, 1);
  assert.equal(summariseRepeatedSohScope(analysis, { province: 'MUCHINGA PROVINCE', district: 'CHINSALI' }).count, 0);
  assert.equal(summariseRepeatedSohScope(analysis, { province: 'CENTRAL PROVINCE' }).count, 6);
  assert.equal(summariseRepeatedSohScope(analysis, { province: 'LUSAKA PROVINCE' }).count, 4);
});

test('province and district counts reconcile without changing the underlying report classifications', () => {
  const national = summariseRepeatedSohScope(analysis);
  const provinces = [...new Set(national.units.map(unit => unit.province))];
  assert.equal(provinces.reduce((sum, province) => sum + summariseRepeatedSohScope(analysis, { province }).count, 0), national.count);
  for (const province of provinces) {
    const scoped = summariseRepeatedSohScope(analysis, { province });
    const districts = [...new Set(scoped.units.map(unit => unit.district))];
    assert.equal(districts.reduce((sum, district) => sum + summariseRepeatedSohScope(analysis, { province, district }).count, 0), scoped.count);
    assert.ok(scoped.repeatedUnits.every(unit => unit.repeated * 2 > unit.reportRows && analysis.units.includes(unit)));
  }
});

test('care level and exact reporting unit intersect the geography; empty scopes do not fall back to national', () => {
  const unit = summariseRepeatedSohScope(analysis, { province: 'MUCHINGA PROVINCE' }).repeatedUnits[0];
  const facility = `${unit.province}|${unit.district}|${unit.facilityLevel}|${unit.facility}`;
  const scope = { province: unit.province, district: unit.district, facilityLevel: 'level-1', facility };
  const matchesLevel = (level, selected) => selected === 'all' || selected === 'level-1' && level === 'LEVEL 1 HOSPITAL';
  assert.equal(summariseRepeatedSohScope(analysis, scope, matchesLevel).count, 1);
  assert.equal(summariseRepeatedSohScope(analysis, { ...scope, district: 'CHINSALI' }, matchesLevel).count, 0);
  assert.equal(summariseRepeatedSohScope(analysis, { ...scope, facilityLevel: 'level-2' }, matchesLevel).count, 0);
  assert.equal(summariseRepeatedSohScope(analysis, { province: 'Not a province' }).assessed, 0);
});

test('missing weekly detail is unavailable rather than a misleading zero repeated-report count', () => {
  const incomplete = analyseRepeatedSoh(periods.filter(period => period.reportDate !== dates[0]), { dates });
  assert.equal(summariseRepeatedSohScope(incomplete).count, null);
  const zeroData = analyseRepeatedSoh([], { dates });
  assert.equal(summariseRepeatedSohScope(zeroData).count, null);
});

test('executive card and Data Quality drill-through share the date, lookback and scope', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /<ExecutiveRepeatedReportsCard catalogue=\{currentReportCatalogue\} periodId=\{fieldData.id\} lookback=\{qualityRepeatWeeks\}/);
  assert.match(source, /province=\{selectedProvince\} district=\{selectedDistrict\} facilityLevel=\{selectedFacilityLevel\} facility=\{selectedFacility\}/);
  const handler = source.slice(source.indexOf('function openExecutiveRepeatedReports()'), source.indexOf('function openExecutiveCommodityDetail('));
  assert.match(handler, /setAssistantFocus\(\{ \.\.\.emptyAssistantFocus \}\)/);
  assert.match(handler, /setQualityWorkspace\('repeated'\)/); assert.match(handler, /setActivePage\('quality'\)/);
  assert.doesNotMatch(handler, /setSelectedProvince|setSelectedDistrict|setSelectedFacility|setFieldPeriodId/);
  const card = readFileSync(new URL('../src/ExecutiveRepeatedReportsCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /summary.count === null/); assert.match(card, /'Checking\.\.\.'/);
  assert.match(card, /loaded.error \? retry : onOpen/);
  assert.match(card, /useMemo\(\(\) => analyseRepeatedSoh\(loaded.periods/);
});
