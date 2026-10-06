import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { availableTracerMonths, loadTracerMonth, tracerReportingPeriods } from "../src/tracerFacilityData.js";

test("comparison month catalogue includes unloaded January through September", () => {
  assert.equal(availableTracerMonths.length, 9);
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const comparisonMonths = .*availableTracerMonths/);
  assert.match(source, /await loadTracerMonth\(month\)/);
  assert.match(source, /new Set\(\[comparisonBaselineStart, comparisonRangeStart\]\)/);
});

test("selected August and September months load independently and retain both periods", async () => {
  await loadTracerMonth("2026-08");
  await loadTracerMonth("2026-09");
  for (const month of ["2026-08", "2026-09"]) {
    const periods = tracerReportingPeriods.filter((period) => period.month === month);
    assert.ok(periods.length > 1);
    assert.ok(periods.every((period) => period.commodityFacilityData.rows.length > 0));
  }
});
