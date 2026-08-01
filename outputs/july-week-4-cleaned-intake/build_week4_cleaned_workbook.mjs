import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { tracerReportingPeriods } from "../../src/tracerFacilityData.js";

const outputDir = fileURLToPath(new URL(".", import.meta.url));
const report = tracerReportingPeriods.find((period) => period.reportDate === "2026-07-26");
if (!report) throw new Error("Week 4 - 26 July 2026 is not present in the generated tracer data.");

const workbook = Workbook.create();
const readMe = workbook.worksheets.add("Read Me");
const qa = workbook.worksheets.add("QA Summary");
const summary = workbook.worksheets.add("SUMMARY SHEET");
const { dictionaries, rows } = report.commodityFacilityData;
const [provinces, districts, levels, facilities, items, programmes] = [
  dictionaries.provinces,
  dictionaries.districts,
  dictionaries.levels,
  dictionaries.facilities,
  dictionaries.items,
  dictionaries.programmes,
];

const green = "#087E45";
const paleGreen = "#E7F5ED";
const border = "#D8E5DD";
const headers = [
  "DATE", "NATION", "PROVINCE", "DISTRICT", "FACILITY LEVEL", "FACILITY NAME",
  "PROGRAM", "DESCRIPTION OF ITEM", "UNIT", "QUANTITY", "AMC", "MOS", "AVAILABILITY",
  "IMBALANCES", "PROGRAM", "MOH LEVEL", "MAJOR CATEGORY", "FACILITY NAMES (Elmis)",
  "DESCRIPTION OF ITEM (Elmis)", "FACILY LEVEL NEW",
];

function isPrimaryLevel(level) {
  return /HEALTH POST|HEALTH CENTRE|PRIMARY CARE/.test(String(level).toUpperCase());
}

function mohLevel(level) {
  const value = String(level).toUpperCase();
  if (isPrimaryLevel(value)) return "PRIMARY";
  if (/LEVEL 3|CANCER|HEART|EYE|OPTHAMOLOGY|RENAL|MENTAL HEALTH|WOMEN AND NEWBORN/.test(value)) return "TERTIARY";
  return "SECONDARY";
}

function elmisFacilityLevel(level) {
  const value = String(level).toUpperCase();
  if (isPrimaryLevel(value)) return "Health Center/ Health Post";
  if (/LEVEL 3|CANCER|HEART|EYE|OPTHAMOLOGY|RENAL|MENTAL HEALTH|WOMEN AND NEWBORN/.test(value)) return "Level 3 Hospital";
  if (/LEVEL 2|GENERAL HOSPITAL/.test(value)) return "Level 2 Hospital";
  return "Level 1 Hospital";
}

function majorCategory(programme) {
  const value = String(programme).toUpperCase();
  if (value.includes("ART")) return "HIV";
  if (value.includes("TB")) return "TB";
  if (value.includes("MALARIA")) return "MALARIA";
  if (value.includes("REPRODUCTIVE")) return "REPRODUCTIVE HEALTH";
  if (value.includes("VACCINE")) return "VACCINES";
  if (/GLOVES|CANNULAE|CATHETER|COTTON|SYRINGE|NEEDLE|GAUZE|OTHER MS|DISINFECT/.test(value)) return "MEDSURG";
  return "ESSENTIAL MEDICINES";
}

function styleHeader(range) {
  range.format = {
    fill: green,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: border },
  };
}

readMe.showGridLines = false;
readMe.getRange("A1:H1").merge();
readMe.getRange("A1").values = [["July Week 4 2026 Cleaned Tracer Intake"]];
readMe.getRange("A1:H1").format = { fill: green, font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center" };
readMe.getRange("A3:B9").values = [
  ["Reporting period", report.label],
  ["Report date", new Date("2026-07-26T00:00:00")],
  ["Source", "10 provincial July Week 4 tracer submissions"],
  ["Recognised commodity rows", report.counts.rows],
  ["Provinces submitted", `${report.counts.provinces}/10`],
  ["Districts submitted", `${report.counts.districts}/${report.counts.expectedDistricts}`],
  ["Purpose", "Review-ready intake. Append to the master only after final administrative review."],
];
readMe.getRange("A3:A9").format = { fill: paleGreen, font: { bold: true, color: "#174B31" }, borders: { preset: "all", style: "thin", color: border } };
readMe.getRange("B3:B9").format = { borders: { preset: "all", style: "thin", color: border }, wrapText: true };
readMe.getRange("B4").format.numberFormat = "yyyy-mm-dd";
readMe.getRange("A11:H11").merge();
readMe.getRange("A11").values = [["Cleaning rules applied"]];
readMe.getRange("A11:H11").format = { fill: paleGreen, font: { bold: true, color: "#174B31" } };
readMe.getRange("A12:H15").merge(true);
readMe.getRange("A12:H15").values = [
  ["1. Provincial/district records are retained only when they match the national district roster (116 expected districts)."],
  ["2. Template carry-over columns such as ‘DO NOT EDIT’ and facilities from other provinces are excluded from district reporting."],
  ["3. Quantities, AMC, MOS and availability are preserved as numeric values. Availability is 1 when quantity is above zero and 0 when it is zero."],
  ["4. This file is a new clean intake for 26 July 2026; it does not overwrite the existing January-July master workbook."],
];
readMe.getRange("A12:H15").format = { wrapText: true, borders: { preset: "all", style: "thin", color: border } };
readMe.getRange("A:A").format.columnWidth = 28;
readMe.getRange("B:B").format.columnWidth = 52;
readMe.getRange("A1:H1").format.rowHeight = 30;
readMe.getRange("A12:H15").format.rowHeight = 30;

qa.showGridLines = false;
qa.getRange("A1:G1").merge();
qa.getRange("A1").values = [["Week 4 - 26 July 2026 Quality Summary"]];
qa.getRange("A1:G1").format = { fill: green, font: { bold: true, color: "#FFFFFF", size: 16 } };
qa.getRange("A3:F3").values = [["Province", "Expected districts", "Submitted districts", "Missing districts", "Expected reporting units", "Submitted reporting units"]];
styleHeader(qa.getRange("A3:F3"));
const qaRows = report.dataQuality.provinces
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((province) => [province.name, province.expectedDistricts, province.districts, Math.max(0, province.expectedDistricts - province.districts), province.expected, province.reported]);
qa.getRange(`A4:F${qaRows.length + 3}`).values = qaRows;
qa.getRange(`A4:F${qaRows.length + 3}`).format = { borders: { preset: "insideHorizontal", style: "thin", color: border } };
qa.getRange(`B4:F${qaRows.length + 3}`).format.numberFormat = "#,##0";
qa.getRange(`A3:F${qaRows.length + 3}`).format.wrapText = true;
qa.getRange(`A3:F${qaRows.length + 3}`).format.autofitColumns();
qa.getRange("A:A").format.columnWidth = 25;
qa.getRange("E:F").format.columnWidth = 23;
qa.freezePanes.freezeRows(3);
qa.getRange(`D4:D${qaRows.length + 3}`).conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { fill: "#FCE8E6", font: { color: "#B42318", bold: true } } });

summary.showGridLines = false;
summary.getRange(`A1:T1`).values = [headers];
styleHeader(summary.getRange("A1:T1"));
const dataRows = rows.map(([p, d, l, f, i, pr, qty, amc, mos]) => {
  const facilityLevel = levels[l];
  const programme = programmes[pr];
  const primary = isPrimaryLevel(facilityLevel);
  return [
    new Date("2026-07-26T00:00:00"), "ZAMBIA", provinces[p], districts[d], facilityLevel, primary ? "ALL" : facilities[f],
    programme, items[i], "", Number(qty) || 0, Number(amc) || 0, Number(mos) || 0, Number(qty) > 0 ? 1 : 0,
    "", programme, mohLevel(facilityLevel), majorCategory(programme), primary ? "HC/HP" : facilities[f], items[i], elmisFacilityLevel(facilityLevel),
  ];
});
summary.getRange(`A2:T${dataRows.length + 1}`).values = dataRows;
summary.getRange("N2").formulas = [["=IF(L2<=0,\"STOCKED OUT\",IF(L2<=0.5,\"EMERGENCY LEVELS(<=0.5 MOS)\",IF(L2<2,\"UNDERSTOCKED(0.5-2 MOS)\",IF(L2<=4,\"ACCORDING TO PLAN(2-4 MOS)\",IF(L2<12,\"OVERSTOCKED(4-12 MOS)\",\"OVERSTOCKED(>=12 MOS)\")))))"]];
summary.getRange(`N2:N${dataRows.length + 1}`).fillDown();
summary.getRange(`A1:T${dataRows.length + 1}`).format.borders = { preset: "insideHorizontal", style: "thin", color: "#EDF2EE" };
summary.getRange(`A2:A${dataRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
summary.getRange(`J2:L${dataRows.length + 1}`).format.numberFormat = "#,##0.0";
summary.getRange(`M2:M${dataRows.length + 1}`).format.numberFormat = "0%";
summary.getRange(`A1:T${dataRows.length + 1}`).format.wrapText = false;
summary.getRange("A:A").format.columnWidth = 14;
summary.getRange("B:B").format.columnWidth = 12;
summary.getRange("C:D").format.columnWidth = 20;
summary.getRange("E:E").format.columnWidth = 24;
summary.getRange("F:F").format.columnWidth = 32;
summary.getRange("G:G").format.columnWidth = 20;
summary.getRange("H:H").format.columnWidth = 44;
summary.getRange("I:I").format.columnWidth = 10;
summary.getRange("J:M").format.columnWidth = 14;
summary.getRange("N:N").format.columnWidth = 28;
summary.getRange("O:Q").format.columnWidth = 20;
summary.getRange("R:R").format.columnWidth = 32;
summary.getRange("S:S").format.columnWidth = 44;
summary.getRange("T:T").format.columnWidth = 24;
summary.freezePanes.freezeRows(1);
summary.tables.add(`A1:T${dataRows.length + 1}`, true, "CleanedTracerIntake");
summary.getRange(`M2:M${dataRows.length + 1}`).conditionalFormats.add("cellIs", { operator: "equal", formula: 0, format: { fill: "#FCE8E6", font: { color: "#B42318", bold: true } } });

const check = await workbook.inspect({ kind: "table", range: "QA Summary!A1:F13", include: "values,formulas", tableMaxRows: 13, tableMaxCols: 6 });
console.log(check.ndjson);
const summaryCheck = await workbook.inspect({ kind: "table", range: "SUMMARY SHEET!A1:T4", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 20 });
console.log(summaryCheck.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "QA Summary", range: "A1:F13", scale: 1.5, format: "png" });
await fs.writeFile(new URL("qa-summary-preview.png", import.meta.url), new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(fileURLToPath(new URL("JULY-WEEK-4-2026-CLEANED-TRACER-INTAKE.xlsx", import.meta.url)));
console.log(`Exported ${dataRows.length} rows.`);
