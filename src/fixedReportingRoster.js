import register from './reportingRoster2026.js';
import {reportingTextKey, reportingUnitKey} from './reportingIdentity.js';

export const fixedReportingRegister = register;
const unitsByKey = new Map(register.units.map(row => [row.id, row]));
const cached = new WeakMap();

export function usesFixedReportingRegister(period) {
  const date = period?.reportDate || period?.id || '';
  return date >= register.appliesFrom && date <= register.appliesThrough
    && Boolean(period?.dataQuality?.facilityRosterRule);
}

export function fixedDistrictDirectory(period) {
  return usesFixedReportingRegister(period) ? register.districts : period?.dataQuality?.districts || [];
}

export function fixedReportingEvidence(period) {
  if (!usesFixedReportingRegister(period)) return null;
  if (cached.has(period)) return cached.get(period);
  const submitted = new Map();
  const outside = new Map();
  const add = row => {
    // A combined primary-care submission fulfils two streams, not a third unit.
    const levels = row.facilityLevel === 'PRIMARY CARE - NOT SPECIFIED'
      ? ['HEALTH CENTRE', 'HEALTH POST'] : [row.facilityLevel];
    for (const facilityLevel of levels) {
      const source = {...row, facilityLevel};
      const key = reportingUnitKey(source);
      const target = unitsByKey.has(key) ? submitted : outside;
      const previous = target.get(key);
      target.set(key, {...source, combinedPrimaryCareReported: row.facilityLevel === 'PRIMARY CARE - NOT SPECIFIED' || Boolean(previous?.combinedPrimaryCareReported),
        sourceNames: [...new Set([...(previous?.sourceNames || []), row.name || row.facility])], reportingKey: key});
    }
  };
  const data = period.commodityFacilityData;
  if (data?.rows && data?.dictionaries) {
    const {provinces, districts, levels, facilities} = data.dictionaries;
    const seen = new Set();
    for (const [p, d, l, f, , , quantity] of data.rows) {
      if (!(Number(quantity) > 0)) continue;
      const sourceKey = `${p}|${d}|${l}|${f}`;
      if (seen.has(sourceKey)) continue;
      seen.add(sourceKey);
      add({province: provinces[p], district: districts[d], facilityLevel: levels[l], name: facilities[f]});
    }
  } else {
    for (const row of period.facilities || []) if (Number(row.quantity) > 0) add(row);
  }
  const rows = register.units.map(unit => {
    const evidence = submitted.get(unit.id);
    return {...unit, name: evidence?.name || unit.name, masterName: unit.name,
      reportingKey: unit.id, sourceNames: evidence?.sourceNames || [], rosterExpected: true,
      combinedPrimaryCareReported: Boolean(evidence?.combinedPrimaryCareReported),
      reported: Boolean(evidence), hasTracerSubmission: Boolean(evidence),
      reconciliationStatus: evidence ? 'Registered unit - positive-SOH block received' : 'Registered unit - no qualifying submission'};
  });
  const result = {rows, outsideRegister: [...outside.values()], version: register.version};
  cached.set(period, result);
  return result;
}

export function outsideRegisterRows(period, scope = {}) {
  return (fixedReportingEvidence(period)?.outsideRegister || []).filter(row =>
    (!scope.province || scope.province === 'all' || reportingTextKey(row.province) === reportingTextKey(scope.province))
    && (!scope.district || scope.district === 'all' || reportingTextKey(row.district) === reportingTextKey(scope.district)));
}
