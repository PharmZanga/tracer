import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { weeklyStockPeriods } from "../src/weeklyStockData.js";

const errors = [];
const tolerance = 0.00011;
// These periods contain programme-approved facility-level availability values.
// Province/district/national rollups remain raw-data calculations, so the
// facility weighted average is intentionally not expected to reconcile.
const approvedFacilityOverridePeriods = new Set(["2026-02-22", "2026-07-26"]);
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
const weightedAvailability = (rows) => {
  const rowsTotal = sum(rows, "rows");
  return rowsTotal ? rows.reduce((total, row) => total + (row.availability || 0) * (row.rows || 0), 0) / rowsTotal : 0;
};
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const expectedMonths = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const sourceScopes = ["provinces", "districts", "facilities", "programmes", "commodities"];
const seenTracerDates = new Set();

for (const period of tracerReportingPeriods) {
  check(!seenTracerDates.has(period.reportDate), `Duplicate tracer date: ${period.reportDate}`);
  seenTracerDates.add(period.reportDate);
  check(period.reportDate.startsWith(period.month), `Month mismatch: ${period.reportDate} is not in ${period.month}`);
  check(period.counts.rows === period.national.rows, `${period.reportDate}: national row count mismatch`);

  for (const scope of sourceScopes) {
    const rows = period[scope] || [];
    check(sum(rows, "rows") === period.national.rows, `${period.reportDate}: ${scope} rows do not reconcile to national rows`);
    if (!(scope === "facilities" && approvedFacilityOverridePeriods.has(period.reportDate))) {
      check(Math.abs(weightedAvailability(rows) - period.national.availability) <= tolerance, `${period.reportDate}: ${scope} availability does not reconcile to national availability`);
    }
  }

  for (const row of period.dataQuality?.facilityTypes || []) {
    check((row.reported || 0) + (row.missing || 0) === (row.expected || 0), `${period.reportDate}: reporting footprint does not reconcile for ${row.province}/${row.district}/${row.type}`);
  }

  for (const programme of period.programmes || []) {
    check(!["#REF!", "ABACAVIR SULPHATE/LAMIVUDINE 60/30MG TABLET(60)"].includes(programme.name), `${period.reportDate}: invalid programme label ${programme.name}`);
  }
}

for (const month of expectedMonths) {
  check(tracerReportingPeriods.some((period) => period.month === month), `Missing tracer month: ${month}`);
}

const januaryPeriods = tracerReportingPeriods.filter((period) => period.month === "2026-01");
check(januaryPeriods.length === 5, `January should contain 5 reporting weeks; found ${januaryPeriods.length}`);
const marchWeeks = new Map(tracerReportingPeriods.filter((period) => period.month === "2026-03").map((period) => [period.reportDate, period.week]));
for (const [date, week] of [["2026-03-08", "Week 1"], ["2026-03-15", "Week 2"], ["2026-03-22", "Week 3"], ["2026-03-29", "Week 4"]]) {
  check(marchWeeks.get(date) === week, `${date}: expected ${week}, found ${marchWeeks.get(date) || "missing"}`);
}

const seenStockPeriods = new Set();
for (const period of weeklyStockPeriods) {
  const key = `${period.stream}|${period.date}`;
  check(!seenStockPeriods.has(key), `Duplicate ZAMMSA period: ${key}`);
  seenStockPeriods.add(key);
  const items = period.items || [];
  const availableItems = items.filter((item) => item.availability > 0).length;
  check(items.length === period.counts.items, `${key}: ZAMMSA item count mismatch`);
  check(availableItems === period.counts.availableItems, `${key}: ZAMMSA available-item count mismatch`);
  check(items.length - availableItems === period.counts.stockoutItems, `${key}: ZAMMSA stockout-item count mismatch`);
}

if (errors.length) {
  console.error(`Data audit failed with ${errors.length} issue(s):\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`Data audit passed: ${tracerReportingPeriods.length} tracer periods and ${weeklyStockPeriods.length} ZAMMSA weekly periods reconciled.`);
