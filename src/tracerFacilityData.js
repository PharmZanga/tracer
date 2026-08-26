import { tracerReportingPeriods as tracerFacilityDataJanFeb } from "./tracerFacilityDataJanFeb.js";
import { tracerReportingPeriods as tracerFacilityDataMarApr } from "./tracerFacilityDataMarApr.js";
import { tracerReportingPeriods as tracerFacilityDataMayJun } from "./tracerFacilityDataMayJun.js";
import { tracerReportingPeriods as tracerFacilityDataJul } from "./tracerFacilityDataJul.js";

export const availableTracerYears = ["2024", "2025", "2026"];

export let tracerReportingPeriods = [
  ...tracerFacilityDataJanFeb,
  ...tracerFacilityDataMarApr,
  ...tracerFacilityDataMayJun,
  ...tracerFacilityDataJul,
].sort((left, right) => left.reportDate.localeCompare(right.reportDate));

const loadedHistoricalYears = new Set();

export async function loadHistoricalTracerYear(year) {
  if (year === "2026" || loadedHistoricalYears.has(year)) return tracerReportingPeriods;
  if (!availableTracerYears.includes(year)) throw new Error(`No tracer data is available for ${year}.`);

  const module = await import(/* @vite-ignore */ `/historical/tracerFacilityData${year}.js`);
  tracerReportingPeriods = [...tracerReportingPeriods, ...module.tracerReportingPeriods]
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  loadedHistoricalYears.add(year);
  return tracerReportingPeriods;
}

export const tracerFacilityData = tracerReportingPeriods.at(-1);
