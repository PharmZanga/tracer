import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityDataJul.js";

test("August Week 4 preserves the verified Chilenje Normal Saline submission", () => {
  const period = tracerReportingPeriods.find((entry) => entry.id === "2026-08-30");
  assert.ok(period, "Week 4 - 30 August 2026 should be available");

  const { dictionaries, rows } = period.commodityFacilityData;
  const record = rows.find((row) => (
    dictionaries.provinces[row[0]] === "LUSAKA PROVINCE"
    && dictionaries.districts[row[1]] === "LUSAKA"
    && dictionaries.facilities[row[3]] === "CHILENJE HOSPITAL"
    && dictionaries.items[row[4]] === "Sodium Chloride (Normal Saline) 500ml 0.09% (1)"
  ));

  assert.ok(record, "Chilenje Normal Saline record should exist");
  assert.equal(record[6], 1122);
  assert.equal(record[7], 1500);
  assert.equal(record[8], 1);
  assert.ok(record[6] / record[7] < 1, "Calculated MOS should remain under one month");
});
