import fs from "node:fs/promises";
import path from "node:path";

import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { weeklyStockPeriods } from "../src/weeklyStockData.js";
import { primaryCareDistrictRows } from "../src/reportingQuality.js";

const outPath = process.argv[2] || path.resolve("tmp", "national-tracer-report-data.json");

const currentDates = new Set(["2026-07-26", "2026-08-02"]);
const previousDates = new Set(["2026-07-06", "2026-07-12", "2026-07-19"]);
const current = tracerReportingPeriods.filter((period) => currentDates.has(period.reportDate));
const previous = tracerReportingPeriods.filter((period) => previousDates.has(period.reportDate));

if (current.length !== 2) throw new Error(`Expected 2 current periods, found ${current.length}`);
if (previous.length !== 3) throw new Error(`Expected 3 previous periods, found ${previous.length}`);

const countFields = [
  "stockout",
  "nearCritical",
  "understocked",
  "accordingToPlan",
  "abovePlan",
  "overstock",
  "dataGap",
  "quantity",
  "amc",
  "riskRows",
];

function weightedRollup(rows, name) {
  const totalRows = rows.reduce((sum, row) => sum + Number(row?.rows || 0), 0);
  const output = {
    name,
    rows: totalRows,
    availability: totalRows
      ? rows.reduce((sum, row) => sum + Number(row?.availability || 0) * Number(row?.rows || 0), 0) / totalRows
      : null,
    mos: totalRows
      ? rows.reduce((sum, row) => sum + Number(row?.mos || 0) * Number(row?.rows || 0), 0) / totalRows
      : null,
  };
  for (const field of countFields) {
    output[field] = rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0);
  }
  output.stockoutRate = totalRows ? output.stockout / totalRows : null;
  return output;
}

function aggregateNamed(periods, field) {
  const names = new Set(periods.flatMap((period) => (period[field] || []).map((row) => row.name)));
  return [...names]
    .map((name) => weightedRollup(
      periods.flatMap((period) => (period[field] || []).filter((row) => row.name === name)),
      name,
    ))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rollupLevel(periods, outputName, acceptedNames) {
  const accepted = new Set(acceptedNames);
  const rows = periods.flatMap((period) => (period.facilityLevels || []).filter((row) => accepted.has(row.name)));
  return weightedRollup(rows, outputName);
}

function combineAnalysis(periods) {
  const national = weightedRollup(periods.map((period) => period.national), "Zambia");
  const provinces = aggregateNamed(periods, "provinces");
  const programmes = aggregateNamed(periods, "programmes");
  const levels = [
    rollupLevel(periods, "Health Centre / Health Post", ["HEALTH CENTRE", "HEALTH POST"]),
    rollupLevel(periods, "Level 1 Hospital", ["LEVEL 1 HOSPITAL"]),
    rollupLevel(periods, "Level 2 Hospital", ["LEVEL 2/GENERAL HOSPITAL"]),
    rollupLevel(periods, "Level 3 Hospital", ["LEVEL 3 HOSPITAL"]),
  ];
  return { national, provinces, programmes, levels };
}

function imbalanceRows(analysis) {
  return [...analysis.provinces, analysis.national].map((row) => ({
    name: row.name === "Zambia" ? "National" : row.name.replace(" PROVINCE", ""),
    rows: row.rows,
    accordingToPlan: row.rows ? row.accordingToPlan / row.rows : null,
    emergency: row.rows ? row.nearCritical / row.rows : null,
    excessStock: row.rows ? row.overstock / row.rows : null,
    overstocked: row.rows ? row.abovePlan / row.rows : null,
    understocked: row.rows ? row.understocked / row.rows : null,
    stockedOut: row.rows ? row.stockout / row.rows : null,
    counts: {
      accordingToPlan: row.accordingToPlan,
      emergency: row.nearCritical,
      excessStock: row.overstock,
      overstocked: row.abovePlan,
      understocked: row.understocked,
      stockedOut: row.stockout,
    },
  }));
}

function decodeRaw(period) {
  const { dictionaries, rows } = period.commodityFacilityData;
  return rows.map((row, index) => {
    const [provinceIndex, districtIndex, levelIndex, facilityIndex, itemIndex, programmeIndex, quantity, amc, mos] = row;
    const numericQuantity = Number(quantity);
    const numericAmc = Number(amc);
    const numericMos = Number(mos);
    let stockStatus = "Data gap";
    if (Number.isFinite(numericMos)) {
      if (numericMos === 0) stockStatus = "Stocked Out";
      else if (numericMos <= 0.5) stockStatus = "Emergency";
      else if (numericMos < 2) stockStatus = "Understocked";
      else if (numericMos <= 4) stockStatus = "According to Plan";
      else if (numericMos < 12) stockStatus = "Overstocked";
      else stockStatus = "Excess Stock";
    }
    return {
      reportingPeriod: period.label,
      reportDate: period.reportDate,
      observationId: `${period.id}-${index + 1}`,
      province: dictionaries.provinces[provinceIndex],
      district: dictionaries.districts[districtIndex],
      facilityLevel: dictionaries.levels[levelIndex],
      facility: dictionaries.facilities[facilityIndex],
      commodity: dictionaries.items[itemIndex],
      programme: dictionaries.programmes[programmeIndex],
      quantity: Number.isFinite(numericQuantity) ? numericQuantity : null,
      amc: Number.isFinite(numericAmc) ? numericAmc : null,
      mos: Number.isFinite(numericMos) ? numericMos : null,
      stockStatus,
      available: Number.isFinite(numericQuantity) ? numericQuantity > 0 : null,
    };
  });
}

function reportingRows(period) {
  return primaryCareDistrictRows(period).map((row) => ({
    reportingPeriod: period.label,
    reportDate: period.reportDate,
    province: row.province,
    district: row.name,
    healthCentreReported: row.healthCentreReported,
    healthPostReported: row.healthPostReported,
    combinedPrimaryCareReported: row.combinedPrimaryCareReported,
    hospitalOrOtherReported: row.hospitalOrOtherReported,
    complete: row.submitted,
    partial: row.partial,
    hospitalOnly: row.hospitalOnly,
    detailStatus: row.detailStatus,
    persistentGap: false,
  }));
}

const currentAnalysis = combineAnalysis(current);
const previousAnalysis = combineAnalysis(previous);
const reporting = current.flatMap(reportingRows);
const incompleteByDistrict = new Map();
for (const row of reporting.filter((item) => !item.complete)) {
  const key = `${row.province}|${row.district}`;
  incompleteByDistrict.set(key, (incompleteByDistrict.get(key) || 0) + 1);
}
for (const row of reporting) {
  row.persistentGap = !row.complete && incompleteByDistrict.get(`${row.province}|${row.district}`) > 1;
}

const reportingSummary = current.map((period) => {
  const rows = primaryCareDistrictRows(period);
  const complete = rows.filter((row) => row.submitted).length;
  return {
    reportingPeriod: period.label,
    reportDate: period.reportDate,
    expectedDistricts: rows.length,
    completeDistricts: complete,
    completeness: rows.length ? complete / rows.length : null,
    partialDistricts: rows.filter((row) => row.partial).length,
    hospitalOnlyDistricts: rows.filter((row) => row.hospitalOnly).length,
    incompleteDistricts: rows.length - complete,
  };
});

const centralPeriods = weeklyStockPeriods.filter((period) => period.date === "2026-07-31");
const centralItems = centralPeriods.flatMap((period) => period.items.map((item) => ({
  reportDate: period.date,
  stream: period.stream,
  category: item.category,
  commodity: item.name,
  availability: item.availability,
  status: item.status,
})));
const centralCategories = centralPeriods.flatMap((period) => period.categories.map((category) => ({
  reportDate: period.date,
  stream: period.stream,
  category: category.name,
  availability: category.availability,
})));
const centralTotals = centralPeriods.reduce((acc, period) => {
  acc.items += period.counts.items;
  acc.availableItems += period.counts.availableItems;
  acc.stockoutItems += period.counts.stockoutItems;
  return acc;
}, { items: 0, availableItems: 0, stockoutItems: 0 });
centralTotals.availability = centralTotals.items ? centralTotals.availableItems / centralTotals.items : null;

const output = {
  generatedAt: new Date().toISOString(),
  report: {
    title: "National Weekly Tracer Commodity Availability Report",
    startDate: "2026-07-20",
    endDate: "2026-08-02",
    periodLabel: "20 July - 2 August 2026",
    periodSlug: "20_July_to_2_August_2026",
    preparedBy: "Zanga Musakuzi",
    preparedByTitle: "Principal Pharmacist - Data Analytics",
  },
  currentPeriods: current.map((period) => ({
    id: period.id,
    label: period.label,
    reportDate: period.reportDate,
    source: period.source,
    counts: period.counts,
    national: period.national,
  })),
  previousPeriods: previous.map((period) => ({
    id: period.id,
    label: period.label,
    reportDate: period.reportDate,
    source: period.source,
    counts: period.counts,
    national: period.national,
  })),
  current: {
    ...currentAnalysis,
    imbalances: imbalanceRows(currentAnalysis),
  },
  previous: {
    ...previousAnalysis,
    imbalances: imbalanceRows(previousAnalysis),
  },
  reportingSummary,
  reportingRows: reporting,
  rawData: current.flatMap(decodeRaw),
  zammsa: {
    reportDate: "2026-07-31",
    totals: centralTotals,
    streams: centralPeriods.map((period) => ({
      stream: period.stream,
      label: period.label,
      overallAvailability: period.overallAvailability,
      counts: period.counts,
    })),
    categories: centralCategories,
    items: centralItems,
  },
  qa: {
    provinceCount: currentAnalysis.provinces.length,
    expectedProvinceCount: 10,
    expectedDistricts: reportingSummary.map((row) => row.expectedDistricts),
    rawObservationCount: current.flatMap((period) => period.commodityFacilityData.rows).length,
    rawObservationExpected: currentAnalysis.national.rows,
    currentStockStatusSum: currentAnalysis.national.stockout
      + currentAnalysis.national.nearCritical
      + currentAnalysis.national.understocked
      + currentAnalysis.national.accordingToPlan
      + currentAnalysis.national.abovePlan
      + currentAnalysis.national.overstock
      + currentAnalysis.national.dataGap,
    availabilityMethodNote: "Submitted tracer availability is retained from the source roll-up. Stock status is independently classified from MOS and is not forced to reconcile to availability.",
  },
};

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(output));
console.log(JSON.stringify({
  output: outPath,
  rows: output.rawData.length,
  nationalAvailability: output.current.national.availability,
  nationalMos: output.current.national.mos,
  reporting: output.reportingSummary,
  central: output.zammsa.totals,
}, null, 2));
