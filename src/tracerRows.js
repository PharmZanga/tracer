import { canonicalCommodityName, isCommodityName } from './commodityNormalization.js';

const decodedPeriods = new Map();
const emptyRows = Object.freeze([]);
const cacheLimit = 12;

export function decodeCommodityRows(data) {
  if (!data?.dictionaries || !data?.rows) return emptyRows;
  const { provinces = [], districts = [], levels = [], facilities = [], items = [], programmes = [] } = data.dictionaries;
  const names = items.map(canonicalCommodityName);
  const accepted = names.map(isCommodityName);
  return data.rows.filter((row) => accepted[row[4]]).map(([province, district, level, facility, item, programme, quantity, amc, mos]) => ({
    province: provinces[province], district: districts[district], facilityLevel: levels[level],
    facility: facilities[facility], item: names[item], programme: programmes[programme],
    quantity: quantity === null || quantity === undefined || quantity === '' ? null : Number(quantity),
    amc: amc === null || amc === undefined || amc === '' ? null : Number(amc),
    mos: mos === null || mos === undefined || mos === '' || !Number.isFinite(Number(mos)) ? null : Number(mos),
  }));
}

export function commodityRowsFromPeriod(period) {
  const data = period?.commodityFacilityData;
  if (!data?.dictionaries || !data?.rows) return emptyRows;
  const cached = decodedPeriods.get(data);
  if (cached) {
    decodedPeriods.delete(data);
    decodedPeriods.set(data, cached);
    return cached;
  }
  const rows = decodeCommodityRows(data);
  // Bound retained decoded history while reusing the selected period on clicks.
  decodedPeriods.set(data, rows);
  if (decodedPeriods.size > cacheLimit) decodedPeriods.delete(decodedPeriods.keys().next().value);
  return rows;
}
