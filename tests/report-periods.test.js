import assert from "node:assert/strict";
import test from "node:test";
import { reportCatalogue } from "../src/reportCatalogue.js";
import { reportOptions, selectReportPeriods, matchingStockPeriods } from "../src/reportPeriods.js";
import { loadTracerMonth, tracerReportingPeriods } from "../src/tracerFacilityData.js";

test("all January to September months and their 40 reporting weeks are selectable before loading", () => {
  const monthly = reportOptions(reportCatalogue,"monthly","2026");
  assert.equal(monthly.length,9);
  assert.equal(reportOptions(reportCatalogue,"weekly","2026").length,40);
  const sep = monthly.at(-1);
  assert.equal(sep.periods.at(-1).id,"2026-10-04");
  assert.equal(reportOptions(reportCatalogue,"quarterly","2026").length,3);
  assert.equal(reportOptions(reportCatalogue,"quarterly","2026")[2].periods.length,14);
});

test("partial quarter is labelled and historical years have independent catalogues", () => {
  const partial = reportOptions([{id:"x",month:"2026-01",reportDate:"2026-01-04",label:"week"}],"quarterly","2026")[0];
  assert.match(partial.label,/partial/);
  for (const year of ["2024","2025"]) assert.ok(reportOptions(reportCatalogue,"monthly",year).length);
});

test("August monthly report loads exactly four weeks and reconciles current observations", async () => {
  await loadTracerMonth("2026-08");
  const option = reportOptions(reportCatalogue,"monthly","2026").find(o=>o.id==="2026-08");
  const periods = selectReportPeriods(tracerReportingPeriods,option);
  assert.equal(periods.length,4);
  assert.equal(periods.reduce((sum,p)=>sum+p.national.rows,0),97394);
  assert.ok(periods.every(p=>p.id!=="2026-08-02"));
});

test("central weekly sources match the selected week and do not leak September into August", () => {
  const sources = [{date:"2026-08-07"},{date:"2026-08-14"},{date:"2026-09-15"}];
  const monthly = reportOptions(reportCatalogue,"monthly","2026").find(o=>o.id==="2026-08");
  assert.equal(matchingStockPeriods(sources,monthly,"monthly").length,2);
  const weekly = reportOptions(reportCatalogue,"weekly","2026").find(o=>o.id==="2026-08-09");
  assert.deepEqual(matchingStockPeriods(sources,weekly,"weekly"),[{date:"2026-08-07"}]);
});
