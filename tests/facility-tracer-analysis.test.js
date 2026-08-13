import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyseFacilityTracer, analyseTracerCommodity, facilityTracerExportRows } from "../src/facilityTracerAnalysis.js";

test("positive quantity is never a confirmed stock-out", () => {
  assert.equal(analyseTracerCommodity({ item: "A", quantity: 205, amc: 200, mos: 0 }).status, "Low stock");
  assert.equal(analyseTracerCommodity({ item: "B", quantity: 1, amc: 120, mos: null }).status, "Critical low stock");
});

test("only numeric zero quantity is a confirmed stock-out", () => {
  assert.equal(analyseTracerCommodity({ item: "A", quantity: 0, amc: 20, mos: null }).status, "Confirmed stock-out");
  assert.equal(analyseTracerCommodity({ item: "B", quantity: null, amc: 20, mos: 0 }).status, "Data-quality exception");
});

test("blank MOS is recalculated separately when quantity and AMC are valid", () => {
  const item = analyseTracerCommodity({ item: "A", quantity: 205, amc: 200, mos: null });
  assert.equal(item.submittedMos, null);
  assert.equal(item.calculatedMos, 1.025);
  assert.ok(item.flags.includes("MOS recalculated"));
});

test("facility summary reconciles with commodity rows", () => {
  const result = analyseFacilityTracer([
    { item: "A", quantity: 0, amc: 10, mos: 0 },
    { item: "B", quantity: 1, amc: 10, mos: null },
    { item: "C", quantity: 10, amc: 10, mos: 1 },
    { item: "D", quantity: 30, amc: 10, mos: 3 },
    { item: "E", quantity: 50, amc: 10, mos: 5 },
    { item: "F", quantity: null, amc: 10, mos: null },
  ]);
  assert.equal(result.total, 6);
  assert.equal(result.available, 4);
  assert.equal(Object.values(result.byStatus).reduce((sum, rows) => sum + rows.length, 0), 6);
  assert.equal(result.byStatus["Confirmed stock-out"].length, 1);
  assert.equal(result.byStatus["Critical low stock"].length, 1);
  assert.equal(result.dataQualityItems.length, 2);
});

test("existing facility workflow exposes reporting states, filters and complete export fields", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /Open submitted tracer/);
  assert.match(appSource, /No tracer submitted/);
  assert.match(appSource, /Facility did not report for the selected week/);
  assert.match(appSource, /Submitted tracer availability/);
  assert.match(appSource, /Search commodity/);
  assert.match(appSource, /All programmes/);
  assert.match(appSource, /facilityTracerExportRows/);
  assert.match(appSource, /Open redistribution tracker/);
});

test("facility export uses the same analysed rows and includes all management fields", () => {
  const analysis = analyseFacilityTracer([{ item: "Example", program: "TEST", quantity: 1, amc: 120, mos: null }]);
  const rows = facilityTracerExportRows({ reportLabel: "Week 5", province: "LUSAKA", district: "LUSAKA", facilityLevel: "LEVEL 1", facilityName: "MATERO", submittedAvailability: "80%", availabilityNumerator: 40, availabilityDenominator: 50, analysis, items: analysis.items });
  assert.deepEqual(rows.find((row) => row[0] === "Submitted tracer availability"), ["Submitted tracer availability", "80%"]);
  assert.deepEqual(rows.find((row) => row[0] === "Availability numerator"), ["Availability numerator", 40]);
  assert.ok(rows.some((row) => row.includes("Platform-calculated MOS")));
  const itemRow = rows.at(-1);
  assert.equal(itemRow[0], "Critical low stock");
  assert.equal(itemRow[3], 1);
  assert.equal(itemRow[6], "0.008");
  assert.match(itemRow[8], /MOS recalculated/);
  assert.match(itemRow[9], /Monitor closely/);
});
