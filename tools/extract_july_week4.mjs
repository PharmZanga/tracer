import fs from "node:fs/promises";
import { tracerReportingPeriods } from "../src/tracerFacilityData.js";

const period = tracerReportingPeriods.find((entry) => entry.reportDate === "2026-07-26");
if (!period) throw new Error("Week 4 - 26 July 2026 was not found in the generated data.");
const body = `// Generated from the cleaned provincial submissions for Week 4 - 26 July 2026.\nexport const tracerReportingPeriods = ${JSON.stringify([period])};\n`;
await fs.writeFile(new URL("../src/tracerFacilityDataJul.js", import.meta.url), body);
console.log(`Created compact July data module with ${period.counts.rows} commodity rows.`);
