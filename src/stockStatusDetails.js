export const nationalStockBands = [
  { id: 'stockout', label: 'Stocked out', definition: 'Submitted MOS at or below 0.1. Near-zero MOS can coexist with positive SOH; this is not a confirmed zero-quantity count.' },
  { id: 'nearCritical', label: 'Emergency', definition: 'Submitted MOS above 0.1 and below 1 month.' },
  { id: 'understocked', label: 'Understocked', definition: 'Submitted MOS from 1 to below 2 months.' },
  { id: 'accordingToPlan', label: 'According to plan', definition: 'Submitted MOS from 2 through 4 months.' },
  { id: 'overstock', label: 'Overstocked', definition: 'Submitted MOS above 4 months, including excess stock.' },
];

export function nationalStockBand(mos) {
  if (!Number.isFinite(mos)) return 'dataGap';
  if (mos <= 0.1) return 'stockout';
  if (mos < 1) return 'nearCritical';
  if (mos < 2) return 'understocked';
  if (mos <= 4) return 'accordingToPlan';
  return 'overstock';
}

const unitKey = row => JSON.stringify([row.province, row.district, row.facilityLevel, row.facility]);
const compare = (a, b) => String(a || '').localeCompare(String(b || ''));

export function stockBandRecords(rows, band, { search = '', programme = 'all', commodity = '' } = {}) {
  if (!nationalStockBands.some(row => row.id === band)) return [];
  const term = search.trim().toLowerCase();
  return rows.filter(row => nationalStockBand(row.mos) === band)
    .filter(row => programme === 'all' || row.programme === programme)
    .filter(row => !commodity || row.item === commodity)
    .filter(row => !term || [row.item, row.programme, row.province, row.district, row.facility, row.facilityLevel].join(' ').toLowerCase().includes(term))
    .sort((a, b) => compare(a.item, b.item) || compare(a.province, b.province) || compare(a.district, b.district) || compare(a.facility, b.facility) || compare(a.programme, b.programme));
}

export function summariseStockCommodities(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const group = groups.get(row.item) || { name: row.item, records: 0, units: new Set(), programmes: new Set(), provinces: new Set(), zeroQuantity: 0 };
    group.records++;
    group.units.add(unitKey(row)); group.programmes.add(row.programme); group.provinces.add(row.province);
    if (row.quantity === 0) group.zeroQuantity++;
    groups.set(row.item, group);
  });
  return [...groups.values()].map(group => ({ name: group.name, records: group.records, reportingUnits: group.units.size, programmes: [...group.programmes].sort().join('; '), provinces: group.provinces.size, zeroQuantity: group.zeroQuantity }));
}

function csvCell(value) {
  // Keep workbook labels from becoming formulas when the CSV opens in Excel.
  const text = typeof value === 'string' && /^[\s]*[=+\-@]/.test(value) ? "'" + value : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export function stockStatusCsv(rows, { view, period, band }) {
  const label = nationalStockBands.find(row => row.id === band)?.label || band;
  const header = ['Reporting date', 'Reporting week', 'Submitted MOS band'];
  const data = view === 'commodities'
    ? [header.concat(['Commodity', 'Programmes', 'Submitted records', 'Reporting units', 'Provinces', 'Explicit zero SOH records']),
      ...summariseStockCommodities(rows).map(row => [period.reportDate, period.label, label, row.name, row.programmes, row.records, row.reportingUnits, row.provinces, row.zeroQuantity])]
    : [header.concat(['Province', 'District', 'Reporting unit', 'Facility level', 'Commodity', 'Programme', 'SOH', 'AMC', 'Submitted MOS']),
      ...rows.map(row => [period.reportDate, period.label, label, row.province, row.district, row.facility, row.facilityLevel, row.item, row.programme, row.quantity, row.amc, row.mos])];
  return '\uFEFF' + data.map(row => row.map(csvCell).join(',')).join('\r\n');
}
