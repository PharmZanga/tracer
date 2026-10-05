import assert from "node:assert/strict";
import test from "node:test";

import { loadHistoricalTracerYear, tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { facilityNameMatchesDifferentDistrict, reportingFacilityType, sourceSupportedHospitalFacility } from "../src/dataQualityEvidence.js";
import { primaryCareDistrictRows, primaryCareDistrictSummary, primaryCareLevelReported } from "../src/reportingQuality.js";

await loadHistoricalTracerYear("2026");

const districtNames = [...new Set(tracerReportingPeriods.flatMap((period) => (period.dataQuality?.districts || []).map((row) => row.name)))];

test("January through September has one complete 116-district reporting universe every week", () => {
  assert.equal(tracerReportingPeriods.length, 40);
  assert.equal(tracerReportingPeriods[0].id, "2026-01-04");
  assert.equal(tracerReportingPeriods.at(-1).id, "2026-10-04");

  tracerReportingPeriods.forEach((period) => {
    const rows = primaryCareDistrictRows(period);
    const identities = rows.map((row) => `${row.province}|${row.name}`);
    const summary = primaryCareDistrictSummary(period);

    assert.equal(rows.length, 116, `${period.label}: district directory changed`);
    assert.equal(new Set(identities).size, rows.length, `${period.label}: duplicate district in reporting universe`);
    assert.equal(summary.expected, 116, `${period.label}: invalid expected district total`);
    assert.equal(summary.reported + summary.missing, summary.expected, `${period.label}: reporting total does not reconcile`);
  });
});

test("September Week 2 is a complete national submission before dashboard publication", () => {
  const weekTwo = tracerReportingPeriods.find((period) => period.id === "2026-09-13");
  const summary = primaryCareDistrictSummary(weekTwo);

  assert.ok(weekTwo);
  assert.equal(weekTwo.label, "Week 2 - 13 September 2026");
  assert.equal(weekTwo.counts.provinces, 10);
  assert.equal(weekTwo.counts.rows, 24516);
  assert.equal(weekTwo.counts.facilityUnits, 401);
  assert.equal(weekTwo.dataQuality.districts.length, 116);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 116);
  assert.equal(summary.missing, 0);
});

test("September Week 3 is a complete national submission before dashboard publication", () => {
  const weekThree = tracerReportingPeriods.find((period) => period.id === "2026-09-20");
  const summary = primaryCareDistrictSummary(weekThree);

  assert.ok(weekThree);
  assert.equal(weekThree.label, "Week 3 - 20 September 2026");
  assert.equal(weekThree.counts.provinces, 10);
  assert.equal(weekThree.counts.rows, 24368);
  assert.equal(weekThree.counts.facilityUnits, 398);
  assert.equal(weekThree.dataQuality.districts.length, 116);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 115);
  assert.equal(summary.missing, 1);
});

test("September Week 4 is a complete national submission before dashboard publication", () => {
  const weekFour = tracerReportingPeriods.find((period) => period.id === "2026-09-27");
  const summary = primaryCareDistrictSummary(weekFour);

  assert.ok(weekFour);
  assert.equal(weekFour.label, "Week 4 - 27 September 2026");
  assert.equal(weekFour.counts.provinces, 10);
  assert.equal(weekFour.counts.rows, 24285);
  assert.equal(weekFour.counts.facilityUnits, 396);
  assert.equal(weekFour.dataQuality.districts.length, 116);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 114);
  assert.equal(summary.missing, 2);
});

test("September Week 5 is a complete national submission before dashboard publication", () => {
  const weekFive = tracerReportingPeriods.find((period) => period.id === "2026-10-04");
  const summary = primaryCareDistrictSummary(weekFive);

  assert.ok(weekFive);
  assert.equal(weekFive.label, "Week 5 - 4 October 2026");
  assert.equal(weekFive.month, "2026-09");
  assert.equal(weekFive.counts.rows, 23969);
  assert.equal(weekFive.counts.provinces, 10);
  assert.equal(weekFive.counts.facilityUnits, 393);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 112);
  assert.equal(summary.missing, 4);
});

test("all primary-care submissions have the same effective level result used by Data Quality", () => {
  tracerReportingPeriods.forEach((period) => {
    primaryCareDistrictRows(period).forEach((district) => {
      assert.equal(
        primaryCareLevelReported(district, "HEALTH CENTRE"),
        Boolean(district.healthCentreSubmissionReceived),
        `${period.label}: ${district.name} Health Centre result is inconsistent`,
      );
      assert.equal(
        primaryCareLevelReported(district, "HEALTH POST"),
        Boolean(district.healthPostSubmissionReceived),
        `${period.label}: ${district.name} Health Post result is inconsistent`,
      );
      if (district.combinedPrimaryCareReported) {
        assert.equal(district.healthCentreSubmissionReceived, true, `${period.label}: combined Health Centre evidence lost for ${district.name}`);
        assert.equal(district.healthPostSubmissionReceived, true, `${period.label}: combined Health Post evidence lost for ${district.name}`);
      }
    });
  });
});

test("hospital history accepts submitted facilities unless their name identifies another district", () => {
  let supportedHospitalRows = 0;

  tracerReportingPeriods.forEach((period) => {
    (period.facilities || []).forEach((facility) => {
      const type = reportingFacilityType(facility.facilityLevel);
      if (["Health Centres", "Health Posts", "Health Centres and Posts (combined)"].includes(type)) return;

      const conflictingDistrict = facilityNameMatchesDifferentDistrict(facility, districtNames);
      assert.equal(
        sourceSupportedHospitalFacility(facility, districtNames),
        !conflictingDistrict,
        `${period.label}: hospital evidence rule is inconsistent for ${facility.name}`,
      );
      if (!conflictingDistrict) supportedHospitalRows += 1;
    });
  });

  assert.ok(supportedHospitalRows > 0, "no submitted hospital evidence was retained");
});
