import test from "node:test";
import assert from "node:assert/strict";

import { latestZammsaCentralReport } from "../src/zammsaCentralStockData.js";

test("15 September ZAMMSA central report is complete and keeps MOS gaps distinct from zero", () => {
  const report = latestZammsaCentralReport;
  assert.equal(report.date, "2026-09-15");
  assert.equal(report.rows.length, 635);
  assert.equal(new Set(report.rows.map((row) => row.code)).size, 635);
  assert.equal(report.summary.belowTwoMos, 136);
  assert.equal(report.summary.mosDataGaps, report.rows.filter((row) => row.mos === null).length);
  assert.equal(report.summary.confirmedStockouts, report.rows.filter((row) => row.stockOnHand === 0 && row.mos === 0).length);
  assert.ok(report.rows.some((row) => row.mos === 0 && row.stockOnHand > 0));
  assert.ok(report.rows.every((row) => row.stockOnHand !== null));
  assert.deepEqual(
    report.rows.find((row) => row.code === "EM1322"),
    {
      code: "EM1322",
      item: "Caffeine Citrate 10mg/ml, 1ml Amp (10)",
      category: "Other Essential Medicines",
      ami: 1038,
      stockOnHand: 22,
      mos: 0,
      comment: "",
      reportDate: "2026-09-15",
      reportLabel: "15 September 2026",
    },
  );
});
