import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tracerReportingPeriods } from "../src/tracerFacilityData.js";
import { zammsaCentralReports } from "../src/zammsaCentralStockData.js";

const period = tracerReportingPeriods.find((item) => item.reportDate === "2026-09-06");
const previous = tracerReportingPeriods.find((item) => item.reportDate === "2026-08-30");

if (!period || !previous) throw new Error("Required August or September reporting period is unavailable.");

mkdirSync(dirname(process.argv[2]), { recursive: true });
writeFileSync(process.argv[2], JSON.stringify({
  period,
  previous,
  central: zammsaCentralReports.at(-1),
}, null, 2));
