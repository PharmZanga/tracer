import test from "node:test";
import assert from "node:assert/strict";

import { latestZammsaCentralReport } from "../src/zammsaCentralStockData.js";

test("31 August ZAMMSA central report is complete and keeps MOS gaps distinct from zero", () => {
  const report = latestZammsaCentralReport;
  assert.equal(report.date, "2026-08-31");
  assert.equal(report.rows.length, 660);
  assert.equal(new Set(report.rows.map((row) => row.code)).size, 660);
  assert.equal(report.summary.mosDataGaps, report.rows.filter((row) => row.mos === null).length);
  assert.equal(report.summary.confirmedStockouts, report.rows.filter((row) => row.stockOnHand === 0 && row.mos === 0).length);
  assert.ok(report.rows.some((row) => row.mos === 0 && row.stockOnHand > 0));
  const sourceAnomaly = report.rows.find((row) => row.code === "LAB2274");
  assert.equal(sourceAnomaly.stockOnHand, null);
  assert.match(sourceAnomaly.comment, /LAB2275.*treated as missing/);
});
