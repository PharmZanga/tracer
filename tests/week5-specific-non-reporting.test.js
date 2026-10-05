import assert from "node:assert/strict";
import test from "node:test";

import { facilityReportingRows, primaryCareDistrictRows, primaryCareLevelReported } from "../src/reportingQuality.js";
import { loadHistoricalTracerYear, tracerReportingPeriods } from "../src/tracerFacilityData.js";

await loadHistoricalTracerYear("2026");

const weekFive = tracerReportingPeriods.find((period) => period.id === "2026-10-04");

test("Week 5 retains the confirmed Muchinga Health Post non-submissions", () => {
  for (const district of ["CHINSALI", "LAVUSHIMANDA", "MPIKA", "SHIWANG'ANDU"]) {
    const row = primaryCareDistrictRows(weekFive).find((candidate) => candidate.province === "MUCHINGA PROVINCE" && candidate.name === district);
    assert.ok(row, `${district} is present in the reporting district directory`);
    assert.equal(primaryCareLevelReported(row, "HEALTH POST"), false, `${district} Health Post is not reported`);
  }
});

test("Week 5 does not use Levy Mwanawasa renal or TB data as a Level 3 submission", () => {
  const levy = facilityReportingRows(weekFive).find((facility) => facility.province === "LUSAKA PROVINCE"
    && facility.district === "LUSAKA"
    && facility.facilityLevel === "LEVEL 3 HOSPITAL"
    && /levy mwanawasa/i.test(facility.name));

  assert.ok(levy, "Levy Mwanawasa Level 3 is expected");
  assert.equal(levy.reported, false);
});
