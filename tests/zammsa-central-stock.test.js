import test from "node:test";
import assert from "node:assert/strict";

import { latestZammsaCentralReport } from "../src/zammsaCentralStockData.js";

test("15 August ZAMMSA central report is complete and keeps MOS gaps distinct from zero", () => {
  const report = latestZammsaCentralReport;
  assert.equal(report.date, "2026-08-15");
  assert.equal(report.rows.length, 689);
  assert.equal(new Set(report.rows.map((row) => row.code)).size, 689);
  assert.equal(report.summary.mosDataGaps, report.rows.filter((row) => row.mos === null).length);
  assert.equal(report.summary.confirmedStockouts, report.rows.filter((row) => row.stockOnHand === 0 && row.mos === 0).length);
  assert.ok(report.rows.some((row) => row.mos === 0 && row.stockOnHand > 0));
});
