import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("national weekly report workspace is available from the sidebar and uses its selected period", () => {
  assert.match(appSource, /id: "reports", short: "RP", label: "Generate Report"/);
  assert.match(appSource, /id: "administration", label: "Administration", pages: \["reports", "imports"\]/);
  assert.match(appSource, /function NationalWeeklyReport/);
  assert.match(appSource, /nationalReportPeriodId/);
  assert.match(appSource, /buildNationalReportSummary\(selectReportPeriods/);
  assert.match(appSource, /Generate PDF report/);
  assert.match(appSource, /DHO reporting completeness stood at/);
  assert.match(appSource, /missing reports are not treated as stock data/);
});

test("report template supports independently selected sections and Ministry-only branding", () => {
  assert.match(appSource, /Report sections/);
  assert.match(appSource, /type="checkbox" checked=\{includedSections.includes\(id\)\}/);
  for (const id of ["overview","care","provinces","programmes","zammsa","reporting","stock","commodities","actions","sources"]) {
    assert.ok(appSource.includes(`sectionProps("${id}")`));
  }
  assert.match(appSource, /sectionOptions.filter\(\(\[id\]\) => includedSections.includes\(id\)\)/);
  assert.match(appSource, /activePage !== "reports" && <div className="national-brand control-tower-brand"/);
  assert.match(appSource, /ReportAvailabilityChart weekly=\{summary.weekly\}/);
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /\.national-weekly-report \[hidden\] \{ display: none !important/);
  assert.match(css, /body:has\(\.page-reports\) \.national-header \{ display: none !important/);
});
