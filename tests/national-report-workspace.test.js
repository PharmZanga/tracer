import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("national weekly report workspace is available from the sidebar and uses its selected period", () => {
  assert.match(appSource, /id: "reports", short: "RP", label: "Generate Report"/);
  assert.match(appSource, /id: "administration", label: "Administration", (?:icon: \w+, )?pages: \["reports", "imports", "viewers"\]/);
  assert.match(appSource, /function NationalWeeklyReport/);
  assert.match(appSource, /nationalReportPeriodId/);
  assert.match(appSource, /buildNationalReportSummary\(selectReportPeriods/);
  assert.match(appSource, /Download PDF/);
  assert.match(appSource, /Download Word \(\.docx\)/);
  const narrativeSource = fs.readFileSync(new URL('../src/reportNarrative.js', import.meta.url), 'utf8');
  assert.match(narrativeSource, /\(DHO\) reporting completeness stood at/);
  assert.match(appSource, /missing reports are not treated as stock data/);
});

test("report template supports independently selected sections and Ministry-only branding", () => {
  assert.match(appSource, /Report sections/);
  assert.match(appSource, /type="checkbox" checked=\{includedSections.includes\(id\)\}/);
  for (const id of ["overview","care","provinces","programmes","zammsa","reporting","stock","commodities","actions","sources"]) {
    assert.ok(appSource.includes(`sectionProps("${id}")`));
  }
  assert.match(appSource, /selectedReportSections\(includedSections\)/);
  assert.match(appSource, /selectedSections.map\(\(\[id,label\]\)/);
  assert.match(appSource, /activePage !== "reports" && <div className="national-brand control-tower-brand"/);
  assert.match(appSource, /ReportAvailabilityChart weekly=\{summary.weekly\}/);
  assert.match(appSource, /ReportPerformanceBars rows=\{provinces\}/);
  assert.match(appSource, /ReportPerformanceBars rows=\{programmes\}/);
  assert.match(appSource, /ReportCareChart rows=\{levelRows\}/);
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /\.national-weekly-report \[hidden\] \{ display: none !important/);
  assert.match(css, /body:has\(\.page-reports\) \.national-header \{ display: none !important/);
  assert.match(css, /\.national-report-tools \{ display: grid; grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.national-report-tools \.national-report-section-picker \{ flex-basis: auto/);
});
