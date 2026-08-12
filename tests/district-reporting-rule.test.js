import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { primaryCareDistrictRows, primaryCareDistrictSummary } from "../src/reportingQuality.js";

const week4 = tracerReportingPeriods.find((period) => period.id === "2026-07-26");

test("district requires both Health Centre and Health Post reports", () => {
  const summary = primaryCareDistrictSummary(week4);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 111);
  assert.equal(summary.partial, 3);
  assert.equal(summary.hospitalOnly, 1);
});

test("Level 1 hospital does not make Nakonde a reported DHO district", () => {
  const nakonde = primaryCareDistrictRows(week4).find((row) => row.name === "NAKONDE");
  assert.equal(nakonde.submitted, false);
  assert.equal(nakonde.hospitalOnly, true);
  assert.equal(nakonde.healthCentreReported, false);
  assert.equal(nakonde.healthPostReported, false);
});

test("partial primary-care submissions fail the district rule", () => {
  const partial = primaryCareDistrictRows(week4).filter((row) => row.partial).map((row) => row.name).sort();
  assert.deepEqual(partial, ["CHAVUMA", "CHEMBE", "NALOLO"]);
});

test("combined primary-care sheets qualify when the source does not split levels", () => {
  const marchWeek2 = tracerReportingPeriods.find((period) => period.id === "2026-03-08");
  const summary = primaryCareDistrictSummary(marchWeek2);
  assert.equal(summary.reported, 116);
  assert.ok(summary.rows.every((row) => row.combinedPrimaryCareReported));
});
