const percent = value => Number.isFinite(value)
  ? `${(value * 100).toLocaleString('en', {maximumFractionDigits: 1})}%` : 'Not reported';
const number = value => value.toLocaleString('en');

export function summariseLeadershipCommodities(rows) {
  const groups = new Map();
  let zeroQuantity = 0;
  for (const row of rows) {
    if (row.quantity === 0) zeroQuantity++;
    if (!row.item) continue;
    const group = groups.get(row.item) || {name: row.item, records: 0, available: 0, zeroQuantity: 0};
    group.records++;
    group.available += Number(Number.isFinite(row.quantity) && row.quantity > 0);
    group.zeroQuantity += Number(row.quantity === 0);
    groups.set(row.item, group);
  }
  return {records: rows.length, zeroQuantity,
    commodities: [...groups.values()].sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)).slice(0, 3)};
}

export function buildLeadershipHighlights(rollup, detail) {
  if (!rollup?.rows) return [];
  const total = rollup.rows;
  const bands = [
    ['stockout', 'Zero / near-zero MOS', rollup.stockout, 'At or below 0.1 MOS', 'red'],
    ['nearCritical', 'Emergency stock', rollup.nearCritical, 'Above 0.1 and below 1 MOS', 'amber'],
    ['understocked', 'Understocked', rollup.understocked, '1 to below 2 MOS', 'amber'],
    ['accordingToPlan', 'Stocked to plan', rollup.accordingToPlan, '2 to 4 MOS', 'green'],
    ['overstock', 'Overstocked', (rollup.abovePlan || 0) + (rollup.overstock || 0), 'Above 4 MOS', 'blue'],
    ['dataGap', 'MOS not reported', rollup.dataGap, 'Missing MOS is not zero stock', 'neutral'],
  ];
  return [
    {id: 'availability', label: 'Drug availability', value: percent(rollup.availability),
      detail: `${number(total)} submitted records`, tone: 'green'},
    ...bands.map(([id, label, count, definition, tone]) => ({id, label, value: percent((count || 0) / total),
      detail: `${number(count || 0)} records`, title: `${definition}; ${number(count || 0)} of ${number(total)} submitted records`, tone})),
    ...(detail.records ? [{id: 'zero-soh', label: 'Explicit zero stock', value: number(detail.zeroQuantity),
      detail: `Of ${number(detail.records)} detailed records`, title: 'Submitted SOH equals zero; not a count of missing reports or units of medicine', tone: 'red'}] : []),
    ...detail.commodities.map(row => ({id: `commodity:${row.name}`, label: row.name,
      value: `${percent(row.available / row.records)} availability`,
      detail: `${number(row.records)} records / ${number(row.zeroQuantity)} zero SOH`,
      title: `${row.name}: one of the most-reported commodities in this filter. ${number(row.available)} of ${number(row.records)} records have positive SOH; ${number(row.zeroQuantity)} have zero SOH.`,
      tone: 'teal'})),
  ];
}
