import { useMemo, useState } from "react";
import { tracerReportingPeriods } from "./tracerFacilityData.js";
import { weeklyStockPeriods } from "./weeklyStockData.js";

const dashboardPages = [
  { id: "executive", short: "EX", label: "Executive Summary" },
  { id: "national", short: "NS", label: "National Stock Status" },
  { id: "stock", short: "ZS", label: "ZAMMSA Weekly Stock Status" },
  { id: "provincial", short: "PP", label: "Provincial Performance" },
  { id: "facilities", short: "FA", label: "Facility Alerts" },
  { id: "commodities", short: "CI", label: "Commodity Intelligence" },
  { id: "comparison", short: "CP", label: "Comparison" },
  { id: "programmes", short: "PR", label: "Programme Performance" },
  { id: "quality", short: "DQ", label: "Data Quality" },
  { id: "reporting", short: "RR", label: "Reporting Rate" },
  { id: "actions", short: "AT", label: "Action Tracker" },
];

const statusLabels = {
  stockout: "Stockout",
  nearCritical: "Near critical",
  understocked: "Low stock",
  accordingToPlan: "According to plan",
  abovePlan: "Above plan",
  overstock: "Overstock",
  dataGap: "Data gap",
};

const stockStreamLabels = {
  EMMS: "Essential medicines (EMMS)",
  LAB: "Laboratory commodities (LAB)",
};

function normalizeRate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  if (number > 1 && number <= 10) return Math.min(number / 10, 1);
  if (number > 10) return Math.min(number / 100, 1);
  return Math.min(number, 1);
}

function commodityStockStatus(mos) {
  const value = Number(mos);
  if (!Number.isFinite(value)) return "Incomplete report";
  if (value <= 0) return "Stocked out";
  if (value <= 0.5) return "Emergency stock";
  if (value < 2) return "Understocked";
  if (value <= 4) return "According to plan";
  if (value < 12) return "Overstocked";
  return "Excess stock";
}

function commodityStatusTone(status) {
  if (status === "Stocked out") return "red";
  if (status === "Emergency stock" || status === "Understocked") return "amber";
  if (status === "According to plan") return "green";
  if (status === "Overstocked" || status === "Excess stock") return "blue";
  return "muted";
}

function commodityRowsFromPeriod(period) {
  const data = period?.commodityFacilityData;
  if (!data?.dictionaries || !data?.rows) return [];
  const { provinces = [], districts = [], levels = [], facilities = [], items = [], programmes = [] } = data.dictionaries;
  return data.rows.map(([province, district, level, facility, item, programme, quantity, amc, mos]) => ({
    province: provinces[province],
    district: districts[district],
    facilityLevel: levels[level],
    facility: facilities[facility],
    item: items[item],
    programme: programmes[programme],
    quantity: Number(quantity || 0),
    amc: Number(amc || 0),
    mos: Number.isFinite(Number(mos)) ? Number(mos) : null,
  }));
}

function commodityGroupRows(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[key] || "Unknown";
    const current = groups.get(name) || { name, rows: 0, available: 0, mosTotal: 0, quantity: 0, amc: 0 };
    current.rows += 1;
    current.available += row.quantity > 0 ? 1 : 0;
    current.mosTotal += row.mos || 0;
    current.quantity += row.quantity || 0;
    current.amc += row.amc || 0;
    groups.set(name, current);
  });
  return [...groups.values()].map((row) => ({
    ...row,
    availability: row.rows ? row.available / row.rows : 0,
    mos: row.rows ? row.mosTotal / row.rows : 0,
  })).sort((a, b) => a.availability - b.availability || a.name.localeCompare(b.name));
}

function compareText(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function formatPercent(value) {
  return `${Math.round(normalizeRate(value) * 1000) / 10}%`;
}

function formatMos(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(1);
}

function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeCommodity(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stockCategoryRowsFor(period) {
  if (!period) return [];
  const sourceCategories = new Map((period.categories || []).map((row) => [row.name, row.availability]));
  const grouped = new Map();
  (period.items || []).forEach((item) => {
    const current = grouped.get(item.category) || { name: item.category, available: 0, total: 0, availability: 0 };
    current.total += 1;
    if ((item.availability || 0) > 0) current.available += 1;
    grouped.set(item.category, current);
  });
  for (const [name, availability] of sourceCategories) {
    if (!grouped.has(name)) grouped.set(name, { name, available: null, total: null, availability });
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    availability: sourceCategories.has(row.name) ? sourceCategories.get(row.name) : row.total ? row.available / row.total : 0,
  }));
}

function stockChangeRows(current, previous) {
  if (!current?.items || !previous?.items) return null;
  const previousByName = new Map(previous.items.map((item) => [normalizeCommodity(item.name), item]));
  const newlyUnavailable = current.items
    .filter((item) => (item.availability || 0) <= 0 && (previousByName.get(normalizeCommodity(item.name))?.availability || 0) > 0)
    .map((item) => ({ item: item.name, category: item.category }));
  const recovered = current.items
    .filter((item) => (item.availability || 0) > 0 && (previousByName.get(normalizeCommodity(item.name))?.availability || 0) <= 0)
    .map((item) => ({ item: item.name, category: item.category }));
  return { from: previous.label, to: current.label, newlyUnavailable, recovered };
}

function makeEmptyRollup(name = "Current selection") {
  return {
    name,
    rows: 0,
    availability: 0,
    mos: null,
    stockout: 0,
    nearCritical: 0,
    understocked: 0,
    accordingToPlan: 0,
    abovePlan: 0,
    overstock: 0,
    dataGap: 0,
    quantity: 0,
    amc: 0,
    riskRows: 0,
    stockoutRate: 0,
  };
}

function combineRollups(rows, fallback) {
  if (!rows.length) return fallback || makeEmptyRollup();
  const totals = rows.reduce((acc, row) => {
    acc.rows += row.rows || 0;
    acc.availabilityWeighted += normalizeRate(row.availability) * (row.rows || 0);
    if (row.mos !== null && row.mos !== undefined) {
      acc.mosWeighted += row.mos * (row.rows || 0);
      acc.mosRows += row.rows || 0;
    }
    acc.stockout += row.stockout || 0;
    acc.nearCritical += row.nearCritical || 0;
    acc.understocked += row.understocked || 0;
    acc.accordingToPlan += row.accordingToPlan || 0;
    acc.abovePlan += row.abovePlan || 0;
    acc.overstock += row.overstock || 0;
    acc.dataGap += row.dataGap || 0;
    acc.quantity += row.quantity || 0;
    acc.amc += row.amc || 0;
    acc.riskRows += row.riskRows || 0;
    return acc;
  }, {
    rows: 0,
    availabilityWeighted: 0,
    mosWeighted: 0,
    mosRows: 0,
    stockout: 0,
    nearCritical: 0,
    understocked: 0,
    accordingToPlan: 0,
    abovePlan: 0,
    overstock: 0,
    dataGap: 0,
    quantity: 0,
    amc: 0,
    riskRows: 0,
  });
  return {
    name: "Current selection",
    rows: totals.rows,
    availability: totals.rows ? totals.availabilityWeighted / totals.rows : 0,
    mos: totals.mosRows ? Math.round((totals.mosWeighted / totals.mosRows) * 100) / 100 : null,
    stockout: totals.stockout,
    nearCritical: totals.nearCritical,
    understocked: totals.understocked,
    accordingToPlan: totals.accordingToPlan,
    abovePlan: totals.abovePlan,
    overstock: totals.overstock,
    dataGap: totals.dataGap,
    quantity: Math.round(totals.quantity),
    amc: Math.round(totals.amc),
    riskRows: totals.riskRows,
    stockoutRate: totals.rows ? totals.stockout / totals.rows : 0,
  };
}

function classifyRollup(row) {
  if ((row.stockout || 0) > 0 || (row.stockoutRate || 0) >= 0.15) return "red";
  if ((row.nearCritical || 0) + (row.understocked || 0) > 0 || (row.availability || 0) < 0.8) return "amber";
  if ((row.overstock || 0) > 0) return "blue";
  return "green";
}

const careLevelBuckets = [
  { id: "primary", label: "Health Centre/Health Post" },
  { id: "level1", label: "Level 1 Hospital" },
  { id: "level2", label: "Level 2 Hospital" },
  { id: "level3", label: "Level 3/Specialised Hospital" },
];

const facilityCareLevelOptions = [
  { value: "health-post", label: "Health Post" },
  { value: "health-centre", label: "Health Centre" },
  { value: "level-1", label: "Level 1" },
  { value: "level-2", label: "Level 2" },
  { value: "level-3", label: "Level 3" },
];

const specialisedCareLevelOptions = [
  { value: "specialised-cancer", label: "Cancer Diseases Hospital" },
  { value: "specialised-heart", label: "National Heart Hospital" },
  { value: "specialised-women-newborn", label: "Women and Newborn Hospital" },
  { value: "specialised-renal", label: "Renal Units" },
  { value: "specialised-mental-health", label: "Mental Health Units" },
  { value: "specialised-eye", label: "Eye/Ophthalmology Hospital" },
  { value: "specialised-tb", label: "TB-DS / TB-MDR Units" },
];

function careLevelBucket(facilityLevel = "") {
  const text = facilityLevel.toUpperCase();
  if (text.includes("HEALTH CENTRE") || text.includes("HEALTH POST")) return "primary";
  if (text.includes("LEVEL 2") || text.includes("GENERAL HOSPITAL")) return "level2";
  if (
    text.includes("LEVEL 3") ||
    text.includes("TERTIARY") ||
    text.includes("SPECIAL") ||
    text.includes("OPTH") ||
    text.includes("OPHTH") ||
    text.includes("CANCER") ||
    text.includes("RENAL") ||
    text.includes("MENTAL") ||
    text.includes("HEART") ||
    text.includes("WOMEN") ||
    text.includes("NEW BORN") ||
    text.includes("PAEDIATRIC") ||
    text.includes("TB") ||
    text.includes("DS-TB") ||
    text.includes("MDR")
  ) return "level3";
  if (text.includes("LEVEL 1") || text.includes("DISTRICT")) return "level1";
  return "other";
}

function matchesFacilityCareLevel(facilityLevel = "", selectedLevel = "all") {
  if (selectedLevel === "all") return true;
  const text = String(facilityLevel).toUpperCase();
  if (selectedLevel === "health-post") return text.includes("HEALTH POST");
  if (selectedLevel === "health-centre") return text.includes("HEALTH CENTRE");
  if (selectedLevel === "level-1") return careLevelBucket(text) === "level1";
  if (selectedLevel === "level-2") return careLevelBucket(text) === "level2";
  if (selectedLevel === "level-3") return careLevelBucket(text) === "level3";
  if (selectedLevel === "specialised-cancer") return text.includes("CANCER");
  if (selectedLevel === "specialised-heart") return text.includes("HEART");
  if (selectedLevel === "specialised-women-newborn") return text.includes("WOMEN") || text.includes("NEW BORN") || text.includes("NEWBORN");
  if (selectedLevel === "specialised-renal") return text.includes("RENAL");
  if (selectedLevel === "specialised-mental-health") return text.includes("MENTAL");
  if (selectedLevel === "specialised-eye") return text.includes("OPTH") || text.includes("OPHTH") || text.includes("EYE");
  if (selectedLevel === "specialised-tb") return text.includes("TB") || text.includes("MDR");
  return false;
}

function facilityCareLevelLabel(selectedLevel) {
  return [...facilityCareLevelOptions, ...specialisedCareLevelOptions].find((option) => option.value === selectedLevel)?.label || "All levels";
}

function LevelOfCarePerformance({ rows }) {
  const chartHeight = 180;
  const chartPoints = rows.map((row, index) => {
    const x = rows.length <= 1 ? 50 : 9 + (index * 82) / (rows.length - 1);
    const y = 92 - Math.max(0, Math.min(row.availability || 0, 1)) * 80;
    return `${x},${y}`;
  }).join(" ");
  const level3Row = rows.find((row) => row.id === "level3");
  const level3Levels = level3Row?.facilityLevels || [];
  const level3Names = level3Row?.facilityNames || [];

  return (
    <section className="level-care-performance">
      <div className="level-care-head">
        <div>
          <p className="eyebrow dark">Level Of Care Performance</p>
          <h2>Facilities and departments performance</h2>
        </div>
      </div>
      <div className="level-care-chart">
        <div className="level-care-axis">
          {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((tick) => <span key={tick}>{tick}%</span>)}
        </div>
        <div className="level-care-plot">
          <svg className="level-care-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={chartPoints} />
          </svg>
          {rows.map((row) => {
            const availability = Math.max(0, Math.min(row.availability || 0, 1));
            const barHeight = `${Math.max(12, availability * chartHeight)}px`;
            const pointTop = `${18 + (1 - availability) * chartHeight}px`;
            return (
              <div className="level-care-group" key={row.id}>
                <div className="availability-point" style={{ top: pointTop }}>
                  <span>{formatPercent(row.availability)}</span>
                  <i />
                </div>
                <div className="mos-bar" style={{ height: barHeight }}>
                  <strong>{formatMos(row.mos)}</strong>
                </div>
                <b>{row.label}</b>
                <small>{row.rows.toLocaleString()} rows</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="level-care-legend">
        <span><i className="mos-key" />Availability bar, MOS shown inside</span>
        <span><i className="availability-key" />Average of Availability</span>
      </div>
      {level3Row ? (
        <div className="level-care-inclusions">
          <strong>Level 3/Specialised calculation includes</strong>
          <span>{level3Levels.length ? level3Levels.join(", ") : "No Level 3/Specialised facility levels in the current filter."}</span>
          {level3Names.length ? <small>Facilities: {level3Names.slice(0, 12).join(", ")}{level3Names.length > 12 ? `, +${level3Names.length - 12} more` : ""}</small> : null}
        </div>
      ) : null}
    </section>
  );
}

function buildRedistributionCandidates(facilities) {
  const demandByProvinceItem = new Map();
  const supplyRows = [];

  facilities.forEach((facility) => {
    (facility.stockoutItems || []).forEach((item) => {
      const key = `${facility.province}|${normalizeCommodity(item.item)}`;
      const demand = demandByProvinceItem.get(key) || [];
      demand.push({ facility, item, priority: "Stockout" });
      demandByProvinceItem.set(key, demand);
    });
    (facility.lowStockItems || []).forEach((item) => {
      const key = `${facility.province}|${normalizeCommodity(item.item)}`;
      const demand = demandByProvinceItem.get(key) || [];
      demand.push({ facility, item, priority: "Low stock" });
      demandByProvinceItem.set(key, demand);
    });
    (facility.overstockItems || []).forEach((item) => {
      supplyRows.push({ facility, item });
    });
  });

  const candidates = [];
  supplyRows.forEach((source) => {
    const key = `${source.facility.province}|${normalizeCommodity(source.item.item)}`;
    const demandRows = demandByProvinceItem.get(key) || [];
    demandRows
      .filter((destination) => destination.facility.name !== source.facility.name || destination.facility.district !== source.facility.district)
      .slice(0, 3)
      .forEach((destination) => {
        candidates.push({
          province: source.facility.province,
          commodity: source.item.item,
          sourceFacility: source.facility.isAggregate ? `All ${source.facility.facilityLevel.toLowerCase()} facilities` : source.facility.name,
          sourceDistrict: source.facility.district,
          sourceLevel: source.facility.facilityLevel,
          sourceMos: source.item.mos,
          sourceQty: source.item.quantity,
          destinationFacility: destination.facility.isAggregate ? `All ${destination.facility.facilityLevel.toLowerCase()} facilities` : destination.facility.name,
          destinationDistrict: destination.facility.district,
          destinationLevel: destination.facility.facilityLevel,
          destinationMos: destination.item.mos,
          destinationQty: destination.item.quantity,
          priority: destination.priority,
        });
      });
  });

  return candidates
    .sort((a, b) => a.province.localeCompare(b.province) || (a.destinationMos || 0) - (b.destinationMos || 0) || (b.sourceMos || 0) - (a.sourceMos || 0))
    .slice(0, 80);
}

function TopRowsTable({ title, rows, onSelect, detail = "riskRows" }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>Sorted by weakest availability and highest tracer risk.</p>
        </div>
      </div>
      <div className="table-scroll compact-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Availability</th>
              <th>MOS</th>
              <th>Stockout</th>
              <th>Low stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.province || ""}-${row.name}`}>
                <td>
                  {onSelect ? <button className="table-link" type="button" onClick={() => onSelect(row)}>{row.name}</button> : row.name}
                  {row.province ? <small>{row.province}</small> : null}
                </td>
                <td>{formatPercent(row.availability)}</td>
                <td>{formatMos(row.mos)}</td>
                <td>{(row.stockout || 0).toLocaleString()}</td>
                <td>{((row.nearCritical || 0) + (row.understocked || 0)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="panel-foot">{rows.length} rows shown by {detail}.</small>
    </div>
  );
}

function KpiCard({ label, value, sub, tone = "green" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function qualityRate(row) {
  return row?.expected ? (row.reported || 0) / row.expected : 0;
}

function reportingTone(rate) {
  const value = normalizeRate(rate);
  if (value >= 0.9) return "green";
  if (value >= 0.7) return "amber";
  return "red";
}

function reportingStatus(row) {
  return (row.reported || 0) > 0 ? "Reported" : "Not Reported";
}

const reportingConsistencyRules = {
  minorGapPeriods: 1,
  persistentMissedPeriods: 2,
};

function longestMissedRun(history) {
  let longest = 0;
  let current = 0;
  history.forEach((row) => {
    if (row.reported) {
      current = 0;
    } else {
      current += 1;
      longest = Math.max(longest, current);
    }
  });
  return longest;
}

function reportingConsistency(history) {
  const reported = history.filter((row) => row.reported).length;
  const missed = history.length - reported;
  const run = longestMissedRun(history);
  if (!reported) return "No reporting";
  if (!missed) return "Fully reported";
  if (run >= reportingConsistencyRules.persistentMissedPeriods) return "Persistent non-reporting";
  if (missed <= reportingConsistencyRules.minorGapPeriods) return "Minor reporting gaps";
  return "Irregular reporting";
}

function reportingFacilityLabel(type) {
  const labels = {
    "Health Centres": "Health Centre",
    "Health Posts": "Health Post",
    "Level 1 Hospitals": "Level 1 Hospital",
    "Level 2 Hospitals": "Level 2 / General Hospital",
    "Level 3/Specialised Hospitals": "Level 3 / Specialised Hospital",
    "Cancer Units": "Cancer Unit",
    "Renal Units": "Renal Unit",
    "TB-DS/MDR Units": "TB-DS / TB-MDR Unit",
    "Mental Health Units": "Mental Health Unit",
    "Ophthalmology Units": "Eye / Ophthalmology Unit",
    "Heart Units": "Heart / Cardiac Unit",
    "Women And Newborn Units": "Women and Newborn Unit",
  };
  return labels[type] || String(type || "Reporting Unit").replace(/\s+Units$/, " Unit").replace(/\s+Hospitals$/, " Hospital");
}

function aggregateQualityRows(rows, groupKey, labelKey = "name") {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row[groupKey];
    if (!groups.has(key)) {
      groups.set(key, { [labelKey]: key, expected: 0, reported: 0, missing: 0 });
    }
    const group = groups.get(key);
    group.expected += row.expected || 0;
    group.reported += row.reported || 0;
    group.missing += row.missing || 0;
  });
  return [...groups.values()].map((row) => ({ ...row, rate: qualityRate(row) }));
}

function aggregateRollups(rows, groupKey = "name") {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row[groupKey];
    if (!groups.has(key)) {
      groups.set(key, { ...makeEmptyRollup(key), name: key });
    }
    const group = groups.get(key);
    group.rows += row.rows || 0;
    group.availabilityWeighted = (group.availabilityWeighted || 0) + normalizeRate(row.availability) * (row.rows || 0);
    if (row.mos !== null && row.mos !== undefined) {
      group.mosWeighted = (group.mosWeighted || 0) + row.mos * (row.rows || 0);
      group.mosRows = (group.mosRows || 0) + (row.rows || 0);
    }
    group.stockout += row.stockout || 0;
    group.nearCritical += row.nearCritical || 0;
    group.understocked += row.understocked || 0;
    group.accordingToPlan += row.accordingToPlan || 0;
    group.abovePlan += row.abovePlan || 0;
    group.overstock += row.overstock || 0;
    group.dataGap += row.dataGap || 0;
    group.quantity += row.quantity || 0;
    group.amc += row.amc || 0;
    group.riskRows += row.riskRows || 0;
  });
  return [...groups.values()].map((row) => ({
    ...row,
    availability: row.rows ? row.availabilityWeighted / row.rows : 0,
    mos: row.mosRows ? Math.round((row.mosWeighted / row.mosRows) * 100) / 100 : null,
    stockoutRate: row.rows ? row.stockout / row.rows : 0,
  }));
}

function quarterOfMonth(month = "") {
  const monthNumber = Number(String(month).slice(5, 7));
  if (!monthNumber) return "Q1";
  return `Q${Math.floor((monthNumber - 1) / 3) + 1}`;
}

function shortPeriodLabel(period) {
  if (!period?.reportDate) return period?.label || "";
  return new Date(`${period.reportDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function comparisonRangeLabel(periodType, year, start, end) {
  const lower = String(start) <= String(end) ? start : end;
  const upper = String(start) <= String(end) ? end : start;
  if (periodType === "yearly") return lower === upper ? String(lower) : `${lower} to ${upper}`;
  if (periodType === "quarterly") return lower === upper ? `${lower} ${year}` : `${lower} to ${upper} ${year}`;
  return lower === upper ? monthLabel(lower) : `${monthLabel(lower)} to ${monthLabel(upper)}`;
}

function comparisonMetricValue(row, metric) {
  if (metric === "mos") return row.mos ?? 0;
  if (metric === "amc") return row.amc ?? 0;
  if (metric === "reporting") return row.expected ? (row.reported || 0) / row.expected : row.rows ? 1 : 0;
  return normalizeRate(row.availability);
}

function comparisonMetricLabel(metric) {
  if (metric === "mos") return "Months of stock";
  if (metric === "amc") return "AMC";
  if (metric === "reporting") return "Reporting rate";
  return "Availability";
}

function formatComparisonMetric(value, metric) {
  if (metric === "availability" || metric === "reporting") return formatPercent(value);
  if (metric === "mos") return formatMos(value);
  return Math.round(value || 0).toLocaleString();
}

function comparisonTone(value, metric) {
  if (metric === "amc") return "green";
  const normalized = metric === "mos" ? Math.min((value || 0) / 4, 1) : normalizeRate(value);
  if (normalized >= 0.8) return "green";
  if (normalized >= 0.6) return "amber";
  return "red";
}

function comparisonPeriodInRange(period, periodType, year, start, end) {
  const periodYear = String(period.month || "").slice(0, 4);
  if (periodType === "yearly") return periodYear >= String(start) && periodYear <= String(end);
  if (periodYear !== String(year)) return false;
  const value = periodType === "quarterly" ? quarterOfMonth(period.month) : String(period.month);
  const lower = String(start) <= String(end) ? String(start) : String(end);
  const upper = String(start) <= String(end) ? String(end) : String(start);
  return value >= lower && value <= upper;
}

function comparisonRowsForPeriod(period, filters) {
  const provinceFilter = (row) => filters.province === "all" || row.province === filters.province || row.name === filters.province;
  const districtFilter = (row) => filters.district === "all" || row.district === filters.district || row.name === filters.district;
  const facilityLevelFilter = (row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel);
  const programFilter = (row) => filters.program === "all" || row.name === filters.program || row.programme === filters.program || row.program === filters.program;
  const commodityFilter = (row) => filters.commodity === "all" || row.name === filters.commodity;

  if (filters.compareBy === "province") {
    return (period.provinces || [])
      .filter(provinceFilter)
      .map((row) => ({ ...row, group: row.name }));
  }
  if (filters.compareBy === "district") {
    return (period.districts || [])
      .filter(provinceFilter)
      .filter(districtFilter)
      .map((row) => ({ ...row, group: row.name }));
  }
  if (filters.compareBy === "commodity") {
    return (period.commodities || [])
      .filter(commodityFilter)
      .map((row) => ({ ...row, group: row.name }));
  }
  if (filters.compareBy === "program") {
    return (period.programmes || [])
      .filter(programFilter)
      .map((row) => ({ ...row, group: row.name }));
  }

  const selectedLevelLabel = filters.facilityLevel === "all" ? "" : facilityCareLevelLabel(filters.facilityLevel);
  const groups = careLevelBuckets.map((bucket) => {
    const facilities = (period.facilities || [])
      .filter(provinceFilter)
      .filter(districtFilter)
      .filter(facilityLevelFilter)
      .filter((facility) => careLevelBucket(facility.facilityLevel) === bucket.id);
    return {
      ...combineRollups(facilities, makeEmptyRollup(selectedLevelLabel || bucket.label)),
      name: selectedLevelLabel || bucket.label,
      group: selectedLevelLabel || bucket.label,
    };
  });
  return groups.filter((row) => row.rows > 0 || filters.facilityLevel === "all");
}

function aggregateComparisonRows(periods, filters) {
  const rows = periods.flatMap((period) => comparisonRowsForPeriod(period, filters));
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.group || row.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([name, values]) => ({
    ...combineRollups(values, makeEmptyRollup(name)),
    name,
    periods: values.length,
  }));
}

function qualityLevelGroup(type = "") {
  if (type === "Health Posts" || type === "Health Centres") return "Health Posts & Health Centres";
  return type;
}

function buildQualityLevelSections(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const level = qualityLevelGroup(row.type);
    if (!groups.has(level)) groups.set(level, new Map());
    const districtRows = groups.get(level);
    if (!districtRows.has(row.district)) {
      districtRows.set(row.district, { name: row.district, expected: 0, reported: 0, missing: 0 });
    }
    const district = districtRows.get(row.district);
    district.expected += row.expected || 0;
    district.reported += row.reported || 0;
    district.missing += row.missing || 0;
  });
  return [...groups.entries()].map(([level, districtMap]) => {
    const districts = [...districtMap.values()]
      .map((district) => ({
        ...district,
        rate: qualityRate(district),
        status: district.missing === 0 ? "Reported" : district.reported > 0 ? "Partial" : "Missing",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expected = districts.length;
    const reported = districts.filter((district) => district.status === "Reported").length;
    const partial = districts.filter((district) => district.status === "Partial").length;
    const missing = districts.filter((district) => district.status === "Missing").length;
    return {
      level,
      districts,
      expected,
      reported,
      partial,
      missing,
      rate: expected ? reported / expected : 0,
    };
  }).sort((a, b) => a.level.localeCompare(b.level));
}

function QualityLevelSection({ section }) {
  return (
    <div className="quality-level-section">
      <div className="quality-level-head">
        <div>
          <h3>{section.level}</h3>
          <p>{section.reported} reported, {section.partial} partial, {section.missing} missing out of {section.expected} expected districts</p>
        </div>
        <strong>{formatPercent(section.rate)}</strong>
      </div>
      <div className="table-scroll compact-table quality-level-table">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Expected</th>
              <th>Reported</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {section.districts.map((district) => (
              <tr key={`${section.level}-${district.name}`}>
                <td>{district.name}</td>
                <td><span className="quality-check expected">Yes</span></td>
                <td><span className={district.status === "Reported" ? "quality-check reported" : district.status === "Partial" ? "quality-check partial" : "quality-check missing"}>{district.status === "Reported" ? "Yes" : district.status === "Partial" ? "Partial" : "No"}</span></td>
                <td><span className={district.status === "Reported" ? "status-pill reported" : district.status === "Partial" ? "status-pill partial" : "status-pill missing"}>{district.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportingBars({ title, rows, onSelect }) {
  return (
    <div className="quality-panel">
      <div className="quality-panel-head">
        <h3>{title}</h3>
        <span>{rows.length} rows</span>
      </div>
      <div className="quality-bars">
        {rows.map((row) => (
          <button type="button" className="quality-bar-row" key={row.name} onClick={() => onSelect?.(row)}>
            <span>{row.name}</span>
            <div className="quality-bar-track"><i style={{ width: `${Math.min(100, Math.round((row.rate || qualityRate(row)) * 100))}%` }} /></div>
            <b>{formatPercent(row.rate || qualityRate(row))}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function QualityTable({ title, rows, firstColumn = "Name", onSelect }) {
  return (
    <div className="quality-panel">
      <div className="quality-panel-head">
        <h3>{title}</h3>
        <span>{rows.length} rows</span>
      </div>
      <div className="table-scroll compact-table">
        <table>
          <thead>
            <tr>
              <th>{firstColumn}</th>
              <th>Expected</th>
              <th>Reported</th>
              <th>Missing</th>
              <th>% Reporting</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.province || ""}-${row.district || ""}-${row.name || row.type}`}>
                <td>
                  {onSelect ? <button className="table-link" type="button" onClick={() => onSelect(row)}>{row.name || row.type}</button> : row.name || row.type}
                </td>
                <td>{(row.expected || 0).toLocaleString()}</td>
                <td>{(row.reported || 0).toLocaleString()}</td>
                <td>{(row.missing || 0).toLocaleString()}</td>
                <td>{formatPercent(row.rate || qualityRate(row))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FacilityCard({ facility, onOpen }) {
  const rows = facility.rows || 0;
  const availabilityPercent = formatPercent(facility.availability);
  const stockoutPercent = rows ? formatPercent((facility.stockoutItemCount || 0) / rows) : "0%";
  const lowStockPercent = rows ? formatPercent((facility.lowStockItemCount || 0) / rows) : "0%";
  return (
    <article>
      <div className="facility-alert-head">
        <div>
          <h4>
            <button className="facility-title-button" type="button" onClick={() => onOpen(facility)}>
              {facility.isAggregate ? `All ${facility.facilityLevel.toLowerCase()} facilities` : facility.name}
            </button>
          </h4>
          <span>{facility.district} | {facility.province} | {facility.facilityLevel}</span>
          {facility.isAggregate ? <small className="aggregate-note">Aggregate summary row. Load actual provincial tracer files to show named facilities under this level.</small> : null}
        </div>
        <div className="facility-alert-counts">
          <div className="availability-count">
            <b>{availabilityPercent}</b>
            <small>available</small>
          </div>
          <div>
            <b>{facility.stockoutItemCount}</b>
            <small>stockout</small>
            <em>{stockoutPercent}</em>
          </div>
          <div>
            <b>{facility.lowStockItemCount}</b>
            <small>low stock</small>
            <em>{lowStockPercent}</em>
          </div>
        </div>
      </div>
      <div className="facility-alert-items">
        <div>
          <strong>Stockout commodities</strong>
          {facility.stockoutItems?.length ? facility.stockoutItems.slice(0, 5).map((item, index) => (
            <span key={`stockout-${facility.name}-${item.item}-${index}`}>{item.item}<small>{item.program}</small></span>
          )) : <span>No stockouts submitted</span>}
        </div>
        <div>
          <strong>Low-stock commodities</strong>
          {facility.lowStockItems?.length ? facility.lowStockItems.slice(0, 5).map((item, index) => (
            <span key={`low-${facility.name}-${item.item}-${index}`}>{item.item}<small>{item.program} | MOS {formatMos(item.mos)}</small></span>
          )) : <span>No low-stock items submitted</span>}
        </div>
      </div>
      <button className="open-tracer-button" type="button" onClick={() => onOpen(facility)}>Open submitted tracer</button>
    </article>
  );
}

function TracerItemTable({ title, items, totalCount, emptyText }) {
  const shownCount = items.length;
  const countLabel = totalCount > shownCount ? `${shownCount} of ${totalCount}` : totalCount;
  return (
    <div>
      <h3>{title} <small>{countLabel}</small></h3>
      <div className="tracer-detail-table">
        <table>
          <thead><tr><th>Commodity</th><th>Programme</th><th>Qty</th><th>AMC</th><th>MOS</th></tr></thead>
          <tbody>
            {items.length ? items.map((item, index) => (
              <tr key={`${title}-${item.item}-${index}`}>
                <td>{item.item}</td>
                <td>{item.program}</td>
                <td>{item.quantity?.toLocaleString?.() ?? item.quantity}</td>
                <td>{item.amc?.toLocaleString?.() ?? item.amc}</td>
                <td>{formatMos(item.mos)}</td>
              </tr>
            )) : <tr><td colSpan="5">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FacilityTracerModal({ facility, report, onClose }) {
  if (!facility) return null;
  const relatedFacilities = report.facilities
    .filter((item) => item.province === facility.province)
    .filter((item) => item.district === facility.district)
    .filter((item) => item.facilityLevel === facility.facilityLevel)
    .filter((item) => !item.isAggregate)
    .sort((a, b) => b.stockoutItemCount - a.stockoutItemCount || b.lowStockItemCount - a.lowStockItemCount || a.name.localeCompare(b.name));
  const [modalMode, setModalMode] = useState("aggregate");
  const [selectedTracer, setSelectedTracer] = useState(null);
  const activeFacility = modalMode === "facility" && selectedTracer ? selectedTracer : facility;
  const title = activeFacility.isAggregate ? `All ${activeFacility.facilityLevel.toLowerCase()} facilities` : activeFacility.name;
  const stockoutItems = activeFacility.stockoutItems || [];
  const lowStockItems = activeFacility.lowStockItems || [];
  const accordingToPlanItems = activeFacility.accordingToPlanItems || [];
  const overstockItems = activeFacility.overstockItems || [];
  const accordingToPlanCount = activeFacility.accordingToPlanItemCount ?? accordingToPlanItems.length;
  const overstockCount = activeFacility.overstockItemCount ?? overstockItems.length;
  const lowStockCount = activeFacility.lowStockItemCount || 0;
  const stockoutCount = activeFacility.stockoutItemCount || 0;
  const statusTotal = activeFacility.rows || 0;
  const lowStockRows = (activeFacility.nearCritical || 0) + (activeFacility.understocked || 0);
  const overstockRows = (activeFacility.abovePlan || 0) + (activeFacility.overstock || 0);
  const statusRows = [
    { label: "Stockout", value: activeFacility.stockout || 0, tone: "red" },
    { label: "Low stock", value: lowStockRows, tone: "amber" },
    { label: "Stocked according to plan", value: activeFacility.accordingToPlan || 0, tone: "green" },
    { label: "Overstocked", value: overstockRows, tone: "blue" },
  ];
  const showBackButton = modalMode === "facility" || modalMode === "list";

  function goBack() {
    if (modalMode === "facility") {
      setModalMode("list");
      return;
    }
    setModalMode("aggregate");
    setSelectedTracer(null);
  }

  function exportTracerExcel() {
    const rows = [
      ["Report", report.label],
      ["Province", activeFacility.province],
      ["District", activeFacility.district],
      ["Facility level", activeFacility.facilityLevel],
      ["Reporting unit", title],
      ["Availability", formatPercent(activeFacility.availability)],
      ["Average MOS", formatMos(activeFacility.mos)],
      [],
      ["Status", "Commodity", "Programme", "Quantity", "AMC", "MOS"],
      ...[
        ["Stockout", stockoutItems],
        ["Low stock", lowStockItems],
        ["Stocked according to plan", accordingToPlanItems],
        ["Overstocked", overstockItems],
      ].flatMap(([status, items]) => items.map((item) => [
        status,
        item.item,
        item.program,
        item.quantity,
        item.amc,
        formatMos(item.mos),
      ])),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "submitted-tracer"}-${report.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Submitted tracer details">
      <div className="tracer-modal">
        <div className="modal-head">
          {showBackButton ? <button className="modal-back-button" type="button" onClick={goBack}>Back</button> : null}
          <div>
            <p className="eyebrow dark">Submitted Tracer</p>
            <h2>{title}</h2>
            <span>{activeFacility.district} | {activeFacility.province} | {activeFacility.facilityLevel} | {report.label}</span>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={() => window.print()}>Export PDF</button>
            <button type="button" onClick={exportTracerExcel}>Export Excel</button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        {facility.isAggregate ? (
          <div className="modal-switcher">
            <button className={modalMode === "aggregate" ? "active" : ""} type="button" onClick={() => {
              setModalMode("aggregate");
              setSelectedTracer(null);
            }}>
              Aggregate tracer summary
            </button>
            <button type="button" className={modalMode === "list" ? "active" : ""} onClick={() => setModalMode("list")}>
              Show individual facility tracers
            </button>
          </div>
        ) : null}
        {modalMode === "list" ? (
          <div className="individual-tracer-panel">
            <div className="modal-warning">
              These are the named {facility.facilityLevel.toLowerCase()} submissions available for {facility.district}. Select a facility to open its submitted tracer in this same window.
            </div>
            <div className="individual-facility-list">
              {relatedFacilities.length ? relatedFacilities.map((item) => (
                <button type="button" key={`${item.province}-${item.district}-${item.facilityLevel}-${item.name}`} onClick={() => {
                  setSelectedTracer(item);
                  setModalMode("facility");
                }}>
                  <strong>{item.name}</strong>
                  <span>{formatPercent(item.availability)} availability | MOS {formatMos(item.mos)}</span>
                  <small>{item.stockoutItemCount} stockout | {item.lowStockItemCount} low stock</small>
                </button>
              )) : <div className="empty-state">No named facilities are available yet for this district and level. The uploaded tracer currently contains only the aggregate row.</div>}
            </div>
          </div>
        ) : (
          <>
            {facility.isAggregate && modalMode === "aggregate" ? (
              <div className="modal-warning">
                This is the aggregate submitted tracer for all {facility.facilityLevel.toLowerCase()} facilities in {facility.district}. The percentages below show the overall drug status across the submitted rows before you drill into named facilities.
              </div>
            ) : null}
            {modalMode === "facility" ? (
              <div className="modal-warning">
                Showing named facility tracer. Use the Back button above to return to the facility list.
              </div>
            ) : null}
            <div className="modal-kpis">
              <KpiCard label="Availability" value={formatPercent(activeFacility.availability)} sub={`${activeFacility.rows.toLocaleString()} submitted rows`} />
              <KpiCard label="Average MOS" value={formatMos(activeFacility.mos)} sub="Submitted stock position" />
              <KpiCard label="Stockout items" value={stockoutCount} sub="MOS at or near zero" tone="red" />
              <KpiCard label="Low-stock items" value={lowStockCount} sub="Below 2 MOS" tone="amber" />
              <KpiCard label="Stocked to plan" value={accordingToPlanCount} sub="2 to 4 MOS" />
              <KpiCard label="Overstocked items" value={overstockCount} sub="Above 4 MOS" tone="blue" />
            </div>
            <div className="stock-status-strip">
              {statusRows.map((row) => (
                <div className={`stock-status stock-status-${row.tone}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{statusTotal ? formatPercent(row.value / statusTotal) : "0%"}</strong>
                  <small>{row.value.toLocaleString()} of {statusTotal.toLocaleString()} rows</small>
                </div>
              ))}
            </div>
            <div className="tracer-detail-grid">
              <TracerItemTable title="Stockout commodities" items={stockoutItems} totalCount={stockoutCount} emptyText="No stockout commodities submitted." />
              <TracerItemTable title="Low-stock commodities" items={lowStockItems} totalCount={lowStockCount} emptyText="No low-stock commodities submitted." />
              <TracerItemTable title="Stocked according to plan" items={accordingToPlanItems} totalCount={accordingToPlanCount} emptyText="No commodities submitted between 2 and 4 MOS." />
              <TracerItemTable title="Overstocked commodities" items={overstockItems} totalCount={overstockCount} emptyText="No commodities submitted above 4 MOS." />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState("executive");
  const [fieldPeriodId, setFieldPeriodId] = useState(tracerReportingPeriods.at(-1).id);
  const [selectedProvince, setSelectedProvince] = useState("all");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedFacilityLevel, setSelectedFacilityLevel] = useState("all");
  const [selectedFacility, setSelectedFacility] = useState("all");
  const [openFacility, setOpenFacility] = useState(null);
  const [stockDate, setStockDate] = useState([...new Set(weeklyStockPeriods.map((period) => period.date))].sort().at(-1) || "");
  const [stockStream, setStockStream] = useState(weeklyStockPeriods.some((period) => period.stream === "EMMS") ? "EMMS" : weeklyStockPeriods.at(-1)?.stream || "LAB");
  const [stockCategory, setStockCategory] = useState("");
  const [reportPeriodId, setReportPeriodId] = useState(tracerReportingPeriods.at(-1).id);
  const [reportProvince, setReportProvince] = useState("all");
  const [reportDistrict, setReportDistrict] = useState("all");
  const [reportFacilityType, setReportFacilityType] = useState("all");
  const [reportStatus, setReportStatus] = useState("all");
  const [reportDrillProvince, setReportDrillProvince] = useState("");
  const [reportDrillDistrict, setReportDrillDistrict] = useState("");
  const [comparisonPeriodType, setComparisonPeriodType] = useState("monthly");
  const [comparisonYear, setComparisonYear] = useState("2026");
  const [comparisonBaselineStart, setComparisonBaselineStart] = useState(() => [...new Set(tracerReportingPeriods.map((period) => period.month))].at(-2) || tracerReportingPeriods.at(-1).month);
  const [comparisonBaselineEnd, setComparisonBaselineEnd] = useState(() => [...new Set(tracerReportingPeriods.map((period) => period.month))].at(-2) || tracerReportingPeriods.at(-1).month);
  const [comparisonRangeStart, setComparisonRangeStart] = useState(() => tracerReportingPeriods.at(-1).month);
  const [comparisonRangeEnd, setComparisonRangeEnd] = useState(() => tracerReportingPeriods.at(-1).month);
  const [comparisonProvince, setComparisonProvince] = useState("all");
  const [comparisonDistrict, setComparisonDistrict] = useState("all");
  const [comparisonFacilityLevel, setComparisonFacilityLevel] = useState("all");
  const [comparisonCommodity, setComparisonCommodity] = useState("all");
  const [comparisonProgram, setComparisonProgram] = useState("all");
  const [comparisonCompareBy, setComparisonCompareBy] = useState("level");
  const [comparisonMetric, setComparisonMetric] = useState("availability");
  const [query, setQuery] = useState("");
  const [selectedCommodity, setSelectedCommodity] = useState("");
  const [commodityOptionPage, setCommodityOptionPage] = useState(1);
  const [commodityStatusFilter, setCommodityStatusFilter] = useState("all");
  const [commodityFacilityQuery, setCommodityFacilityQuery] = useState("");
  const [commoditySort, setCommoditySort] = useState("mos");
  const [commodityPage, setCommodityPage] = useState(1);
  const [commodityPageSize, setCommodityPageSize] = useState(25);
  const [openCommodityFacility, setOpenCommodityFacility] = useState(null);
  const [qualityRangeStart, setQualityRangeStart] = useState("2026-01");
  const [qualityRangeEnd, setQualityRangeEnd] = useState("2026-06");
  const [qualityGranularity, setQualityGranularity] = useState("month");
  const [qualityProvinceFilter, setQualityProvinceFilter] = useState("all");
  const [qualityDistrictFilter, setQualityDistrictFilter] = useState("all");
  const [qualityFacilityLevelFilter, setQualityFacilityLevelFilter] = useState("all");
  const [qualityStatusFilter, setQualityStatusFilter] = useState("non-reporting");
  const [qualitySearch, setQualitySearch] = useState("");
  const [qualityTablePage, setQualityTablePage] = useState(1);
  const [qualityPointFilter, setQualityPointFilter] = useState("all");
  const [openReportingFacility, setOpenReportingFacility] = useState(null);
  const [actions, setActions] = useState([
    { id: 1, issue: "Facility stockouts in highest-risk reporting units", action: "Validate counts and initiate redistribution", owner: "Provincial pharmacist", status: "In progress" },
    { id: 2, issue: "Low-stock commodities below 2 MOS", action: "Prioritize replenishment before stockout", owner: "District pharmacist", status: "Open" },
    { id: 3, issue: "Missing or inconsistent tracer submissions", action: "Send data-quality queries to reporting teams", owner: "NSCCU", status: "Open" },
    { id: 4, issue: "Programme-level understocking", action: "Review affected facilities with programme managers", owner: "Control Tower", status: "In progress" },
  ]);

  const fieldData = tracerReportingPeriods.find((period) => period.id === fieldPeriodId) || tracerReportingPeriods.at(-1);
  const activePageLabel = dashboardPages.find((page) => page.id === activePage)?.label;
  const fieldMonths = [...new Set(tracerReportingPeriods.map((period) => period.month))];
  const selectedMonth = fieldData.month;
  const weeksInMonth = tracerReportingPeriods.filter((period) => period.month === selectedMonth);
  const stockStreams = [...new Set(weeklyStockPeriods.map((period) => period.stream))].sort();
  const stockTrendRows = weeklyStockPeriods
    .filter((period) => period.stream === stockStream)
    .sort((a, b) => a.date.localeCompare(b.date));
  const stockDates = stockTrendRows.map((period) => ({ date: period.date, label: period.label }));
  const stockData = stockTrendRows.find((period) => period.date === stockDate) || stockTrendRows.at(-1);
  const currentStockPeriod = weeklyStockPeriods.find((period) => period.date === stockData?.date && period.stream === stockData?.stream);
  const previousStockPeriod = weeklyStockPeriods
    .filter((period) => period.stream === stockStream && period.date < (stockData?.date || ""))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const stockChange = stockChangeRows(currentStockPeriod, previousStockPeriod) || { from: stockData?.label || "", to: stockData?.label || "", newlyUnavailable: [], recovered: [] };
  const stockCategoryRows = stockData ? stockCategoryRowsFor(stockData).sort((a, b) => b.availability - a.availability || a.name.localeCompare(b.name)) : [];
  const stockItemRows = currentStockPeriod?.items ? [...currentStockPeriod.items].sort((a, b) => a.availability - b.availability || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) : [];
  const stockoutItemRows = stockItemRows.filter((item) => item.availability <= 0).slice(0, 80);
  const selectedStockCategory = stockCategory || stockCategoryRows[0]?.name || "";
  const selectedStockItems = currentStockPeriod?.items
    ? currentStockPeriod.items
      .filter((item) => item.category === selectedStockCategory)
      .sort((a, b) => a.availability - b.availability || a.name.localeCompare(b.name))
    : [];
  const reportData = tracerReportingPeriods.find((period) => period.id === reportPeriodId) || tracerReportingPeriods.at(-1);
  const reportBaseRows = (reportData.dataQuality?.facilityTypes || [])
    .map((row) => ({
      ...row,
      facilityType: reportingFacilityLabel(row.type),
      facilityName: `${row.district} ${reportingFacilityLabel(row.type)} reporting unit`,
      status: reportingStatus(row),
      rate: qualityRate(row),
      notReported: row.missing || 0,
      lastReportingPeriod: (row.reported || 0) > 0 ? reportData.label : "-",
    }));
  const reportFacilityTypeOptions = [...new Set(reportBaseRows.map((row) => row.facilityType))].sort();
  const reportProvinceOptions = [...new Set(reportBaseRows.map((row) => row.province))].sort();
  const reportDistrictOptions = [...new Set(reportBaseRows
    .filter((row) => reportProvince === "all" || row.province === reportProvince)
    .map((row) => row.district))].sort();
  const reportingRows = reportBaseRows
    .filter((row) => reportProvince === "all" || row.province === reportProvince)
    .filter((row) => reportDistrict === "all" || row.district === reportDistrict)
    .filter((row) => reportFacilityType === "all" || row.facilityType === reportFacilityType)
    .filter((row) => reportStatus === "all" || row.status === reportStatus);
  const reportingKpis = reportingRows.reduce((acc, row) => {
    acc.expected += row.expected || 0;
    acc.reported += row.reported || 0;
    acc.notReported += row.notReported || 0;
    return acc;
  }, { expected: 0, reported: 0, notReported: 0 });
  reportingKpis.rate = reportingKpis.expected ? reportingKpis.reported / reportingKpis.expected : 0;
  const reportingProvinceRows = aggregateQualityRows(reportingRows, "province", "name")
    .sort((a, b) => a.name.localeCompare(b.name));
  const reportingDistrictRows = aggregateQualityRows(
    reportingRows.filter((row) => (reportDrillProvince || reportProvince) === "all" || row.province === (reportDrillProvince || reportProvince)),
    "district",
    "name",
  ).sort((a, b) => a.name.localeCompare(b.name));
  const reportingChartRows = reportDrillProvince ? reportingDistrictRows : reportingProvinceRows;
  const reportingFacilityRows = reportingRows
    .filter((row) => !reportDrillProvince || row.province === reportDrillProvince)
    .filter((row) => !reportDrillDistrict || row.district === reportDrillDistrict)
    .sort((a, b) => a.province.localeCompare(b.province) || a.district.localeCompare(b.district) || a.facilityType.localeCompare(b.facilityType));

  const provinceOptions = fieldData.provinces.map((province) => province.name).sort();
  const districtOptions = [...new Set(fieldData.districts
    .filter((district) => selectedProvince === "all" || district.province === selectedProvince)
    .map((district) => district.name))].sort();
  const facilityLevelOptions = facilityCareLevelOptions;
  const facilityOptions = selectedDistrict === "all" ? [] : fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => facility.district === selectedDistrict)
    .filter((facility) => matchesFacilityCareLevel(facility.facilityLevel, selectedFacilityLevel))
    .map((facility) => `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`)
    .sort();

  const filteredFacilities = fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => selectedDistrict === "all" || facility.district === selectedDistrict)
    .filter((facility) => matchesFacilityCareLevel(facility.facilityLevel, selectedFacilityLevel))
    .filter((facility) => selectedFacility === "all" || `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}` === selectedFacility);

  const fieldKpis = combineRollups(filteredFacilities, fieldData.national);
  const scopedProvinceRows = aggregateRollups(filteredFacilities, "province")
    .sort((a, b) => b.availability - a.availability || b.rows - a.rows);
  const scopedDistrictRows = aggregateRollups(filteredFacilities, "district")
    .sort((a, b) => b.riskRows - a.riskRows || a.availability - b.availability);
  const levelOfCareRows = careLevelBuckets.map((bucket) => {
    const facilities = filteredFacilities.filter((facility) => careLevelBucket(facility.facilityLevel) === bucket.id);
    return {
      ...combineRollups(facilities, makeEmptyRollup(bucket.label)),
      id: bucket.id,
      label: bucket.label,
      facilityLevels: [...new Set(facilities.map((facility) => facility.facilityLevel))].sort(),
      facilityNames: [...new Set(facilities
        .filter((facility) => !facility.isAggregate)
        .map((facility) => facility.name))].sort(),
    };
  }).filter((row) => selectedProvince === "all" || row.rows > 0);
  const bestProvince = scopedProvinceRows[0];
  const worstProvince = [...scopedProvinceRows].sort((a, b) => a.availability - b.availability || b.riskRows - a.riskRows)[0];
  const stockoutFacilityCount = filteredFacilities.filter((facility) => facility.stockoutItemCount > 0).length;
  const lowStockFacilityCount = filteredFacilities.filter((facility) => facility.lowStockItemCount > 0).length;
  const redistributionCandidates = buildRedistributionCandidates(filteredFacilities);
  const redistributionProvinceCount = new Set(redistributionCandidates.map((item) => item.province)).size;
  const facilityAlerts = filteredFacilities
    .filter((facility) => facility.stockoutItemCount > 0 || facility.lowStockItemCount > 0)
    .sort((a, b) => Number(a.isAggregate) - Number(b.isAggregate) || b.stockoutItemCount - a.stockoutItemCount || b.lowStockItemCount - a.lowStockItemCount)
    .slice(0, 48);
  const districtsInScope = scopedDistrictRows;

  const commodityScopeRows = useMemo(() => commodityRowsFromPeriod(fieldData)
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
    .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel))
    .filter((row) => selectedFacility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === selectedFacility), [fieldData, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const commodityOptions = useMemo(() => [...new Set(commodityScopeRows.map((row) => row.item))].filter(Boolean).sort(compareText), [commodityScopeRows]);
  const commodityMatches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return commodityOptions.filter((item) => !search || item.toLowerCase().includes(search));
  }, [commodityOptions, query]);
  const commodityOptionPageCount = Math.max(1, Math.ceil(commodityMatches.length / 10));
  const visibleCommodityMatches = commodityMatches.slice((Math.min(commodityOptionPage, commodityOptionPageCount) - 1) * 10, Math.min(commodityOptionPage, commodityOptionPageCount) * 10);
  const selectedCommodityRows = useMemo(() => {
    if (!selectedCommodity) return [];
    const grouped = new Map();
    commodityScopeRows.filter((row) => row.item === selectedCommodity).forEach((row) => {
      const key = `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`;
      const current = grouped.get(key) || { ...row, quantity: 0, amc: 0, mosValues: [] };
      current.quantity += row.quantity || 0;
      current.amc += row.amc || 0;
      if (row.mos !== null) current.mosValues.push(row.mos);
      grouped.set(key, current);
    });
    return [...grouped.values()].map((row) => ({
      ...row,
      mos: row.amc > 0 ? row.quantity / row.amc : (row.mosValues.length ? row.mosValues.reduce((sum, value) => sum + value, 0) / row.mosValues.length : null),
      reportingStatus: "Reported",
    }));
  }, [commodityScopeRows, selectedCommodity]);
  const selectedCommodityProgramme = selectedCommodityRows[0]?.programme || "Not submitted";
  const commodityStatusCounts = selectedCommodityRows.reduce((counts, row) => {
    const status = commodityStockStatus(row.mos);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const commodityAvailableCount = selectedCommodityRows.filter((row) => row.quantity > 0).length;
  const commodityAverageMos = selectedCommodityRows.length ? selectedCommodityRows.reduce((sum, row) => sum + (row.mos || 0), 0) / selectedCommodityRows.length : 0;
  const commodityTotalSoh = selectedCommodityRows.reduce((sum, row) => sum + row.quantity, 0);
  const commodityTotalAmc = selectedCommodityRows.reduce((sum, row) => sum + row.amc, 0);
  const commodityFacilityRows = useMemo(() => selectedCommodityRows
    .filter((row) => commodityStatusFilter === "all" || commodityStockStatus(row.mos) === commodityStatusFilter)
    .filter((row) => !commodityFacilityQuery.trim() || `${row.facility} ${row.district} ${row.province}`.toLowerCase().includes(commodityFacilityQuery.trim().toLowerCase()))
    .sort((a, b) => {
      if (commoditySort === "facility") return compareText(a.facility, b.facility);
      if (commoditySort === "province") return compareText(a.province, b.province) || compareText(a.district, b.district);
      if (commoditySort === "stock") return b.quantity - a.quantity;
      if (commoditySort === "status") return compareText(commodityStockStatus(a.mos), commodityStockStatus(b.mos));
      return (a.mos ?? -1) - (b.mos ?? -1);
    }), [selectedCommodityRows, commodityStatusFilter, commodityFacilityQuery, commoditySort]);
  const commodityPageCount = Math.max(1, Math.ceil(commodityFacilityRows.length / commodityPageSize));
  const commodityVisibleRows = commodityFacilityRows.slice((Math.min(commodityPage, commodityPageCount) - 1) * commodityPageSize, Math.min(commodityPage, commodityPageCount) * commodityPageSize);
  const commodityTrendRows = useMemo(() => !selectedCommodity ? [] : tracerReportingPeriods.map((period) => {
    const rows = commodityRowsFromPeriod(period)
      .filter((row) => row.item === selectedCommodity)
      .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
      .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict)
      .filter((row) => matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel));
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const amc = rows.reduce((sum, row) => sum + row.amc, 0);
    return { label: period.label, reportDate: period.reportDate, availability: rows.length ? rows.filter((row) => row.quantity > 0).length / rows.length : 0, mos: amc > 0 ? quantity / amc : 0, rows: rows.length };
  }), [selectedCommodity, selectedProvince, selectedDistrict, selectedFacilityLevel]);
  const commodityTrendVisibleRows = commodityTrendRows.slice(-12);
  const commodityTrendMosScale = Math.max(4, Math.ceil(Math.max(0, ...commodityTrendVisibleRows.map((row) => row.mos || 0))));
  const commodityTrendMosPoints = commodityTrendVisibleRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(commodityTrendVisibleRows.length, 1)) * 100;
    const y = 100 - Math.min((row.mos || 0) / commodityTrendMosScale, 1) * 100;
    return `${x},${y}`;
  }).join(" ");
  const commodityProvinceRows = commodityGroupRows(selectedCommodityRows, "province");
  const commodityDistrictRows = commodityGroupRows(selectedCommodityRows, "district");
  const commodityLevelRows = commodityGroupRows(selectedCommodityRows, "facilityLevel");
  const commodityFacilityHistory = useMemo(() => !openCommodityFacility ? [] : tracerReportingPeriods
    .map((period) => {
      const row = commodityRowsFromPeriod(period).find((item) => item.item === selectedCommodity
        && item.province === openCommodityFacility.province
        && item.district === openCommodityFacility.district
        && item.facilityLevel === openCommodityFacility.facilityLevel
        && item.facility === openCommodityFacility.facility);
      return row ? { ...row, label: period.label, reportDate: period.reportDate } : null;
    })
    .filter(Boolean), [openCommodityFacility, selectedCommodity]);

  const comments = fieldData.comments || [];
  const expectedProvinces = 10;
  const reportingRate = expectedProvinces ? fieldData.counts.provinces / expectedProvinces : 0;
  const expectedDistricts = fieldData.counts.expectedDistricts || fieldData.counts.districts;
  const expectedFacilityUnits = fieldData.counts.expectedLevelReports || fieldData.counts.expectedFacilityUnits || fieldData.counts.facilityUnits;
  const missingDistricts = fieldData.counts.missingDistricts || 0;
  const missingFacilityUnits = fieldData.counts.missingFacilityUnits || 0;
  const dataQuality = fieldData.dataQuality || { provinces: [], districts: [], facilityTypes: [] };
  const qualityMonths = [...new Set(tracerReportingPeriods.map((period) => period.month))].sort();
  const qualityRangeLower = qualityRangeStart <= qualityRangeEnd ? qualityRangeStart : qualityRangeEnd;
  const qualityRangeUpper = qualityRangeStart <= qualityRangeEnd ? qualityRangeEnd : qualityRangeStart;
  const qualityRangePeriods = tracerReportingPeriods.filter((period) => period.month >= qualityRangeLower && period.month <= qualityRangeUpper);
  const qualityRoster = qualityRangePeriods[0]?.dataQuality?.facilities || [];
  const qualityProvinceOptions = [...new Set(qualityRoster.map((row) => row.province))].sort();
  const qualityDistrictOptions = [...new Set(qualityRoster
    .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
    .map((row) => row.district))].sort();
  const qualityFacilityLevelOptions = [...new Set(qualityRoster
    .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
    .filter((row) => qualityDistrictFilter === "all" || row.district === qualityDistrictFilter)
    .map((row) => row.facilityLevel))].sort();
  const qualityPeriodFacilityMaps = useMemo(() => new Map(qualityRangePeriods.map((period) => [period.id, new Map((period.dataQuality?.facilities || []).map((row) => [`${row.province}|${row.district}|${row.facilityLevel}|${row.name}`, row]))])), [qualityRangePeriods]);
  const qualityFacilityHistories = useMemo(() => qualityRoster
    .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
    .filter((row) => qualityDistrictFilter === "all" || row.district === qualityDistrictFilter)
    .filter((row) => qualityFacilityLevelFilter === "all" || row.facilityLevel === qualityFacilityLevelFilter)
    .map((facility) => {
      const key = `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`;
      const history = qualityRangePeriods.map((period) => {
        const row = qualityPeriodFacilityMaps.get(period.id)?.get(key);
        return { id: period.id, month: period.month, label: period.label, expected: true, reported: Boolean(row?.reported) };
      });
      const reports = history.filter((row) => row.reported).length;
      const missed = history.length - reports;
      const consistency = reportingConsistency(history);
      return {
        ...facility,
        history,
        expectedReports: history.length,
        reportsSubmitted: reports,
        missedReports: missed,
        rate: history.length ? reports / history.length : 0,
        consistency,
        consecutiveMissed: longestMissedRun(history),
        latestReport: [...history].reverse().find((row) => row.reported)?.label || "No successful report",
      };
    }), [qualityRoster, qualityRangePeriods, qualityPeriodFacilityMaps, qualityProvinceFilter, qualityDistrictFilter, qualityFacilityLevelFilter]);
  const qualityTrendRows = useMemo(() => {
    const groups = new Map();
    qualityRangePeriods.forEach((period) => {
      const key = qualityGranularity === "month" ? period.month : period.id;
      const current = groups.get(key) || { id: key, label: qualityGranularity === "month" ? monthLabel(period.month) : period.label, expected: 0, reported: 0 };
      qualityFacilityHistories.forEach((facility) => {
        const history = facility.history.find((row) => row.id === period.id);
        if (history?.expected) {
          current.expected += 1;
          current.reported += history.reported ? 1 : 0;
        }
      });
      groups.set(key, current);
    });
    return [...groups.values()].map((row) => ({ ...row, missing: row.expected - row.reported, rate: row.expected ? row.reported / row.expected : 0 }));
  }, [qualityRangePeriods, qualityFacilityHistories, qualityGranularity]);
  const qualitySummary = qualityFacilityHistories.reduce((summary, facility) => {
    summary.expected += facility.expectedReports;
    summary.reported += facility.reportsSubmitted;
    summary.missing += facility.missedReports;
    summary.consistent += facility.consistency === "Fully reported" ? 1 : 0;
    summary.irregular += ["Irregular reporting", "Persistent non-reporting", "No reporting"].includes(facility.consistency) ? 1 : 0;
    return summary;
  }, { expected: 0, reported: 0, missing: 0, consistent: 0, irregular: 0 });
  qualitySummary.rate = qualitySummary.expected ? qualitySummary.reported / qualitySummary.expected : 0;
  const lowestQualityPoint = [...qualityTrendRows].sort((a, b) => a.rate - b.rate)[0];
  const qualityDistrictTrendRows = aggregateQualityRows(qualityFacilityHistories.map((row) => ({ ...row, expected: row.expectedReports, reported: row.reportsSubmitted, missing: row.missedReports })), "district")
    .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  const qualityLevelTrendRows = aggregateQualityRows(qualityFacilityHistories.map((row) => ({ ...row, expected: row.expectedReports, reported: row.reportsSubmitted, missing: row.missedReports, level: row.facilityLevel })), "level")
    .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  const nonReportingFacilityRows = qualityFacilityHistories
    .filter((row) => qualityStatusFilter === "all" || (qualityStatusFilter === "non-reporting" ? row.missedReports > 0 : row.consistency === qualityStatusFilter))
    .filter((row) => qualityPointFilter === "all" || row.history.some((item) => (qualityGranularity === "month" ? item.month === qualityPointFilter : item.id === qualityPointFilter) && !item.reported))
    .filter((row) => !qualitySearch.trim() || `${row.name} ${row.district} ${row.province}`.toLowerCase().includes(qualitySearch.trim().toLowerCase()))
    .sort((a, b) => b.missedReports - a.missedReports || a.rate - b.rate || compareText(a.name, b.name));
  const qualityTablePageCount = Math.max(1, Math.ceil(nonReportingFacilityRows.length / 10));
  const qualityTableCurrentPage = Math.min(qualityTablePage, qualityTablePageCount);
  const visibleNonReportingFacilityRows = nonReportingFacilityRows.slice((qualityTableCurrentPage - 1) * 10, qualityTableCurrentPage * 10);
  const qualityTrendPoints = qualityTrendRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(qualityTrendRows.length, 1)) * 100;
    const y = 100 - normalizeRate(row.rate) * 100;
    return `${x},${y}`;
  }).join(" ");
  const provinceQualityRows = dataQuality.provinces || [];
  const selectedProvinceQuality = selectedProvince === "all"
    ? null
    : provinceQualityRows.find((row) => row.name === selectedProvince);
  const districtQualityRows = (dataQuality.districts || [])
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince);
  const provinceLevelRows = selectedProvince === "all"
    ? []
    : (dataQuality.facilityTypes || []).filter((row) => row.province === selectedProvince);
  const qualityLevelSections = buildQualityLevelSections(provinceLevelRows);
  const bottomDistrictRows = [...districtQualityRows].sort((a, b) => (a.rate || qualityRate(a)) - (b.rate || qualityRate(b)) || b.missing - a.missing).slice(0, 10);
  const topDistrictRows = [...districtQualityRows].sort((a, b) => (b.rate || qualityRate(b)) - (a.rate || qualityRate(a)) || a.missing - b.missing).slice(0, 10);
  const stockStatusTotal = fieldKpis.rows || 1;
  const stockStatusRows = [
    { label: "Stocked out", count: fieldKpis.stockout, rate: fieldKpis.stockout / stockStatusTotal, sub: "MOS at or near zero", tone: "red" },
    { label: "Emergency", count: fieldKpis.nearCritical, rate: fieldKpis.nearCritical / stockStatusTotal, sub: "Below 1 MOS", tone: "amber" },
    { label: "Understocked", count: fieldKpis.understocked, rate: fieldKpis.understocked / stockStatusTotal, sub: "1 to below 2 MOS", tone: "amber" },
    { label: "According to plan", count: fieldKpis.accordingToPlan, rate: fieldKpis.accordingToPlan / stockStatusTotal, sub: "2 to 4 MOS", tone: "green" },
    { label: "Overstocked", count: fieldKpis.abovePlan + fieldKpis.overstock, rate: (fieldKpis.abovePlan + fieldKpis.overstock) / stockStatusTotal, sub: "Above 4 MOS", tone: "blue" },
  ];
  const scopedProgrammeRows = (fieldData.programmeScopes || fieldData.programmes || [])
    .filter((row) => !row.province || selectedProvince === "all" || row.province === selectedProvince)
    .filter((row) => !row.district || selectedDistrict === "all" || row.district === selectedDistrict)
    .filter((row) => !row.facilityLevel || matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel));
  const productCategoryRows = aggregateRollups(scopedProgrammeRows, "name")
    .sort((a, b) => a.availability - b.availability || (a.mos || 0) - (b.mos || 0))
    .slice(0, 36);
  const programmePressureRows = aggregateRollups(scopedProgrammeRows, "name")
    .sort((a, b) => b.riskRows - a.riskRows || a.availability - b.availability)
    .slice(0, 12);
  const comparisonYears = [...new Set(tracerReportingPeriods.map((period) => String(period.month).slice(0, 4)))].sort();
  const comparisonMonths = [...new Set(tracerReportingPeriods
    .filter((period) => String(period.month).startsWith(comparisonYear))
    .map((period) => period.month))].sort();
  const comparisonRangeOptions = comparisonPeriodType === "monthly"
    ? comparisonMonths.map((month) => ({ value: month, label: monthLabel(month) }))
    : comparisonPeriodType === "quarterly"
      ? ["Q1", "Q2", "Q3", "Q4"].map((quarter) => ({ value: quarter, label: quarter }))
      : comparisonYears.map((year) => ({ value: year, label: year }));
  const comparisonDistrictOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.districts || [])
    .filter((row) => comparisonProvince === "all" || row.province === comparisonProvince)
    .map((row) => row.name))].sort();
  const comparisonFacilityLevelOptions = facilityCareLevelOptions;
  const comparisonCommodityOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.commodities || []).map((row) => row.name))]
    .filter(Boolean)
    .sort(compareText)
    .slice(0, 600);
  const comparisonProgramOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.programmes || []).map((row) => row.name))]
    .filter(Boolean)
    .sort(compareText);
  const comparisonFilters = {
    province: comparisonProvince,
    district: comparisonDistrict,
    facilityLevel: comparisonFacilityLevel,
    commodity: comparisonCommodity,
    program: comparisonProgram,
    compareBy: comparisonCompareBy,
  };
  const comparisonPeriods = tracerReportingPeriods
    .filter((period) => comparisonPeriodInRange(period, comparisonPeriodType, comparisonYear, comparisonRangeStart, comparisonRangeEnd))
    .sort((a, b) => compareText(a.reportDate, b.reportDate));
  const previousComparisonPeriods = tracerReportingPeriods
    .filter((period) => comparisonPeriodInRange(period, comparisonPeriodType, comparisonYear, comparisonBaselineStart, comparisonBaselineEnd))
    .sort((a, b) => compareText(a.reportDate, b.reportDate));
  const comparisonRows = aggregateComparisonRows(comparisonPeriods, comparisonFilters)
    .sort((a, b) => comparisonMetricValue(b, comparisonMetric) - comparisonMetricValue(a, comparisonMetric) || compareText(a.name, b.name));
  const previousComparisonRows = aggregateComparisonRows(previousComparisonPeriods, comparisonFilters);
  const comparisonCurrent = combineRollups(comparisonRows, makeEmptyRollup("Current comparison"));
  const comparisonPrevious = combineRollups(previousComparisonRows, makeEmptyRollup("Previous comparison"));
  const comparisonDelta = comparisonMetricValue(comparisonCurrent, comparisonMetric) - comparisonMetricValue(comparisonPrevious, comparisonMetric);
  const comparisonBest = comparisonRows[0] || makeEmptyRollup("No data");
  const comparisonWorst = comparisonRows.at(-1) || makeEmptyRollup("No data");
  const comparisonGap = comparisonMetricValue(comparisonBest, comparisonMetric) - comparisonMetricValue(comparisonWorst, comparisonMetric);
  const comparisonCurrentLabel = comparisonRangeLabel(comparisonPeriodType, comparisonYear, comparisonRangeStart, comparisonRangeEnd);
  const comparisonPreviousLabel = comparisonRangeLabel(comparisonPeriodType, comparisonYear, comparisonBaselineStart, comparisonBaselineEnd);
  const comparisonPreviousByName = new Map(previousComparisonRows.map((row) => [row.name, row]));
  const comparisonCareOrder = new Map(careLevelBuckets.map((bucket, index) => [bucket.label, index]));
  const comparisonExecutiveRows = [...comparisonRows]
    .sort((a, b) => {
      if (comparisonCompareBy !== "level") return comparisonMetricValue(b, comparisonMetric) - comparisonMetricValue(a, comparisonMetric);
      return (comparisonCareOrder.get(a.name) ?? 99) - (comparisonCareOrder.get(b.name) ?? 99);
    })
    .slice(0, comparisonCompareBy === "level" ? 4 : 8)
    .map((current) => ({
      name: current.name,
      current,
      previous: comparisonPreviousByName.get(current.name) || makeEmptyRollup(current.name),
    }));
  const comparisonMosScale = Math.max(
    4,
    Math.ceil(Math.max(0, ...comparisonExecutiveRows.flatMap((row) => [row.current.mos || 0, row.previous.mos || 0]))),
  );
  const comparisonPreviousMosPoints = comparisonExecutiveRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(comparisonExecutiveRows.length, 1)) * 100;
    const y = 100 - Math.min((row.previous.mos || 0) / comparisonMosScale, 1) * 100;
    return `${x},${y}`;
  }).join(" ");
  const comparisonCurrentMosPoints = comparisonExecutiveRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(comparisonExecutiveRows.length, 1)) * 100;
    const y = 100 - Math.min((row.current.mos || 0) / comparisonMosScale, 1) * 100;
    return `${x},${y}`;
  }).join(" ");
  const comparisonAvailabilityDeltaPoints = (normalizeRate(comparisonCurrent.availability) - normalizeRate(comparisonPrevious.availability)) * 100;
  const comparisonMosDelta = (comparisonCurrent.mos || 0) - (comparisonPrevious.mos || 0);
  const comparisonTakeaways = [...comparisonExecutiveRows]
    .map((row) => ({
      name: row.name,
      delta: (normalizeRate(row.current.availability) - normalizeRate(row.previous.availability)) * 100,
      availability: normalizeRate(row.current.availability),
    }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  const comparisonTrendGroups = comparisonRows.slice(0, 5).map((row) => row.name);
  const comparisonCommodityRows = aggregateRollups(comparisonPeriods.flatMap((period) => period.commodities || []), "name")
    .filter((row) => comparisonCommodity === "all" || row.name === comparisonCommodity)
    .sort((a, b) => a.availability - b.availability || b.riskRows - a.riskRows)
    .slice(0, 60);
  const comparisonInsights = [
    `${comparisonBest.name} has the highest ${comparisonMetricLabel(comparisonMetric).toLowerCase()} at ${formatComparisonMetric(comparisonMetricValue(comparisonBest, comparisonMetric), comparisonMetric)}.`,
    `${comparisonWorst.name} is the lowest performer at ${formatComparisonMetric(comparisonMetricValue(comparisonWorst, comparisonMetric), comparisonMetric)}.`,
    `The performance gap across the selected comparison is ${formatComparisonMetric(comparisonGap, comparisonMetric)}.`,
    comparisonDelta >= 0
      ? `The comparison range improved by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} against the selected baseline range.`
      : `The comparison range declined by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} against the selected baseline range.`,
  ];

  function resetFieldHierarchy() {
    setSelectedProvince("all");
    setSelectedDistrict("all");
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
  }

  function changeMonth(month) {
    const latestInMonth = tracerReportingPeriods.filter((period) => period.month === month).at(-1);
    setFieldPeriodId(latestInMonth.id);
    resetFieldHierarchy();
  }

  function selectProvince(province) {
    setSelectedProvince(province);
    setSelectedDistrict("all");
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
    setActivePage("provincial");
  }

  function selectDistrict(district) {
    setSelectedDistrict(district);
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
    setActivePage("facilities");
  }

  function changeProvinceFilter(province) {
    setSelectedProvince(province);
    setSelectedDistrict("all");
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
  }

  function changeDistrictFilter(district) {
    setSelectedDistrict(district);
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
  }

  function selectQualityProvince(province) {
    setSelectedProvince(province);
    setSelectedDistrict("all");
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
    setActivePage("quality");
  }

  function selectQualityDistrict(district) {
    setSelectedDistrict(district);
    setSelectedFacilityLevel("all");
    setSelectedFacility("all");
    setActivePage("quality");
  }

  function changeReportPeriod(periodId) {
    setReportPeriodId(periodId);
    setReportProvince("all");
    setReportDistrict("all");
    setReportFacilityType("all");
    setReportStatus("all");
    setReportDrillProvince("");
    setReportDrillDistrict("");
  }

  function changeReportProvince(province) {
    setReportProvince(province);
    setReportDistrict("all");
    setReportDrillProvince(province === "all" ? "" : province);
    setReportDrillDistrict("");
  }

  function changeReportDistrict(district) {
    setReportDistrict(district);
    setReportDrillDistrict(district === "all" ? "" : district);
  }

  function updateActionStatus(id, status) {
    setActions((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  }

  function exportCsv() {
    const headers = ["Province", "District", "Facility level", "Reporting unit", "Availability", "MOS", "Stockout items", "Low stock items", "Rows"];
    const lines = [
      headers.map(csvCell).join(","),
      ...filteredFacilities.map((facility) => [
        facility.province,
        facility.district,
        facility.facilityLevel,
        facility.isAggregate ? `All ${facility.facilityLevel.toLowerCase()} facilities` : facility.name,
        formatPercent(facility.availability),
        formatMos(facility.mos),
        facility.stockoutItemCount,
        facility.lowStockItemCount,
        facility.rows,
      ].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tracer-facility-alerts-${fieldData.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCommodityCsv() {
    if (!selectedCommodity) return;
    const metadata = [
      ["Commodity", selectedCommodity],
      ["Programme", selectedCommodityProgramme],
      ["Reporting period", fieldData.label],
      ["Province filter", selectedProvince === "all" ? "All provinces" : selectedProvince],
      ["District filter", selectedDistrict === "all" ? "All districts" : selectedDistrict],
      ["Facility level filter", facilityCareLevelLabel(selectedFacilityLevel)],
      ["Exported", new Date().toLocaleString()],
      [],
      ["Province", "District", "Facility", "Facility level", "Commodity", "Programme", "SOH", "AMC", "MOS", "Stock status", "Reporting status", "Reporting week"],
    ];
    const lines = [
      ...metadata.map((row) => row.map(csvCell).join(",")),
      ...commodityFacilityRows.map((row) => [
        row.province, row.district, row.facility, row.facilityLevel, selectedCommodity,
        row.programme, row.quantity, row.amc, formatMos(row.mos), commodityStockStatus(row.mos), row.reportingStatus, fieldData.label,
      ].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `commodity-intelligence-${selectedCommodity.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}-${fieldData.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportNonReportingCsv() {
    const rows = [
      ["Reporting range", `${monthLabel(qualityRangeLower)} to ${monthLabel(qualityRangeUpper)}`],
      ["Province", qualityProvinceFilter === "all" ? "All provinces" : qualityProvinceFilter],
      ["District", qualityDistrictFilter === "all" ? "All districts" : qualityDistrictFilter],
      ["Facility level", qualityFacilityLevelFilter === "all" ? "All levels" : qualityFacilityLevelFilter],
      ["Expected reports", qualitySummary.expected],
      ["Reports received", qualitySummary.reported],
      ["Reporting rate", formatPercent(qualitySummary.rate)],
      [],
      ["Province", "District", "Facility", "Facility level", "Expected reports", "Reports received", "Missed reports", "Reporting rate", "Consecutive missed", "Latest successful report", "Status"],
      ...nonReportingFacilityRows.map((row) => [row.province, row.district, row.name, row.facilityLevel, row.expectedReports, row.reportsSubmitted, row.missedReports, formatPercent(row.rate), row.consecutiveMissed, row.latestReport, row.consistency]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `non-reporting-facilities-${qualityRangeLower}-to-${qualityRangeUpper}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="control-tower-app">
      <header className="national-header">
        <div className="national-brand moh-brand">
          <img src="./zambia-coat-of-arms.svg" alt="Republic of Zambia coat of arms" />
          <div>
            <span>Republic of Zambia</span>
            <strong>Ministry of Health</strong>
          </div>
        </div>
        <div className="national-title">
          <span>National Tracer Drug Availability</span>
          <strong>Weekly Facility Reporting Dashboard</strong>
        </div>
        <div className="national-brand control-tower-brand">
          <img src="./control-tower-logo.svg" alt="Control Tower logo" />
          <div>
            <span>Control Tower</span>
            <strong>National Supply Chain Coordinating Unit</strong>
          </div>
        </div>
      </header>

      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span>TR</span>
          <div>
            <strong>Tracer Dashboard</strong>
            <small>Facility to national visibility</small>
          </div>
        </div>
        <nav aria-label="Dashboard pages">
          {dashboardPages.map((page) => (
            <button className={activePage === page.id ? "active" : ""} type="button" key={page.id} onClick={() => setActivePage(page.id)}>
              <span>{page.short}</span>
              {page.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-data">
          <span>Weekly submission</span>
          <strong>{fieldData.label}</strong>
          <small>{fieldData.counts.facilityUnits} reporting units</small>
          <small>{fieldData.counts.rows.toLocaleString()} commodity rows</small>
        </div>
      </aside>

      <main className={`app-shell dashboard-page page-${activePage}`}>
        <header className="dashboard-topbar">
          <div>
            <span>National Tracer Drug Availability</span>
            <strong>{activePageLabel}</strong>
          </div>
          {!['stock', 'comparison', 'reporting'].includes(activePage) && <div className="global-filter-bar">
            <label>
              <span>Month</span>
              <select value={selectedMonth} onChange={(event) => changeMonth(event.target.value)}>
                {fieldMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
              </select>
            </label>
            <label>
              <span>Week</span>
              <select value={fieldPeriodId} onChange={(event) => {
                setFieldPeriodId(event.target.value);
                resetFieldHierarchy();
              }}>
                {weeksInMonth.map((period) => <option value={period.id} key={period.id}>{period.week} - {period.reportDate}</option>)}
              </select>
            </label>
            {activePage !== "quality" && <label>
              <span>Province</span>
              <select value={selectedProvince} onChange={(event) => changeProvinceFilter(event.target.value)}>
                <option value="all">All provinces</option>
                {provinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}
              </select>
            </label>}
            {activePage !== "quality" && <><label>
              <span>District</span>
              <select value={selectedDistrict} onChange={(event) => changeDistrictFilter(event.target.value)}>
                <option value="all">All districts</option>
                {districtOptions.map((district) => <option value={district} key={district}>{district}</option>)}
              </select>
            </label>
            <label>
              <span>Facility level</span>
              <select value={selectedFacilityLevel} onChange={(event) => {
                setSelectedFacilityLevel(event.target.value);
                setSelectedFacility("all");
              }}>
                <option value="all">All levels</option>
                {facilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                <optgroup label="Specialised services">
                  {specialisedCareLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                </optgroup>
              </select>
            </label>
            <label>
              <span>Reporting unit</span>
              <select disabled={selectedDistrict === "all"} value={selectedFacility} onChange={(event) => setSelectedFacility(event.target.value)}>
                <option value="all">{selectedDistrict === "all" ? "Select district first" : "All reporting units"}</option>
                {facilityOptions.map((facility) => {
                  const [, district, level, name] = facility.split("|");
                  return <option value={facility} key={facility}>{name === "ALL" ? `All ${level.toLowerCase()} facilities - ${district}` : `${name} - ${district}`}</option>;
                })}
              </select>
            </label><button type="button" onClick={resetFieldHierarchy}>Clear</button></>}
          </div>}
        </header>

        <section className="hero">
          <div>
            <p className="eyebrow">Weekly Tracer Submission</p>
            <h1>Facility stock visibility from province submissions</h1>
            <p className="lede">This dashboard uses only weekly tracer reports submitted by provinces. It highlights stockouts, low stock, reporting footprint, programme pressure, and commodity risk from facility level up to national level.</p>
          </div>
          <div className="report-card">
            <span>Selected report</span>
            <strong>{fieldData.reportDate}</strong>
            <small>{fieldData.source}</small>
            <small>{fieldData.counts.rows.toLocaleString()} commodity rows | {fieldData.counts.facilityUnits} reporting units</small>
            <button className="hero-export" type="button" onClick={exportCsv}>Export facility CSV</button>
          </div>
        </section>

        <section className="executive-brief">
          <div className="executive-statement">
            <p className="eyebrow dark">Leadership Brief</p>
            <h2>National tracer availability is {formatPercent(fieldKpis.availability)}, with {fieldKpis.riskRows.toLocaleString()} submitted rows requiring attention.</h2>
            <p>{bestProvince?.name} has the strongest reported availability at {formatPercent(bestProvince?.availability)}, while {worstProvince?.name} is lowest at {formatPercent(worstProvince?.availability)}. In the current filter, {stockoutFacilityCount} reporting units have stockouts and {lowStockFacilityCount} have low-stock commodities.</p>
          </div>
          <div className="executive-kpis">
            <div><span>National availability</span><strong>{formatPercent(fieldKpis.availability)}</strong><small>Facility tracer submissions</small></div>
            <div><span>Average MOS</span><strong>{formatMos(fieldKpis.mos)}</strong><small>Submitted stock position</small></div>
            <div><span>Reporting units</span><strong>{filteredFacilities.length}</strong><small>{fieldData.counts.facilityUnits} in full report</small></div>
            <div><span>Stockout facilities</span><strong>{stockoutFacilityCount}</strong><small>At least one stockout item</small></div>
            <div><span>Low-stock facilities</span><strong>{lowStockFacilityCount}</strong><small>Below 2 MOS</small></div>
            <div><span>Districts reporting</span><strong>{selectedProvince === "all" ? fieldData.counts.districts : districtsInScope.length}</strong><small>Province/district footprint</small></div>
          </div>
        </section>

        <LevelOfCarePerformance rows={levelOfCareRows} />

        <section className="tracer-overview">
          <div className="tracer-lead">
            <p className="eyebrow dark">National Stock Status</p>
            <h2>Tracer commodities by submitted months of stock</h2>
            <p>Stock status is shown as percentage of submitted commodity rows, with counts retained for traceability.</p>
          </div>
          <div className="tracer-metrics">
            {stockStatusRows.map((row) => (
              <div className={`stock-percent-card stat-${row.tone}`} key={row.label}>
                <span>{row.label}</span>
                <strong>{formatPercent(row.rate)}</strong>
                <small>{row.count.toLocaleString()} of {fieldKpis.rows.toLocaleString()} rows</small>
                <em>{row.sub}</em>
              </div>
            ))}
          </div>
          <div className="product-performance">
            <div className="product-performance-head">
              <div>
                <h3>Product category availability</h3>
                <p>Availability percentage and average MOS by programme/product category for the selected filters.</p>
              </div>
              <span>{productCategoryRows.length} categories shown</span>
            </div>
            <div className="product-performance-chart">
              {productCategoryRows.map((row) => (
                <div className="product-category-row" key={row.name}>
                  <span>{row.name}</span>
                  <div className="product-category-track">
                    <i style={{ width: `${Math.min(100, Math.round((row.availability || 0) * 100))}%` }} />
                  </div>
                  <b>{formatPercent(row.availability)}</b>
                  <em>MOS {formatMos(row.mos)}</em>
                </div>
              ))}
            </div>
            <div className="table-scroll compact-table product-performance-table">
              <table>
                <thead>
                  <tr>
                    <th>Product category</th>
                    <th>Availability</th>
                    <th>Avg MOS</th>
                    <th>Stocked out</th>
                    <th>Low stock</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {productCategoryRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{formatPercent(row.availability)}</td>
                      <td>{formatMos(row.mos)}</td>
                      <td>{row.stockout.toLocaleString()}</td>
                      <td>{(row.nearCritical + row.understocked).toLocaleString()}</td>
                      <td>{row.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="weekly-stock-section">
          <div className="weekly-hero">
            <div>
              <p>National Supply Chain Visibility</p>
              <h2>Medicines and medical supplies stock intelligence</h2>
              <span>Central stock status, programme risks, weekly availability, and item movement monitoring.</span>
            </div>
            <img src="./control-tower-logo.svg" alt="Control Tower" />
          </div>
          <div className="weekly-live-strip">
            <span>Live indicators</span>
            <b>{stockData?.counts?.items?.toLocaleString() || "0"}</b><small>unique ordering codes across stock reports</small>
            <b>{stockData?.counts?.availableItems?.toLocaleString() || "0"}</b><small>commodities available in selected week</small>
            <b>{stockData?.counts?.stockoutItems?.toLocaleString() || "0"}</b><small>commodities displayed at 0.0 availability</small>
            <b>{formatPercent(stockData?.overallAvailability)}</b><small>weekly availability</small>
          </div>
          <div className="weekly-stock-head">
            <div>
              <p className="eyebrow dark">Weekly Inventory Availability</p>
              <h2>ZAMMSA weekly stock status</h2>
              <p>This tab uses only ZAMMSA weekly stock-status submissions. Select EMMS or laboratory and a reporting week, then click a category bar to see related medicines in the latest weekly stock-status report.</p>
            </div>
            <div className="weekly-stock-controls">
              <label>
                <span>Programme</span>
                <select value={stockStream} onChange={(event) => {
                  const nextStream = event.target.value;
                  const nextRows = weeklyStockPeriods.filter((period) => period.stream === nextStream).sort((a, b) => a.date.localeCompare(b.date));
                  setStockStream(nextStream);
                  setStockDate(nextRows.at(-1)?.date || "");
                  setStockCategory("");
                }}>
                  {stockStreams.map((stream) => <option value={stream} key={stream}>{stockStreamLabels[stream] || stream}</option>)}
                </select>
              </label>
              <label>
                <span>Reporting week</span>
                <select value={stockDate} onChange={(event) => {
                  setStockDate(event.target.value);
                  setStockCategory("");
                }}>
                  {stockDates.map((period) => <option value={period.date} key={period.date}>{period.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          {stockData ? (
            <>
              <div className="weekly-stock-grid">
                <div className="weekly-stock-panel stock-trend-panel">
                  <div className="quality-panel-head">
                    <div>
                      <h3>Availability trend by week</h3>
                      <p>Click a week to update the category chart and week-to-week item changes.</p>
                    </div>
                  </div>
                  <div className="stock-trend-bars">
                    {stockTrendRows.map((period) => (
                      <button type="button" className={period.date === stockDate ? "active" : ""} key={`${period.stream}-${period.date}`} onClick={() => {
                        setStockDate(period.date);
                        setStockCategory("");
                      }}>
                        <i style={{ height: `${Math.max(28, Math.round(period.overallAvailability * 150))}px` }} />
                        <strong>{formatPercent(period.overallAvailability)}</strong>
                        <span>{period.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="weekly-stock-panel">
                  <div className="quality-panel-head">
                    <div>
                      <h3>Stock availability by category</h3>
                      <p>Click any category bar to reveal related commodities from the selected central stock-status report.</p>
                    </div>
                    <span>{stockCategoryRows.length} categories</span>
                  </div>
                  <div className="stock-category-list intelligence-category-list">
                    {stockCategoryRows.map((row) => (
                      <button type="button" className={selectedStockCategory === row.name ? "stock-category-row active" : "stock-category-row"} key={row.name} onClick={() => setStockCategory(row.name)}>
                        <span>{row.name}</span>
                        <div className="stock-category-track"><i style={{ width: `${Math.round(row.availability * 100)}%` }} /></div>
                        <b>{row.available !== null && row.total !== null ? `${row.available}/${row.total}` : formatPercent(row.availability)}</b>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="weekly-change-grid">
                <div className="weekly-change-box">
                  <h3>Newly unavailable · {stockChange?.newlyUnavailable?.length || 0}</h3>
                  <p>{stockChange?.from} to {stockChange?.to}</p>
                  <div className="weekly-change-items">
                    {(stockChange?.newlyUnavailable || []).slice(0, 30).map((item) => (
                      <div className="weekly-change-item" key={`${item.item}-${item.category}`}>
                        <b>{item.item}</b>
                        <span>{item.category}</span>
                      </div>
                    ))}
                    {!(stockChange?.newlyUnavailable || []).length && <div className="empty-state small">No newly unavailable items in this comparison.</div>}
                  </div>
                </div>
                <div className="weekly-change-box recovered">
                  <h3>Recovered · {stockChange?.recovered?.length || 0}</h3>
                  <p>{stockChange?.from} to {stockChange?.to}</p>
                  <div className="weekly-change-items">
                    {(stockChange?.recovered || []).slice(0, 30).map((item) => (
                      <div className="weekly-change-item" key={`${item.item}-${item.category}`}>
                        <b>{item.item}</b>
                        <span>{item.category}</span>
                      </div>
                    ))}
                    {!(stockChange?.recovered || []).length && <div className="empty-state small">No recovered items in this comparison.</div>}
                  </div>
                </div>
              </div>
              <div className="weekly-stock-panel linked-stock">
                <div className="quality-panel-head">
                  <div>
                    <h3>{selectedStockCategory || "Select a category"}</h3>
                    <p>{currentStockPeriod ? "Related stock-status commodities appear here." : "Item names are available for the 19 and 26 June workbook periods."}</p>
                  </div>
                  <span>{selectedStockItems.length ? `${selectedStockItems.length} items` : ""}</span>
                </div>
                {selectedStockItems.length ? (
                  <div className="table-scroll compact-table weekly-stock-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Availability</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStockItems.map((item) => (
                          <tr key={`${item.category}-${item.name}`}>
                            <td>{item.name}</td>
                            <td>{formatPercent(item.availability)}</td>
                            <td><span className={item.availability > 0 ? "status-pill reported" : "status-pill missing"}>{item.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty-state">Select a 19 or 26 June category to see the submitted stock-status commodities.</div>}
              </div>
            </>
          ) : <div className="empty-state">No weekly stock data is available.</div>}
        </section>

        <section className="field-visibility">
          <div className="field-head">
            <div>
              <p className="eyebrow dark">Facility To National Drilldown</p>
              <h2>Province, district, facility, programme, and commodity visibility</h2>
              <p>Click a province or district to narrow the reporting units and commodity alerts.</p>
            </div>
          </div>
          <div className="field-kpis">
            <div><span>Availability</span><strong>{formatPercent(fieldKpis.availability)}</strong><small>{fieldKpis.rows.toLocaleString()} commodity rows</small></div>
            <div><span>Average MOS</span><strong>{formatMos(fieldKpis.mos)}</strong><small>{fieldKpis.quantity.toLocaleString()} SOH submitted</small></div>
            <div><span>Risk rows</span><strong>{fieldKpis.riskRows.toLocaleString()}</strong><small>Stockout, near critical, or low stock</small></div>
            <div><span>Current footprint</span><strong>{filteredFacilities.length}</strong><small>Reporting units in current filters</small></div>
          </div>
          <div className="field-grid">
            <TopRowsTable title="Province availability" rows={scopedProvinceRows.slice(0, 10)} onSelect={(row) => selectProvince(row.name)} />
            <TopRowsTable title={selectedProvince === "all" ? "Districts needing attention" : `Districts in ${selectedProvince}`} rows={districtsInScope.slice(0, 12)} onSelect={(row) => selectDistrict(row.name)} />
            <TopRowsTable title="Programme pressure" rows={programmePressureRows} />
          </div>
          <div className="hierarchy-path">
            <button type="button" onClick={resetFieldHierarchy}>Zambia</button>
            <span>/</span>
            <button type="button" disabled={selectedProvince === "all"} onClick={() => selectProvince(selectedProvince)}>{selectedProvince === "all" ? "Select a province" : selectedProvince}</button>
            <span>/</span>
            <button type="button" disabled={selectedDistrict === "all"}>{selectedDistrict === "all" ? "Select a district" : selectedDistrict}</button>
            <b>{filteredFacilities.length} reporting units in current selection</b>
          </div>
        </section>

        <section className="facility-alerts">
          <div className="facility-alert-summary">
            <div>
              <p className="eyebrow dark">Facility Alerts</p>
              <h3>{selectedDistrict !== "all" ? `${selectedDistrict} reporting units` : selectedProvince !== "all" ? `${selectedProvince} facilities and districts` : "Facilities with stockouts and low stock"}</h3>
              <p>Named health posts and health centres are shown when the actual facility tracer is loaded. “All health post/centre facilities” means the current source only contains an aggregate summary row.</p>
            </div>
            <div className="facility-alert-kpis">
              <span><b>{stockoutFacilityCount}</b> facilities with stockouts</span>
              <span><b>{lowStockFacilityCount}</b> facilities with low stock</span>
            </div>
          </div>
          <div className="facility-alert-list">
            {facilityAlerts.length ? facilityAlerts.map((facility) => (
              <FacilityCard facility={facility} onOpen={setOpenFacility} key={`${facility.province}-${facility.district}-${facility.facilityLevel}-${facility.name}`} />
            )) : <div className="empty-state">No stockout or low-stock facilities match the current filters.</div>}
          </div>
        </section>

        <section className="table-panel">
          <div className="table-headline">
            <div>
              <p className="eyebrow dark">Commodity Intelligence</p>
              <h2>Facility-level commodity stock position</h2>
              <p>Search one commodity in the selected reporting week, then use stock status, geography, and care-level filters to see the reporting facilities behind the result.</p>
            </div>
            <div className="export-actions">
              <button type="button" disabled={!selectedCommodity} onClick={exportCommodityCsv}>Export filtered CSV</button>
              <button type="button" onClick={() => window.print()}>Export PDF</button>
            </div>
          </div>
          <div className="commodity-search-row">
            <div className="commodity-autocomplete">
              <label htmlFor="commodity-search">Commodity search</label>
              <input id="commodity-search" value={query} onChange={(event) => { setQuery(event.target.value); setCommodityOptionPage(1); setCommodityPage(1); }} placeholder="Search for a commodity..." autoComplete="off" />
              {!selectedCommodity && <div className="commodity-match-list">
                <div className="commodity-match-head"><span>{commodityMatches.length} commodities in current filters</span><span>Page {Math.min(commodityOptionPage, commodityOptionPageCount)} of {commodityOptionPageCount}</span></div>
                {visibleCommodityMatches.length ? visibleCommodityMatches.map((item) => <button type="button" key={item} onClick={() => { setSelectedCommodity(item); setQuery(item); setCommodityPage(1); }}>{item}</button>) : <p>No matching commodity was found in the selected reporting period and filters.</p>}
                {commodityMatches.length > 10 && <div className="commodity-match-pagination"><button type="button" disabled={commodityOptionPage <= 1} onClick={() => setCommodityOptionPage((page) => page - 1)}>Previous</button><button type="button" disabled={commodityOptionPage >= commodityOptionPageCount} onClick={() => setCommodityOptionPage((page) => page + 1)}>Next</button></div>}
              </div>}
            </div>
            <div className="selected-commodity-control">
              <span>Selected reporting week</span>
              <strong>{fieldData.label}</strong>
              {selectedCommodity && <button type="button" onClick={() => { setSelectedCommodity(""); setQuery(""); setCommodityOptionPage(1); setCommodityStatusFilter("all"); setOpenCommodityFacility(null); }}>Clear search</button>}
            </div>
          </div>

          {!selectedCommodity && <div className="empty-state">Choose one commodity to view facility availability, stock status, reporting gaps, and weekly trend.</div>}

          {selectedCommodity && <>
            <div className="commodity-summary-heading">
              <div>
                <span>Commodity Intelligence &gt; {selectedCommodity}</span>
                <h3>{selectedCommodity}</h3>
                <p>{selectedCommodityProgramme} | {fieldData.label}</p>
              </div>
              <small>Current scope: {selectedProvince === "all" ? "All provinces" : selectedProvince} | {selectedDistrict === "all" ? "All districts" : selectedDistrict} | {facilityCareLevelLabel(selectedFacilityLevel)}</small>
            </div>
            <div className="commodity-kpis">
              <div><span>Facilities reporting</span><strong>{selectedCommodityRows.length}</strong><small>Commodity rows submitted</small></div>
              <div><span>Commodity availability</span><strong>{formatPercent(selectedCommodityRows.length ? commodityAvailableCount / selectedCommodityRows.length : 0)}</strong><small>{commodityAvailableCount} facilities available</small></div>
              <div><span>Average MOS</span><strong>{formatMos(commodityAverageMos)}</strong><small>Reporting facilities only</small></div>
              <div className="red"><span>Stocked out</span><strong>{commodityStatusCounts["Stocked out"] || 0}</strong><small>MOS = 0</small></div>
              <div className="amber"><span>Emergency stock</span><strong>{commodityStatusCounts["Emergency stock"] || 0}</strong><small>Above 0 to 0.5 MOS</small></div>
              <div className="amber"><span>Understocked</span><strong>{commodityStatusCounts.Understocked || 0}</strong><small>Above 0.5 to below 2 MOS</small></div>
              <div className="green"><span>According to plan</span><strong>{commodityStatusCounts["According to plan"] || 0}</strong><small>2 to 4 MOS</small></div>
              <div className="blue"><span>Overstocked / excess</span><strong>{(commodityStatusCounts.Overstocked || 0) + (commodityStatusCounts["Excess stock"] || 0)}</strong><small>Above 4 MOS</small></div>
            </div>
            <div className="commodity-totals"><span>Total SOH: <b>{Math.round(commodityTotalSoh).toLocaleString()}</b></span><span>Total AMC: <b>{Math.round(commodityTotalAmc).toLocaleString()}</b></span><span>Reporting rate: <b>{formatPercent(selectedCommodityRows.length / Math.max(filteredFacilities.length, 1))}</b></span><span>Incomplete commodity records: <b>Not classified as stockout</b></span></div>
            <div className="commodity-status-tabs" aria-label="Commodity stock status">
              {["all", "Stocked out", "Emergency stock", "Understocked", "According to plan", "Overstocked", "Excess stock"].map((status) => <button type="button" className={commodityStatusFilter === status ? "active" : ""} key={status} onClick={() => { setCommodityStatusFilter(status); setCommodityPage(1); }}>{status === "all" ? "All statuses" : status} {status === "all" ? selectedCommodityRows.length : commodityStatusCounts[status] || 0}</button>)}
            </div>
            <div className="commodity-chart-grid">
              <div className="commodity-chart-panel"><h3>Availability by province</h3>{commodityProvinceRows.map((row) => <button type="button" className="commodity-bar" key={row.name} onClick={() => changeProvinceFilter(row.name)}><span>{row.name}</span><i><b style={{ width: `${Math.round(row.availability * 100)}%` }} /></i><strong>{formatPercent(row.availability)}</strong></button>)}</div>
              <div className="commodity-chart-panel"><h3>Average MOS by level of care</h3>{commodityLevelRows.map((row) => <button type="button" className="commodity-bar" key={row.name} onClick={() => { const option = [...facilityCareLevelOptions, ...specialisedCareLevelOptions].find((item) => item.label.toUpperCase() === row.name.toUpperCase()); if (option) setSelectedFacilityLevel(option.value); }}><span>{row.name}</span><i><b style={{ width: `${Math.min((row.mos / 12) * 100, 100)}%` }} /></i><strong>{formatMos(row.mos)}</strong></button>)}</div>
              <div className="commodity-chart-panel commodity-week-chart-panel"><div className="commodity-week-chart-head"><h3>Weekly availability and MOS</h3><span><i /> Availability <b /> MOS</span></div><div className="commodity-week-chart"><div className="commodity-week-axis availability">Availability (%)</div><div className="commodity-week-axis mos">MOS</div><div className="commodity-week-grid" aria-hidden="true">{[0, 25, 50, 75, 100].map((value) => <i key={value} style={{ bottom: `${value}%` }}><small>{value}%</small></i>)}</div><div className="commodity-week-columns" style={{ "--commodity-columns": commodityTrendVisibleRows.length }}>{commodityTrendVisibleRows.map((row) => <button type="button" key={row.reportDate} onClick={() => { setFieldPeriodId(row.reportDate); resetFieldHierarchy(); }}><i style={{ height: `${Math.round(row.availability * 100)}%` }}><b>{formatPercent(row.availability)}</b></i><em style={{ bottom: `${Math.min((row.mos / commodityTrendMosScale) * 100, 100)}%` }}>{formatMos(row.mos)}</em><span>{row.label.replace("Week ", "W")}</span></button>)}</div><svg className="commodity-week-mos-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={commodityTrendMosPoints} /></svg></div><small className="commodity-week-note">Click a week to update the reporting period.</small></div>
            </div>
            <div className="table-tools commodity-table-tools">
              <input value={commodityFacilityQuery} onChange={(event) => { setCommodityFacilityQuery(event.target.value); setCommodityPage(1); }} placeholder="Search facility, district, or province" />
              <select value={commoditySort} onChange={(event) => setCommoditySort(event.target.value)}><option value="mos">Sort by MOS</option><option value="stock">Sort by stock on hand</option><option value="province">Sort by geography</option><option value="facility">Sort by facility</option><option value="status">Sort by stock status</option></select>
              <select value={commodityPageSize} onChange={(event) => { setCommodityPageSize(Number(event.target.value)); setCommodityPage(1); }}><option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option></select>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Province</th><th>District</th><th>Facility</th><th>Facility level</th><th>SOH</th><th>AMC</th><th>MOS</th><th>Stock status</th><th>Reporting status</th><th /></tr></thead>
                <tbody>{commodityVisibleRows.length ? commodityVisibleRows.map((row) => <tr key={`${row.province}-${row.district}-${row.facilityLevel}-${row.facility}`}><td>{row.province}</td><td>{row.district}</td><td>{row.facility}</td><td>{row.facilityLevel}</td><td>{Math.round(row.quantity).toLocaleString()}</td><td>{Math.round(row.amc).toLocaleString()}</td><td>{formatMos(row.mos)}</td><td><span className={`comparison-signal ${commodityStatusTone(commodityStockStatus(row.mos))}`}>{commodityStockStatus(row.mos)}</span></td><td><span className="comparison-signal green">Reported</span></td><td><button type="button" className="ghost-button" onClick={() => setOpenCommodityFacility(row)}>View details</button></td></tr>) : <tr><td colSpan="10">No reporting facilities match the selected commodity filters.</td></tr>}</tbody>
              </table>
            </div>
            <div className="commodity-pagination"><button type="button" disabled={commodityPage <= 1} onClick={() => setCommodityPage((page) => page - 1)}>Previous</button><span>Page {Math.min(commodityPage, commodityPageCount)} of {commodityPageCount} | {commodityFacilityRows.length} reporting facilities</span><button type="button" disabled={commodityPage >= commodityPageCount} onClick={() => setCommodityPage((page) => page + 1)}>Next</button></div>
          </>}
        </section>

        <section className="comparison-section">
          <div className="section-head">
            <div>
              <p className="eyebrow dark">Comparison</p>
              <h2>Compare tracer drug availability across time, care level, and commodity</h2>
              <p>Use monthly, quarterly, or yearly views to compare availability, months of stock, reporting rate, and AMC across provinces, districts, levels of care, programmes, and medicines.</p>
            </div>
            <div className="export-actions">
              <button type="button" onClick={exportCsv}>Export CSV</button>
              <button type="button" onClick={() => window.print()}>Export PDF</button>
            </div>
          </div>

          <div className="comparison-filters">
            <label>
              <span>Period type</span>
              <select value={comparisonPeriodType} onChange={(event) => {
                const periodType = event.target.value;
                setComparisonPeriodType(periodType);
                if (periodType === "monthly") {
                  const months = [...new Set(tracerReportingPeriods
                    .filter((period) => String(period.month).startsWith(comparisonYear))
                    .map((period) => period.month))].sort();
                  const latest = months.at(-1) || "";
                  const baseline = months.at(-2) || latest;
                  setComparisonBaselineStart(baseline);
                  setComparisonBaselineEnd(baseline);
                  setComparisonRangeStart(latest);
                  setComparisonRangeEnd(latest);
                } else if (periodType === "quarterly") {
                  setComparisonBaselineStart("Q1");
                  setComparisonBaselineEnd("Q1");
                  setComparisonRangeStart("Q2");
                  setComparisonRangeEnd("Q2");
                } else {
                  const latestYear = comparisonYears.at(-1) || comparisonYear;
                  const baselineYear = comparisonYears.at(-2) || latestYear;
                  setComparisonBaselineStart(baselineYear);
                  setComparisonBaselineEnd(baselineYear);
                  setComparisonRangeStart(latestYear);
                  setComparisonRangeEnd(latestYear);
                }
              }}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {comparisonPeriodType !== "yearly" && <label>
              <span>Year</span>
              <select value={comparisonYear} onChange={(event) => {
                const year = event.target.value;
                const months = [...new Set(tracerReportingPeriods
                  .filter((period) => String(period.month).startsWith(year))
                  .map((period) => period.month))].sort();
                const latest = months.at(-1) || "";
                const baseline = months.at(-2) || latest;
                setComparisonYear(year);
                if (comparisonPeriodType === "monthly") {
                  setComparisonBaselineStart(baseline);
                  setComparisonBaselineEnd(baseline);
                  setComparisonRangeStart(latest);
                  setComparisonRangeEnd(latest);
                }
              }}>
                {comparisonYears.map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
            </label>}
            <label>
              <span>Baseline start</span>
              <select value={comparisonBaselineStart} onChange={(event) => setComparisonBaselineStart(event.target.value)}>
                {comparisonRangeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Baseline end</span>
              <select value={comparisonBaselineEnd} onChange={(event) => setComparisonBaselineEnd(event.target.value)}>
                {comparisonRangeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Comparison start</span>
              <select value={comparisonRangeStart} onChange={(event) => setComparisonRangeStart(event.target.value)}>
                {comparisonRangeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Comparison end</span>
              <select value={comparisonRangeEnd} onChange={(event) => setComparisonRangeEnd(event.target.value)}>
                {comparisonRangeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Province</span>
              <select value={comparisonProvince} onChange={(event) => {
                setComparisonProvince(event.target.value);
                setComparisonDistrict("all");
              }}>
                <option value="all">All provinces</option>
                {provinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}
              </select>
            </label>
            <label>
              <span>District</span>
              <select value={comparisonDistrict} onChange={(event) => setComparisonDistrict(event.target.value)}>
                <option value="all">All districts</option>
                {comparisonDistrictOptions.map((district) => <option value={district} key={district}>{district}</option>)}
              </select>
            </label>
            <label>
              <span>Level of care</span>
              <select value={comparisonFacilityLevel} onChange={(event) => setComparisonFacilityLevel(event.target.value)}>
                <option value="all">All levels</option>
                {comparisonFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                <optgroup label="Specialised services">
                  {specialisedCareLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                </optgroup>
              </select>
            </label>
            <label>
              <span>Commodity</span>
              <select value={comparisonCommodity} onChange={(event) => {
                setComparisonCommodity(event.target.value);
                if (event.target.value !== "all") setComparisonCompareBy("commodity");
              }}>
                <option value="all">All commodities</option>
                {comparisonCommodityOptions.map((commodity) => <option value={commodity} key={commodity}>{commodity}</option>)}
              </select>
            </label>
            <label>
              <span>Program</span>
              <select value={comparisonProgram} onChange={(event) => {
                setComparisonProgram(event.target.value);
                if (event.target.value !== "all") setComparisonCompareBy("program");
              }}>
                <option value="all">All programmes</option>
                {comparisonProgramOptions.map((program) => <option value={program} key={program}>{program}</option>)}
              </select>
            </label>
            <label>
              <span>Compare by</span>
              <select value={comparisonCompareBy} onChange={(event) => setComparisonCompareBy(event.target.value)}>
                <option value="level">Level of care</option>
                <option value="province">Province</option>
                <option value="district">District</option>
                <option value="commodity">Commodity</option>
                <option value="program">Program</option>
              </select>
            </label>
            <label>
              <span>Display metric</span>
              <select value={comparisonMetric} onChange={(event) => setComparisonMetric(event.target.value)}>
                <option value="availability">Availability</option>
                <option value="mos">Months of stock</option>
                <option value="reporting">Reporting rate</option>
                <option value="amc">AMC</option>
              </select>
            </label>
          </div>

          <div className="comparison-overview">
            <div className="comparison-story">
              <p>National overview</p>
              <h3>{comparisonPreviousLabel} vs {comparisonCurrentLabel}</h3>
              <strong>Drug availability and months of stock</strong>
              <div className={`comparison-story-callout ${comparisonAvailabilityDeltaPoints >= 0 ? "positive" : "negative"}`}>
                {comparisonAvailabilityDeltaPoints >= 0 ? "Availability improved" : "Availability declined"} by {Math.abs(comparisonAvailabilityDeltaPoints).toFixed(1)} percentage points in {comparisonCurrentLabel} compared with {comparisonPreviousLabel}.
              </div>
            </div>

            <div className="comparison-period-kpi availability">
              <h3>Drug availability</h3>
              <div>
                <span><small>{comparisonPreviousLabel}</small><strong>{formatPercent(comparisonPrevious.availability)}</strong></span>
                <b aria-hidden="true">&#8594;</b>
                <span><small>{comparisonCurrentLabel}</small><strong>{formatPercent(comparisonCurrent.availability)}</strong></span>
              </div>
              <p className={comparisonAvailabilityDeltaPoints >= 0 ? "positive" : "negative"}>
                {comparisonAvailabilityDeltaPoints >= 0 ? "Up" : "Down"} {Math.abs(comparisonAvailabilityDeltaPoints).toFixed(1)} percentage points
              </p>
            </div>

            <div className="comparison-period-kpi mos">
              <h3>Months of stock (MOS)</h3>
              <div>
                <span><small>{comparisonPreviousLabel}</small><strong>{formatMos(comparisonPrevious.mos)}</strong></span>
                <b aria-hidden="true">&#8594;</b>
                <span><small>{comparisonCurrentLabel}</small><strong>{formatMos(comparisonCurrent.mos)}</strong></span>
              </div>
              <p className={comparisonMosDelta >= 0 ? "positive" : "negative"}>
                {comparisonMosDelta >= 0 ? "Up" : "Down"} {Math.abs(comparisonMosDelta).toFixed(1)} months
              </p>
            </div>
          </div>

          <div className="comparison-panel comparison-combo-panel">
            <div className="comparison-combo-title">
              <h3>Drug availability by {comparisonCompareBy === "level" ? "level of care" : comparisonCompareBy} - {comparisonPreviousLabel} vs {comparisonCurrentLabel}</h3>
              <div className="comparison-combo-legend" aria-label="Chart legend">
                <span className="previous-availability">{comparisonPreviousLabel} availability</span>
                <span className="current-availability">{comparisonCurrentLabel} availability</span>
                <span className="previous-mos">{comparisonPreviousLabel} MOS</span>
                <span className="current-mos">{comparisonCurrentLabel} MOS</span>
              </div>
            </div>
            {comparisonExecutiveRows.length ? (
              <div className="comparison-combo-scroll">
                <div className="comparison-combo-chart" style={{ minWidth: `${Math.max(820, comparisonExecutiveRows.length * 160)}px` }}>
                  <span className="comparison-axis-title availability">Availability (%)</span>
                  <span className="comparison-axis-title mos">Months of stock (MOS)</span>
                  <div className="comparison-left-axis" aria-hidden="true">
                    {[100, 80, 60, 40, 20, 0].map((value) => <span style={{ bottom: `${value}%` }} key={value}>{value}%</span>)}
                  </div>
                  <div className="comparison-right-axis" aria-hidden="true">
                    {[comparisonMosScale, comparisonMosScale * 0.75, comparisonMosScale * 0.5, comparisonMosScale * 0.25, 0].map((value) => <span style={{ bottom: `${(value / comparisonMosScale) * 100}%` }} key={value}>{value.toFixed(1)}</span>)}
                  </div>
                  <div className="comparison-combo-plot">
                    <div className="comparison-grid-lines" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((value) => <i key={value} />)}</div>
                    <div className="comparison-category-grid" style={{ "--comparison-columns": comparisonExecutiveRows.length }}>
                      {comparisonExecutiveRows.map((row) => {
                        const previousAvailability = normalizeRate(row.previous.availability) * 100;
                        const currentAvailability = normalizeRate(row.current.availability) * 100;
                        const previousMosTop = 100 - Math.min((row.previous.mos || 0) / comparisonMosScale, 1) * 100;
                        const currentMosTop = 100 - Math.min((row.current.mos || 0) / comparisonMosScale, 1) * 100;
                        return (
                          <div className="comparison-category" key={row.name}>
                            <div className="comparison-paired-bars">
                              <i className="previous" style={{ height: `${previousAvailability}%` }}><b>{previousAvailability.toFixed(1)}%</b></i>
                              <i className="current" style={{ height: `${currentAvailability}%` }}><b>{currentAvailability.toFixed(1)}%</b></i>
                            </div>
                            <span className="comparison-mos-marker previous" style={{ top: `${previousMosTop}%` }}>{formatMos(row.previous.mos)}</span>
                            <span className="comparison-mos-marker current" style={{ top: `${currentMosTop}%` }}>{formatMos(row.current.mos)}</span>
                            <strong>{row.name}</strong>
                          </div>
                        );
                      })}
                    </div>
                    <svg className="comparison-mos-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <polyline className="previous" points={comparisonPreviousMosPoints} />
                      <polyline className="current" points={comparisonCurrentMosPoints} />
                    </svg>
                  </div>
                </div>
              </div>
            ) : <p className="empty-state">No comparison rows match the selected filters.</p>}
          </div>

          <div className="comparison-takeaways">
            <h3>Key takeaways</h3>
            {comparisonTakeaways.map((item) => (
              <div className={item.delta >= 0 ? "positive" : "negative"} key={item.name}>
                <strong>{item.name}</strong>
                <p>{item.delta >= 0 ? "Availability improved" : "Availability declined"} by {Math.abs(item.delta).toFixed(1)} percentage points to {formatPercent(item.availability)}.</p>
              </div>
            ))}
          </div>

          <div className="comparison-panel">
            <div className="quality-panel-head">
              <div>
                <h3>Heatmap</h3>
                <p>Rows are the top comparison groups; columns are reporting periods.</p>
              </div>
            </div>
            <div className="comparison-heatmap">
              <div className="heatmap-header">
                <span />
                {comparisonPeriods.map((period) => <b key={period.id}>{shortPeriodLabel(period)}</b>)}
              </div>
              {comparisonTrendGroups.map((name) => (
                <div className="heatmap-row" key={name}>
                  <strong>{name}</strong>
                  {comparisonPeriods.map((period) => {
                    const row = comparisonRowsForPeriod(period, comparisonFilters).find((item) => (item.group || item.name) === name);
                    const value = row ? comparisonMetricValue(row, comparisonMetric) : 0;
                    return <span className={`heatmap-cell heatmap-${comparisonTone(value, comparisonMetric)}`} key={`${name}-${period.id}`}>{formatComparisonMetric(value, comparisonMetric)}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="comparison-grid">
            <div className="comparison-panel">
              <div className="quality-panel-head">
                <div>
                  <h3>Ranking table</h3>
                  <p>Best to weakest performers for the current comparison.</p>
                </div>
              </div>
              <div className="table-scroll compact-table">
                <table>
                  <thead>
                    <tr><th>Rank</th><th>Name</th><th>{comparisonMetricLabel(comparisonMetric)}</th><th>MOS</th><th>Risk rows</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {comparisonRows.slice(0, 30).map((row, index) => {
                      const value = comparisonMetricValue(row, comparisonMetric);
                      const tone = comparisonTone(value, comparisonMetric);
                      return (
                        <tr key={row.name}>
                          <td>{index + 1}</td>
                          <td>{row.name}</td>
                          <td>{formatComparisonMetric(value, comparisonMetric)}</td>
                          <td>{formatMos(row.mos)}</td>
                          <td>{row.riskRows.toLocaleString()}</td>
                          <td><span className={`comparison-signal ${tone}`}>{tone === "green" ? "Good" : tone === "amber" ? "Monitor" : "Critical"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="comparison-panel insights-panel">
              <div className="quality-panel-head">
                <div>
                  <h3>Insights</h3>
                  <p>Automatic interpretation from the selected comparison.</p>
                </div>
              </div>
              {comparisonInsights.map((insight) => <p key={insight}>{insight}</p>)}
            </div>
          </div>

          <div className="table-panel comparison-commodity-table">
            <div className="table-headline">
              <div>
                <h2>Commodity comparison table</h2>
                <p>Commodity rollup across the selected period window.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Commodity</th>
                    <th>Availability</th>
                    <th>MOS</th>
                    <th>AMC</th>
                    <th>Stockout rows</th>
                    <th>Low-stock rows</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonCommodityRows.map((row) => {
                    const tone = classifyRollup(row);
                    return (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{formatPercent(row.availability)}</td>
                        <td>{formatMos(row.mos)}</td>
                        <td>{Math.round(row.amc || 0).toLocaleString()}</td>
                        <td>{row.stockout.toLocaleString()}</td>
                        <td>{(row.nearCritical + row.understocked).toLocaleString()}</td>
                        <td><span className={`comparison-signal ${tone}`}>{tone === "green" ? "Good" : tone === "amber" ? "Monitor" : "Critical"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="weekly-section">
          <div className="weekly-head">
            <div>
              <p className="eyebrow dark">Programme Performance</p>
              <h2>Programme availability from the selected tracer submission</h2>
              <p>Programme managers can immediately see stockout and low-stock pressure in their portfolio.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Programme</th>
                  <th>Availability</th>
                  <th>MOS</th>
                  <th>Stockout</th>
                  <th>Low stock</th>
                  <th>Risk rows</th>
                </tr>
              </thead>
              <tbody>
                {fieldData.programmes.map((program) => (
                  <tr key={program.name}>
                    <td>{program.name}</td>
                    <td>{formatPercent(program.availability)}</td>
                    <td>{formatMos(program.mos)}</td>
                    <td>{program.stockout.toLocaleString()}</td>
                    <td>{(program.nearCritical + program.understocked).toLocaleString()}</td>
                    <td>{program.riskRows.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="concerns-section">
          <div className="section-head">
            <div>
              <p className="eyebrow dark">Data Quality</p>
              <h2>Province, district, and level-of-care reporting footprint</h2>
              <p>Expected reports are checked by province, district, and level of care from the clean tracer universe. Reported means that district submitted that level of care in the selected week.</p>
            </div>
          </div>
          <div className="stats-grid">
            <KpiCard label="Province reporting" value={`${fieldData.counts.provinces}/${expectedProvinces}`} sub={`${formatPercent(reportingRate)} provincial footprint`} />
            <KpiCard label="District reporting" value={`${fieldData.counts.districts}/${expectedDistricts}`} sub={`${missingDistricts} districts did not submit`} />
            <KpiCard label="Level reports" value={`${expectedFacilityUnits - missingFacilityUnits}/${expectedFacilityUnits}`} sub={`${missingFacilityUnits} district-level reports missing`} />
            <KpiCard label="Reporting rate" value={formatPercent((expectedFacilityUnits - missingFacilityUnits) / expectedFacilityUnits)} sub="Reported district-level footprint" />
            <KpiCard label="Selected scope" value={selectedProvince !== "all" ? selectedProvince : "Zambia"} sub="Click a province to expand details" />
          </div>
          <div className="quality-drill-path">
            <button type="button" onClick={() => {
              resetFieldHierarchy();
              setActivePage("quality");
            }}>Zambia</button>
            <span>/</span>
            <button type="button" disabled={selectedProvince === "all"} onClick={() => selectQualityProvince(selectedProvince)}>
              {selectedProvince === "all" ? "Select province" : selectedProvince}
            </button>
          </div>
          <div className="quality-grid">
            <QualityTable title="Provincial district-level reporting" rows={provinceQualityRows} firstColumn="Province" onSelect={(row) => selectQualityProvince(row.name)} />
            <ReportingBars title="Province reporting percentage" rows={[...provinceQualityRows].sort((a, b) => (a.rate || qualityRate(a)) - (b.rate || qualityRate(b)))} onSelect={(row) => selectQualityProvince(row.name)} />
          </div>
          <div className="non-reporting-workspace">
            <div className="table-headline">
              <div>
                <p className="eyebrow dark">Non-Reporting Facilities</p>
                <h2>Reporting-rate trend and follow-up list</h2>
                <p>Expected reporting units are drawn from the tracer reporting universe. A non-reporting unit is only shown when it was expected in the selected period.</p>
              </div>
              <div className="export-actions"><button type="button" onClick={exportNonReportingCsv}>Export CSV</button><button type="button" onClick={() => window.print()}>Export PDF</button></div>
            </div>
            <div className="reporting-filter-bar">
              <label><span>Start month</span><select value={qualityRangeStart} onChange={(event) => setQualityRangeStart(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
              <label><span>End month</span><select value={qualityRangeEnd} onChange={(event) => setQualityRangeEnd(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
              <label><span>Trend period</span><select value={qualityGranularity} onChange={(event) => { setQualityGranularity(event.target.value); setQualityPointFilter("all"); }}><option value="month">Month</option><option value="week">Reporting week</option></select></label>
              <label><span>Province</span><select value={qualityProvinceFilter} onChange={(event) => { setQualityProvinceFilter(event.target.value); setQualityDistrictFilter("all"); }}><option value="all">All provinces</option>{qualityProvinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}</select></label>
              <label><span>District</span><select value={qualityDistrictFilter} onChange={(event) => setQualityDistrictFilter(event.target.value)}><option value="all">All districts</option>{qualityDistrictOptions.map((district) => <option value={district} key={district}>{district}</option>)}</select></label>
              <label><span>Facility level</span><select value={qualityFacilityLevelFilter} onChange={(event) => setQualityFacilityLevelFilter(event.target.value)}><option value="all">All levels</option>{qualityFacilityLevelOptions.map((level) => <option value={level} key={level}>{level}</option>)}</select></label>
              <label><span>Reporting status</span><select value={qualityStatusFilter} onChange={(event) => setQualityStatusFilter(event.target.value)}><option value="non-reporting">Any reporting gap</option><option value="all">All reporting units</option><option value="Fully reported">Fully reported</option><option value="Minor reporting gaps">Minor reporting gaps</option><option value="Irregular reporting">Irregular reporting</option><option value="Persistent non-reporting">Persistent non-reporting</option><option value="No reporting">No reporting</option></select></label>
            </div>
            <div className="stats-grid non-reporting-kpis">
              <KpiCard label="Expected reports" value={qualitySummary.expected.toLocaleString()} sub="Expected monthly or weekly reports" />
              <KpiCard label="Reports received" value={qualitySummary.reported.toLocaleString()} sub="Reports received in selected range" />
              <KpiCard label="Overall reporting rate" value={formatPercent(qualitySummary.rate)} sub="Reports received / expected" tone={reportingTone(qualitySummary.rate)} />
              <KpiCard label="Non-reporting units" value={qualityFacilityHistories.filter((row) => row.missedReports > 0).length.toLocaleString()} sub="Unique expected units with a gap" tone="red" />
              <KpiCard label="Incomplete reports" value="0" sub="Not inferable from tracer source" tone="amber" />
              <KpiCard label="Consistent units" value={qualitySummary.consistent.toLocaleString()} sub="Reported in every expected period" />
              <KpiCard label="Irregular units" value={qualitySummary.irregular.toLocaleString()} sub="Two or more missed periods" tone="amber" />
              <KpiCard label="Lowest reporting period" value={lowestQualityPoint ? formatPercent(lowestQualityPoint.rate) : "-"} sub={lowestQualityPoint?.label || "No selected periods"} tone="red" />
            </div>
            <div className="non-reporting-grid">
              <div className="quality-panel">
                <div className="quality-panel-head"><div><h3>Reporting Rate Trend</h3><p>Click a month or week to show facilities that missed that point.</p></div><span>{monthLabel(qualityRangeLower)} to {monthLabel(qualityRangeUpper)}</span></div>
                <div className="reporting-trend-graph"><div className="reporting-trend-axis">Reporting rate (%)</div><div className="reporting-trend-grid" aria-hidden="true">{[0, 25, 50, 75, 100].map((value) => <i key={value} style={{ bottom: `${value}%` }}><small>{value}%</small></i>)}</div><div className="reporting-trend-points" style={{ "--trend-points": qualityTrendRows.length }}>{qualityTrendRows.map((row) => <button type="button" className={qualityPointFilter === row.id ? "active" : ""} key={row.id} style={{ "--trend-rate": `${100 - normalizeRate(row.rate) * 100}%` }} onClick={() => { setQualityPointFilter((current) => current === row.id ? "all" : row.id); setQualityTablePage(1); }}><b>{formatPercent(row.rate)}</b><span>{qualityGranularity === "month" ? row.label.replace(" 2026", "") : row.label.replace("Week ", "W")}</span></button>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={qualityTrendPoints} /></svg></div>
              </div>
              <div className="quality-panel">
                <div className="quality-panel-head"><div><h3>District reporting rate</h3><p>Lowest to highest across the selected range.</p></div><span>{qualityDistrictTrendRows.length} districts</span></div>
                <div className="quality-bars">{qualityDistrictTrendRows.slice(0, 18).map((row) => <button type="button" className={`quality-bar-row reporting-tone-${reportingTone(row.rate)}`} key={row.name} onClick={() => setQualityDistrictFilter(row.name)}><span>{row.name}</span><div className="quality-bar-track"><i style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><b>{formatPercent(row.rate)}</b></button>)}</div>
              </div>
              <div className="quality-panel">
                <div className="quality-panel-head"><div><h3>Reporting rate by facility level</h3><p>Expected reports versus reports received.</p></div></div>
                <div className="quality-bars">{qualityLevelTrendRows.map((row) => <button type="button" className={`quality-bar-row reporting-tone-${reportingTone(row.rate)}`} key={row.name} onClick={() => setQualityFacilityLevelFilter(row.name)}><span>{row.name}</span><div className="quality-bar-track"><i style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><b>{formatPercent(row.rate)}</b></button>)}</div>
              </div>
            </div>
            <div className="table-panel non-reporting-table">
              <div className="table-headline"><div><h2>Non-reporting facilities</h2><p>Only expected reporting units with an identified reporting gap are listed. Aggregate health-post and health-centre rows remain aggregate where the submitted tracer does not provide individual facility names.</p></div><input value={qualitySearch} onChange={(event) => { setQualitySearch(event.target.value); setQualityTablePage(1); }} placeholder="Search facility, district, or province" /></div>
              <div className="table-scroll"><table><thead><tr><th>Province</th><th>District</th><th>Facility / reporting unit</th><th>Facility level</th><th>Expected</th><th>Submitted</th><th>Missed</th><th>Rate</th><th>Consecutive missed</th><th>Latest report</th><th>Status</th><th /></tr></thead><tbody>{visibleNonReportingFacilityRows.length ? visibleNonReportingFacilityRows.map((row) => <tr key={`${row.province}-${row.district}-${row.facilityLevel}-${row.name}`}><td>{row.province}</td><td>{row.district}</td><td>{row.name}</td><td>{row.facilityLevel}</td><td>{row.expectedReports}</td><td>{row.reportsSubmitted}</td><td>{row.missedReports}</td><td>{formatPercent(row.rate)}</td><td>{row.consecutiveMissed}</td><td>{row.latestReport}</td><td><span className={`comparison-signal ${row.missedReports ? "red" : "green"}`}>{row.consistency}</span></td><td><button type="button" className="ghost-button" onClick={() => setOpenReportingFacility(row)}>History</button></td></tr>) : <tr><td colSpan="12">No expected reporting units match the selected reporting-gap filters.</td></tr>}</tbody></table></div>
              <div className="non-reporting-pagination"><button type="button" disabled={qualityTableCurrentPage <= 1} onClick={() => setQualityTablePage((page) => page - 1)}>Previous</button><span>Page {qualityTableCurrentPage} of {qualityTablePageCount} | {nonReportingFacilityRows.length} facilities</span><button type="button" disabled={qualityTableCurrentPage >= qualityTablePageCount} onClick={() => setQualityTablePage((page) => page + 1)}>Next</button></div>
            </div>
          </div>
          {selectedProvinceQuality ? (
            <div className="quality-note">
              <strong>{selectedProvinceQuality.name}</strong>
              <span>{selectedProvinceQuality.reported.toLocaleString()} of {selectedProvinceQuality.expected.toLocaleString()} expected district-level reports submitted, with {selectedProvinceQuality.missing.toLocaleString()} missing.</span>
            </div>
          ) : null}
          {selectedProvince === "all" ? (
            <div className="empty-state">Select a province above to see expected and reported districts by level of care.</div>
          ) : (
            <div className="quality-level-sections">
              {qualityLevelSections.map((section) => <QualityLevelSection section={section} key={section.level} />)}
            </div>
          )}
          {comments.length ? (
            <div className="concerns-grid">
              {comments.slice(0, 6).map((comment, index) => (
                <div className="concern concern-neutral" key={`${comment.province}-${index}`}>
                  <div>
                    <span>{comment.province}</span>
                    <small>Submission comment</small>
                  </div>
                  <p>{comment.note}</p>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">No submission comments were captured for this selected week.</div>}
        </section>

        <section className="reporting-rate-section">
          <div className="section-head">
            <div>
              <p className="eyebrow dark">Reporting Rate</p>
              <h2>Facility and specialised unit reporting performance</h2>
              <p>Reporting rate is calculated as reporting units submitted divided by reporting units expected for each facility level or specialised programme in the selected period.</p>
            </div>
          </div>
          <div className="reporting-filter-bar">
            <label>
              <span>Reporting period</span>
              <select value={reportPeriodId} onChange={(event) => changeReportPeriod(event.target.value)}>
                {tracerReportingPeriods.map((period) => (
                  <option value={period.id} key={period.id}>{period.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Province</span>
              <select value={reportProvince} onChange={(event) => changeReportProvince(event.target.value)}>
                <option value="all">All provinces</option>
                {reportProvinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}
              </select>
            </label>
            <label>
              <span>District</span>
              <select value={reportDistrict} onChange={(event) => changeReportDistrict(event.target.value)}>
                <option value="all">All districts</option>
                {reportDistrictOptions.map((district) => <option value={district} key={district}>{district}</option>)}
              </select>
            </label>
            <label>
              <span>Facility Type</span>
              <select value={reportFacilityType} onChange={(event) => {
                setReportFacilityType(event.target.value);
                setReportDrillDistrict("");
              }}>
                <option value="all">All facility levels</option>
                {reportFacilityTypeOptions.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Report status</span>
              <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
                <option value="all">All</option>
                <option value="Reported">Reported</option>
                <option value="Not Reported">Not Reported</option>
              </select>
            </label>
          </div>
          <div className="stats-grid">
            <KpiCard label="Expected reporting units" value={reportingKpis.expected.toLocaleString()} sub="Facility-level reports expected" />
            <KpiCard label="Reporting units submitted" value={reportingKpis.reported.toLocaleString()} sub="Submitted in selected period" />
            <KpiCard label="Reporting units missing" value={reportingKpis.notReported.toLocaleString()} sub="Missing in selected period" tone="red" />
            <KpiCard label="Reporting rate" value={formatPercent(reportingKpis.rate)} sub="Reported / expected" tone={reportingTone(reportingKpis.rate)} />
          </div>
          <div className="reporting-drill-path">
            <button type="button" onClick={() => {
              setReportDrillProvince("");
              setReportDrillDistrict("");
            }}>Zambia</button>
            <span>/</span>
            <button type="button" disabled={!reportDrillProvince} onClick={() => setReportDrillDistrict("")}>
              {reportDrillProvince || "Select province"}
            </button>
            <span>/</span>
            <button type="button" disabled={!reportDrillDistrict}>{reportDrillDistrict || "Select district"}</button>
          </div>
          <div className="reporting-layout">
            <div className="quality-panel reporting-chart">
              <div className="quality-panel-head">
                <div>
                  <h3>{reportDrillProvince ? `District reporting rate in ${reportDrillProvince}` : "Reporting rate by province"}</h3>
                  <p>{reportDrillProvince ? "Click a district to show facility level and specialised reporting units." : "Click a province to drill down to district reporting rate."}</p>
                </div>
                <span>{reportingChartRows.length} rows</span>
              </div>
              <div className="quality-bars">
                {reportingChartRows.map((row) => {
                  const rate = row.rate || qualityRate(row);
                  const tone = reportingTone(rate);
                  return (
                    <button
                      type="button"
                      className={`quality-bar-row reporting-tone-${tone}`}
                      key={row.name}
                      onClick={() => {
                        if (reportDrillProvince) {
                          setReportDrillDistrict(row.name);
                          setReportDistrict(row.name);
                        } else {
                          setReportDrillProvince(row.name);
                          setReportProvince(row.name);
                          setReportDistrict("all");
                          setReportDrillDistrict("");
                        }
                      }}
                    >
                      <span>{row.name}</span>
                      <div className="quality-bar-track"><i style={{ width: `${Math.round(normalizeRate(rate) * 100)}%` }} /></div>
                      <b>{formatPercent(rate)}</b>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="quality-panel reporting-facilities">
              <div className="quality-panel-head">
                <div>
                  <h3>{reportDrillDistrict ? `${reportDrillDistrict} facility-level reporting` : "Facility-level reporting"}</h3>
                  <p>Rows show facility level and specialised reporting status for the selected scope.</p>
                </div>
                <span>{reportingFacilityRows.length} rows</span>
              </div>
              <div className="table-scroll compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Facility name</th>
                      <th>Facility type</th>
                      <th>Reported status</th>
                      <th>Reporting rate</th>
                      <th>Last reporting period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportingFacilityRows.map((row) => (
                      <tr key={`${row.province}-${row.district}-${row.facilityType}`}>
                        <td>{row.facilityName}</td>
                        <td>{row.facilityType}</td>
                        <td><span className={`status-pill ${row.status === "Reported" ? "reported" : "missing"}`}>{row.status}</span></td>
                        <td>{formatPercent(row.rate)}</td>
                        <td>{row.lastReportingPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="table-panel reporting-table">
            <div className="table-headline">
              <div>
                <h2>Reporting rate detail</h2>
                <p>Province, district and facility-type summary for the selected reporting filters.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>District</th>
                    <th>Facility Type</th>
                    <th>Expected</th>
                    <th>Reported</th>
                    <th>Not Reported</th>
                    <th>Reporting Rate %</th>
                  </tr>
                </thead>
                <tbody>
                  {reportingRows.map((row) => (
                    <tr key={`${row.province}-${row.district}-${row.facilityType}`}>
                      <td>{row.province}</td>
                      <td>{row.district}</td>
                      <td>{row.facilityType}</td>
                      <td>{row.expected.toLocaleString()}</td>
                      <td>{row.reported.toLocaleString()}</td>
                      <td>{row.notReported.toLocaleString()}</td>
                      <td><span className={`comparison-signal ${reportingTone(row.rate)}`}>{formatPercent(row.rate)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="action-tracker">
          <div className="action-tracker-head">
            <div>
              <p className="eyebrow dark">Control Tower Action Tracker</p>
              <h2>Turn tracer alerts into weekly actions</h2>
              <p>Actions are based on facility stockout, low-stock, programme, and data-quality signals from tracer submissions.</p>
            </div>
            <div className="action-summary">
              <span><b>{actions.filter((item) => item.status === "Open").length}</b> open</span>
              <span><b>{actions.filter((item) => item.status === "In progress").length}</b> in progress</span>
              <span><b>{actions.filter((item) => item.status === "Completed").length}</b> completed</span>
            </div>
          </div>
          <div className="action-table-wrap">
            <table>
              <thead>
                <tr><th>Issue</th><th>Action</th><th>Owner</th><th>Status</th></tr>
              </thead>
              <tbody>
                {actions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.issue}</td>
                    <td>{item.action}</td>
                    <td>{item.owner}</td>
                    <td>
                      <select value={item.status} onChange={(event) => updateActionStatus(item.id, event.target.value)}>
                        <option>Open</option>
                        <option>In progress</option>
                        <option>Completed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="redistribution-panel">
            <div className="redistribution-head">
              <div>
                <p className="eyebrow dark">Redistribution Recommendations</p>
                <h3>Same-province commodity matches for provincial pharmacists</h3>
                <p>Suggested from facilities reporting overstocked commodities to facilities in the same province reporting stockout or low stock for the same commodity.</p>
              </div>
              <div className="redistribution-summary">
                <span><b>{redistributionCandidates.length}</b> suggested transfers</span>
                <span><b>{redistributionProvinceCount}</b> provinces</span>
              </div>
            </div>
            <div className="action-table-wrap redistribution-table">
              <table>
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>Commodity</th>
                    <th>Source overstock</th>
                    <th>Destination need</th>
                    <th>Suggested action</th>
                  </tr>
                </thead>
                <tbody>
                  {redistributionCandidates.length ? redistributionCandidates.map((item, index) => (
                    <tr key={`${item.province}-${item.commodity}-${item.sourceFacility}-${item.destinationFacility}-${index}`}>
                      <td>{item.province}</td>
                      <td>{item.commodity}</td>
                      <td>
                        <strong>{item.sourceFacility}</strong>
                        <small>{item.sourceDistrict} | {item.sourceLevel}</small>
                        <small>MOS {formatMos(item.sourceMos)} | Qty {item.sourceQty?.toLocaleString?.() ?? item.sourceQty}</small>
                      </td>
                      <td>
                        <strong>{item.destinationFacility}</strong>
                        <small>{item.destinationDistrict} | {item.destinationLevel}</small>
                        <small>{item.priority} | MOS {formatMos(item.destinationMos)} | Qty {item.destinationQty?.toLocaleString?.() ?? item.destinationQty}</small>
                      </td>
                      <td>
                        <span className={item.priority === "Stockout" ? "priority-pill critical" : "priority-pill monitor"}>{item.priority}</span>
                        <p>Province to validate physical stock and redistribute from source to destination.</p>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5">No same-province overstock to stockout/low-stock commodity matches are available in the current filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <FacilityTracerModal
        key={openFacility ? `${openFacility.province}-${openFacility.district}-${openFacility.facilityLevel}-${openFacility.name}` : "closed"}
        facility={openFacility}
        report={fieldData}
        onClose={() => setOpenFacility(null)}
      />
      {openCommodityFacility && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setOpenCommodityFacility(null)}>
        <section className="commodity-detail-panel" role="dialog" aria-modal="true" aria-label="Commodity facility details" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head">
            <div><p className="eyebrow dark">Commodity Intelligence &gt; {selectedCommodity} &gt; {openCommodityFacility.facility}</p><h2>{openCommodityFacility.facility}</h2><span>{openCommodityFacility.district} | {openCommodityFacility.province} | {openCommodityFacility.facilityLevel}</span></div>
            <button type="button" onClick={() => setOpenCommodityFacility(null)}>Close</button>
          </div>
          <div className="commodity-detail-kpis">
            <div><span>Stock on hand</span><strong>{Math.round(openCommodityFacility.quantity).toLocaleString()}</strong></div>
            <div><span>Average monthly consumption</span><strong>{Math.round(openCommodityFacility.amc).toLocaleString()}</strong></div>
            <div><span>Months of stock</span><strong>{formatMos(openCommodityFacility.mos)}</strong></div>
            <div className={commodityStatusTone(commodityStockStatus(openCommodityFacility.mos))}><span>Current classification</span><strong>{commodityStockStatus(openCommodityFacility.mos)}</strong></div>
          </div>
          <div className="commodity-history"><h3>Submitted commodity trend</h3><p>Only periods with a submitted record are plotted. Missing submissions are not interpreted as stockouts.</p>{commodityFacilityHistory.length ? <div className="commodity-history-list">{commodityFacilityHistory.map((row) => <div key={row.reportDate}><span>{row.label}</span><b>SOH {Math.round(row.quantity).toLocaleString()}</b><b>AMC {Math.round(row.amc).toLocaleString()}</b><b>{formatMos(row.mos)} MOS</b><em>{commodityStockStatus(row.mos)}</em></div>)}</div> : <div className="empty-state">No submitted historical record was found for this commodity and facility.</div>}</div>
          <div className="commodity-detail-note"><b>Reporting status:</b> Reported for {fieldData.label}. Quantity received, dispensed/consumed, losses, adjustments, and days out of stock are not present in the submitted tracer source and are therefore not estimated.</div>
        </section>
      </div>}
      {openReportingFacility && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setOpenReportingFacility(null)}>
        <section className="commodity-detail-panel" role="dialog" aria-modal="true" aria-label="Facility reporting history" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head"><div><p className="eyebrow dark">Data Quality &gt; Non-Reporting Facilities &gt; {openReportingFacility.name}</p><h2>{openReportingFacility.name}</h2><span>{openReportingFacility.district} | {openReportingFacility.province} | {openReportingFacility.facilityLevel}</span></div><button type="button" onClick={() => setOpenReportingFacility(null)}>Close</button></div>
          <div className="commodity-detail-kpis"><div><span>Expected reports</span><strong>{openReportingFacility.expectedReports}</strong></div><div><span>Reports received</span><strong>{openReportingFacility.reportsSubmitted}</strong></div><div><span>Reporting rate</span><strong>{formatPercent(openReportingFacility.rate)}</strong></div><div className={openReportingFacility.missedReports ? "red" : "green"}><span>Consistency</span><strong>{openReportingFacility.consistency}</strong></div></div>
          <div className="commodity-history"><h3>Period-by-period reporting history</h3><p>{monthLabel(qualityRangeLower)} to {monthLabel(qualityRangeUpper)}. A missing period is only shown because this unit is expected in the reporting universe.</p><div className="commodity-history-list">{openReportingFacility.history.map((row) => <div key={row.id}><span>{row.label}</span><b>Expected: Yes</b><b>Reported: {row.reported ? "Yes" : "No"}</b><em>{row.reported ? "Reported" : "Not reported"}</em></div>)}</div></div>
          <div className="commodity-detail-note"><b>Latest successful report:</b> {openReportingFacility.latestReport}. <b>Consecutive periods missed:</b> {openReportingFacility.consecutiveMissed}. Aggregate health-post and health-centre reporting units are shown where named facility submissions are not present in the source.</div>
        </section>
      </div>}
    </div>
  );
}

export default App;
