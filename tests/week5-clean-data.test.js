import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { primaryCareDistrictRows, primaryCareDistrictSummary } from "../src/reportingQuality.js";

const week5 = tracerReportingPeriods.find((period) => period.id === "2026-08-02");

test("2 August is July Week 5 and is the latest tracer period", () => {
  assert.ok(week5);
  assert.equal(tracerReportingPeriods.at(-1).id, "2026-08-02");
  assert.equal(week5.label, "Week 5 - 2 August 2026");
  assert.equal(week5.month, "2026-07");
  assert.equal(week5.week, "Week 5");
  assert.equal(week5.source, "TRACER SUMMARY 02 AUAGUST 2026.xlsx");
  assert.equal(week5.counts.rows, 24348);
  assert.equal(week5.counts.facilityUnits, 410);
});

test("Week 5 DHO compliance requires both Health Centre and Health Post", () => {
  const summary = primaryCareDistrictSummary(week5);
  assert.equal(summary.expected, 116);
  assert.equal(summary.reported, 114);
  assert.equal(summary.missing, 2);
  assert.equal(summary.partial, 1);

  const missing = primaryCareDistrictRows(week5).filter((row) => !row.submitted);
  assert.deepEqual(missing.map((row) => row.name).sort(), ["LAVUSHIMANDA", "NALOLO"]);

  const lavushimanda = missing.find((row) => row.name === "LAVUSHIMANDA");
  assert.equal(lavushimanda.healthCentreReported, false);
  assert.equal(lavushimanda.healthPostReported, false);

  const nalolo = missing.find((row) => row.name === "NALOLO");
  assert.equal(nalolo.healthCentreReported, false);
  assert.equal(nalolo.healthPostReported, true);
  assert.equal(nalolo.partial, true);
});

test("Week 5 uses programme-approved Power BI presentation values", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /"2026-08-02"/);
  assert.match(appSource, /primary: \{ mos: 3\.5, availability: 0\.93/);
  assert.match(appSource, /level1: \{ mos: 3\.2, availability: 0\.81/);
  assert.match(appSource, /level2: \{ mos: 2\.8, availability: 0\.78/);
  assert.match(appSource, /level3: \{ mos: 2\.2, availability: 0\.74/);
  assert.match(appSource, /"NORTH-WESTERN PROVINCE": \{ mos: 4\.3, availability: 0\.88/);
  assert.match(appSource, /"WESTERN PROVINCE": \{ mos: 2\.7, availability: 0\.85/);
  assert.match(appSource, /setQualityRangeEnd\] = useState\(tracerReportingPeriods\.at\(-1\)\?\.month/);
});
