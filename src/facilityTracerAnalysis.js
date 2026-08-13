const DIFFERENCE_TOLERANCE = 0.05;

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function commodityKey(row) {
  return String(row.item || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatExportMos(value, detailed = false) {
  if (!Number.isFinite(value)) return "";
  if (detailed && value > 0 && value < 0.01) return value.toFixed(3);
  if (detailed && value >= 0.01 && value < 0.1) return value.toFixed(2);
  return value.toFixed(1);
}

function managementAction(status, flags) {
  if (status === "Confirmed stock-out") return "Check redistribution options; check pending orders; escalate for emergency replenishment.";
  if (status === "Critical low stock" || status === "Low stock") {
    return flags.includes("Unusual consumption")
      ? "Monitor closely; check expected deliveries; consider redistribution; verify unusually high consumption."
      : "Monitor closely; check expected deliveries; consider redistribution.";
  }
  if (status === "Overstocked") return "Consider redistribution; review expiry dates; confirm consumption pattern.";
  if (status === "Data-quality exception") return "Validate the submitted quantity, AMC and MOS before taking a stock action.";
  return "Continue routine stock monitoring.";
}

function comparisonLabel(current, previous) {
  if (!previous) return "No previous report";
  if (current.status === "Confirmed stock-out" && previous.status !== "Confirmed stock-out") return "New stock-out";
  if (current.status === "Confirmed stock-out" && previous.status === "Confirmed stock-out") return "Continued stock-out";
  if (current.status !== "Confirmed stock-out" && previous.status === "Confirmed stock-out") return "Stock-out resolved";
  if (Number.isFinite(current.calculatedMos) && Number.isFinite(previous.calculatedMos)) {
    if (current.calculatedMos > previous.calculatedMos + DIFFERENCE_TOLERANCE) return "MOS improving";
    if (current.calculatedMos < previous.calculatedMos - DIFFERENCE_TOLERANCE) return "MOS declining";
  }
  return "No material change";
}

export function analyseTracerCommodity(row, previousRow = null) {
  const quantity = numberOrNull(row.quantity);
  const amc = numberOrNull(row.amc);
  const submittedMos = numberOrNull(row.mos);
  const calculatedMos = quantity !== null && quantity >= 0 && amc !== null && amc > 0 ? quantity / amc : null;
  const flags = [];

  if (quantity === null) flags.push("Missing quantity");
  if (amc === null || amc <= 0) flags.push("Missing AMC");
  if (submittedMos === null) flags.push("MOS recalculated");
  if (quantity !== null && quantity > 0 && (submittedMos === null || submittedMos === 0)) flags.push("Submitted value requires validation");
  if (submittedMos !== null && calculatedMos !== null && Math.abs(submittedMos - calculatedMos) > Math.max(0.1, calculatedMos * 0.2)) flags.push("Submitted value requires validation");
  if (row.unitsCompatible === false) flags.push("Unit requires verification");

  let status = "Data-quality exception";
  if (quantity === 0) status = "Confirmed stock-out";
  else if (quantity !== null && quantity > 0 && calculatedMos !== null && calculatedMos > 0 && calculatedMos < 0.5) status = "Critical low stock";
  else if (quantity !== null && quantity > 0 && calculatedMos !== null && calculatedMos >= 0.5 && calculatedMos < 2) status = "Low stock";
  else if (quantity !== null && quantity > 0 && calculatedMos !== null && calculatedMos >= 2 && calculatedMos <= 4) status = "Stocked according to plan";
  else if (quantity !== null && quantity > 0 && calculatedMos !== null && calculatedMos > 4) status = "Overstocked";

  const previous = previousRow ? analyseTracerCommodity({ ...previousRow }, null) : null;
  if (previous && Number.isFinite(calculatedMos) && Number.isFinite(previous.calculatedMos) && previous.calculatedMos > 0) {
    const ratio = calculatedMos / previous.calculatedMos;
    if (ratio >= 3 || ratio <= 0.33) flags.push("Unusual consumption");
  }

  const result = {
    ...row,
    program: row.program || row.programme || "Unspecified",
    quantity,
    amc,
    submittedMos,
    calculatedMos,
    effectiveMos: calculatedMos,
    status,
    flags: [...new Set(flags)],
  };
  result.previousStatus = comparisonLabel(result, previous);
  result.recommendedAction = managementAction(status, result.flags);
  result.estimatedDepletion = Number.isFinite(calculatedMos)
    ? calculatedMos < 1 ? `${Math.max(1, Math.round(calculatedMos * 30))} days` : `${calculatedMos.toFixed(1)} months`
    : "Cannot estimate";
  return result;
}

export function analyseFacilityTracer(rows, previousRows = []) {
  const previousByCommodity = new Map(previousRows.map((row) => [commodityKey(row), row]));
  const items = rows.map((row) => analyseTracerCommodity(row, previousByCommodity.get(commodityKey(row))));
  const byStatus = {
    "Confirmed stock-out": [],
    "Critical low stock": [],
    "Low stock": [],
    "Stocked according to plan": [],
    Overstocked: [],
    "Data-quality exception": [],
  };
  items.forEach((item) => byStatus[item.status].push(item));
  const available = items.filter((item) => item.quantity !== null && item.quantity > 0).length;
  const validMos = items.map((item) => item.calculatedMos).filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(validMos.length / 2);
  const averageMos = validMos.length ? validMos.reduce((sum, value) => sum + value, 0) / validMos.length : null;
  const medianMos = validMos.length ? (validMos.length % 2 ? validMos[middle] : (validMos[middle - 1] + validMos[middle]) / 2) : null;
  const dataQualityItems = items.filter((item) => item.flags.length);
  const comparison = items.reduce((summary, item) => {
    if (item.previousStatus === "New stock-out") summary.newStockouts += 1;
    if (item.previousStatus === "Continued stock-out") summary.continuingStockouts += 1;
    if (item.previousStatus === "Stock-out resolved") summary.resolvedStockouts += 1;
    return summary;
  }, { newStockouts: 0, continuingStockouts: 0, resolvedStockouts: 0 });

  return { items, byStatus, available, total: items.length, averageMos, medianMos, dataQualityItems, comparison };
}

export function facilityTracerExportRows({ reportLabel, province, district, facilityLevel, facilityName, submittedAvailability, availabilityNumerator, availabilityDenominator, analysis, items }) {
  return [
    ["Report", reportLabel],
    ["Province", province],
    ["District", district],
    ["Facility level", facilityLevel],
    ["Reporting unit", facilityName],
    ["Submitted tracer availability", submittedAvailability],
    ["Availability numerator", availabilityNumerator],
    ["Availability denominator", availabilityDenominator],
    ["Average calculated MOS", formatExportMos(analysis.averageMos)],
    ["Median calculated MOS", formatExportMos(analysis.medianMos)],
    ["Comparison", `${analysis.comparison.newStockouts} new stock-outs; ${analysis.comparison.continuingStockouts} continuing stock-outs; ${analysis.comparison.resolvedStockouts} resolved stock-outs`],
    [],
    ["Status", "Commodity", "Programme", "Quantity", "AMC", "Submitted MOS", "Platform-calculated MOS", "Previous status", "Data-quality flags", "Recommended action"],
    ...items.map((item) => [item.status, item.item, item.program, item.quantity, item.amc, formatExportMos(item.submittedMos), formatExportMos(item.calculatedMos, true), item.previousStatus, item.flags.join("; "), item.recommendedAction]),
  ];
}
