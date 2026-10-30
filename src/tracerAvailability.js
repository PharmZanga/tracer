import submitted from './submittedAvailability2026.js';
import {reportingUnitKey, reportingTextKey} from './reportingIdentity.js';

export const reportedAvailabilityBasis = 'submitted-report-average';
export const availabilityMethodology = 'HC/HP: each facility uses COUNTIF(SOH,">0")/70. The district submits its already-calculated percentage; provincial HC/HP availability is the arithmetic mean of submitted district percentages. Combined district stock is not used to recalculate this percentage. Other care levels retain their own tracer templates. Missing source percentages are unavailable, not zero; totals are report averages, not facility-count weighted estimates.';
const primaryLevels = new Set(['HEALTH CENTRE', 'HEALTH POST', 'PRIMARY CARE - NOT SPECIFIED']);
const sourceKey = row => [row.province, row.district, row.facilityLevel].map(reportingTextKey).join('|');

export function availabilityForRows(rows) {
  let total = 0, reports = 0, missing = 0;
  const corrected = rows.some(row => row.availabilityBasis === reportedAvailabilityBasis);
  for (const row of rows) {
    if (row.availabilityBasis === reportedAvailabilityBasis) {
      total += row.availabilityTotal || 0;
      reports += row.availabilityReports || 0;
      missing += row.availabilityMissingReports || 0;
    } else if (Number.isFinite(row.availability) && row.rows > 0) {
      const weight = corrected ? 1 : row.rows;
      total += row.availability * weight;
      reports += weight;
    }
  }
  return {availability: reports > 0 && missing < 1e-8 ? total / reports : null,
    availabilityKnownAverage: reports ? total / reports : null,
    availabilityTotal: total, availabilityReports: reports, availabilityMissingReports: missing,
    ...(corrected ? {availabilityBasis: reportedAvailabilityBasis} : {})};
}

export function withSubmittedAvailability(period, sources = submitted.periods[period?.id] || []) {
  if (!period?.id?.startsWith('2026-') || !Array.isArray(period.facilities)) return period;
  if (period.national?.availabilityBasis === reportedAvailabilityBasis) return period;
  const evidence = new Map(sources.map(row => [sourceKey(row), row]));
  const duplicates = new Map();
  const keyFor = row => primaryLevels.has(row.facilityLevel) ? sourceKey(row) : reportingUnitKey(row);
  for (const row of period.facilities) if (row.quantity > 0) duplicates.set(keyFor(row), (duplicates.get(keyFor(row)) || 0) + 1);
  const facilities = period.facilities.map(row => {
    const primary = primaryLevels.has(row.facilityLevel);
    const source = primary ? evidence.get(sourceKey(row)) : null;
    const submittedReport = row.quantity > 0;
    const availability = submittedReport ? primary ? source?.availability ?? null : row.availability : null;
    const weight = 1 / (duplicates.get(keyFor(row)) || 1);
    return {...row, stockPresenceAvailability: row.availability, availability,
      availabilityBasis: reportedAvailabilityBasis, availabilityTotal: Number.isFinite(availability) ? availability * weight : 0,
      availabilityReports: Number.isFinite(availability) ? weight : 0,
      availabilityMissingReports: Number.isFinite(availability) || !submittedReport ? 0 : weight,
      availabilitySource: source || null,
      availabilityMethod: primary ? source ? 'Submitted district facility average' : 'Submitted district average unavailable'
        : 'Individual hospital/service tracer report'};
  });
  function decorate(rows, accept) {
    return (rows || []).map(row => ({...row, stockPresenceAvailability: row.availability,
      ...availabilityForRows(facilities.filter(facility => accept(facility, row)))}));
  }
  const programmeScopes = facilities.map(row => ({...row, facility: row.name,
    name: row.facilityLevel === 'CANCER DISEASES HOSPITAL' ? 'CANCER' : row.facilityLevel}));
  // ART is a subset of several templates. District totals cannot recover its
  // facility-average availability, so retain its stock evidence without inventing a rate.
  const art = new Map();
  const data = period.commodityFacilityData;
  if (data) for (const [p, d, l, f, , programme, quantity, amc, mos] of data.rows) {
    if (data.dictionaries.programmes[programme] !== 'ART') continue;
    const key = [p, d, l, f].join('|');
    const group = art.get(key) || {name: 'ART', province: data.dictionaries.provinces[p], district: data.dictionaries.districts[d],
      facilityLevel: data.dictionaries.levels[l], facility: data.dictionaries.facilities[f], rows: 0, quantity: 0, amc: 0,
      positive: 0, mosTotal: 0, mosRows: 0};
    group.rows++; group.quantity += quantity || 0; group.amc += amc || 0; group.positive += Number(quantity > 0);
    const band = !Number.isFinite(mos) ? 'dataGap' : mos <= .1 ? 'stockout' : mos < 1 ? 'nearCritical' : mos < 2 ? 'understocked' : mos <= 4 ? 'accordingToPlan' : 'abovePlan';
    group[band] = (group[band] || 0) + 1;
    if (['stockout', 'nearCritical', 'understocked'].includes(band)) group.riskRows = (group.riskRows || 0) + 1;
    if (Number.isFinite(mos)) {group.mosTotal += Math.min(12, Math.max(0, mos)); group.mosRows++;}
    art.set(key, group);
  }
  for (const group of art.values()) {
    const parentSubmitted = facilities.some(row => row.quantity > 0 && row.province === group.province && row.district === group.district
      && row.facilityLevel === group.facilityLevel && row.name === group.facility);
    const known = !primaryLevels.has(group.facilityLevel) && parentSubmitted;
    programmeScopes.push({...group, availabilityBasis: reportedAvailabilityBasis,
      availability: known ? group.positive / group.rows : null,
      availabilityTotal: known ? group.positive / group.rows : 0, availabilityReports: known ? 1 : 0,
      availabilityMissingReports: !known && parentSubmitted ? 1 : 0,
      stockPresenceAvailability: group.positive / group.rows,
      mos: group.mosRows ? group.mosTotal / group.mosRows : null});
  }
  const streams = new Map();
  for (const row of programmeScopes) {
    const group = streams.get(row.name) || [];
    group.push(row); streams.set(row.name, group);
  }
  const programmes = [...streams].map(([name, members]) => {
    const first = members[0];
    const row = {...first, name, province: undefined, district: undefined, ...availabilityForRows(members)};
    for (const key of ['rows', 'quantity', 'amc', 'riskRows', 'stockout', 'nearCritical', 'understocked', 'accordingToPlan', 'abovePlan', 'overstock', 'dataGap']) row[key] = members.reduce((sum, r) => sum + (r[key] || 0), 0);
    const mos = members.filter(r => Number.isFinite(r.mos));
    row.mos = mos.length ? mos.reduce((sum, r) => sum + r.mos * r.rows, 0) / mos.reduce((sum, r) => sum + r.rows, 0) : null;
    return row;
  });
  return {...period, facilities,
    national: {...period.national, stockPresenceAvailability: period.national.availability, ...availabilityForRows(facilities), availabilityBasis: reportedAvailabilityBasis},
    provinces: decorate(period.provinces, (f, r) => f.province === r.name),
    districts: decorate(period.districts, (f, r) => f.province === r.province && f.district === r.name),
    facilityLevels: decorate(period.facilityLevels, (f, r) => f.facilityLevel === r.name),
    programmeScopes, programmes,
    availabilityReview: {method: 'Unweighted mean of submitted district/service report averages; not a facility-count weighted national estimate',
      sources: [...evidence.values()], missing: facilities.filter(row => row.availabilityMissingReports > 0)
        .map(({province, district, facilityLevel, name}) => ({province, district, facilityLevel, name}))}};
}
