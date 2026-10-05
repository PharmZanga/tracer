import fs from "node:fs/promises";

import { buildRedistributionCandidates } from "../src/redistribution.js";

const DATASETS = [
  "jan-feb.json",
  "mar-apr.json",
  "may-jun.json",
  "jul-aug.json",
  "sep.json",
];
const EXPECTED_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const errors = [];
const warnings = [];
const isAggregateGroup = (row) => /\s(?:Health Centre|Health Post) facilities$/i.test(String(row.facility || ""));
const numberIsValid = (value) => value === null || value === undefined || (Number.isFinite(Number(value)) && Number(value) >= 0);

function decodeRows(period) {
  const { dictionaries, rows } = period.commodityFacilityData || {};
  const dictionaryNames = ["provinces", "districts", "levels", "facilities", "items", "programmes"];
  if (!dictionaries || !Array.isArray(rows)) {
    errors.push(`${period.id}: commodity-facility data is missing`);
    return [];
  }
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 9) {
      errors.push(`${period.id}: compact row ${index + 1} has an invalid shape`);
      return null;
    }
    const values = dictionaryNames.map((name, dictionaryIndex) => dictionaries[name]?.[row[dictionaryIndex]]);
    if (values.some((value) => !String(value || "").trim())) {
      errors.push(`${period.id}: compact row ${index + 1} has an unresolved identity`);
    }
    if (![row[6], row[7], row[8]].every(numberIsValid)) {
      warnings.push(`${period.id}: compact row ${index + 1} is a source-data exception with an invalid SOH, AMC, or MOS value`);
    }
    return {
      province: values[0], district: values[1], facilityLevel: values[2], facility: values[3],
      item: values[4], programme: values[5], quantity: row[6], amc: row[7], mos: row[8],
    };
  }).filter(Boolean);
}

const periodMap = new Map();
for (const datasetName of DATASETS) {
  const path = new URL(`../public/data/tracer/2026/${datasetName}`, import.meta.url);
  const dataset = JSON.parse(await fs.readFile(path, "utf8"));
  for (const period of dataset.tracerReportingPeriods || []) {
    if (periodMap.has(period.id)) errors.push(`${period.id}: appears in more than one published dataset`);
    periodMap.set(period.id, period);
  }
}

const periods = [...periodMap.values()].sort((left, right) => left.id.localeCompare(right.id));
if (periods.length !== 40) errors.push(`Expected 40 January-September periods, found ${periods.length}`);

const report = { reviewedAt: new Date().toISOString(), periods: [], errors, warnings };
for (const period of periods) {
  if (!EXPECTED_MONTHS.includes(period.month)) errors.push(`${period.id}: outside the January-September 2026 audit scope`);
  if (period.id !== period.reportDate) errors.push(`${period.id}: period ID and report date differ`);
  if (period.counts?.provinces !== 10) warnings.push(`${period.id}: source submission includes ${period.counts?.provinces} provinces, not the full 10-province footprint`);
  if (period.dataQuality?.districts?.length !== 116) errors.push(`${period.id}: expected 116 district quality rows, found ${period.dataQuality?.districts?.length}`);

  const rows = decodeRows(period);
  if (rows.length !== period.counts?.rows) errors.push(`${period.id}: compact row count ${rows.length} differs from declared ${period.counts?.rows}`);

  const seen = new Set();
  let duplicateRows = 0;
  for (const row of rows) {
    const identity = [row.province, row.district, row.facilityLevel, row.facility, row.item, row.programme].join("|").toUpperCase();
    if (seen.has(identity)) duplicateRows += 1;
    seen.add(identity);
  }
  if (duplicateRows) warnings.push(`${period.id}: ${duplicateRows} repeated source row(s) retained for traceability and collapsed only for operational recommendations`);

  const recommendations = buildRedistributionCandidates(rows);
  const aggregateActions = recommendations.filter((item) => isAggregateGroup({ facility: item.sourceFacility }) || isAggregateGroup({ facility: item.destinationFacility }));
  if (aggregateActions.length) errors.push(`${period.id}: ${aggregateActions.length} redistribution action(s) use district aggregate rows`);

  const qualityRows = period.dataQuality?.districts || [];
  const invalidQualityRows = qualityRows.filter((row) => Number(row.expected) !== 1 || Number(row.reported || 0) + Number(row.missing || 0) !== 1);
  if (invalidQualityRows.length) errors.push(`${period.id}: ${invalidQualityRows.length} district quality row(s) do not reconcile`);

  report.periods.push({
    id: period.id,
    label: period.label,
    source: period.source,
    rows: rows.length,
    provinces: period.counts?.provinces,
    districts: period.dataQuality?.districts?.length,
    facilityUnits: period.counts?.facilityUnits,
    duplicateSourceRows: duplicateRows,
    redistributionActions: recommendations.length,
  });
}

await fs.mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../tmp/tracer-publication-verification.json", import.meta.url), JSON.stringify(report, null, 2));

if (errors.length) {
  console.error(`Tracer publication verification failed with ${errors.length} issue(s):\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`Tracer publication verification passed: ${periods.length} periods, ${report.periods.reduce((total, period) => total + period.rows, 0).toLocaleString()} facility-commodity records, and no aggregate redistribution actions.`);
