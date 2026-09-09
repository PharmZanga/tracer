import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityDataMarApr.js";
import { primaryCareDistrictRows, primaryCareLevelReported } from "../src/reportingQuality.js";

test("Chongwe combined April Week 2 primary-care report satisfies both levels", () => {
  const period = tracerReportingPeriods.find((row) => row.id === "2026-04-12");
  const chongwe = primaryCareDistrictRows(period).find((row) => row.province === "LUSAKA PROVINCE" && row.name === "CHONGWE");

  assert.ok(chongwe);
  assert.equal(chongwe.combinedPrimaryCareReported, true);
  assert.equal(primaryCareLevelReported(chongwe, "HEALTH CENTRE"), true);
  assert.equal(primaryCareLevelReported(chongwe, "HEALTH POST"), true);
});
