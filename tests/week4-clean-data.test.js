import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityDataJul.js";

const week4 = tracerReportingPeriods.find((period) => period.id === "2026-07-26");

test("July Week 4 uses the 28 July summary report source", () => {
  assert.ok(week4);
  assert.equal(week4.source, "28.07.26 summary reports.xlsx");
  assert.equal(week4.counts.rows, 24481);
  // Raw submission footprint remains 115 districts because Nakonde submitted
  // hospital data. DHO compliance is tested separately using the primary-care
  // rule and is 111/116 for this week.
  assert.equal(week4.districts.length, 115);
  assert.equal(week4.national.availability, 0.8767);
});

test("confirmed Muchinga primary-care non-submissions are not stock records", () => {
  const districts = new Set(["LAVUSHIMANDA", "NAKONDE"]);
  const primaryLevels = new Set(["HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"]);
  const invalidFacilities = week4.facilities.filter((row) => (
    row.province === "MUCHINGA PROVINCE"
    && districts.has(row.district)
    && primaryLevels.has(row.facilityLevel)
  ));
  assert.deepEqual(invalidFacilities, []);

  for (const district of districts) {
    const qualityRows = week4.dataQuality.facilityTypes.filter((row) => (
      row.province === "MUCHINGA PROVINCE"
      && row.district === district
      && ["Health Centres", "Health Posts"].includes(row.type)
    ));
    assert.equal(qualityRows.length, 2);
    assert.ok(qualityRows.every((row) => row.reported === 0 && row.missing === 1));
  }
});

test("Nakonde retains its submitted Level 1 hospital data", () => {
  const nakondeFacilities = week4.facilities.filter((row) => (
    row.province === "MUCHINGA PROVINCE" && row.district === "NAKONDE"
  ));
  assert.ok(nakondeFacilities.some((row) => row.facilityLevel === "LEVEL 1 HOSPITAL" && row.rows > 0));
});
