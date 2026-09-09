import fs from "node:fs/promises";

import { tracerReportingPeriods as mayJunPeriods } from "../src/tracerFacilityDataMayJun.js";
import { tracerReportingPeriods as julOnwardPeriods } from "../src/tracerFacilityDataJul.js";

const PERIOD_START = "2026-06-01";
const PERIOD_END = "2026-08-31";
const periods = [...new Map([...mayJunPeriods, ...julOnwardPeriods]
  .filter((period) => period.id >= PERIOD_START && period.id <= PERIOD_END)
  .map((period) => [period.id, period])).values()]
  .sort((a, b) => a.id.localeCompare(b.id));

const value = (dictionary, index) => dictionary?.[index] ?? "";
const number = (value) => Number(value);
const normalise = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const monthly = new Map();
const exceptions = [];

function bucketFor(month) {
  if (!monthly.has(month)) {
    monthly.set(month, {
      month,
      periods: 0,
      rows: 0,
      provinces: new Set(),
      districts: new Set(),
      facilities: new Set(),
      duplicateRows: 0,
      missingIdentity: 0,
      negativeNumbers: 0,
      positiveQuantityWithoutAmc: 0,
      missingSubmittedMos: 0,
      materialMosDifferences: 0,
      cappedMos: 0,
      declaredRowMismatches: 0,
    });
  }
  return monthly.get(month);
}

const periodResults = periods.map((period) => {
  const { dictionaries, rows } = period.commodityFacilityData;
  const summary = bucketFor(period.month);
  const seen = new Set();
  const metrics = {
    id: period.id,
    label: period.label,
    month: period.month,
    rows: rows.length,
    provinces: new Set(),
    districts: new Set(),
    facilities: new Set(),
    duplicates: 0,
    missingIdentity: 0,
    negativeNumbers: 0,
    positiveQuantityWithoutAmc: 0,
    missingSubmittedMos: 0,
    materialMosDifferences: 0,
    cappedMos: 0,
    declaredRows: period.counts?.rows ?? null,
    declaredRowMatch: period.counts?.rows === undefined || period.counts.rows === rows.length,
    nationalMos: period.national?.mos ?? null,
    calculatedNationalMos: null,
  };
  let totalQuantity = 0;
  let totalAmc = 0;

  rows.forEach((row) => {
    const province = value(dictionaries.provinces, row[0]);
    const district = value(dictionaries.districts, row[1]);
    const level = value(dictionaries.levels, row[2]);
    const facility = value(dictionaries.facilities, row[3]);
    const item = value(dictionaries.items, row[4]);
    const programme = value(dictionaries.programmes, row[5]);
    const quantity = number(row[6]);
    const amc = number(row[7]);
    const submittedMos = row[8] === null || row[8] === undefined || row[8] === "" ? null : number(row[8]);
    const key = [province, district, level, facility, item, programme].map(normalise).join("|");
    const identity = { province, district, level, facility, item, programme };

    metrics.provinces.add(normalise(province));
    metrics.districts.add(`${normalise(province)}|${normalise(district)}`);
    metrics.facilities.add(`${normalise(province)}|${normalise(district)}|${normalise(facility)}`);
    summary.provinces.add(normalise(province));
    summary.districts.add(`${normalise(province)}|${normalise(district)}`);
    summary.facilities.add(`${normalise(province)}|${normalise(district)}|${normalise(facility)}`);

    if (seen.has(key)) {
      metrics.duplicates += 1;
      summary.duplicateRows += 1;
      exceptions.push({ period: period.id, severity: "high", type: "Duplicate facility-item-programme row", ...identity });
    }
    seen.add(key);
    if ([province, district, level, facility, item, programme].some((entry) => !String(entry || "").trim())) {
      metrics.missingIdentity += 1;
      summary.missingIdentity += 1;
      exceptions.push({ period: period.id, severity: "high", type: "Missing identity field", ...identity });
    }
    if ([quantity, amc, submittedMos].filter((entry) => entry !== null).some((entry) => !Number.isFinite(entry) || entry < 0)) {
      metrics.negativeNumbers += 1;
      summary.negativeNumbers += 1;
      exceptions.push({ period: period.id, severity: "high", type: "Invalid numeric value", quantity, amc, submittedMos, ...identity });
    }
    if (quantity > 0 && !(amc > 0)) {
      metrics.positiveQuantityWithoutAmc += 1;
      summary.positiveQuantityWithoutAmc += 1;
      exceptions.push({ period: period.id, severity: "medium", type: "Positive SOH without AMC", quantity, amc, submittedMos, ...identity });
    }
    if (amc > 0 && submittedMos === null) {
      metrics.missingSubmittedMos += 1;
      summary.missingSubmittedMos += 1;
    }
    if (quantity >= 0 && amc > 0 && submittedMos !== null && Number.isFinite(submittedMos)) {
      const calculatedMos = quantity / amc;
      const difference = Math.abs(calculatedMos - submittedMos);
      if (submittedMos >= 12 && calculatedMos > 12) {
        metrics.cappedMos += 1;
        summary.cappedMos += 1;
      } else if (difference > 0.51) {
        metrics.materialMosDifferences += 1;
        summary.materialMosDifferences += 1;
        exceptions.push({
          period: period.id,
          severity: difference > 2 ? "high" : "medium",
          type: "Submitted versus calculated MOS difference",
          quantity,
          amc,
          submittedMos,
          calculatedMos: Math.round(calculatedMos * 100) / 100,
          difference: Math.round(difference * 100) / 100,
          ...identity,
        });
      }
    }
    if (Number.isFinite(quantity)) totalQuantity += quantity;
    if (Number.isFinite(amc)) totalAmc += amc;
  });

  metrics.calculatedNationalMos = totalAmc > 0 ? Math.round((totalQuantity / totalAmc) * 100) / 100 : null;
  if (!metrics.declaredRowMatch) summary.declaredRowMismatches += 1;
  summary.periods += 1;
  summary.rows += rows.length;
  return {
    ...metrics,
    provinces: metrics.provinces.size,
    districts: metrics.districts.size,
    facilities: metrics.facilities.size,
  };
});

const monthResults = [...monthly.values()].map((entry) => ({
  ...entry,
  provinces: entry.provinces.size,
  districts: entry.districts.size,
  facilities: entry.facilities.size,
}));

const audit = {
  reviewedAt: new Date().toISOString(),
  scope: "Dashboard commodity-facility records for June through August 2026",
  periods: periodResults,
  months: monthResults,
  exceptions: exceptions.sort((a, b) => a.period.localeCompare(b.period) || b.severity.localeCompare(a.severity)),
};

await fs.mkdir("tmp", { recursive: true });
await fs.writeFile("tmp/q3-tracer-data-audit.json", JSON.stringify(audit, null, 2));
console.log(JSON.stringify({
  periods: audit.periods.map(({ provinces, districts, facilities, ...period }) => ({ ...period, provinces, districts, facilities })),
  months: audit.months.map(({ provinces, districts, facilities, ...month }) => ({ ...month, provinces, districts, facilities })),
  exceptionCount: audit.exceptions.length,
  topExceptions: audit.exceptions.slice(0, 25),
}, null, 2));
