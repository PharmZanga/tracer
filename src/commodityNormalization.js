const SODIUM_CHLORIDE_500ML = "Sodium Chloride (Normal Saline) 500ml 0.9% (1)";
const NON_COMMODITY_SUMMARY_LABELS = new Set(["AVERAGE MONTH OF STOCK", "PERCENTAGE AVAILABILITY"]);

export function canonicalCommodityName(value) {
  const name = String(value || "").trim();
  const normalized = name.toLowerCase().replace(/\s+/g, " ");

  if (normalized.includes("sodium chloride") && normalized.includes("500ml") && /0\.0?9%/.test(normalized)) {
    return SODIUM_CHLORIDE_500ML;
  }

  return name;
}

export function isCommodityName(value) {
  const name = canonicalCommodityName(value);
  return Boolean(name)
    && !NON_COMMODITY_SUMMARY_LABELS.has(name.toUpperCase())
    && !/^#(?:REF|VALUE|N\/A|NAME|DIV\/0)!?$/i.test(name)
    && !/^\d+(?:\.\d+)?$/.test(name);
}

export function findLongestZeroAvailabilityRun(rows) {
  let longest = null;
  let current = null;

  rows.forEach((row) => {
    const isSubmittedZero = Number(row.rows || 0) > 0 && Number(row.availability) === 0;
    if (!isSubmittedZero) {
      current = null;
      return;
    }

    if (!current) current = { weeks: 0, startLabel: row.label, endLabel: row.label };
    current.weeks += 1;
    current.endLabel = row.label;
    if (!longest || current.weeks > longest.weeks) longest = { ...current };
  });

  return longest;
}

export function commodityRiskTone(stockoutRate) {
  const rate = Number(stockoutRate || 0);
  if (rate >= 0.2) return "red";
  if (rate >= 0.05) return "amber";
  return "green";
}

export function commodityTrendDirection(delta) {
  if (delta === null || delta === undefined || delta === "") return "unavailable";
  const value = Number(delta);
  if (!Number.isFinite(value)) return "unavailable";
  if (value >= 0.01) return "up";
  if (value <= -0.01) return "down";
  return "steady";
}

export { SODIUM_CHLORIDE_500ML };
