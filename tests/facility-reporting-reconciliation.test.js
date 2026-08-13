import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { facilityReportingKey, facilityReportingRows, primaryCareDistrictSummary, reconciledExpectedFacilityRows } from "../src/reportingQuality.js";

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

test("the complete facility mapping reconciles every loaded reporting week", () => {
  assert.equal(tracerReportingPeriods.length, 31);

  tracerReportingPeriods.forEach((period) => {
    const rows = facilityReportingRows(period);
    const keys = rows.map(facilityReportingKey);
    const submittedKeys = new Set((period.facilities || []).map(facilityReportingKey));
    const received = rows.filter((facility) => facility.reported);
    const missing = rows.filter((facility) => !facility.reported);
    const districtSummary = primaryCareDistrictSummary(period);

    assert.equal(new Set(keys).size, keys.length, `${period.label}: duplicate facility mapping`);
    assert.equal(received.length, submittedKeys.size, `${period.label}: received total does not match unique submitted tracers`);
    assert.equal(rows.length, received.length + missing.length, `${period.label}: expected total does not reconcile`);
    assert.equal(districtSummary.expected, 116, `${period.label}: district universe is not 116`);
    rows.forEach((facility) => {
      assert.ok(facility.province, `${period.label}: facility has no province mapping`);
      assert.ok(facility.district, `${period.label}: facility has no district mapping`);
      assert.ok(facility.facilityLevel, `${period.label}: facility has no level-of-care mapping`);
      assert.ok(facility.name || facility.facility, `${period.label}: facility has no name mapping`);
    });
  });
});

test("all-week facility totals use the same reconciled mapping", () => {
  const expectedTotals = {
    "2026-01-04": [426, 406, 20], "2026-01-11": [418, 401, 17], "2026-01-18": [434, 417, 17],
    "2026-01-25": [435, 419, 16], "2026-01-31": [427, 408, 19], "2026-02-08": [301, 283, 18],
    "2026-02-15": [302, 284, 18], "2026-02-22": [265, 243, 22], "2026-02-28": [276, 260, 16],
    "2026-03-08": [281, 265, 16], "2026-03-15": [276, 260, 16], "2026-03-22": [262, 241, 21],
    "2026-03-29": [277, 260, 17], "2026-04-05": [279, 260, 19], "2026-04-12": [1717, 1717, 0],
    "2026-04-19": [282, 266, 16], "2026-04-26": [282, 266, 16], "2026-05-03": [284, 267, 17],
    "2026-05-10": [245, 219, 26], "2026-05-17": [281, 265, 16], "2026-05-24": [282, 266, 16],
    "2026-05-31": [283, 267, 16], "2026-06-07": [283, 267, 16], "2026-06-14": [257, 237, 20],
    "2026-06-21": [281, 265, 16], "2026-06-28": [280, 263, 17], "2026-07-06": [289, 273, 16],
    "2026-07-12": [282, 266, 16], "2026-07-19": [289, 272, 17], "2026-07-26": [425, 408, 17],
    "2026-08-02": [429, 410, 19],
  };

  tracerReportingPeriods.forEach((period) => {
    const rows = facilityReportingRows(period);
    const actual = [rows.length, rows.filter((row) => row.reported).length, rows.filter((row) => !row.reported).length];
    assert.deepEqual(actual, expectedTotals[period.id], `${period.label}: expected/received/missing mapping changed`);
  });
});
