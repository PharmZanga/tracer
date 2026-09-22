import { tracerBootstrapPeriod } from "./tracerBootstrap.js";

export const availableTracerYears = ["2024", "2025", "2026"];
export let tracerReportingPeriods = [tracerBootstrapPeriod];

const loadedSets = new Set();
const loadingSets = new Map();
const dataPaths = {
  live: ["/data/tracer/2026/sep.json"],
  2026: ["/data/tracer/2026/jan-feb.json", "/data/tracer/2026/mar-apr.json", "/data/tracer/2026/may-jun.json", "/data/tracer/2026/jul-aug.json"],
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

export async function loadHistoricalTracerYear(year) {
  if (!availableTracerYears.includes(year)) throw new Error(`No tracer data is available for ${year}.`);
  if (year === "2026") await loadLiveTracerData();
  return loadSet(year);
}

export const tracerFacilityData = tracerBootstrapPeriod;
