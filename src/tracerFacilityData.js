import { tracerBootstrapPeriod } from "./tracerBootstrap.js";

export const availableTracerYears = ["2024", "2025", "2026"];
export const availableTracerMonths = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
export let tracerReportingPeriods = [tracerBootstrapPeriod];

const loadedSets = new Set();
const loadingSets = new Map();
const dataPaths = {
  live: ["/data/tracer/2026/sep.json"],
  "2026-01-02": ["/data/tracer/2026/jan-feb.json"],
  "2026-03-04": ["/data/tracer/2026/mar-apr.json"],
  "2026-05-06": ["/data/tracer/2026/may-jun.json"],
  "2026-07-08": ["/data/tracer/2026/jul-aug.json"],
  2025: ["/data/tracer/2025.json"],
  2024: ["/data/tracer/2024.json"],
};

function mergePeriods(periods) {
  const unique = new Map(tracerReportingPeriods.map((period) => [period.id, period]));
  periods.forEach((period) => unique.set(period.id, period));
  tracerReportingPeriods = [...unique.values()].sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  return tracerReportingPeriods;
}

async function readDataset(path) {
  if (typeof window === "undefined") {
    const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
    return JSON.parse(await readFile(new URL(`../public${path}`, import.meta.url), "utf8"));
  }
  const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`);
  if (!response.ok) throw new Error(`Unable to load tracer dataset: ${path}`);
  return response.json();
}

async function loadSet(key) {
  if (loadedSets.has(key)) return tracerReportingPeriods;
  if (loadingSets.has(key)) return loadingSets.get(key);
  const promise = Promise.all((dataPaths[key] || []).map(readDataset))
    .then((datasets) => {
      datasets.forEach((dataset) => mergePeriods(dataset.tracerReportingPeriods || []));
      loadedSets.add(key);
      loadingSets.delete(key);
      return tracerReportingPeriods;
    })
    .catch((error) => {
      loadingSets.delete(key);
      throw error;
    });
  loadingSets.set(key, promise);
  return promise;
}

export function loadLiveTracerData() {
  return loadSet("live");
}

export async function loadTracerMonth(month) {
  if (!/^2026-\d{2}$/.test(month)) return loadHistoricalTracerYear(month.slice(0, 4));
  if (month === "2026-09") return loadLiveTracerData();
  const key = month <= "2026-02" ? "2026-01-02"
    : month <= "2026-04" ? "2026-03-04"
      : month <= "2026-06" ? "2026-05-06"
        : "2026-07-08";
  return loadSet(key);
}

export async function loadHistoricalTracerYear(year) {
  if (!availableTracerYears.includes(year)) throw new Error(`No tracer data is available for ${year}.`);
  if (year === "2026") {
    await loadLiveTracerData();
    for (const key of ["2026-01-02", "2026-03-04", "2026-05-06", "2026-07-08"]) await loadSet(key);
    return tracerReportingPeriods;
  }
  return loadSet(year);
}

export const tracerFacilityData = tracerBootstrapPeriod;
