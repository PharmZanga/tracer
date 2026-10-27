import { commodityRowsFromPeriod } from './tracerRows.js';
import { facilityReportingKey } from './reportingQuality.js';

const weekMs = 7 * 86400000;
const textKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const recordKey = row => JSON.stringify([facilityReportingKey(row), row.item, textKey(row.programme)]);

export function classifyRepeatedSohReport(unit) {
  const repeated = unit.positive + unit.zero;
  const repeatRate = unit.reportRows > 0 ? repeated / unit.reportRows : null;
  const isRepeatedReport = unit.reportRows > 0 && repeated * 2 > unit.reportRows;
  return { ...unit, repeated, repeatRate, isRepeatedReport,
    comparisonCoverage: unit.reportRows > 0 ? unit.comparable / unit.reportRows : null,
    reportStatus: !unit.reportRows ? 'No valid SOH' : isRepeatedReport ? 'Repeated report'
      : unit.comparable < unit.reportRows ? 'Not flagged - incomplete comparison' : 'Not flagged (50% or less)',
  };
}

export function summariseRepeatedSohScope(analysis, scope = {}, matchesLevel = (level, selected) => selected === 'all' || level === selected) {
  const { province = 'all', district = 'all', facilityLevel = 'all', facility = 'all' } = scope;
  const units = analysis.units.filter(unit => unit.reportRows > 0
    && (province === 'all' || unit.province === province)
    && (district === 'all' || unit.district === district)
    && matchesLevel(unit.facilityLevel, facilityLevel)
    && (facility === 'all' || `${unit.province}|${unit.district}|${unit.facilityLevel}|${unit.facility}` === facility));
  const repeatedUnits = units.filter(unit => unit.isRepeatedReport);
  return { units, repeatedUnits, assessed: units.length, count: analysis.unavailableDates.length ? null : repeatedUnits.length };
}

export function repeatedSohWindow(catalogue, endId, lookback = 3) {
  const end = catalogue.find(period => period.id === endId);
  if (!end || !Number.isInteger(lookback) || lookback < 1 || lookback > 8) return [];
  const time = Date.parse(`${end.reportDate}T00:00:00Z`);
  if (!Number.isFinite(time)) return [];
  return Array.from({ length: lookback + 1 }, (_, index) => {
    const reportDate = new Date(time - (lookback - index) * weekMs).toISOString().slice(0, 10);
    return catalogue.find(period => period.reportDate === reportDate) || { id: reportDate, reportDate, label: reportDate, missing: true };
  });
}

export function analyseRepeatedSoh(periods, { dates, mode = 'consecutive', accepts = () => true } = {}) {
  if (!dates?.length || dates.length < 2) return { records: [], units: [], comparable: 0, excluded: 0, unavailableDates: [] };
  const byDate = new Map(periods.map(period => [period.reportDate, period]));
  const requiredDates = mode === 'endpoints' ? [dates[0], dates.at(-1)] : dates;
  const unavailableDates = requiredDates.filter(date => !byDate.get(date)?.commodityFacilityData?.rows);
  const indexed = new Map();
  for (const date of requiredDates) {
    const period = byDate.get(date);
    const records = new Map();
    const weeklyRows = commodityRowsFromPeriod(period);
    const positiveUnits = new Set(weeklyRows.filter(row => Number.isFinite(row.quantity) && row.quantity > 0).map(facilityReportingKey));
    for (const row of weeklyRows) {
      if (!accepts(row)) continue;
      const key = recordKey(row);
      const previous = records.get(key);
      records.set(key, previous ? { ...previous, duplicate: true } : { row, duplicate: false, invalidBlock: !positiveUnits.has(facilityReportingKey(row)) });
    }
    indexed.set(date, records);
  }
  const endPeriod = byDate.get(dates.at(-1));
  const aggregateKeys = new Set((endPeriod?.facilities || []).filter(row => row.isAggregate).map(facilityReportingKey));
  const records = [], unitsByKey = new Map();
  let comparable = 0, excluded = 0;
  for (const [key, entry] of indexed.get(dates.at(-1)) || []) {
    const row = entry.row;
    const unitKey = facilityReportingKey(row);
    const unit = unitsByKey.get(unitKey) || {
      key: unitKey, province: row.province, district: row.district, facility: row.facility,
      facilityLevel: row.facilityLevel,
      isAggregate: aggregateKeys.has(unitKey) || /PRIMARY CARE|HEALTH (CENTRE|CENTER|POST)/i.test(row.facilityLevel) && /^all\b/i.test(row.facility || ''),
      assessed: 0, reportRows: 0, comparable: 0, positive: 0, zero: 0,
    };
    unit.assessed++;
    unitsByKey.set(unitKey, unit);
    if (!entry.duplicate && !entry.invalidBlock && Number.isFinite(row.quantity) && row.quantity >= 0) unit.reportRows++;
    const observations = requiredDates.map(date => indexed.get(date)?.get(key));
    // Duplicate identities are ambiguous even if their quantities happen to agree.
    if (observations.some(observation => !observation || observation.duplicate || observation.invalidBlock || !Number.isFinite(observation.row.quantity) || observation.row.quantity < 0)) {
      excluded++;
      continue;
    }
    comparable++; unit.comparable++;
    if (!observations.every(observation => observation.row.quantity === row.quantity)) continue;
    const kind = row.quantity === 0 ? 'zero' : 'positive';
    unit[kind]++;
    records.push({ ...row, key, unitKey, isAggregate: unit.isAggregate, kind,
      observations: requiredDates.map((reportDate, index) => {
        const period = byDate.get(reportDate);
        const source = period.sourceWorkbooks?.find(workbook => workbook.province === row.province);
        return { ...observations[index].row, reportDate, label: period.label, source: source?.filename || period.source || '', sha256: source?.sha256 || '' };
      }),
    });
  }
  const units = [...unitsByKey.values()].map(classifyRepeatedSohReport)
    .sort((a, b) => Number(b.isRepeatedReport) - Number(a.isRepeatedReport) || (b.repeatRate || 0) - (a.repeatRate || 0) || b.repeated - a.repeated || a.facility.localeCompare(b.facility));
  records.sort((a, b) => a.item.localeCompare(b.item) || a.programme.localeCompare(b.programme) || a.facility.localeCompare(b.facility));
  return { records, units, comparable, excluded, unavailableDates };
}

const csvCell = value => {
  const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : String(value ?? '');
  return `"${safe.replaceAll('"', '""')}"`;
};

export function repeatedSohCsv(records, { mode, start, end, units = [] }) {
  const reports = new Map(units.map(unit => [unit.key, unit]));
  const rows = [['Check', 'Window start', 'Window end', 'Flag', 'Province', 'District', 'Reporting unit', 'Unit type', 'Level of care', 'Commodity', 'Programme', 'Reporting date', 'SOH', 'AMC', 'Submitted MOS', 'Source workbook / dataset', 'Source SHA256', 'Interpretation', 'Report status', 'Repeated SOH entries', 'Valid current-report SOH entries', 'Repeated SOH percent', 'Comparable entries']];
  for (const record of records) for (const observation of record.observations) {
    const unit = reports.get(record.unitKey);
    rows.push([
    mode === 'endpoints' ? 'Matching endpoints only' : 'Unchanged every calendar week', start, end,
    record.kind === 'zero' ? 'Repeated zero SOH' : 'Repeated positive SOH', record.province, record.district, record.facility,
    record.isAggregate ? 'District aggregate reporting stream' : 'Named facility / reporting unit', record.facilityLevel,
    record.item, record.programme, observation.reportDate, observation.quantity, observation.amc, observation.mos,
    observation.source, observation.sha256, 'Verification flag only; unchanged SOH is not proof of a copied report',
    unit?.reportStatus, unit?.repeated, unit?.reportRows, unit?.repeatRate === null || !unit ? '' : (unit.repeatRate * 100).toFixed(2), unit?.comparable,
  ]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function repeatedSohReportsCsv(units, { mode, start, end }) {
  const rows = [['Window start', 'Window end', 'Comparison rule', 'Province', 'District', 'Reporting unit', 'Unit type', 'Level / reporting stream', 'Report status', 'Repeated SOH entries', 'Valid current-report SOH entries', 'Repeated SOH percent', 'Repeated positive SOH entries', 'Repeated zero SOH entries', 'Comparable entries', 'Comparison coverage percent', 'Threshold', 'Interpretation'],
    ...units.map(unit => [start, end, mode === 'endpoints' ? 'Matching endpoints only' : 'Unchanged every calendar week',
      unit.province, unit.district, unit.facility, unit.isAggregate ? 'District aggregate reporting stream' : 'Named facility / reporting unit', unit.facilityLevel,
      unit.reportStatus, unit.repeated, unit.reportRows, unit.repeatRate === null ? '' : (unit.repeatRate * 100).toFixed(2), unit.positive, unit.zero, unit.comparable,
      unit.comparisonCoverage === null ? '' : (unit.comparisonCoverage * 100).toFixed(2), 'Strictly more than 50% of valid current-report SOH entries', 'Verification flag; not proof of a copied report']),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
