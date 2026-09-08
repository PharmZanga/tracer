import { tracerReportingPeriods as tracerFacilityDataSep } from "./tracerFacilityDataSep.js";

export const availableTracerYears = ["2024", "2025", "2026"];

export let tracerReportingPeriods = [
  ...tracerFacilityDataSep,
].sort((left, right) => left.reportDate.localeCompare(right.reportDate));

const loadedHistoricalYears = new Set();

const currentYearDataModules = [
  "tracerFacilityDataJanFeb.js",
  "tracerFacilityDataMarApr.js",
  "tracerFacilityDataMayJun.js",
  "tracerFacilityDataJul.js",
];

export async function loadHistoricalTracerYear(year) {
  if (loadedHistoricalYears.has(year)) return tracerReportingPeriods;
  if (!availableTracerYears.includes(year)) throw new Error(`No tracer data is available for ${year}.`);

  const modulePaths = year === "2026"
    ? currentYearDataModules.map((fileName) => `${window.__TRACER_SECURE_DASHBOARD__ ? "/tracer-data" : "/src"}/${fileName}`)
    : [`/historical/tracerFacilityData${year}.js`];
  const modules = await Promise.all(modulePaths.map((modulePath) => import(/* @vite-ignore */ modulePath)));
  tracerReportingPeriods = [...tracerReportingPeriods, ...modules.flatMap((module) => module.tracerReportingPeriods)]
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  loadedHistoricalYears.add(year);
  return tracerReportingPeriods;
}

export const tracerFacilityData = tracerReportingPeriods.at(-1);
