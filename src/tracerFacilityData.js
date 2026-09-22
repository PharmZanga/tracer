import { tracerReportingPeriods as tracerFacilityDataSep } from "./tracerFacilityDataSep.js";

export const availableTracerYears = ["2024", "2025", "2026"];

// Keep the live reporting weeks responsive. Earlier 2026 periods are loaded on
// demand by history-heavy workspaces rather than blocking every dashboard click.
export let tracerReportingPeriods = [...tracerFacilityDataSep].sort((left, right) => left.reportDate.localeCompare(right.reportDate));

const loadedHistoricalYears = new Set();

export async function loadHistoricalTracerYear(year) {
  if (loadedHistoricalYears.has(year)) return tracerReportingPeriods;
  if (!availableTracerYears.includes(year)) throw new Error(`No tracer data is available for ${year}.`);

  const modules = year === "2026"
    ? await Promise.all([
      import("./tracerFacilityDataJanFeb.js"),
      import("./tracerFacilityDataMarApr.js"),
      import("./tracerFacilityDataMayJun.js"),
      import("./tracerFacilityDataJul.js"),
    ])
    : [await import(/* @vite-ignore */ `/historical/tracerFacilityData${year}.js`)];
  tracerReportingPeriods = [...tracerReportingPeriods, ...modules.flatMap((module) => module.tracerReportingPeriods)]
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  loadedHistoricalYears.add(year);
  return tracerReportingPeriods;
}

// Node's test suite keeps its historical reconciliation coverage. Browsers do
// not run this branch, so their initial bundle remains limited to live data.
if (typeof process !== "undefined" && process.versions?.node) {
  await loadHistoricalTracerYear("2026");
}

export const tracerFacilityData = tracerReportingPeriods.at(-1);
