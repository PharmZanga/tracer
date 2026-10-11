import assert from "node:assert/strict";
import test from "node:test";
import { loadHistoricalTracerYear, tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { vaccineStockData } from "../src/vaccineData.js";
import { buildVaccineReportingUnits, cleanVaccineReportingRows } from "../src/vaccineReportingUnits.js";

await loadHistoricalTracerYear("2026");

const officialDistricts = tracerReportingPeriods.at(-1).dataQuality.districts;
const { provinces, districts, vaccines } = vaccineStockData.dictionaries;
test('September vaccine source preserves observed values and missing Muchinga submissions',()=>{
  const period=vaccineStockData.periods.find(p=>p.id==='2026-09');
  assert.equal(period.sourceSheet,'SEPTEMBER 2026');
  assert.equal(period.rows.length,1133);
  const chadiza=period.rows.find(r=>districts[r[1]]==='Chadiza'&&vaccines[r[2]]==='BCG');
  assert.equal(chadiza[3],1220);assert.equal(chadiza[4],1520);
  for(const district of ['Lavushimanda','Isoka','Mpika']) assert.ok(!period.rows.some(r=>provinces[r[0]]==='Muchinga'&&districts[r[1]]===district));
  assert.equal(period.rows.reduce((sum,r)=>sum+(r[3]||0),0),4178213);
});
const rawRows = vaccineStockData.periods.flatMap((period) => period.rows.map(([province, district, vaccine, stock, amc, mos, expiryDate, vvmStage]) => ({
  province: provinces[province], district: districts[district], vaccine: vaccines[vaccine], stock, amc, mos, expiryDate, vvmStage,
})));

test("vaccine reporting universe contains exactly 116 districts and 10 provincial offices", () => {
  const units = buildVaccineReportingUnits(officialDistricts);
  assert.equal(units.filter((unit) => unit.unitType === "district").length, 116);
  assert.equal(units.filter((unit) => unit.unitType === "provincial_office").length, 10);
  assert.equal(units.length, 126);
});

test("vaccine data retains only official districts and PHO submissions", () => {
  const units = buildVaccineReportingUnits(officialDistricts);
  const cleanedRows = cleanVaccineReportingRows(rawRows, units);
  const officialKeys = new Set(units.map((unit) => unit.key));
  assert.ok(cleanedRows.length < rawRows.length);
  assert.ok(cleanedRows.every((row) => officialKeys.has(row.reportingUnitKey)));
  assert.ok(!cleanedRows.some((row) => row.district === "NVS"));
  assert.ok(cleanedRows.some((row) => row.district === "Lusaka PHO"));
});
