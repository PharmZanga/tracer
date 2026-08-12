import test from "node:test";
import assert from "node:assert/strict";
import { tracerReportingPeriods } from "../src/tracerFacilityData.js";

test("Data Quality retains the complete Muchinga district universe", () => {
  const period = tracerReportingPeriods[0];
  const districts = [...new Set((period.dataQuality?.districts || [])
    .filter((row) => row.province === "MUCHINGA PROVINCE")
    .map((row) => row.name))].sort();

  assert.deepEqual(districts, [
    "CHAMA",
    "CHINSALI",
    "ISOKA",
    "KANCHIBIYA",
    "LAVUSHIMANDA",
    "MAFINGA",
    "MPIKA",
    "NAKONDE",
    "SHIWANG'ANDU",
  ]);
});

test("Data Quality reporting units include Level 2 hospitals", () => {
  const levels = new Set((tracerReportingPeriods[0].dataQuality?.facilityTypes || []).map((row) => row.type));
  assert.equal(levels.has("Level 2 Hospitals"), true);
});
