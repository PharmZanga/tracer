import assert from "node:assert/strict";
import test from "node:test";

import { loadHistoricalTracerYear, tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { facilityReportingKey, facilityReportingRows, primaryCareDistrictRows, primaryCareDistrictSummary, reconciledExpectedFacilityRows } from "../src/reportingQuality.js";

await loadHistoricalTracerYear("2026");

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

test("Week 4 reconciles the expected-facility roster without duplicate reporting units", () => {
  const week4 = tracerReportingPeriods.find((period) => period.id === "2026-07-26");
  const rawMissing = week4.dataQuality.facilities.filter((facility) => !facility.reported);
  const reconciledMissing = reconciledExpectedFacilityRows(week4).filter((facility) => !facility.reported);

  assert.ok(rawMissing.length >= reconciledMissing.length);
  assert.equal(new Set(reconciledMissing.map(facilityReportingKey)).size, reconciledMissing.length);
});

test("Week 5 reconciles facility reporting across the same shared rule", () => {
  const week5 = tracerReportingPeriods.find((period) => period.id === "2026-08-02");
  const reconciled = reconciledExpectedFacilityRows(week5);

  assert.ok(reconciled.filter((facility) => !facility.reported).length > 0);
  assert.equal(new Set(reconciled.map(facilityReportingKey)).size, reconciled.length);
});

test("August Week 4 records confirmed facility non-submissions without treating them as stock data", () => {
  const week4 = tracerReportingPeriods.find((period) => period.id === "2026-08-30");
  const districtSummary = primaryCareDistrictSummary(week4);

  assert.ok(week4);
  assert.equal(week4.label, "Week 4 - 30 August 2026");
  assert.equal(week4.source, "30.08.2026Tracer summary report.xlsx");
  assert.equal(districtSummary.expected, 116);
  assert.equal(districtSummary.reported, 114);
  assert.equal(districtSummary.missing, 2);

  const rufunsa = primaryCareDistrictRows(week4).find((row) => row.province === "LUSAKA PROVINCE" && row.name === "RUFUNSA");
  assert.ok(rufunsa);
  assert.equal(rufunsa.healthCentreReported, false);
  assert.equal(rufunsa.healthPostReported, false);
  assert.equal(rufunsa.partial, false);

  const nalolo = primaryCareDistrictRows(week4).find((row) => row.province === "WESTERN PROVINCE" && row.name === "NALOLO");
  assert.ok(nalolo);
  assert.equal(nalolo.healthCentreReported, false);
  assert.equal(nalolo.healthPostReported, true);
  assert.equal(nalolo.partial, true);
});

test("the complete facility mapping reconciles every loaded reporting week", () => {
  assert.equal(tracerReportingPeriods.length, 40);

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

test("all-week facility totals reconcile after excluding template-only blocks", () => {
  tracerReportingPeriods.forEach((period) => {
    const rows = facilityReportingRows(period);
    const actual = [rows.length, rows.filter((row) => row.reported).length, rows.filter((row) => !row.reported).length];
    assert.equal(actual[1] + actual[2], actual[0], `${period.label}: reporting totals do not reconcile`);
  });
});
