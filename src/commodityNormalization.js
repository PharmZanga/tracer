const SODIUM_CHLORIDE_500ML = "Sodium Chloride (Normal Saline) 500ml 0.9% (1)";
const NON_COMMODITY_SUMMARY_LABELS = new Set(["AVERAGE MONTH OF STOCK", "PERCENTAGE AVAILABILITY"]);
const identityKey = value => value.toLowerCase().replace(/[(),\s-]/g, "").replace(/\.$/, "");
const reviewedNames = [
  "Needle Luer 23G x 1.5 Disposable (100)",
  "Needle Luer 21G/23G x 1.5 Disposable (100)",
  "Metronidazole 5mg/ml injection, 1 Bottle (1)",
  "Diclofenac Sodium 75mg/3ml injection (1)",
  "Bandage P.O.P 7.5cm X 2.7m",
  "Sodium Divalproex 500mg Tablet (100)",
  "Sodium Chloride 0.9% solution, 1000ml (1)",
  "Condoms Latex Male (144)", "Surgical Gloves Powder Free Latex (100)",
  "Cotton Wool absorbent Bp/EP 500g (1 roll)", "Adhesive Tape (Zinc Oxide)",
  "Suture Silk Non-Absorbable (12)", "Bandage P.O.P 7.5cm X 2.7m (1)",
  "Dapsone-Pyrimethamine (Delta prim) tablet", "Urine Collecting Bags Adult 1000ml (1)",
  "Gauze Absorbent 36cm x 50m Roll (1)", "Nystatin Oral Susp 30ml Btl 100000iu/ml Suspension (1)",
  "Gauze Swab X-Ray Detectable (100)", "X-Ray Films 30X40CM (BLUE SENSITIVE) NON INTERLEAV",
  "Azithromycin 250mg tablet (1*3)", "Metronidazole 200mg tablet (100)",
  "Vaccine Rota Virus (RV)", "Vaccine Oral Poliovirus (OPV)",
  "Vaccine Pneumococcal conjugate (PCV)", "Vaccine Measles/Rubella (MR)",
  "Vaccine Diptheria, Pertussis, Tetanus (DPT)", "Vaccine Bacille Calmette-Guerin (BCG)",
  "Vaccine Inactivated polio (IPV)", "Vaccine Tetanus/Deptheria (TD)",
];
const reviewedAliases = new Map(reviewedNames.map(name => [identityKey(name), name]));

export function canonicalCommodityName(value) {
  const name = String(value || "").trim();
  const normalized = name.toLowerCase().replace(/\s+/g, " ");

  if (normalized.includes("sodium chloride") && /\b500\s*ml\b/.test(normalized) && /0\.0?9\s*%/.test(normalized)) {
    return SODIUM_CHLORIDE_500ML;
  }

  return reviewedAliases.get(identityKey(name)) || name;
}

export function canonicalCommodityRollups(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const name = canonicalCommodityName(row.name);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups].map(([name, members]) => {
    const result = {...members[0], name, normalized: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), sourceNames: [...new Set(members.flatMap(r=>r.sourceNames||[r.name]))]};
    const sum = field => members.reduce((total,r)=>total+(Number(r[field])||0),0);
    for (const field of ['rows','quantity','amc','stockout','nearCritical','understocked','accordingToPlan','abovePlan','overstock','dataGap','riskRows']) result[field]=sum(field);
    const available = members.filter(r=>Number.isFinite(r.availability));
    const availabilityRows = available.reduce((n,r)=>n+r.rows,0);
    result.availability=availabilityRows?available.reduce((n,r)=>n+r.availability*r.rows,0)/availabilityRows:null;
    const mosMembers=members.filter(r=>Number.isFinite(r.mos));
    const mosRows=mosMembers.reduce((n,r)=>n+r.rows,0);
    result.mos=mosRows?mosMembers.reduce((n,r)=>n+r.mos*r.rows,0)/mosRows:null;
    result.stockoutRate=result.rows?result.stockout/result.rows:0;
    return result;
  });
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
