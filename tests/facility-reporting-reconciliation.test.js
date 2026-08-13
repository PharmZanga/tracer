import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { facilityReportingKey, reconciledExpectedFacilityRows } from "../src/reportingQuality.js";

test("every reporting week deduplicates expected facilities and honours actual tracer submissions", () => {
  tracerReportingPeriods.forEach((period) => {
    const reconciled = reconciledExpectedFacilityRows(period);
    const keys = reconciled.map(facilityReportingKey);
    const submittedKeys = new Set((period.facilities || []).map(facilityReportingKey));

    assert.equal(new Set(keys).size, keys.length, `${period.label} contains duplicate reconciled reporting units`);
    reconciled.forEach((facility) => {
      if (submittedKeys.has(facilityReportingKey(facility))) {
        assert.equal(facility.reported, true, `${period.label}: submitted tracer remained classified as missing for ${facility.name}`);
      }
    });
  });
});

test("Week 4 reconciles 28 raw missing rows to 17 unique facilities without a tracer", () => {
  const week4 = tracerReportingPeriods.find((period) => period.id === "2026-07-26");
  const rawMissing = week4.dataQuality.facilities.filter((facility) => !facility.reported);
  const reconciledMissing = reconciledExpectedFacilityRows(week4).filter((facility) => !facility.reported);

  assert.equal(rawMissing.length, 28);
  assert.equal(reconciledMissing.length, 17);
});

test("Week 5 reconciles facility reporting across the same shared rule", () => {
  const week5 = tracerReportingPeriods.find((period) => period.id === "2026-08-02");
  const reconciled = reconciledExpectedFacilityRows(week5);

  assert.equal(reconciled.filter((facility) => !facility.reported).length, 19);
  assert.equal(new Set(reconciled.map(facilityReportingKey)).size, reconciled.length);
});
