export const reportedAvailabilityBasis = 'submitted-report-average';
export const availabilityMethodology = 'Availability uses the original SOH-based rollups: positive-stock tracer records divided by the corresponding tracer records, combined using record-count weights. HC/HP templates contain 70 tracer lines; other care levels retain their own templates. Entered workbook footer percentages do not replace this calculation. District HC/HP rows can contain combined facility stock, so their availability is not an estimate of the percentage of individual facilities with stock. Non-reporting is measured separately.';

export function availabilityForRows(rows) {
  let total = 0, count = 0;
  for (const row of rows) {
    if (Number.isFinite(row.availability) && row.rows > 0) {
      total += row.availability * row.rows;
      count += row.rows;
    }
  }
  return {availability: count ? total / count : null};
}

export function withSubmittedAvailability(period) {
  if (!period?.id?.startsWith('2026-') || !Array.isArray(period.facilities)) return period;
  const facilities = period.facilities;
  // Retain district/facility identities for filtering without replacing stock-based rates.
  const programmeScopes = facilities.map(row => ({...row, facility: row.name,
    name: row.facilityLevel === 'CANCER DISEASES HOSPITAL' ? 'CANCER' : row.facilityLevel}));
  // ART remains a separate subset for programme filtering.
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
    programmeScopes.push({...group, availability: group.positive / group.rows,
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
  return {...period, programmeScopes, programmes};
}
