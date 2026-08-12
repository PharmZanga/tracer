import assert from "node:assert/strict";
import test from "node:test";

import { canonicalCommodityName, commodityRiskTone, commodityTrendDirection, findLongestZeroAvailabilityRun, isCommodityName, SODIUM_CHLORIDE_500ML } from "../src/commodityNormalization.js";
import { tracerReportingPeriods } from "../src/tracerFacilityData.js";

test("500 ml sodium chloride spelling variants resolve to one commodity", () => {
  const variants = [
    "Sodium Chloride (Normal Saline) 500ml 0.09% (1)",
    "Sodium Chloride (Normal Saline) 500ml 0.9% (1)",
    "Sodium Chloride 0.9% solution, 500ml (1)",
  ];

  assert.deepEqual(new Set(variants.map(canonicalCommodityName)), new Set([SODIUM_CHLORIDE_500ML]));
  assert.equal(canonicalCommodityName("Sodium Chloride 0.9% solution, 1000ml (1)"), "Sodium Chloride 0.9% solution, 1000ml (1)");
});

test("canonical 500 ml sodium chloride has historical weekly observations", () => {
  const matchingPeriods = tracerReportingPeriods.filter((period) => {
    const items = period.commodityFacilityData?.dictionaries?.items || [];
    return items.some((item) => canonicalCommodityName(item) === SODIUM_CHLORIDE_500ML);
  });

  assert.ok(matchingPeriods.length >= 12, `expected at least 12 historical periods, found ${matchingPeriods.length}`);
});

test("prolonged zero-availability alerts require submitted observations", () => {
  const run = findLongestZeroAvailabilityRun([
    { label: "Week 1", rows: 10, availability: 0 },
    { label: "Week 2", rows: 12, availability: 0 },
    { label: "Week 3", rows: 0, availability: 0 },
    { label: "Week 4", rows: 14, availability: 0 },
    { label: "Week 5", rows: 15, availability: 0 },
    { label: "Week 6", rows: 16, availability: 0 },
    { label: "Week 7", rows: 17, availability: 0 },
  ]);

  assert.deepEqual(run, { weeks: 4, startLabel: "Week 4", endLabel: "Week 7" });
});

test("commodity triage tone and trend thresholds are stable", () => {
  assert.equal(commodityRiskTone(0.2), "red");
  assert.equal(commodityRiskTone(0.05), "amber");
  assert.equal(commodityRiskTone(0.049), "green");
  assert.equal(commodityTrendDirection(0.02), "up");
  assert.equal(commodityTrendDirection(-0.02), "down");
  assert.equal(commodityTrendDirection(0.005), "steady");
  assert.equal(commodityTrendDirection(null), "unavailable");
  assert.equal(isCommodityName("PERCENTAGE AVAILABILITY"), false);
  assert.equal(isCommodityName("AVERAGE MONTH OF STOCK"), false);
  assert.equal(isCommodityName("#REF!"), false);
  assert.equal(isCommodityName("9"), false);
  assert.equal(isCommodityName(SODIUM_CHLORIDE_500ML), true);
});
