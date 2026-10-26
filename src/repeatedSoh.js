import { commodityRowsFromPeriod } from './tracerRows.js';
import { facilityReportingKey } from './reportingQuality.js';

const weekMs = 7 * 86400000;
const textKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const recordKey = row => JSON.stringify([facilityReportingKey(row), row.item, textKey(row.programme)]);

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
      assessed: 0, comparable: 0, positive: 0, zero: 0,
    };
    unit.assessed++;
    unitsByKey.set(unitKey, unit);
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
  const units = [...unitsByKey.values()].sort((a, b) => b.positive - a.positive || b.zero - a.zero || a.facility.localeCompare(b.facility));
  records.sort((a, b) => a.item.localeCompare(b.item) || a.programme.localeCompare(b.programme) || a.facility.localeCompare(b.facility));
  return { records, units, comparable, excluded, unavailableDates };
}

const csvCell = value => {
  const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : String(value ?? '');
  return `"${safe.replaceAll('"', '""')}"`;
};

export function repeatedSohCsv(records, { mode, start, end }) {
  const rows = [['Check', 'Window start', 'Window end', 'Flag', 'Province', 'District', 'Reporting unit', 'Unit type', 'Level of care', 'Commodity', 'Programme', 'Reporting date', 'SOH', 'AMC', 'Submitted MOS', 'Source workbook / dataset', 'Source SHA256', 'Interpretation']];
  for (const record of records) for (const observation of record.observations) rows.push([
    mode === 'endpoints' ? 'Matching endpoints only' : 'Unchanged every calendar week', start, end,
    record.kind === 'zero' ? 'Repeated zero SOH' : 'Repeated positive SOH', record.province, record.district, record.facility,
    record.isAggregate ? 'District aggregate reporting stream' : 'Named facility / reporting unit', record.facilityLevel,
    record.item, record.programme, observation.reportDate, observation.quantity, observation.amc, observation.mos,
    observation.source, observation.sha256, 'Verification flag only; unchanged SOH is not proof of a copied report',
  ]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
