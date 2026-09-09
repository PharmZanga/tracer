import fs from "node:fs";
import path from "node:path";
import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { weeklyStockPeriods } from "../src/weeklyStockData.js";
import { zammsaCentralReports } from "../src/zammsaCentralStockData.js";

const reportDates = ["2026-08-09", "2026-08-16"];
const fields = [
  "name", "rows", "availability", "mos", "stockout", "nearCritical", "understocked",
  "accordingToPlan", "abovePlan", "overstock", "dataGap", "quantity", "amc", "riskRows", "stockoutRate",
];
const compactMetric = (item) => Object.fromEntries(fields.map((field) => [field, item?.[field] ?? 0]));
const compactQuality = (quality = {}) => ({
  provinces: quality.provinces ?? [],
  districts: quality.districts ?? [],
  facilityTypes: quality.facilityTypes ?? [],
});

const periods = tracerReportingPeriods
  .filter((period) => reportDates.includes(period.reportDate))
  .map((period) => ({
    id: period.id,
    reportDate: period.reportDate,
    label: period.label,
    source: period.source,
    counts: period.counts,
    national: compactMetric(period.national),
    provinces: (period.provinces ?? []).map(compactMetric),
    facilityLevels: (period.facilityLevels ?? []).map(compactMetric),
    programmes: (period.programmes ?? []).map(compactMetric),
    missingDistricts: period.missingDistricts ?? [],
    dataQuality: compactQuality(period.dataQuality),
  }));

if (periods.length !== 2) throw new Error("Could not find both August reporting periods.");

const output = path.resolve("tmp", "august-weeks-1-2-report-data.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
const weeklyStock = weeklyStockPeriods
  .filter((period) => ["2026-08-07", "2026-08-14"].includes(period.date))
  .map((period) => ({
    date: period.date,
    label: period.label,
    stream: period.stream,
    source: period.source,
    overallAvailability: period.overallAvailability,
    counts: period.counts,
    categories: period.categories ?? [],
    items: period.items ?? [],
  }));
const centralReport = zammsaCentralReports.find((report) => report.date === "2026-08-15") ?? null;
fs.writeFileSync(output, JSON.stringify({ periods, weeklyStock, centralReport }, null, 2));
console.log(output);
