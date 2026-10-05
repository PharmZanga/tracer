import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node tools/convert_xls_workbook.mjs <source.xls> <destination.xlsx>");

await fs.mkdir(path.dirname(destination), { recursive: true });
const workbook = XLSX.readFile(source, { cellFormula: true, cellNF: true, cellDates: true });
XLSX.writeFile(workbook, destination, { bookType: "xlsx" });
console.log(`Converted ${path.basename(source)} to ${path.basename(destination)}.`);
