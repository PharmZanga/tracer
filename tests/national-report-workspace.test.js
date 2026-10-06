import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("national weekly report workspace is available from the sidebar and uses its selected period", () => {
  assert.match(appSource, /id: "reports", short: "RP", label: "Generate Report"/);
  assert.match(appSource, /id: "administration", label: "Administration", pages: \["reports", "imports"\]/);
  assert.match(appSource, /function NationalWeeklyReport/);
  assert.match(appSource, /nationalReportPeriodId/);
  assert.match(appSource, /buildNationalReportSummary\(nationalReportPeriod, nationalReportPreviousPeriod\)/);
  assert.match(appSource, /Generate PDF report/);
  assert.match(appSource, /DHO reporting completeness stood at/);
  assert.match(appSource, /missing reports are not treated as stock data/);
});
