import assert from "node:assert/strict";
import test from "node:test";

import { reportingFacilityType, sourceSupportedHospitalFacility } from "../src/dataQualityEvidence.js";

test("only source-supported hospitals establish Data Quality reporting obligations", () => {
  const kafueGeneral = {
    district: "KAFUE",
    name: "Kafue General Hospital",
    facilityLevel: "LEVEL 2/GENERAL HOSPITAL",
  };
  const misplacedLuampaHospital = {
    district: "KAFUE",
    name: "Luampa Mission Hospital",
    facilityLevel: "LEVEL 1 HOSPITAL",
  };

  assert.equal(reportingFacilityType(kafueGeneral.facilityLevel), "Level 2 Hospitals");
  assert.equal(sourceSupportedHospitalFacility(kafueGeneral, ["KAFUE", "LUAMPA"]), true);
  assert.equal(sourceSupportedHospitalFacility(misplacedLuampaHospital, ["KAFUE", "LUAMPA"]), false);
});

test("primary-care sheets do not become extra hospital reporting obligations", () => {
  assert.equal(sourceSupportedHospitalFacility({
    district: "KAFUE",
    name: "HC/HP",
    facilityLevel: "PRIMARY CARE - NOT SPECIFIED",
  }), false);
});
