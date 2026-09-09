import fs from "node:fs";

import { tracerReportingPeriods } from "../src/tracerFacilityDataJul.js";

const replacement = JSON.parse(fs.readFileSync("tmp/corrected-week4-period.json", "utf8"));
const periods = tracerReportingPeriods.map((period) => (
  period.id === replacement.id
    ? { ...period, ...replacement, dataQuality: period.dataQuality }
    : period
));

const corrected = periods.find((period) => period.id === "2026-08-30");
const { dictionaries, rows } = corrected.commodityFacilityData;
const record = rows.find((row) => (
  dictionaries.provinces[row[0]] === "LUSAKA PROVINCE"
  && dictionaries.districts[row[1]] === "LUSAKA"
  && dictionaries.facilities[row[3]] === "CHILENJE HOSPITAL"
  && dictionaries.items[row[4]] === "Sodium Chloride (Normal Saline) 500ml 0.09% (1)"
));

if (!record || record[6] !== 1122 || record[7] !== 1500 || record[8] !== 1) {
  throw new Error("Verified Chilenje Normal Saline correction is missing.");
}

fs.writeFileSync(
  "src/tracerFacilityDataJul.js",
  `export const tracerReportingPeriods = ${JSON.stringify(periods)};\n`,
  "utf8",
);
console.log("Replaced the Week 4 period with corrected Chilenje source data.");
