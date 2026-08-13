import { useEffect, useMemo, useRef, useState } from "react";
import { tracerReportingPeriods } from "./tracerFacilityData.js";
import { weeklyStockPeriods } from "./weeklyStockData.js";
import { fitForecast, reorderRecommendation } from "./forecasting.js";
import { canonicalCommodityName, commodityRiskTone, commodityTrendDirection, findLongestZeroAvailabilityRun, isCommodityName } from "./commodityNormalization.js";
import { primaryCareDistrictRows, primaryCareDistrictSummary } from "./reportingQuality.js";
import { buildRedistributionCandidates } from "./redistribution.js";
import { analyseFacilityTracer, facilityTracerExportRows } from "./facilityTracerAnalysis.js";

const dashboardPages = [
  { id: "executive", short: "EX", label: "Executive Summary" },
  { id: "national", short: "NS", label: "National Stock Status" },
  { id: "stock", short: "ZS", label: "ZAMMSA Weekly Stock Status" },
  { id: "provincial", short: "PP", label: "Provincial Performance" },
  { id: "facilities", short: "FA", label: "Facility Alerts" },
  { id: "commodities", short: "CI", label: "Commodity Intelligence" },
  { id: "comparison", short: "CP", label: "Comparison" },
  { id: "programmes", short: "PR", label: "Programme Performance" },
  { id: "reporting", short: "RR", label: "Reporting Rate" },
  { id: "quality", short: "DQ", label: "Data Quality" },
  { id: "predictive", short: "PA", label: "Predictive Analysis" },
  { id: "actions", short: "AT", label: "Action Tracker" },
  { id: "imports", short: "IM", label: "Submission Import", adminOnly: true },
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

const actionApiUrl = window.__TRACER_SECURE_DASHBOARD__
  ? window.location.origin
  : import.meta.env.VITE_ACTION_API_URL || "https://tracer-comments-api.onrender.com";
const copilotApiUrl = window.__TRACER_SECURE_DASHBOARD__ ? window.location.origin : "";

const copilotSuggestions = [
  "What are the priority stockout risks in the current filters?",
  "Which provinces need the most urgent follow-up?",
  "Summarise reporting coverage for this reporting week.",
  "What should a provincial pharmacist act on first?",
];

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
    item: canonicalCommodityName(items[item]),
    programme: programmes[programme],
    quantity: quantity === null || quantity === undefined || quantity === "" ? null : Number(quantity),
    amc: amc === null || amc === undefined || amc === "" ? null : Number(amc),
    mos: mos === null || mos === undefined || mos === "" || !Number.isFinite(Number(mos)) ? null : Number(mos),
  })).filter((row) => isCommodityName(row.item));
}

function facilityIdentityKey(facility) {
  return [facility.province, facility.district, facility.facilityLevel, facility.name || facility.facility]
    .map((value) => String(value || "").trim().toUpperCase())
    .join("|");
}

function groupCommodityRowsByFacility(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = facilityIdentityKey({ ...row, name: row.facility });
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  });
  return grouped;
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

function collapseCommodityFacilityRows(rows, commodity) {
  if (!commodity) return [];
  const grouped = new Map();
  rows.filter((row) => row.item === commodity).forEach((row) => {
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
}

function matchesCommodityStatus(row, filter) {
  if (filter === "all") return true;
  if (filter === "Available") return row.quantity > 0;
  if (filter === "Overstocked / excess") return ["Overstocked", "Excess stock"].includes(commodityStockStatus(row.mos));
  return commodityStockStatus(row.mos) === filter;
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

function formatCalculatedMos(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value > 0 && value < 0.01) return Number(value).toFixed(3);
  if (value >= 0.01 && value < 0.1) return Number(value).toFixed(2);
  return Number(value).toFixed(1);
}

function MosSparkline({ values = [] }) {
  const submitted = values.filter((row) => Number.isFinite(row.mos));
  if (!submitted.length) return <span className="mos-sparkline-empty">No history</span>;
  const scale = Math.max(4, Math.min(12, Math.ceil(Math.max(...submitted.map((row) => row.mos)))));
  const points = values.map((row, index) => {
    if (!Number.isFinite(row.mos)) return null;
    const x = values.length > 1 ? (index / (values.length - 1)) * 76 + 2 : 40;
    const y = 25 - (Math.min(row.mos, scale) / scale) * 21;
    return { x, y, ...row };
  }).filter(Boolean);
  const latest = points.at(-1);
  const tone = commodityStatusTone(commodityStockStatus(latest?.mos));
  const label = values.map((row) => `${row.label}: ${Number.isFinite(row.mos) ? `${formatMos(row.mos)} MOS` : "not submitted"}`).join(", ");
  return <svg className={`mos-sparkline tone-${tone}`} viewBox="0 0 80 28" role="img" aria-label={`Eight-week MOS trend. ${label}`}><line x1="2" y1="25" x2="78" y2="25" /><polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />{points.map((point) => <circle cx={point.x} cy={point.y} r={point === latest ? 2.2 : 1.4} key={`${point.x}-${point.label}`} />)}</svg>;
}

function cappedAverageMos(rows) {
  const values = rows
    .map((row) => Number(row.mos))
    .filter(Number.isFinite)
    .map((value) => Math.min(12, Math.max(0, value)));
  if (!values.length) return null;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.round(average * 100) / 100;
}

function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
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

const initialDashboardParams = new URLSearchParams(window.location.search);
const initialDashboardParam = (name, fallback = "") => initialDashboardParams.get(name) || fallback;

const approvedLevelOfCareDisplayOverrides = {
  "2026-07-26": {
    level3: {
      mos: 2.9,
      availability: 0.78,
      note: "Programme-approved Week 4 presentation value from the 28 July tracer summary; the unadjusted facility rollup remains visible for audit.",
    },
  },
  "2026-08-02": {
    primary: { mos: 3.5, availability: 0.93, note: "Programme-approved July Week 5 presentation value from the 2 August Power BI tracer summary; the cleaned rollup remains visible for audit." },
    level1: { mos: 3.2, availability: 0.81, note: "Programme-approved July Week 5 presentation value from the 2 August Power BI tracer summary; the cleaned rollup remains visible for audit." },
    level2: { mos: 2.8, availability: 0.78, note: "Programme-approved July Week 5 presentation value from the 2 August Power BI tracer summary; the cleaned rollup remains visible for audit." },
    level3: { mos: 2.2, availability: 0.74, note: "Programme-approved July Week 5 presentation value from the 2 August Power BI tracer summary; the cleaned rollup remains visible for audit." },
  },
};

const approvedProvincePerformanceOverrides = {
  "2026-08-02": {
    "NORTH-WESTERN PROVINCE": { mos: 4.3, availability: 0.88 },
    "MUCHINGA PROVINCE": { mos: 3.8, availability: 0.86 },
    "CENTRAL PROVINCE": { mos: 3.7, availability: 0.94 },
    "SOUTHERN PROVINCE": { mos: 3.4, availability: 0.88 },
    "LUAPULA PROVINCE": { mos: 3.4, availability: 0.86 },
    "LUSAKA PROVINCE": { mos: 3.3, availability: 0.87 },
    "NORTHERN PROVINCE": { mos: 3.3, availability: 0.88 },
    "EASTERN PROVINCE": { mos: 3.0, availability: 0.88 },
    "COPPERBELT PROVINCE": { mos: 2.8, availability: 0.88 },
    "WESTERN PROVINCE": { mos: 2.7, availability: 0.85 },
  },
};

const facilityCareLevelOptions = [
  { value: "primary-combined", label: "Health Centre / Health Post (combined)" },
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
  if (text.includes("HEALTH CENTRE") || text.includes("HEALTH POST") || text.includes("PRIMARY CARE")) return "primary";
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
  if (selectedLevel === "primary-combined") return text.includes("PRIMARY CARE") || text.includes("HEALTH POST") || text.includes("HEALTH CENTRE");
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
        <span><i className="mos-key" />Availability bar, average MOS shown inside (12-month cap)</span>
        <span><i className="availability-key" />Submitted-row availability</span>
      </div>
      {level3Row ? (
        <div className="level-care-inclusions">
          <strong>Level 3/Specialised calculation includes</strong>
          <span>{level3Levels.length ? level3Levels.join(", ") : "No Level 3/Specialised facility levels in the current filter."}</span>
          <small>{formatPercent(level3Row.availability)} availability across {level3Row.rows.toLocaleString()} submitted rows, with {level3Row.stockout.toLocaleString()} stockout rows and {level3Row.dataGap.toLocaleString()} data-gap rows.</small>
          {level3Row.displayOverride ? (
            <small className="level-care-override-note">
              Approved display: {formatMos(level3Row.mos)} MOS and {formatPercent(level3Row.availability)} availability. Cleaned calculation: {formatMos(level3Row.calculatedMos)} MOS and {formatPercent(level3Row.calculatedAvailability)} availability. {level3Row.displayOverride.note}
            </small>
          ) : null}
          {level3Names.length ? <small>Facilities: {level3Names.slice(0, 12).join(", ")}{level3Names.length > 12 ? `, +${level3Names.length - 12} more` : ""}</small> : null}
        </div>
      ) : null}
    </section>
  );
}

function redistributionActionKey(item) {
  return [item.sourceProvince, item.destinationProvince || item.province, item.commodity, item.sourceDistrict, item.sourceFacility, item.destinationDistrict, item.destinationFacility]
    .map((value) => normalizeCommodity(String(value || "")))
    .join("|");
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
  if (periodType === "weekly") {
    const lowerLabel = tracerReportingPeriods.find((period) => period.id === lower)?.label || lower;
    const upperLabel = tracerReportingPeriods.find((period) => period.id === upper)?.label || upper;
    return lower === upper ? lowerLabel : `${lowerLabel} to ${upperLabel}`;
  }
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
  if (periodType === "weekly") {
    const lower = String(start) <= String(end) ? String(start) : String(end);
    const upper = String(start) <= String(end) ? String(end) : String(start);
    return String(period.id) >= lower && String(period.id) <= upper;
  }
  const value = periodType === "quarterly" ? quarterOfMonth(period.month) : String(period.month);
  const lower = String(start) <= String(end) ? String(start) : String(end);
  const upper = String(start) <= String(end) ? String(end) : String(start);
  return value >= lower && value <= upper;
}

function commodityComparisonRowsForPeriod(period, filters) {
  const groups = new Map();
  commodityRowsFromPeriod(period)
    .filter((row) => row.item === filters.commodity)
    .filter((row) => filters.province === "all" || row.province === filters.province)
    .filter((row) => filters.district === "all" || row.district === filters.district)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel))
    .filter((row) => filters.program === "all" || row.programme === filters.program)
    .forEach((row) => {
      let name = row.item;
      if (filters.compareBy === "province") name = row.province;
      if (filters.compareBy === "district") name = row.district;
      if (filters.compareBy === "program") name = row.programme;
      if (filters.compareBy === "level") name = careLevelBuckets.find((bucket) => bucket.id === careLevelBucket(row.facilityLevel))?.label || row.facilityLevel;
      const current = groups.get(name) || { ...makeEmptyRollup(name), name, group: name, available: 0, mosTotal: 0, mosRows: 0 };
      const status = commodityStockStatus(row.mos);
      current.rows += 1;
      current.available += row.quantity > 0 ? 1 : 0;
      current.stockout += status === "Stocked out" ? 1 : 0;
      current.nearCritical += status === "Emergency stock" ? 1 : 0;
      current.understocked += status === "Understocked" ? 1 : 0;
      current.accordingToPlan += status === "According to plan" ? 1 : 0;
      current.abovePlan += ["Overstocked", "Excess stock"].includes(status) ? 1 : 0;
      current.riskRows += ["Stocked out", "Emergency stock", "Understocked"].includes(status) ? 1 : 0;
      current.quantity += row.quantity || 0;
      current.amc += row.amc || 0;
      if (row.mos !== null) {
        current.mosTotal += row.mos;
        current.mosRows += 1;
      }
      groups.set(name, current);
    });
  return [...groups.values()].map((row) => ({
    ...row,
    availability: row.rows ? row.available / row.rows : 0,
    mos: row.amc > 0 ? row.quantity / row.amc : (row.mosRows ? row.mosTotal / row.mosRows : null),
    stockoutRate: row.rows ? row.stockout / row.rows : 0,
  }));
}

function comparisonRowsForPeriod(period, filters) {
  const provinceFilter = (row) => filters.province === "all" || row.province === filters.province || row.name === filters.province;
  const districtFilter = (row) => filters.district === "all" || row.district === filters.district || row.name === filters.district;
  const facilityLevelFilter = (row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel);
  const programFilter = (row) => filters.program === "all" || row.name === filters.program || row.programme === filters.program || row.program === filters.program;
  const commodityFilter = (row) => filters.commodity === "all" || row.name === filters.commodity;

  if (filters.commodity !== "all" && period.commodityFacilityData) return commodityComparisonRowsForPeriod(period, filters);

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

function forecastRiskTone(likelihood) {
  if (likelihood >= 0.6) return "red";
  if (likelihood >= 0.35) return "amber";
  return "green";
}

function forecastRiskLabel(likelihood) {
  if (likelihood >= 0.6) return "High risk";
  if (likelihood >= 0.35) return "Moderate risk";
  return "Lower risk";
}

function forecastHorizon(likelihood) {
  if (likelihood >= 0.6) return "Next 1-2 weeks";
  if (likelihood >= 0.35) return "Next 3-4 weeks";
  return "Monitor over 4 weeks";
}

function shortProvinceName(value = "") {
  return value
    .replace(/\s+PROVINCE$/i, "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function forecastRollupsForPeriod(period, filters) {
  const provinceMatches = (row) => filters.province === "all" || row.province === filters.province || row.name === filters.province;
  const hasDetailedScope = filters.district !== "all" || filters.facilityLevel !== "all" || filters.facility !== "all";

  if (!hasDetailedScope) {
    return (period.provinces || [])
      .filter(provinceMatches)
      .map((row) => ({ ...row, name: row.name, province: row.name }));
  }

  return aggregateRollups(
    (period.facilities || [])
      .filter(provinceMatches)
      .filter((row) => filters.district === "all" || row.district === filters.district)
      .filter((row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel))
      .filter((row) => filters.facility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.name}` === filters.facility),
    "province",
  );
}

function buildProvinceForecast(periods, filters) {
  const historyByProvince = new Map();
  periods.forEach((period) => {
    forecastRollupsForPeriod(period, filters).forEach((row) => {
      if (!row.rows) return;
      const key = row.name || row.province;
      if (!historyByProvince.has(key)) historyByProvince.set(key, []);
      historyByProvince.get(key).push({ ...row, label: period.label, reportDate: period.reportDate });
    });
  });

  return [...historyByProvince.entries()].map(([province, history]) => {
    const current = history.at(-1);
    const recent = history.slice(-4);
    const earlier = recent.slice(0, -1);
    const average = (rows, selector) => rows.length ? rows.reduce((total, row) => total + selector(row), 0) / rows.length : 0;
    const stockoutRate = current.stockoutRate ?? (current.rows ? current.stockout / current.rows : 0);
    const riskRate = current.rows ? (current.riskRows || 0) / current.rows : 0;
    const emergencyRate = current.rows ? (current.nearCritical || 0) / current.rows : 0;
    const recentRiskRate = average(recent, (row) => row.rows ? (row.riskRows || 0) / row.rows : 0);
    const earlierStockoutRate = average(earlier, (row) => row.stockoutRate ?? (row.rows ? row.stockout / row.rows : 0));
    const trendChange = stockoutRate - earlierStockoutRate;
    const worsening = Math.max(0, trendChange);

    // The score is deliberately transparent: it is a next-reporting-period risk estimate,
    // not a replacement for provincial stock verification or clinical supply planning.
    const likelihood = Math.min(1, Math.max(0,
      stockoutRate * 0.42
      + riskRate * 0.24
      + recentRiskRate * 0.18
      + emergencyRate * 0.08
      + worsening * 0.08,
    ));

    return {
      province,
      likelihood,
      label: forecastRiskLabel(likelihood),
      tone: forecastRiskTone(likelihood),
      currentStockoutRate: stockoutRate,
      currentRiskRate: riskRate,
      recentRiskRate,
      emergencyRate,
      worsening,
      movement: trendChange > 0.02 ? "up" : trendChange < -0.02 ? "down" : "steady",
      availability: current.availability || 0,
      mos: current.mos,
      rows: current.rows || 0,
      observations: history.length,
      confidence: Math.min(0.95, (Math.min(history.length, 8) / 8) * 0.7 + Math.min((current.rows || 0) / 1000, 1) * 0.3),
      lastReport: current.label,
    };
  }).sort((a, b) => b.likelihood - a.likelihood || b.currentStockoutRate - a.currentStockoutRate || a.province.localeCompare(b.province));
}

function buildCommodityForecast(periods, filters) {
  const historyByCommodity = new Map();
  const currentImpact = new Map();
  periods.forEach((period) => {
    (period.commodities || []).forEach((row) => {
      if (!row.rows) return;
      const key = row.normalized || normalizeCommodity(row.name);
      if (!historyByCommodity.has(key)) historyByCommodity.set(key, []);
      historyByCommodity.get(key).push({ ...row, label: period.label });
    });
  });

  const currentRows = commodityRowsFromPeriod(periods.at(-1) || {})
    .filter((row) => filters.province === "all" || row.province === filters.province)
    .filter((row) => filters.district === "all" || row.district === filters.district)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel))
    .filter((row) => filters.facility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === filters.facility);

  currentRows.forEach((row) => {
    const key = normalizeCommodity(row.item);
    if (!currentImpact.has(key)) currentImpact.set(key, {
      facilities: new Set(), provinces: new Set(), rows: 0, stockout: 0, emergency: 0, lowStock: 0, mosTotal: 0, mosCount: 0,
    });
    const impact = currentImpact.get(key);
    const mos = Number(row.mos);
    impact.rows += 1;
    if (Number.isFinite(mos)) {
      impact.mosTotal += Math.min(12, Math.max(0, mos));
      impact.mosCount += 1;
    }
    if ((row.quantity || 0) <= 0 || mos <= 0) impact.stockout += 1;
    else if (mos <= 0.5) impact.emergency += 1;
    else if (mos < 2) impact.lowStock += 1;
    if ((row.quantity || 0) <= 0 || mos < 2) {
      impact.facilities.add(`${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`);
      impact.provinces.add(row.province);
    }
  });

  return [...historyByCommodity.values()].map((history) => {
    const current = history.at(-1);
    const recent = history.slice(-4);
    const impact = currentImpact.get(current.normalized || normalizeCommodity(current.name));
    if (!impact) return null;
    const stockoutRate = impact.rows ? impact.stockout / impact.rows : 0;
    const emergencyRate = impact.rows ? impact.emergency / impact.rows : 0;
    const lowStockRate = impact.rows ? impact.lowStock / impact.rows : 0;
    const riskRate = impact.rows ? (impact.stockout + impact.emergency + impact.lowStock) / impact.rows : 0;
    const historicalRisk = recent.reduce((total, row) => total + row.riskRows / row.rows, 0) / recent.length;
    const demandForecast = fitForecast(history.map((row) => row.amc), { horizon: 6, seasonalPeriod: 6 });
    const nextDemand = demandForecast.forecast[0] ?? current.amc ?? 0;
    const projectedMos = nextDemand > 0 ? (current.quantity || 0) / nextDemand : current.mos || 0;
    const modelRisk = projectedMos <= 0 ? 1 : projectedMos <= 0.5 ? 0.85 : projectedMos < 2 ? 0.65 : projectedMos <= 4 ? 0.25 : 0.1;
    const currentRiskScore = stockoutRate * 0.46 + riskRate * 0.32 + historicalRisk * 0.22;
    const likelihood = Math.min(1, currentRiskScore * 0.65 + modelRisk * 0.35);
    const reorder = reorderRecommendation(demandForecast, current.quantity || 0, 1.5, 1.15);
    return {
      name: current.name,
      programme: current.programme || "Tracer commodity",
      likelihood,
      tone: forecastRiskTone(likelihood),
      stockoutRate,
      riskRate,
      emergencyRate,
      lowStockRate,
      mos: impact.mosCount ? impact.mosTotal / impact.mosCount : 0,
      observations: history.length,
      affectedFacilities: impact?.facilities.size || 0,
      affectedProvinces: impact?.provinces.size || 0,
      horizon: forecastHorizon(likelihood),
      projectedMos,
      forecastMethod: demandForecast.method,
      forecastDemand: nextDemand,
      forecastLower95: demandForecast.lower95[0] ?? null,
      forecastUpper95: demandForecast.upper95[0] ?? null,
      forecastRmse: demandForecast.rmse,
      forecastMape: demandForecast.mape,
      forecastParams: demandForecast.params,
      forecastSeasonalPeriod: demandForecast.seasonalPeriod,
      reorderPoint: reorder.reorderPoint,
      recommendedOrderQty: reorder.recommendedOrderQty,
    };
  }).filter(Boolean).sort((a, b) => b.likelihood - a.likelihood || b.stockoutRate - a.stockoutRate || a.name.localeCompare(b.name));
}

function buildForecastImpact(periods, filters) {
  const atRiskCounts = periods.map((period) => (period.facilities || [])
    .filter((row) => filters.province === "all" || row.province === filters.province)
    .filter((row) => filters.district === "all" || row.district === filters.district)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, filters.facilityLevel))
    .filter((row) => filters.facility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.name}` === filters.facility)
    .filter((row) => (row.stockoutItemCount || 0) > 0 || (row.lowStockItemCount || 0) > 0).length);
  const current = atRiskCounts.at(-1) || 0;
  const recentChanges = atRiskCounts.slice(-4).slice(1).map((value, index, values) => value - atRiskCounts.slice(-4)[index]);
  const weeklyChange = recentChanges.length ? recentChanges.reduce((total, value) => total + value, 0) / recentChanges.length : 0;
  return { current, projected: Math.max(0, Math.round(current + weeklyChange * 4)), weeklyChange };
}

function buildForecastFeedback(periods, filters) {
  const cycles = [];
  for (let index = 1; index < periods.length; index += 1) {
    const forecastPeriod = periods[index - 1];
    const actualPeriod = periods[index];
    const forecasts = buildProvinceForecast(periods.slice(0, index), filters);
    const actuals = new Map(forecastRollupsForPeriod(actualPeriod, filters)
      .filter((row) => row.rows > 0)
      .map((row) => [row.name || row.province, row]));

    forecasts.forEach((forecast) => {
      const actual = actuals.get(forecast.province);
      if (!actual?.rows) return;
      const actualStockoutRate = actual.stockoutRate ?? actual.stockout / actual.rows;
      const actualRiskRate = (actual.riskRows || 0) / actual.rows;
      const forecastHigh = forecast.likelihood >= 0.35;
      const actualHigh = actualStockoutRate >= 0.15;
      cycles.push({
        province: forecast.province,
        forecastLabel: forecastPeriod.label,
        actualLabel: actualPeriod.label,
        predictedLikelihood: forecast.likelihood,
        actualStockoutRate,
        actualRiskRate,
        accuracy: Math.max(0, 1 - Math.abs(forecast.likelihood - actualStockoutRate)),
        forecastHigh,
        actualHigh,
        confirmed: forecastHigh && actualHigh,
        missedAction: forecastHigh && actualHigh && actualStockoutRate >= forecast.currentStockoutRate,
      });
    });
  }

  const latestActualLabel = periods.at(-1)?.label || "";
  const latestCycle = cycles.filter((row) => row.actualLabel === latestActualLabel);
  const evaluated = latestCycle.length ? latestCycle : cycles;
  return {
    evaluated,
    total: evaluated.length,
    latestActualLabel,
    accuracy: evaluated.length ? evaluated.reduce((total, row) => total + row.accuracy, 0) / evaluated.length : 0,
    confirmed: evaluated.filter((row) => row.confirmed).length,
    highForecasts: evaluated.filter((row) => row.forecastHigh).length,
    missedActions: evaluated.filter((row) => row.missedAction)
      .sort((a, b) => b.actualStockoutRate - a.actualStockoutRate),
  };
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

function FacilityCard({ facility, onOpen, onOpenReporting }) {
  const didReport = facility.reportingStatus !== "Facility did not report";
  const rows = facility.rows || 0;
  const availabilityPercent = formatPercent(facility.availability);
  const stockoutPercent = rows ? formatPercent((facility.stockoutItemCount || 0) / rows) : "0%";
  const lowStockPercent = rows ? formatPercent((facility.lowStockItemCount || 0) / rows) : "0%";
  return (
    <article className={didReport ? "" : "facility-not-reported"}>
      <div className="facility-alert-head">
        <div>
          <h4>
            <button className="facility-title-button" type="button" onClick={() => didReport ? onOpen(facility) : onOpenReporting(facility)}>
              {facility.isAggregate ? `All ${facility.facilityLevel.toLowerCase()} facilities` : facility.name}
            </button>
          </h4>
          <span>{facility.district} | {facility.province} | {facility.facilityLevel}</span>
          <span className={`reporting-status-badge reporting-${String(facility.reportingStatus || "reported on time").toLowerCase().replaceAll(" ", "-")}`}>{facility.reportingStatus || "Reported on time"}</span>
          {facility.isAggregate ? <small className="aggregate-note">Aggregate summary row. Load actual provincial tracer files to show named facilities under this level.</small> : null}
          {didReport ? <div className="facility-condition-badges">
            {facility.stockoutItemCount > 0 && <span className="condition-stockout">Confirmed stock-out</span>}
            {facility.lowStockItemCount > 0 && <span className="condition-low">Low stock</span>}
            {facility.accordingToPlanItemCount > 0 && <span className="condition-plan">Has stock to plan</span>}
            {facility.overstockItemCount > 0 && <span className="condition-overstock">Overstocked</span>}
          </div> : null}
        </div>
        {didReport ? <div className="facility-alert-counts">
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
        </div> : null}
      </div>
      {didReport ? <div className="facility-alert-items">
        <div>
          <strong>Confirmed stock-outs</strong>
          {facility.stockoutItems?.length ? facility.stockoutItems.slice(0, 5).map((item, index) => (
            <span key={`stockout-${facility.name}-${item.item}-${index}`}>{item.item}<small>{item.program}</small></span>
          )) : <span>No confirmed stock-outs</span>}
        </div>
        <div>
          <strong>Critical and low-stock commodities</strong>
          {facility.lowStockItems?.length ? facility.lowStockItems.slice(0, 5).map((item, index) => (
            <span key={`low-${facility.name}-${item.item}-${index}`}>{item.item}<small>{item.program} | MOS {formatCalculatedMos(item.calculatedMos ?? item.mos)}</small></span>
          )) : <span>No low-stock items submitted</span>}
        </div>
      </div> : <div className="facility-no-report-message"><strong>Facility did not report for the selected week.</strong><span>Last reporting date: {facility.lastReportingDate || "No previous report available"}</span><b>Current stock status unknown.</b></div>}
      <button className="open-tracer-button" type="button" onClick={() => didReport ? onOpen(facility) : onOpenReporting(facility)}>{didReport ? "Open submitted tracer" : "Open reporting follow-up"}</button>
    </article>
  );
}

function FacilityTracerTable({ title, items, emptyText, type = "stock", collapsed = false }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <details className="facility-tracer-section" open={!collapsed}>
      <summary><strong>{title}</strong><span>{items.length} records</span></summary>
      <div className="tracer-detail-table">
        <table>
          <thead><tr><th>Commodity</th><th>Programme</th><th>Qty</th><th>AMC</th><th>Submitted MOS</th><th>Calculated MOS</th>{type === "low" ? <th>Estimated depletion</th> : <th>Previous status</th>}<th>Flags</th><th>Recommended action</th></tr></thead>
          <tbody>
            {items.length ? items.map((item, index) => (
              <tr className={!showAll && index >= 8 ? "tracer-row-hidden" : ""} key={`${title}-${item.item}-${index}`}>
                <td title={item.item}>{item.item}</td>
                <td>{item.program}</td>
                <td>{item.quantity === null ? "-" : item.quantity?.toLocaleString?.() ?? item.quantity}</td>
                <td>{item.amc === null ? "-" : item.amc?.toLocaleString?.() ?? item.amc}</td>
                <td>{formatMos(item.submittedMos)}</td>
                <td>{formatCalculatedMos(item.calculatedMos)}{item.submittedMos === null && item.calculatedMos !== null ? <small className="calculated-mos-note">Calculated because submitted MOS was blank.</small> : null}</td>
                <td>{type === "low" ? item.estimatedDepletion : item.previousStatus}</td>
                <td>{item.flags.length ? item.flags.map((flag) => <span className="data-quality-flag" key={flag}>{flag}</span>) : "-"}</td>
                <td>{item.recommendedAction}</td>
              </tr>
            )) : <tr><td colSpan="9">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
      {items.length > 8 ? <button className="view-all-tracer" type="button" onClick={(event) => { event.preventDefault(); setShowAll((value) => !value); }}>{showAll ? "Show first 8" : `View all ${items.length}`}</button> : null}
    </details>
  );
}

function FacilityTracerModal({ facility, report, onClose, onOpenActions }) {
  if (!facility) return null;
  const relatedFacilities = report.facilities
    .filter((item) => item.province === facility.province)
    .filter((item) => item.district === facility.district)
    .filter((item) => item.facilityLevel === facility.facilityLevel)
    .filter((item) => !item.isAggregate)
    .sort((a, b) => b.stockoutItemCount - a.stockoutItemCount || b.lowStockItemCount - a.lowStockItemCount || a.name.localeCompare(b.name));
  const [modalMode, setModalMode] = useState("aggregate");
  const [selectedTracer, setSelectedTracer] = useState(null);
  const [commoditySearch, setCommoditySearch] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const [tableSort, setTableSort] = useState("mos-asc");
  const activeFacility = modalMode === "facility" && selectedTracer ? selectedTracer : facility;
  const title = activeFacility.isAggregate ? `All ${activeFacility.facilityLevel.toLowerCase()} facilities` : activeFacility.name;
  const currentRows = useMemo(() => commodityRowsFromPeriod(report).filter((row) => facilityIdentityKey({ ...row, name: row.facility }) === facilityIdentityKey(activeFacility)), [report, activeFacility]);
  const previousReport = useMemo(() => tracerReportingPeriods.filter((period) => period.reportDate < report.reportDate).sort((a, b) => a.reportDate.localeCompare(b.reportDate)).at(-1), [report.reportDate]);
  const previousRows = useMemo(() => previousReport ? commodityRowsFromPeriod(previousReport).filter((row) => facilityIdentityKey({ ...row, name: row.facility }) === facilityIdentityKey(activeFacility)) : [], [previousReport, activeFacility]);
  const analysis = useMemo(() => analyseFacilityTracer(currentRows, previousRows), [currentRows, previousRows]);
  const statusTotal = analysis.total;
  const submittedAvailability = activeFacility.availability;
  const submittedAvailableCount = Math.round(submittedAvailability * statusTotal);
  const programmes = [...new Set(analysis.items.map((item) => item.program).filter(Boolean))].sort();
  const filterAndSortItems = (items) => {
    const search = commoditySearch.trim().toLowerCase();
    const filtered = items.filter((item) => (!search || item.item.toLowerCase().includes(search)) && (programmeFilter === "all" || item.program === programmeFilter));
    return [...filtered].sort((a, b) => {
      if (tableSort === "commodity-asc") return a.item.localeCompare(b.item);
      if (tableSort === "quantity-desc") return (b.quantity ?? -Infinity) - (a.quantity ?? -Infinity);
      if (tableSort === "amc-desc") return (b.amc ?? -Infinity) - (a.amc ?? -Infinity);
      if (tableSort === "mos-desc") return (b.calculatedMos ?? -Infinity) - (a.calculatedMos ?? -Infinity);
      return (a.calculatedMos ?? Infinity) - (b.calculatedMos ?? Infinity);
    });
  };
  const stockoutItems = filterAndSortItems(analysis.byStatus["Confirmed stock-out"]);
  const criticalItems = filterAndSortItems(analysis.byStatus["Critical low stock"]);
  const lowStockItems = filterAndSortItems(analysis.byStatus["Low stock"]);
  const accordingToPlanItems = filterAndSortItems(analysis.byStatus["Stocked according to plan"]);
  const overstockItems = filterAndSortItems(analysis.byStatus.Overstocked);
  const dataQualityItems = filterAndSortItems(analysis.dataQualityItems);
  const statusRows = [
    { label: "Confirmed stock-outs", value: analysis.byStatus["Confirmed stock-out"].length, definition: "Reported quantity equals zero", tone: "red" },
    { label: "Critical low stock", value: analysis.byStatus["Critical low stock"].length, definition: "Positive stock below 0.5 calculated MOS", tone: "amber" },
    { label: "Low stock", value: analysis.byStatus["Low stock"].length, definition: "0.5 to below 2 calculated MOS", tone: "amber" },
    { label: "Stocked according to plan", value: analysis.byStatus["Stocked according to plan"].length, definition: "2 to 4 calculated MOS", tone: "green" },
    { label: "Overstocked", value: analysis.byStatus.Overstocked.length, definition: "Above 4 calculated MOS", tone: "blue" },
    { label: "Data-quality exceptions", value: analysis.dataQualityItems.length, definition: "Submitted values requiring review", tone: "neutral" },
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
    const rows = facilityTracerExportRows({ reportLabel: report.label, province: activeFacility.province, district: activeFacility.district, facilityLevel: activeFacility.facilityLevel, facilityName: title, submittedAvailability: formatPercent(submittedAvailability), availabilityNumerator: submittedAvailableCount, availabilityDenominator: statusTotal, analysis, items: filterAndSortItems(analysis.items) });
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "submitted-tracer"}-${report.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTracerPdf() {
    document.querySelectorAll(".tracer-modal details").forEach((section) => { section.open = true; });
    document.body.classList.add("printing-tracer");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-tracer"), { once: true });
    window.print();
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
            <button type="button" onClick={exportTracerPdf}>Export PDF</button>
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
              <KpiCard label="Submitted tracer availability ⓘ" value={formatPercent(submittedAvailability)} sub={`${submittedAvailableCount} of ${statusTotal} tracer commodities had positive stock. Availability measures the proportion reported with quantity greater than zero.`} />
              <KpiCard label="Average / median MOS" value={`${formatMos(analysis.averageMos)} / ${formatMos(analysis.medianMos)}`} sub={`${analysis.items.filter((item) => Number.isFinite(item.calculatedMos)).length} of ${statusTotal} commodities with calculable MOS`} />
              {statusRows.map((row) => <KpiCard key={row.label} label={row.label} value={row.value} sub={`${row.value} of ${statusTotal} commodities (${statusTotal ? formatPercent(row.value / statusTotal) : "-"}). ${row.definition}`} tone={row.tone === "neutral" ? undefined : row.tone} />)}
            </div>
            <div className="availability-status-note">A commodity with positive stock is counted as available even when its months of stock are below the recommended level.</div>
            <div className="facility-week-comparison">Compared with the previous week: <b>{analysis.comparison.newStockouts} new stock-outs</b>, <b>{analysis.comparison.continuingStockouts} continuing stock-outs</b> and <b>{analysis.comparison.resolvedStockouts} resolved stock-outs</b>.{previousReport ? ` Previous period: ${previousReport.label}.` : " No previous facility report was available."}</div>
            <div className="facility-tracer-tools">
              <label><span>Search commodity</span><input value={commoditySearch} onChange={(event) => setCommoditySearch(event.target.value)} placeholder="Search commodity name" /></label>
              <label><span>Programme</span><select value={programmeFilter} onChange={(event) => setProgrammeFilter(event.target.value)}><option value="all">All programmes</option>{programmes.map((programme) => <option value={programme} key={programme}>{programme}</option>)}</select></label>
              <label><span>Sort tables</span><select value={tableSort} onChange={(event) => setTableSort(event.target.value)}><option value="mos-asc">MOS: lowest first</option><option value="mos-desc">MOS: highest first</option><option value="quantity-desc">Quantity: highest first</option><option value="amc-desc">AMC: highest first</option><option value="commodity-asc">Commodity: A–Z</option></select></label>
              <button type="button" onClick={onOpenActions}>Open redistribution tracker</button>
            </div>
            <div className="tracer-detail-sections">
              <FacilityTracerTable title="Confirmed stock-outs — reported quantity equals zero" items={stockoutItems} emptyText="No confirmed stock-outs match the current filters." />
              <FacilityTracerTable title="Critical low stock — positive quantity and below 0.5 MOS" items={criticalItems} type="low" emptyText="No critical low-stock commodities match the current filters." />
              <FacilityTracerTable title="Low-stock commodities" items={lowStockItems} type="low" emptyText="No low-stock commodities match the current filters." />
              <FacilityTracerTable title="Stocked according to plan" items={accordingToPlanItems} collapsed emptyText="No commodities between 2 and 4 calculated MOS match the current filters." />
              <FacilityTracerTable title="Overstocked commodities" items={overstockItems} collapsed emptyText="No commodities above 4 calculated MOS match the current filters." />
              <FacilityTracerTable title="Data-quality exceptions" items={dataQualityItems} collapsed emptyText="No data-quality exceptions match the current filters." />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState(() => dashboardPages.some((page) => page.id === initialDashboardParam("page")) ? initialDashboardParam("page") : "executive");
  const [fieldPeriodId, setFieldPeriodId] = useState(() => tracerReportingPeriods.some((period) => period.id === initialDashboardParam("period")) ? initialDashboardParam("period") : tracerReportingPeriods.at(-1).id);
  const [selectedProvince, setSelectedProvince] = useState(() => initialDashboardParam("province", "all"));
  const [selectedDistrict, setSelectedDistrict] = useState(() => initialDashboardParam("district", "all"));
  const [selectedFacilityLevel, setSelectedFacilityLevel] = useState(() => initialDashboardParam("level", "all"));
  const [selectedFacility, setSelectedFacility] = useState(() => initialDashboardParam("facility", "all"));
  const [openFacility, setOpenFacility] = useState(null);
  const [facilityStatusFilters, setFacilityStatusFilters] = useState([]);
  const [facilityAlertPage, setFacilityAlertPage] = useState(1);
  const [facilityAlertView, setFacilityAlertView] = useState("list");
  const [stockDate, setStockDate] = useState([...new Set(weeklyStockPeriods.map((period) => period.date))].sort().at(-1) || "");
  const [stockStream, setStockStream] = useState(weeklyStockPeriods.some((period) => period.stream === "EMMS") ? "EMMS" : weeklyStockPeriods.at(-1)?.stream || "LAB");
  const [stockCategory, setStockCategory] = useState("");
  const [stockCategoryDialog, setStockCategoryDialog] = useState(false);
  const [reportPeriodId, setReportPeriodId] = useState(tracerReportingPeriods.at(-1).id);
  const [reportProvince, setReportProvince] = useState("all");
  const [reportDistrict, setReportDistrict] = useState("all");
  const [reportFacilityType, setReportFacilityType] = useState("all");
  const [reportFacilityName, setReportFacilityName] = useState("all");
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
  const [comparisonFocusA, setComparisonFocusA] = useState("");
  const [comparisonFocusB, setComparisonFocusB] = useState("");
  const [query, setQuery] = useState(() => canonicalCommodityName(initialDashboardParam("commodity")));
  const [selectedCommodity, setSelectedCommodity] = useState(() => canonicalCommodityName(initialDashboardParam("commodity")));
  const [commodityOptionPage, setCommodityOptionPage] = useState(1);
  const [commodityListSort, setCommodityListSort] = useState({ key: "stockouts", direction: "desc" });
  const [commodityAvailabilityThreshold, setCommodityAvailabilityThreshold] = useState("all");
  const [commodityStatusFilter, setCommodityStatusFilter] = useState(() => initialDashboardParam("stock", "all"));
  const [commodityTableProvince, setCommodityTableProvince] = useState(() => initialDashboardParam("tableProvince", "all"));
  const [commodityTableDistrict, setCommodityTableDistrict] = useState(() => initialDashboardParam("tableDistrict", "all"));
  const [commodityTableLevel, setCommodityTableLevel] = useState(() => initialDashboardParam("tableLevel", "all"));
  const [commodityTableReportingStatus, setCommodityTableReportingStatus] = useState("all");
  const [commodityFacilityQuery, setCommodityFacilityQuery] = useState("");
  const [commoditySort, setCommoditySort] = useState("mos");
  const [commodityPage, setCommodityPage] = useState(1);
  const [commodityPageSize, setCommodityPageSize] = useState(25);
  const [commodityTrendWindow, setCommodityTrendWindow] = useState(12);
  const [openCommodityFacility, setOpenCommodityFacility] = useState(null);
  const [commodityMissingOpen, setCommodityMissingOpen] = useState(false);
  const commodityTableRef = useRef(null);
  const [qualityRangeStart, setQualityRangeStart] = useState("2026-01");
  const [qualityRangeEnd, setQualityRangeEnd] = useState(tracerReportingPeriods.at(-1)?.month || "2026-06");
  const [qualityGranularity, setQualityGranularity] = useState("month");
  const [qualityProvinceFilter, setQualityProvinceFilter] = useState("all");
  const [qualityDistrictFilter, setQualityDistrictFilter] = useState("all");
  const [qualityFacilityLevelFilter, setQualityFacilityLevelFilter] = useState("all");
  const [qualityStatusFilter, setQualityStatusFilter] = useState("non-reporting");
  const [qualitySearch, setQualitySearch] = useState("");
  const [qualityTablePage, setQualityTablePage] = useState(1);
  const [qualityPointFilter, setQualityPointFilter] = useState("all");
  const [openReportingFacility, setOpenReportingFacility] = useState(null);
  const [qualityDetailDialog, setQualityDetailDialog] = useState("");
  const [selectedLibraryPeriodId, setSelectedLibraryPeriodId] = useState("");
  const [predictiveTab, setPredictiveTab] = useState("overview");
  const [predictiveCommodityQuery, setPredictiveCommodityQuery] = useState("");
  const [predictiveCommodityStatus, setPredictiveCommodityStatus] = useState("at-risk");
  const [predictiveCommodityPage, setPredictiveCommodityPage] = useState(1);
  const [actionCommodityQuery, setActionCommodityQuery] = useState("");
  const [actionPageSize, setActionPageSize] = useState(10);
  const [actionPage, setActionPage] = useState(1);
  const [actionUpdates, setActionUpdates] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("tracer-action-updates") || "{}") || {};
    } catch {
      return {};
    }
  });
  const [actionComments, setActionComments] = useState({});
  const [actionCommentDrafts, setActionCommentDrafts] = useState({});
  const [openActionComments, setOpenActionComments] = useState(null);
  const [actionUserEmail, setActionUserEmail] = useState("");
  const [actionSyncState, setActionSyncState] = useState("loading");
  const [actionCommentError, setActionCommentError] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState("");
  const [copilotMessages, setCopilotMessages] = useState([]);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotFeedback, setCopilotFeedback] = useState({});
  const [dashboardUser, setDashboardUser] = useState(null);
  const [importFiles, setImportFiles] = useState([]);
  const [importPeriod, setImportPeriod] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importBusy, setImportBusy] = useState("");
  const [importError, setImportError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", activePage);
    params.set("period", fieldPeriodId);
    if (selectedProvince !== "all") params.set("province", selectedProvince);
    if (selectedDistrict !== "all") params.set("district", selectedDistrict);
    if (selectedFacilityLevel !== "all") params.set("level", selectedFacilityLevel);
    if (selectedFacility !== "all") params.set("facility", selectedFacility);
    if (selectedCommodity) params.set("commodity", selectedCommodity);
    if (commodityStatusFilter !== "all") params.set("stock", commodityStatusFilter);
    if (commodityTableProvince !== "all") params.set("tableProvince", commodityTableProvince);
    if (commodityTableDistrict !== "all") params.set("tableDistrict", commodityTableDistrict);
    if (commodityTableLevel !== "all") params.set("tableLevel", commodityTableLevel);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activePage, fieldPeriodId, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility, selectedCommodity, commodityStatusFilter, commodityTableProvince, commodityTableDistrict, commodityTableLevel]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${actionApiUrl}/api/action-updates`).then((response) => {
        if (!response.ok) throw new Error("Unable to load shared action updates");
        return response.json();
      }),
      window.__TRACER_SECURE_DASHBOARD__
        ? fetch(`${actionApiUrl}/api/current-user`).then((response) => response.ok ? response.json() : null)
        : Promise.resolve(null),
    ])
      .then(([data, user]) => {
        if (cancelled) return;
        setActionUpdates(data?.updates && typeof data.updates === "object" ? data.updates : {});
        // Older shared-action records may not contain an array for every key.
        // Keep a malformed response from preventing the dashboard from rendering.
        setActionComments(Object.fromEntries(
          Object.entries(data?.comments && typeof data.comments === "object" ? data.comments : {})
            .map(([key, comments]) => [key, Array.isArray(comments) ? comments : []]),
        ));
        setActionUserEmail(user?.email || "");
        setDashboardUser(user || null);
        setActionSyncState("shared");
      })
      .catch(() => {
        if (!cancelled) setActionSyncState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDashboardAdmin = ["admin", "super_admin"].includes(dashboardUser?.role);
  const visibleDashboardPages = dashboardPages.filter((page) => !page.adminOnly || isDashboardAdmin);

  async function submitProvincialImport(action) {
    if (!importFiles.length) {
      setImportError("Choose one or more provincial .xlsx submissions first.");
      return;
    }
    setImportBusy(action);
    setImportError("");
    const body = new FormData();
    importFiles.forEach((file) => body.append("reports", file));
    body.append("reportingPeriod", importPeriod || fieldData.id);
    try {
      const endpoint = action === "validate" ? "/api/admin/submissions/validate" : action === "master" ? "/api/admin/submissions/master-workbook" : "/api/admin/submissions/publish";
      const response = await fetch(endpoint, { method: "POST", body });
      if (action === "master") {
        if (!response.ok) throw new Error((await response.json()).error || "Unable to create the master workbook.");
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `tracer-master-${importPeriod || fieldData.id}.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The submission could not be processed.");
        setImportResult(data);
      }
    } catch (error) {
      setImportError(error.message || "The submission could not be processed.");
    } finally {
      setImportBusy("");
    }
  }

  const fieldData = tracerReportingPeriods.find((period) => period.id === fieldPeriodId) || tracerReportingPeriods.at(-1);
  const activePageLabel = dashboardPages.find((page) => page.id === activePage)?.label || "Tracer Dashboard";
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
  const reportBaseRows = primaryCareDistrictRows(reportData)
    .map((row) => {
      const reported = row.submitted ? 1 : 0;
      return {
        province: row.province,
        district: row.name,
        expected: 1,
        reported,
        notReported: 1 - reported,
        missing: 1 - reported,
        status: row.status,
        partial: row.partial,
        hospitalOnly: row.hospitalOnly,
        healthCentreReported: row.healthCentreReported,
        healthPostReported: row.healthPostReported,
        combinedPrimaryCareReported: row.combinedPrimaryCareReported,
        detailStatus: row.detailStatus,
        rate: reported,
        lastReportingPeriod: reported ? reportData.label : "-",
      };
    });
  const reportExpectedFacilityRows = (reportData.dataQuality?.facilities || [])
    .map((facility) => {
      const previous = tracerReportingPeriods
        .filter((period) => period.reportDate < reportData.reportDate)
        .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
        .find((period) => (period.dataQuality?.facilities || []).some((candidate) => candidate.reported && facilityIdentityKey(candidate) === facilityIdentityKey(facility)));
      return {
        province: facility.province,
        district: facility.district,
        facilityName: facility.name,
        facilityType: facility.facilityLevel,
        status: facility.reported ? "Reported" : "Not Reported",
        rate: facility.reported ? 1 : 0,
        lastReportingPeriod: facility.reported ? reportData.label : previous?.label || "No previous report available",
        sourceFacility: facility,
      };
    });
  const reportExpectedKeys = new Set(reportExpectedFacilityRows.map((row) => `${row.province}|${row.district}|${row.facilityType}|${row.facilityName}`));
  const reportSubmittedFacilityRows = [...reportExpectedFacilityRows, ...(reportData.facilities || [])
    .filter((facility) => !reportExpectedKeys.has(`${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`))
    .map((facility) => ({
      province: facility.province,
      district: facility.district,
      facilityName: facility.name,
      facilityType: facility.facilityLevel,
      status: "Reported",
      rate: 1,
      lastReportingPeriod: reportData.label,
      sourceFacility: facility,
    }))];
  const reportFacilityTypeOptions = [...new Set(reportSubmittedFacilityRows.map((row) => row.facilityType))].sort();
  const reportProvinceOptions = [...new Set(reportBaseRows.map((row) => row.province))].sort();
  const reportDistrictOptions = [...new Set(reportBaseRows
    .filter((row) => reportProvince === "all" || row.province === reportProvince)
    .map((row) => row.district))].sort();
  const reportingRows = reportBaseRows
    .filter((row) => reportProvince === "all" || row.province === reportProvince)
    .filter((row) => reportDistrict === "all" || row.district === reportDistrict)
    .filter((row) => reportStatus === "all" || row.status === reportStatus);
  const reportingKpis = reportingRows.reduce((acc, row) => {
    acc.expected += row.expected || 0;
    acc.reported += row.reported || 0;
    acc.notReported += row.notReported || 0;
    acc.partial += row.partial ? 1 : 0;
    acc.hospitalOnly += row.hospitalOnly ? 1 : 0;
    return acc;
  }, { expected: 0, reported: 0, notReported: 0, partial: 0, hospitalOnly: 0 });
  reportingKpis.rate = reportingKpis.expected ? reportingKpis.reported / reportingKpis.expected : 0;
  const reportingProvinceRows = aggregateQualityRows(reportingRows, "province", "name")
    .sort((a, b) => a.name.localeCompare(b.name));
  const reportingDistrictRows = aggregateQualityRows(
    reportingRows.filter((row) => (reportDrillProvince || reportProvince) === "all" || row.province === (reportDrillProvince || reportProvince)),
    "district",
    "name",
  ).sort((a, b) => a.name.localeCompare(b.name));
  const reportingChartRows = reportDrillProvince ? reportingDistrictRows : reportingProvinceRows;
  const reportingFacilityScopeRows = reportSubmittedFacilityRows
    .filter((row) => reportProvince === "all" || row.province === reportProvince)
    .filter((row) => reportDistrict === "all" || row.district === reportDistrict)
    .filter((row) => !reportDrillProvince || row.province === reportDrillProvince)
    .filter((row) => !reportDrillDistrict || row.district === reportDrillDistrict)
    .filter((row) => reportFacilityType === "all" || row.facilityType === reportFacilityType)
    .filter((row) => reportFacilityName === "all" || row.facilityName === reportFacilityName)
    .sort((a, b) => a.province.localeCompare(b.province) || a.district.localeCompare(b.district) || a.facilityType.localeCompare(b.facilityType));
  const reportingFacilityRows = reportingFacilityScopeRows.filter((row) => reportStatus === "all" || row.status === reportStatus);
  const reportingFacilityKpis = reportingFacilityScopeRows.reduce((summary, row) => {
    summary.expected += 1;
    if (row.status === "Reported") summary.received += 1;
    else summary.missing += 1;
    return summary;
  }, { expected: 0, received: 0, missing: 0 });

  const provinceOptions = fieldData.provinces.map((province) => province.name).sort();
  // Retain every expected district in the filter even when it did not submit
  // during the selected week. This makes a reporting gap visible instead of
  // making the district disappear from the dashboard.
  const districtDirectory = fieldData.dataQuality?.districts?.length
    ? fieldData.dataQuality.districts
    : fieldData.districts;
  const districtOptions = [...new Set(districtDirectory
    .filter((district) => selectedProvince === "all" || district.province === selectedProvince)
    .map((district) => district.name))].sort();
  const scopedFacilityLevelRows = fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => selectedDistrict === "all" || facility.district === selectedDistrict);
  const optionIsAvailableInScope = (option) => scopedFacilityLevelRows.some((facility) => matchesFacilityCareLevel(facility.facilityLevel, option.value));
  const facilityLevelOptions = facilityCareLevelOptions.filter(optionIsAvailableInScope);
  const specialisedFacilityLevelOptions = specialisedCareLevelOptions.filter(optionIsAvailableInScope);
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
  const periodCommodityRows = useMemo(() => commodityRowsFromPeriod(fieldData), [fieldData]);
  const filteredCommodityRows = useMemo(() => periodCommodityRows
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
    .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel))
    .filter((row) => selectedFacility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === selectedFacility), [periodCommodityRows, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);

  const fieldKpis = combineRollups(filteredFacilities, fieldData.national);
  const fieldAverageMos = cappedAverageMos(filteredCommodityRows);
  const isNationalUnfilteredScope = selectedProvince === "all"
    && selectedDistrict === "all"
    && selectedFacilityLevel === "all"
    && selectedFacility === "all";
  const scopedProvinceRows = aggregateRollups(filteredFacilities, "province")
    .map((row) => {
      const displayOverride = isNationalUnfilteredScope ? approvedProvincePerformanceOverrides[fieldData.id]?.[row.name] : null;
      return displayOverride ? {
        ...row,
        calculatedAvailability: row.availability,
        calculatedMos: row.mos,
        availability: displayOverride.availability,
        mos: displayOverride.mos,
        displayOverride,
      } : row;
    })
    .sort((a, b) => b.availability - a.availability || b.rows - a.rows);
  const scopedDistrictRows = aggregateRollups(filteredFacilities, "district")
    .sort((a, b) => b.riskRows - a.riskRows || a.availability - b.availability);
  const levelOfCareRows = careLevelBuckets.map((bucket) => {
    const facilities = filteredFacilities.filter((facility) => careLevelBucket(facility.facilityLevel) === bucket.id);
    const commodityRows = filteredCommodityRows.filter((row) => careLevelBucket(row.facilityLevel) === bucket.id);
    const calculatedRollup = combineRollups(facilities, makeEmptyRollup(bucket.label));
    const calculatedMos = cappedAverageMos(commodityRows);
    const displayOverride = isNationalUnfilteredScope
      ? approvedLevelOfCareDisplayOverrides[fieldData.id]?.[bucket.id]
      : null;
    return {
      ...calculatedRollup,
      availability: displayOverride?.availability ?? calculatedRollup.availability,
      mos: displayOverride?.mos ?? calculatedMos,
      calculatedAvailability: calculatedRollup.availability,
      calculatedMos,
      displayOverride,
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
  const facilityCommodityRows = useMemo(() => groupCommodityRowsByFacility(filteredCommodityRows), [filteredCommodityRows]);
  const correctedReportingFacilities = useMemo(() => filteredFacilities.map((facility) => {
    const analysis = analyseFacilityTracer(facilityCommodityRows.get(facilityIdentityKey(facility)) || []);
    const incomplete = analysis.items.some((item) => item.quantity === null || (item.quantity > 0 && (item.amc === null || item.amc <= 0)));
    const stockoutItems = analysis.byStatus["Confirmed stock-out"];
    const lowStockItems = [...analysis.byStatus["Critical low stock"], ...analysis.byStatus["Low stock"]];
    return {
      ...facility,
      reportingStatus: facility.reportedLate ? "Reported late" : incomplete ? "Report submitted but incomplete" : "Reported on time",
      stockoutItems,
      lowStockItems,
      stockoutItemCount: stockoutItems.length,
      lowStockItemCount: lowStockItems.length,
      criticalLowStockItemCount: analysis.byStatus["Critical low stock"].length,
      accordingToPlanItemCount: analysis.byStatus["Stocked according to plan"].length,
      overstockItemCount: analysis.byStatus.Overstocked.length,
    };
  }), [filteredFacilities, facilityCommodityRows]);
  const missingExpectedFacilities = useMemo(() => (fieldData.dataQuality?.facilities || [])
    .filter((facility) => !facility.reported)
    .filter((facility) => !correctedReportingFacilities.some((submitted) => facilityIdentityKey(submitted) === facilityIdentityKey(facility)))
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => selectedDistrict === "all" || facility.district === selectedDistrict)
    .filter((facility) => matchesFacilityCareLevel(facility.facilityLevel, selectedFacilityLevel))
    .map((facility) => {
      const previous = tracerReportingPeriods
        .filter((period) => period.reportDate < fieldData.reportDate)
        .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
        .find((period) => (period.dataQuality?.facilities || []).some((candidate) => candidate.reported && facilityIdentityKey(candidate) === facilityIdentityKey(facility)));
      return {
        ...facility,
        rows: 0,
        availability: null,
        reportingStatus: "Facility did not report",
        lastReportingDate: previous?.label || null,
        stockoutItems: [],
        lowStockItems: [],
        stockoutItemCount: 0,
        lowStockItemCount: 0,
        criticalLowStockItemCount: 0,
        accordingToPlanItemCount: 0,
        overstockItemCount: 0,
      };
    })
    .filter((facility) => selectedFacility === "all" || `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}` === selectedFacility), [fieldData, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility, correctedReportingFacilities]);
  const assessedFacilities = useMemo(() => {
    const unique = new Map();
    [...missingExpectedFacilities, ...correctedReportingFacilities].forEach((facility) => unique.set(facilityIdentityKey(facility), facility));
    return [...unique.values()];
  }, [missingExpectedFacilities, correctedReportingFacilities]);
  const stockoutFacilityCount = correctedReportingFacilities.filter((facility) => facility.stockoutItemCount > 0).length;
  const lowStockFacilityCount = correctedReportingFacilities.filter((facility) => facility.lowStockItemCount > 0).length;
  const facilityStatusOptions = [
    { id: "stockout", label: "Confirmed stock-outs", shortLabel: "Stock-out", icon: "!", tone: "red", matches: (facility) => facility.reportingStatus !== "Facility did not report" && facility.stockoutItemCount > 0 },
    { id: "low", label: "Low-stock commodities", shortLabel: "Low stock", icon: "↓", tone: "orange", matches: (facility) => facility.reportingStatus !== "Facility did not report" && facility.lowStockItemCount > 0 },
    { id: "missing", label: "Did not report", shortLabel: "Did not report", icon: "×", tone: "dark-red", matches: (facility) => facility.reportingStatus === "Facility did not report" },
    { id: "plan", label: "Has commodities stocked to plan", shortLabel: "Has stock to plan", icon: "✓", tone: "green", matches: (facility) => facility.reportingStatus !== "Facility did not report" && facility.accordingToPlanItemCount > 0 },
    { id: "overstock", label: "Has overstocked commodities", shortLabel: "Overstocked", icon: "↑", tone: "blue", matches: (facility) => facility.reportingStatus !== "Facility did not report" && facility.overstockItemCount > 0 },
  ];
  const facilityStatusCounts = Object.fromEntries(facilityStatusOptions.map((option) => [option.id, assessedFacilities.filter(option.matches).length]));
  const filteredFacilityAlerts = assessedFacilities
    .filter((facility) => !facilityStatusFilters.length || facilityStatusOptions.some((option) => facilityStatusFilters.includes(option.id) && option.matches(facility)))
    .sort((a, b) => Number(b.reportingStatus === "Facility did not report") - Number(a.reportingStatus === "Facility did not report") || Number(a.isAggregate) - Number(b.isAggregate) || b.stockoutItemCount - a.stockoutItemCount || b.lowStockItemCount - a.lowStockItemCount);
  const facilityAlertPageSize = 24;
  const facilityAlertPageCount = Math.max(1, Math.ceil(filteredFacilityAlerts.length / facilityAlertPageSize));
  const facilityAlertCurrentPage = Math.min(facilityAlertPage, facilityAlertPageCount);
  const visibleFacilityAlerts = filteredFacilityAlerts.slice((facilityAlertCurrentPage - 1) * facilityAlertPageSize, facilityAlertCurrentPage * facilityAlertPageSize);
  const activeFacilityStatusOptions = facilityStatusOptions.filter((option) => facilityStatusFilters.includes(option.id));
  const facilityAlertsHeading = activeFacilityStatusOptions.length === 1
    ? `Facilities with ${activeFacilityStatusOptions[0].label.toLowerCase()}`
    : activeFacilityStatusOptions.length > 1
      ? "Facilities matching selected stock and reporting conditions"
      : "All assessed facilities";
  const redistributionCandidates = useMemo(() => buildRedistributionCandidates(filteredCommodityRows), [filteredCommodityRows]);
  const actionCommodityCandidates = useMemo(() => redistributionCandidates.filter((item) => !actionCommodityQuery.trim() || item.commodity.toLowerCase().includes(actionCommodityQuery.trim().toLowerCase())), [redistributionCandidates, actionCommodityQuery]);
  const actionPageCount = Math.max(1, Math.ceil(actionCommodityCandidates.length / actionPageSize));
  const actionCurrentPage = Math.min(actionPage, actionPageCount);
  const visibleActionCommodityCandidates = actionCommodityCandidates.slice((actionCurrentPage - 1) * actionPageSize, actionCurrentPage * actionPageSize);
  const actionSummary = actionCommodityCandidates.reduce((summary, item) => {
    const status = actionUpdates[redistributionActionKey(item)]?.status || "Open";
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { Open: 0, "In progress": 0, Completed: 0 });
  const facilityAlerts = filteredFacilityAlerts;
  const districtsInScope = scopedDistrictRows;
  const predictiveHistoryPeriods = useMemo(() => tracerReportingPeriods
    .filter((period) => period.reportDate <= fieldData.reportDate)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate)), [fieldData.reportDate]);
  const predictiveProvinceRows = useMemo(() => buildProvinceForecast(predictiveHistoryPeriods, {
    province: selectedProvince,
    district: selectedDistrict,
    facilityLevel: selectedFacilityLevel,
    facility: selectedFacility,
  }), [predictiveHistoryPeriods, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const predictiveHighRiskRows = predictiveProvinceRows.filter((row) => row.tone === "red");
  const predictiveAverageLikelihood = predictiveProvinceRows.length
    ? predictiveProvinceRows.reduce((total, row) => total + row.likelihood, 0) / predictiveProvinceRows.length
    : 0;
  const predictiveFilters = {
    province: selectedProvince,
    district: selectedDistrict,
    facilityLevel: selectedFacilityLevel,
    facility: selectedFacility,
  };
  const predictiveCommodityRows = useMemo(() => buildCommodityForecast(predictiveHistoryPeriods, predictiveFilters), [predictiveHistoryPeriods, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const predictiveModelSummary = useMemo(() => {
    const errors = predictiveCommodityRows.map((row) => row.forecastMape).filter(Number.isFinite).sort((a, b) => a - b);
    const middle = Math.floor(errors.length / 2);
    const medianMape = errors.length ? (errors.length % 2 ? errors[middle] : (errors[middle - 1] + errors[middle]) / 2) : null;
    return {
      modelled: predictiveCommodityRows.filter((row) => Number.isFinite(row.forecastDemand)).length,
      seasonal: predictiveCommodityRows.filter((row) => row.forecastMethod === "holt_winters_additive").length,
      medianMape,
      reorderUnits: predictiveCommodityRows.reduce((sum, row) => sum + (row.recommendedOrderQty || 0), 0),
    };
  }, [predictiveCommodityRows]);
  const predictiveCommodityTopFive = predictiveCommodityRows.filter((row) => row.affectedFacilities > 0).slice(0, 5);
  const predictiveThreatRows = useMemo(() => {
    const search = predictiveCommodityQuery.trim().toLowerCase();
    return predictiveCommodityRows.filter((row) => {
      if (search && !`${row.name} ${row.programme}`.toLowerCase().includes(search)) return false;
      if (predictiveCommodityStatus === "stockout") return row.stockoutRate > 0;
      if (predictiveCommodityStatus === "emergency") return row.emergencyRate > 0;
      if (predictiveCommodityStatus === "low-stock") return row.lowStockRate > 0;
      if (predictiveCommodityStatus === "high-risk") return row.tone === "red";
      return row.riskRate > 0;
    });
  }, [predictiveCommodityRows, predictiveCommodityQuery, predictiveCommodityStatus]);
  const predictiveThreatPageSize = 20;
  const predictiveThreatPages = Math.max(1, Math.ceil(predictiveThreatRows.length / predictiveThreatPageSize));
  const predictiveThreatPageRows = predictiveThreatRows.slice((Math.min(predictiveCommodityPage, predictiveThreatPages) - 1) * predictiveThreatPageSize, Math.min(predictiveCommodityPage, predictiveThreatPages) * predictiveThreatPageSize);
  const predictiveImpact = useMemo(() => buildForecastImpact(predictiveHistoryPeriods, predictiveFilters), [predictiveHistoryPeriods, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const predictiveTimeline = useMemo(() => predictiveHistoryPeriods.map((period) => {
    const rollup = combineRollups(forecastRollupsForPeriod(period, predictiveFilters), makeEmptyRollup());
    return { label: period.label, rate: rollup.rows ? rollup.riskRows / rollup.rows : 0 };
  }), [predictiveHistoryPeriods, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const predictiveTimelineVisible = predictiveTimeline.slice(-12);
  const predictiveTimelineScale = Math.max(0.4, ...predictiveTimelineVisible.map((row) => row.rate || 0));
  const predictiveTimelinePoints = predictiveTimelineVisible.map((row, index) => {
    const x = predictiveTimelineVisible.length > 1 ? (index / (predictiveTimelineVisible.length - 1)) * 100 : 50;
    const y = 92 - ((row.rate || 0) / predictiveTimelineScale) * 80;
    return `${x},${y}`;
  }).join(" ");
  const predictiveProvinceMos = useMemo(() => {
    const groups = new Map();
    commodityRowsFromPeriod(fieldData).forEach((row) => {
      if (!groups.has(row.province)) groups.set(row.province, []);
      groups.get(row.province).push(row);
    });
    return new Map([...groups.entries()].map(([province, rows]) => [province, cappedAverageMos(rows)]));
  }, [fieldData]);
  const predictiveAttentionByProvince = useMemo(() => {
    const groups = new Map();
    filteredFacilities.forEach((facility) => {
      if ((facility.stockoutItemCount || 0) > 0 || (facility.lowStockItemCount || 0) > 0) {
        groups.set(facility.province, (groups.get(facility.province) || 0) + 1);
      }
    });
    return groups;
  }, [filteredFacilities]);
  const predictiveTopProvince = predictiveProvinceRows[0];
  const predictiveWorseningCount = predictiveProvinceRows.filter((row) => row.worsening > 0.02).length;
  const predictiveTopTransfer = redistributionCandidates[0];
  const predictiveTopTransferStatus = predictiveTopTransfer ? actionUpdates[redistributionActionKey(predictiveTopTransfer)]?.status || "Open" : "Needs validation";
  const predictiveFeedback = useMemo(() => buildForecastFeedback(predictiveHistoryPeriods, predictiveFilters), [predictiveHistoryPeriods, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const predictiveFeedbackRows = predictiveFeedback.evaluated.slice(0, 8);
  const predictiveRecommendations = predictiveProvinceRows.slice(0, 5).map((row) => {
    const transfer = redistributionCandidates.find((candidate) => candidate.province === row.province);
    return {
      ...row,
      transfer,
      actionStatus: transfer ? actionUpdates[redistributionActionKey(transfer)]?.status || "Open" : "Needs validation",
    };
  });

  const commodityScopeRows = useMemo(() => commodityRowsFromPeriod(fieldData)
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
    .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel))
    .filter((row) => selectedFacility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === selectedFacility), [fieldData, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const commodityPreviousScopeRows = useMemo(() => {
    const periodIndex = tracerReportingPeriods.findIndex((period) => period.id === fieldPeriodId);
    const previousPeriod = periodIndex > 0 ? tracerReportingPeriods[periodIndex - 1] : null;
    if (!previousPeriod) return [];
    return commodityRowsFromPeriod(previousPeriod)
      .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
      .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict)
      .filter((row) => matchesFacilityCareLevel(row.facilityLevel, selectedFacilityLevel))
      .filter((row) => selectedFacility === "all" || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === selectedFacility);
  }, [fieldPeriodId, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility]);
  const commodityTriageRows = useMemo(() => {
    const summarise = (rows) => {
      const groups = new Map();
      rows.forEach((row) => {
        if (!row.item) return;
        const current = groups.get(row.item) || { name: row.item, rows: 0, available: 0, stockouts: 0 };
        current.rows += 1;
        current.available += row.quantity > 0 ? 1 : 0;
        current.stockouts += commodityStockStatus(row.mos) === "Stocked out" ? 1 : 0;
        groups.set(row.item, current);
      });
      return new Map([...groups.entries()].map(([name, row]) => [name, {
        ...row,
        availability: row.rows ? row.available / row.rows : 0,
        stockoutRate: row.rows ? row.stockouts / row.rows : 0,
      }]));
    };
    const current = summarise(commodityScopeRows);
    const previous = summarise(commodityPreviousScopeRows);
    return [...current.values()].map((row) => {
      const previousRow = previous.get(row.name);
      const trendDelta = previousRow ? row.availability - previousRow.availability : null;
      return { ...row, previousAvailability: previousRow?.availability ?? null, trendDelta, trend: commodityTrendDirection(trendDelta), tone: commodityRiskTone(row.stockoutRate) };
    });
  }, [commodityScopeRows, commodityPreviousScopeRows]);
  const commodityMatches = useMemo(() => {
    const search = query.trim().toLowerCase();
    const threshold = commodityAvailabilityThreshold === "all" ? null : Number(commodityAvailabilityThreshold) / 100;
    return commodityTriageRows
      .filter((row) => !search || row.name.toLowerCase().includes(search))
      .filter((row) => threshold === null || row.availability < threshold)
      .sort((a, b) => {
        let result = 0;
        if (commodityListSort.key === "name") result = compareText(a.name, b.name);
        if (commodityListSort.key === "availability") result = a.availability - b.availability;
        if (commodityListSort.key === "stockouts") result = a.stockouts - b.stockouts;
        if (commodityListSort.key === "trend") result = (a.trendDelta ?? -Infinity) - (b.trendDelta ?? -Infinity);
        return (commodityListSort.direction === "asc" ? result : -result) || compareText(a.name, b.name);
      });
  }, [commodityTriageRows, query, commodityAvailabilityThreshold, commodityListSort]);
  const commodityOptionPageCount = Math.max(1, Math.ceil(commodityMatches.length / 10));
  const visibleCommodityMatches = commodityMatches.slice((Math.min(commodityOptionPage, commodityOptionPageCount) - 1) * 10, Math.min(commodityOptionPage, commodityOptionPageCount) * 10);
  const selectedCommodityRows = useMemo(() => collapseCommodityFacilityRows(commodityScopeRows, selectedCommodity), [commodityScopeRows, selectedCommodity]);
  const previousSelectedCommodityRows = useMemo(() => collapseCommodityFacilityRows(commodityPreviousScopeRows, selectedCommodity), [commodityPreviousScopeRows, selectedCommodity]);
  const commodityPreviousPeriod = tracerReportingPeriods[Math.max(0, tracerReportingPeriods.findIndex((period) => period.id === fieldPeriodId) - 1)];
  const commodityWeekChange = useMemo(() => {
    if (!selectedCommodity || !previousSelectedCommodityRows.length) return null;
    const keyFor = (row) => `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`;
    const currentByFacility = new Map(selectedCommodityRows.map((row) => [keyFor(row), row]));
    const previousByFacility = new Map(previousSelectedCommodityRows.map((row) => [keyFor(row), row]));
    const currentStockouts = new Set([...currentByFacility].filter(([, row]) => commodityStockStatus(row.mos) === "Stocked out").map(([key]) => key));
    const previousStockouts = new Set([...previousByFacility].filter(([, row]) => commodityStockStatus(row.mos) === "Stocked out").map(([key]) => key));
    const currentAvailability = selectedCommodityRows.length ? selectedCommodityRows.filter((row) => row.quantity > 0).length / selectedCommodityRows.length : 0;
    const previousAvailability = previousSelectedCommodityRows.length ? previousSelectedCommodityRows.filter((row) => row.quantity > 0).length / previousSelectedCommodityRows.length : 0;
    const averageMos = (rows) => rows.length ? rows.reduce((sum, row) => sum + (row.mos || 0), 0) / rows.length : 0;
    return {
      newStockouts: [...currentStockouts].filter((key) => !previousStockouts.has(key)).length,
      resolvedStockouts: [...previousStockouts].filter((key) => !currentStockouts.has(key)).length,
      netStockouts: currentStockouts.size - previousStockouts.size,
      availabilityDelta: currentAvailability - previousAvailability,
      facilityDelta: selectedCommodityRows.length - previousSelectedCommodityRows.length,
      mosDelta: averageMos(selectedCommodityRows) - averageMos(previousSelectedCommodityRows),
      previousLabel: commodityPreviousPeriod?.label || "previous week",
    };
  }, [selectedCommodityRows, previousSelectedCommodityRows, selectedCommodity, commodityPreviousPeriod]);
  const selectedCommodityProgramme = selectedCommodityRows[0]?.programme || "Not submitted";
  const commodityKpiScopeRows = useMemo(() => selectedCommodityRows
    .filter((row) => commodityTableProvince === "all" || row.province === commodityTableProvince)
    .filter((row) => commodityTableDistrict === "all" || row.district === commodityTableDistrict)
    .filter((row) => commodityTableLevel === "all" || row.facilityLevel === commodityTableLevel)
    .filter((row) => commodityTableReportingStatus === "all" || row.reportingStatus === commodityTableReportingStatus), [selectedCommodityRows, commodityTableProvince, commodityTableDistrict, commodityTableLevel, commodityTableReportingStatus]);
  const commodityExpectedFacilities = useMemo(() => filteredFacilities
    .filter((facility) => commodityTableProvince === "all" || facility.province === commodityTableProvince)
    .filter((facility) => commodityTableDistrict === "all" || facility.district === commodityTableDistrict)
    .filter((facility) => commodityTableLevel === "all" || facility.facilityLevel === commodityTableLevel), [filteredFacilities, commodityTableProvince, commodityTableDistrict, commodityTableLevel]);
  const commodityReportedFacilityKeys = new Set(commodityKpiScopeRows.map((row) => `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`));
  const commodityMissingFacilities = commodityExpectedFacilities
    .filter((facility) => !commodityReportedFacilityKeys.has(`${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`))
    .sort((a, b) => compareText(a.province, b.province) || compareText(a.district, b.district) || compareText(a.name, b.name));
  const commodityReportingRate = commodityExpectedFacilities.length ? commodityKpiScopeRows.length / commodityExpectedFacilities.length : 0;
  const commodityFilteredSummaryRows = useMemo(() => commodityKpiScopeRows
    .filter((row) => matchesCommodityStatus(row, commodityStatusFilter)), [commodityKpiScopeRows, commodityStatusFilter]);
  const commodityStatusCounts = commodityKpiScopeRows.reduce((counts, row) => {
    const status = commodityStockStatus(row.mos);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const commodityAvailableCount = commodityFilteredSummaryRows.filter((row) => row.quantity > 0).length;
  const commodityAverageMos = commodityFilteredSummaryRows.length ? commodityFilteredSummaryRows.reduce((sum, row) => sum + (row.mos || 0), 0) / commodityFilteredSummaryRows.length : 0;
  const commodityTotalSoh = commodityFilteredSummaryRows.reduce((sum, row) => sum + row.quantity, 0);
  const commodityTotalAmc = commodityFilteredSummaryRows.reduce((sum, row) => sum + row.amc, 0);
  const commodityTableProvinceOptions = [...new Set(selectedCommodityRows.map((row) => row.province).filter(Boolean))].sort(compareText);
  const commodityTableDistrictOptions = [...new Set(selectedCommodityRows
    .filter((row) => commodityTableProvince === "all" || row.province === commodityTableProvince)
    .map((row) => row.district)
    .filter(Boolean))].sort(compareText);
  const commodityTableLevelOptions = [...new Set(selectedCommodityRows
    .filter((row) => commodityTableProvince === "all" || row.province === commodityTableProvince)
    .filter((row) => commodityTableDistrict === "all" || row.district === commodityTableDistrict)
    .map((row) => row.facilityLevel)
    .filter(Boolean))].sort(compareText);
  const commodityFacilityRows = useMemo(() => commodityFilteredSummaryRows
    .filter((row) => !commodityFacilityQuery.trim() || `${row.facility} ${row.district} ${row.province}`.toLowerCase().includes(commodityFacilityQuery.trim().toLowerCase()))
    .sort((a, b) => {
      if (commoditySort === "facility") return compareText(a.facility, b.facility);
      if (commoditySort === "province") return compareText(a.province, b.province) || compareText(a.district, b.district);
      if (commoditySort === "stock") return b.quantity - a.quantity;
      if (commoditySort === "status") return compareText(commodityStockStatus(a.mos), commodityStockStatus(b.mos));
      return (a.mos ?? -1) - (b.mos ?? -1);
    }), [commodityFilteredSummaryRows, commodityFacilityQuery, commoditySort]);
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
    return { periodId: period.id, label: period.label, reportDate: period.reportDate, availability: rows.length ? rows.filter((row) => row.quantity > 0).length / rows.length : 0, nationalAvailability: normalizeRate(period.national?.availability), mos: amc > 0 ? quantity / amc : 0, rows: rows.length };
  }).filter((row) => row.rows > 0), [selectedCommodity, selectedProvince, selectedDistrict, selectedFacilityLevel]);
  const commodityTrendVisibleRows = commodityTrendRows.slice(-commodityTrendWindow);
  const commodityTrendMosScale = Math.max(4, Math.ceil(Math.max(0, ...commodityTrendVisibleRows.map((row) => row.mos || 0))));
  const commodityTrendMosPoints = commodityTrendVisibleRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(commodityTrendVisibleRows.length, 1)) * 100;
    const y = 100 - Math.min((row.mos || 0) / commodityTrendMosScale, 1) * 100;
    return `${x},${y}`;
  }).join(" ");
  const commodityTrendNationalPoints = commodityTrendVisibleRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(commodityTrendVisibleRows.length, 1)) * 100;
    const y = 100 - Math.min(row.nationalAvailability || 0, 1) * 100;
    return `${x},${y}`;
  }).join(" ");
  const commodityZeroAvailabilityRun = findLongestZeroAvailabilityRun(commodityTrendVisibleRows);
  const commodityProvinceRows = commodityGroupRows(selectedCommodityRows, "province");
  const commodityDistrictRows = commodityGroupRows(selectedCommodityRows, "district");
  const commodityLevelRows = commodityGroupRows(selectedCommodityRows, "facilityLevel");
  const commodityActiveFilters = [
    commodityTableProvince !== "all" ? { key: "province", label: commodityTableProvince } : null,
    commodityTableDistrict !== "all" ? { key: "district", label: commodityTableDistrict } : null,
    commodityTableLevel !== "all" ? { key: "level", label: commodityTableLevel } : null,
    commodityStatusFilter !== "all" ? { key: "status", label: commodityStatusFilter } : null,
  ].filter(Boolean);
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
  const commodityFacilityTrendMap = useMemo(() => {
    if (!selectedCommodity) return new Map();
    const periodIndex = tracerReportingPeriods.findIndex((period) => period.id === fieldPeriodId);
    const periods = tracerReportingPeriods.slice(Math.max(0, periodIndex - 7), periodIndex + 1);
    const trendMap = new Map(selectedCommodityRows.map((row) => {
      const key = `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`;
      return [key, periods.map((period) => ({ periodId: period.id, label: period.label, mos: null }))];
    }));
    periods.forEach((period, periodPosition) => {
      const grouped = new Map();
      commodityRowsFromPeriod(period).filter((row) => row.item === selectedCommodity).forEach((row) => {
        const key = `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`;
        if (!trendMap.has(key)) return;
        const current = grouped.get(key) || { quantity: 0, amc: 0, mosValues: [] };
        current.quantity += row.quantity || 0;
        current.amc += row.amc || 0;
        if (row.mos !== null) current.mosValues.push(row.mos);
        grouped.set(key, current);
      });
      grouped.forEach((row, key) => {
        const mos = row.amc > 0 ? row.quantity / row.amc : (row.mosValues.length ? row.mosValues.reduce((sum, value) => sum + value, 0) / row.mosValues.length : null);
        trendMap.get(key)[periodPosition] = { periodId: period.id, label: period.label, mos };
      });
    });
    return trendMap;
  }, [selectedCommodityRows, selectedCommodity, fieldPeriodId]);
  const commodityFacilityBasket = useMemo(() => {
    if (!openCommodityFacility) return [];
    const grouped = new Map();
    commodityRowsFromPeriod(fieldData).filter((row) => row.province === openCommodityFacility.province
      && row.district === openCommodityFacility.district
      && row.facilityLevel === openCommodityFacility.facilityLevel
      && row.facility === openCommodityFacility.facility).forEach((row) => {
      const current = grouped.get(row.item) || { ...row, quantity: 0, amc: 0, mosValues: [] };
      current.quantity += row.quantity || 0;
      current.amc += row.amc || 0;
      if (row.mos !== null) current.mosValues.push(row.mos);
      grouped.set(row.item, current);
    });
    return [...grouped.values()].map((row) => ({
      ...row,
      mos: row.amc > 0 ? row.quantity / row.amc : (row.mosValues.length ? row.mosValues.reduce((sum, value) => sum + value, 0) / row.mosValues.length : null),
    })).sort((a, b) => {
      const priority = { "Stocked out": 0, "Emergency stock": 1, Understocked: 2, "According to plan": 3, Overstocked: 4, "Excess stock": 5, "Incomplete report": 6 };
      return (priority[commodityStockStatus(a.mos)] ?? 9) - (priority[commodityStockStatus(b.mos)] ?? 9) || compareText(a.item, b.item);
    });
  }, [openCommodityFacility, fieldData]);
  const commodityFacilityBasketSummary = {
    total: commodityFacilityBasket.length,
    available: commodityFacilityBasket.filter((row) => row.quantity > 0).length,
    stockouts: commodityFacilityBasket.filter((row) => commodityStockStatus(row.mos) === "Stocked out").length,
    belowPlan: commodityFacilityBasket.filter((row) => ["Emergency stock", "Understocked"].includes(commodityStockStatus(row.mos))).length,
  };

  const comments = fieldData.comments || [];
  const fieldDistrictReporting = primaryCareDistrictSummary(fieldData);
  const fieldDistrictsReportedInScope = fieldDistrictReporting.rows
    .filter((row) => row.submitted)
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince).length;
  const expectedProvinces = 10;
  const reportingRate = expectedProvinces ? fieldData.counts.provinces / expectedProvinces : 0;
  const expectedDistricts = fieldDistrictReporting.expected;
  const expectedFacilityUnits = fieldData.counts.expectedLevelReports || fieldData.counts.expectedFacilityUnits || fieldData.counts.facilityUnits;
  const missingDistricts = fieldDistrictReporting.missing;
  const missingFacilityUnits = fieldData.counts.missingFacilityUnits || 0;
  const facilityAvailabilityTargetCount = filteredFacilities.filter((facility) => facility.availability >= 0.8).length;
  const facilityAvailabilityTargetRate = filteredFacilities.length ? facilityAvailabilityTargetCount / filteredFacilities.length : 0;
  const highRiskCommodityCount = new Set(commodityScopeRows
    .filter((row) => row.mos !== null && row.mos < 2)
    .map((row) => row.item)
    .filter(Boolean)).size;
  const actionTotal = actionSummary.Open + actionSummary["In progress"] + actionSummary.Completed;
  const managementKpis = [
    { label: "Medicine availability", value: formatPercent(fieldKpis.availability), sub: "Submitted tracer commodity rows", tone: "green" },
    { label: "National stockout rate", value: formatPercent(fieldKpis.rows ? fieldKpis.stockout / fieldKpis.rows : 0), sub: `${fieldKpis.stockout.toLocaleString()} stockout rows`, tone: "red" },
    { label: "High-risk commodities", value: highRiskCommodityCount.toLocaleString(), sub: "At least one row below 2 MOS", tone: "amber" },
    { label: "Facilities at 80%+", value: formatPercent(facilityAvailabilityTargetRate), sub: `${facilityAvailabilityTargetCount} of ${filteredFacilities.length} reporting units`, tone: "green" },
    { label: "Reporting coverage", value: formatPercent(expectedFacilityUnits ? (expectedFacilityUnits - missingFacilityUnits) / expectedFacilityUnits : 0), sub: `${expectedFacilityUnits - missingFacilityUnits} of ${expectedFacilityUnits} expected level reports`, tone: "blue" },
    { label: "Missing reports", value: missingFacilityUnits.toLocaleString(), sub: `${missingDistricts} districts without a submission`, tone: missingFacilityUnits ? "red" : "green" },
    { label: "Actions closed", value: actionTotal ? formatPercent(actionSummary.Completed / actionTotal) : "-", sub: actionTotal ? `${actionSummary.Completed} of ${actionTotal} redistribution actions` : "No active redistribution actions", tone: actionSummary.Completed ? "green" : "neutral" },
  ];
  const dataQuality = fieldData.dataQuality || { provinces: [], districts: [], facilityTypes: [] };
  const qualityMonths = [...new Set(tracerReportingPeriods.map((period) => period.month))].sort();
  const qualityRangeLower = qualityRangeStart <= qualityRangeEnd ? qualityRangeStart : qualityRangeEnd;
  const qualityRangeUpper = qualityRangeStart <= qualityRangeEnd ? qualityRangeEnd : qualityRangeStart;
  const qualityRangePeriods = tracerReportingPeriods.filter((period) => period.month >= qualityRangeLower && period.month <= qualityRangeUpper);
  // Data Quality must use the complete expected reporting universe, not the
  // named facilities that happened to appear in the first selected period.
  // The facilityTypes roster retains districts and levels with no submission,
  // including Level 2 and non-reporting Muchinga districts.
  const qualityDirectoryPeriod = qualityRangePeriods[0] || tracerReportingPeriods[0];
  const qualityDistrictDirectory = qualityDirectoryPeriod?.dataQuality?.districts || [];
  const qualityRoster = (qualityDirectoryPeriod?.dataQuality?.facilityTypes || []).map((row) => ({
    province: row.province,
    district: row.district,
    facilityLevel: row.type,
    facilityType: row.type,
    name: `${row.district} — ${reportingFacilityLabel(row.type)}`,
    isAggregate: true,
  }));
  const qualityProvinceOptions = [...new Set(qualityDistrictDirectory.map((row) => row.province))].sort();
  const qualityDistrictOptions = [...new Set(qualityDistrictDirectory
    .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
    .map((row) => row.name))].sort();
  const qualityFacilityLevelOptions = [...facilityCareLevelOptions, ...specialisedCareLevelOptions]
    .filter((option) => qualityRoster
      .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
      .filter((row) => qualityDistrictFilter === "all" || row.district === qualityDistrictFilter)
      .some((row) => matchesFacilityCareLevel(row.facilityLevel, option.value)));
  const qualityPeriodFacilityMaps = useMemo(() => new Map(qualityRangePeriods.map((period) => [period.id, new Map((period.dataQuality?.facilityTypes || []).map((row) => [`${row.province}|${row.district}|${row.type}`, row]))])), [qualityRangePeriods]);
  const qualityFacilityHistories = useMemo(() => qualityRoster
    .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
    .filter((row) => qualityDistrictFilter === "all" || row.district === qualityDistrictFilter)
    .filter((row) => matchesFacilityCareLevel(row.facilityLevel, qualityFacilityLevelFilter))
    .map((facility) => {
      const key = `${facility.province}|${facility.district}|${facility.facilityLevel}`;
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
  const qualityTrendPoints = qualityTrendRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(qualityTrendRows.length, 1)) * 100;
    const y = 100 - normalizeRate(row.rate) * 100;
    return `${x},${y}`;
  }).join(" ");
  const qualityGapTimelineRows = useMemo(() => qualityRangePeriods.map((period) => {
    let expected = 0;
    let reported = 0;
    qualityFacilityHistories.forEach((facility) => {
      const history = facility.history.find((row) => row.id === period.id);
      if (history?.expected) {
        expected += 1;
        reported += history.reported ? 1 : 0;
      }
    });
    return {
      id: period.id,
      label: period.label,
      date: period.reportDate,
      expected,
      reported,
      missing: Math.max(expected - reported, 0),
      rate: expected ? reported / expected : 0,
    };
  }), [qualityRangePeriods, qualityFacilityHistories]);
  const qualityGapScopeLabel = [
    qualityProvinceFilter === "all" ? "Zambia" : qualityProvinceFilter,
    qualityDistrictFilter === "all" ? "All districts" : qualityDistrictFilter,
    facilityCareLevelLabel(qualityFacilityLevelFilter),
  ].join(" · ");
  // Match the Reporting Rate tab exactly: a DHO district submission requires
  // both Health Centre and Health Post reporting. Level 1/2/3 hospital rows do
  // not satisfy this rule.
  const qualityDistrictReportingTrendRows = useMemo(() => {
    const groups = new Map();
    qualityRangePeriods.forEach((period) => {
      const key = qualityGranularity === "month" ? period.month : period.id;
      const current = groups.get(key) || { id: key, label: qualityGranularity === "month" ? monthLabel(period.month) : period.label, expected: 0, reported: 0 };
      const expectedRows = primaryCareDistrictRows(period)
        .filter((row) => qualityProvinceFilter === "all" || row.province === qualityProvinceFilter)
        .filter((row) => qualityDistrictFilter === "all" || row.name === qualityDistrictFilter);
      current.expected += expectedRows.length;
      current.reported += expectedRows.filter((row) => row.submitted).length;
      groups.set(key, current);
    });
    return [...groups.values()].map((row) => ({ ...row, missing: row.expected - row.reported, rate: row.expected ? row.reported / row.expected : 0 }));
  }, [qualityRangePeriods, qualityGranularity, qualityProvinceFilter, qualityDistrictFilter]);
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
  const qualityDistrictReportingTrendPoints = qualityDistrictReportingTrendRows.map((row, index) => {
    const x = ((index + 0.5) / Math.max(qualityDistrictReportingTrendRows.length, 1)) * 100;
    const y = 100 - normalizeRate(row.rate) * 100;
    return `${x},${y}`;
  }).join(" ");
  const selectedQualityDistrictLabel = qualityDistrictFilter === "all" ? "Select a district" : qualityDistrictFilter;
  const qualityTimelineMissingPeriods = qualityDistrictReportingTrendRows.filter((row) => row.rate === 0);
  const qualityTimelinePartialPeriods = qualityDistrictReportingTrendRows.filter((row) => row.rate > 0 && row.rate < 1);
  const qualityTimelineReportedPeriods = qualityDistrictReportingTrendRows.filter((row) => row.rate >= 1);
  const qualityTimelineNarrative = qualityDistrictFilter === "all"
    ? "Districts submitted divided by districts expected, using the Reporting Rate calculation."
    : qualityTimelineMissingPeriods.length
      ? `${selectedQualityDistrictLabel} did not report in ${qualityTimelineMissingPeriods.map((row) => row.label.replace("Week ", "")).join(", ")}.`
      : qualityTimelinePartialPeriods.length
        ? `${selectedQualityDistrictLabel} submitted in every selected week, but ${qualityTimelinePartialPeriods.map((row) => row.label.replace("Week ", "")).join(", ")} had partial level-of-care reporting.`
        : `${selectedQualityDistrictLabel} reported in every selected week for this level-of-care scope.`;
  const qualityFollowupRows = nonReportingFacilityRows.slice(0, 6);
  const persistentQualityRows = qualityFacilityHistories.filter((row) => ["Persistent non-reporting", "No reporting"].includes(row.consistency));
  const weeklyReportLibraryRows = useMemo(() => tracerReportingPeriods.map((period) => {
    const facilities = period.dataQuality?.facilities || [];
    const reported = facilities.filter((row) => row.reported).length;
    const districtSummary = primaryCareDistrictSummary(period);
    const districts = districtSummary.reported;
    const expectedDistrictsForPeriod = districtSummary.expected;
    return {
      id: period.id,
      label: period.label,
      reportDate: period.reportDate,
      source: period.source || "Weekly provincial tracer submission",
      provinces: period.counts?.provinces || 0,
      districts,
      expectedDistricts: expectedDistrictsForPeriod,
      partialDistricts: districtSummary.partial,
      hospitalOnlyDistricts: districtSummary.hospitalOnly,
      expectedFacilities: facilities.length,
      reportedFacilities: reported,
      rate: facilities.length ? reported / facilities.length : 0,
    };
  }).sort((a, b) => b.reportDate.localeCompare(a.reportDate)), []);
  const selectedLibraryPeriod = weeklyReportLibraryRows.find((row) => row.id === selectedLibraryPeriodId) || weeklyReportLibraryRows[0];
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
  const comparisonRangeOptions = comparisonPeriodType === "weekly"
    ? tracerReportingPeriods.filter((period) => String(period.month).startsWith(comparisonYear)).map((period) => ({ value: period.id, label: period.label }))
    : comparisonPeriodType === "monthly"
      ? comparisonMonths.map((month) => ({ value: month, label: monthLabel(month) }))
      : comparisonPeriodType === "quarterly"
        ? ["Q1", "Q2", "Q3", "Q4"].map((quarter) => ({ value: quarter, label: quarter }))
        : comparisonYears.map((year) => ({ value: year, label: year }));
  const comparisonDistrictOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.districts || [])
    .filter((row) => comparisonProvince === "all" || row.province === comparisonProvince)
    .map((row) => row.name))].sort();
  const comparisonFacilityLevelRows = tracerReportingPeriods.flatMap((period) => period.facilities || [])
    .filter((facility) => comparisonProvince === "all" || facility.province === comparisonProvince)
    .filter((facility) => comparisonDistrict === "all" || facility.district === comparisonDistrict);
  const comparisonOptionIsAvailable = (option) => comparisonFacilityLevelRows.some((facility) => matchesFacilityCareLevel(facility.facilityLevel, option.value));
  const comparisonFacilityLevelOptions = facilityCareLevelOptions.filter(comparisonOptionIsAvailable);
  const comparisonSpecialisedFacilityLevelOptions = specialisedCareLevelOptions.filter(comparisonOptionIsAvailable);
  const comparisonCommodityOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.commodityFacilityData?.dictionaries?.items || []).map(canonicalCommodityName))]
    .filter(Boolean)
    .filter(isCommodityName)
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
  const comparisonFocusOptions = [...new Set([...comparisonRows, ...previousComparisonRows].map((row) => row.name))].sort(compareText);
  const effectiveComparisonFocusA = comparisonFocusOptions.includes(comparisonFocusA) ? comparisonFocusA : comparisonFocusOptions[0] || "";
  const effectiveComparisonFocusB = comparisonFocusOptions.includes(comparisonFocusB) && comparisonFocusB !== effectiveComparisonFocusA
    ? comparisonFocusB
    : comparisonFocusOptions.find((name) => name !== effectiveComparisonFocusA) || "";
  const comparisonFocusCards = [effectiveComparisonFocusA, effectiveComparisonFocusB].filter(Boolean).map((name) => ({
    name,
    current: comparisonRows.find((row) => row.name === name) || makeEmptyRollup(name),
    previous: comparisonPreviousByName.get(name) || makeEmptyRollup(name),
  }));
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
      ? `The second period improved by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} compared with the first period.`
      : `The second period declined by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} compared with the first period.`,
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

  function focusCommodityTable() {
    setCommodityPage(1);
    window.requestAnimationFrame(() => commodityTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function applyCommodityStatusFilter(status) {
    setCommodityStatusFilter(status);
    focusCommodityTable();
  }

  function applyCommodityProvinceFilter(province) {
    setCommodityTableProvince(province);
    setCommodityTableDistrict("all");
    setCommodityTableLevel("all");
    focusCommodityTable();
  }

  function applyCommodityLevelFilter(level) {
    setCommodityTableLevel(level);
    focusCommodityTable();
  }

  function clearCommodityCrossFilter(key) {
    if (key === "province") {
      setCommodityTableProvince("all");
      setCommodityTableDistrict("all");
      setCommodityTableLevel("all");
    }
    if (key === "district") {
      setCommodityTableDistrict("all");
      setCommodityTableLevel("all");
    }
    if (key === "level") setCommodityTableLevel("all");
    if (key === "status") setCommodityStatusFilter("all");
    setCommodityPage(1);
  }

  function selectCommodityTrendPeriod(periodId) {
    setFieldPeriodId(periodId);
    setCommodityPage(1);
    setOpenCommodityFacility(null);
  }

  function changeCommodityListSort(key) {
    setCommodityListSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
    setCommodityOptionPage(1);
  }

  function openSelectedCommodityComparison() {
    const currentIndex = tracerReportingPeriods.findIndex((period) => period.id === fieldPeriodId);
    const previousPeriod = tracerReportingPeriods[Math.max(0, currentIndex - 1)];
    const currentPeriod = tracerReportingPeriods[currentIndex] || fieldData;
    setComparisonPeriodType("weekly");
    setComparisonYear(String(currentPeriod.month || fieldData.month).slice(0, 4));
    setComparisonBaselineStart(previousPeriod.id);
    setComparisonBaselineEnd(previousPeriod.id);
    setComparisonRangeStart(currentPeriod.id);
    setComparisonRangeEnd(currentPeriod.id);
    setComparisonCommodity(selectedCommodity);
    setComparisonProgram("all");
    setComparisonProvince("all");
    setComparisonDistrict("all");
    setComparisonFacilityLevel("all");
    setComparisonCompareBy("province");
    setComparisonMetric("availability");
    setComparisonFocusA(commodityTableProvince !== "all" ? commodityTableProvince : selectedProvince !== "all" ? selectedProvince : "");
    setComparisonFocusB("");
    setActivePage("comparison");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setReportFacilityName("all");
    setReportStatus("all");
    setReportDrillProvince("");
    setReportDrillDistrict("");
  }

  function changeReportProvince(province) {
    setReportProvince(province);
    setReportDistrict("all");
    setReportDrillProvince(province === "all" ? "" : province);
    setReportDrillDistrict("");
    setReportFacilityName("all");
  }

  function changeReportDistrict(district) {
    setReportDistrict(district);
    setReportDrillDistrict(district === "all" ? "" : district);
    setReportFacilityName("all");
  }

  function buildReportingFollowup(facility) {
    const history = tracerReportingPeriods
      .filter((period) => period.reportDate <= fieldData.reportDate)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
      .map((period) => {
        const expected = (period.dataQuality?.facilities || []).find((candidate) => facilityIdentityKey(candidate) === facilityIdentityKey(facility));
        return expected ? { id: period.id, label: period.label, reported: Boolean(expected.reported) } : null;
      })
      .filter(Boolean);
    const reportsSubmitted = history.filter((row) => row.reported).length;
    let consecutiveMissed = 0;
    for (const row of [...history].reverse()) {
      if (row.reported) break;
      consecutiveMissed += 1;
    }
    const latestReport = [...history].reverse().find((row) => row.reported)?.label || "No previous report available";
    return {
      ...facility,
      expectedReports: history.length,
      reportsSubmitted,
      missedReports: history.length - reportsSubmitted,
      rate: history.length ? reportsSubmitted / history.length : 0,
      consecutiveMissed,
      latestReport,
      consistency: reportsSubmitted === history.length ? "Fully reported" : reportsSubmitted ? "Reporting gap" : "No reporting",
      history,
    };
  }

  function syncNonReportingToReportingPage(facility = null) {
    const selectedFacilityName = facility?.name || (selectedFacility === "all" ? "all" : selectedFacility.split("|").at(-1));
    const facilityType = facility?.facilityLevel || (selectedFacilityLevel !== "all" && reportFacilityTypeOptions.includes(selectedFacilityLevel) ? selectedFacilityLevel : "all");
    setReportPeriodId(fieldData.id);
    setReportProvince(facility?.province || selectedProvince);
    setReportDistrict(facility?.district || selectedDistrict);
    setReportFacilityType(facilityType);
    setReportFacilityName(selectedFacilityName || "all");
    setReportStatus("Not Reported");
    setReportDrillProvince((facility?.province || selectedProvince) === "all" ? "" : facility?.province || selectedProvince);
    setReportDrillDistrict((facility?.district || selectedDistrict) === "all" ? "" : facility?.district || selectedDistrict);
    setActivePage("reporting");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFacilityStatusFilter(statusId) {
    setFacilityAlertPage(1);
    setFacilityStatusFilters((current) => current.includes(statusId) ? current.filter((id) => id !== statusId) : [...current, statusId]);
    if (statusId === "missing") syncNonReportingToReportingPage();
  }

  function openFacilityReportingFollowup(facility) {
    syncNonReportingToReportingPage(facility);
    setOpenReportingFacility(buildReportingFollowup(facility));
  }

  async function updateRedistributionAction(item, status) {
    const key = redistributionActionKey(item);
    const localUpdate = { status, updatedBy: actionUserEmail || "Unidentified user", updatedAt: new Date().toISOString() };
    setActionUpdates((current) => ({ ...current, [key]: { ...current[key], ...localUpdate } }));
    try {
      const response = await fetch(`${actionApiUrl}/api/action-updates/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, author: localUpdate.updatedBy }),
      });
      if (!response.ok) throw new Error("Unable to save status");
      const update = await response.json();
      setActionUpdates((current) => ({ ...current, [key]: update }));
      setActionSyncState("shared");
    } catch {
      setActionSyncState("offline");
    }
  }

  async function addActionComment(item) {
    const key = redistributionActionKey(item);
    const body = (actionCommentDrafts[key] || "").trim();
    const author = actionUserEmail || "Dashboard user";
    if (!body) {
      setActionCommentError("Write a comment before adding it.");
      return;
    }
    setActionCommentError("");
    const pendingComment = { id: `pending-${Date.now()}`, author, body, createdAt: new Date().toISOString(), pending: true };
    setActionComments((current) => ({ ...current, [key]: [...(current[key] || []), pendingComment] }));
    setActionCommentDrafts((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch(`${actionApiUrl}/api/action-comments/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, body }),
      });
      if (!response.ok) throw new Error("Unable to save comment");
      const comment = await response.json();
      setActionComments((current) => ({
        ...current,
        [key]: (current[key] || []).map((entry) => entry.id === pendingComment.id ? comment : entry),
      }));
      setActionSyncState("shared");
    } catch {
      setActionCommentError("Shared comments are temporarily unavailable. Please try again.");
      setActionComments((current) => ({ ...current, [key]: (current[key] || []).filter((entry) => entry.id !== pendingComment.id) }));
      setActionCommentDrafts((current) => ({ ...current, [key]: body }));
      setActionSyncState("offline");
    }
  }

  async function deleteActionComment(actionKey, commentId) {
    if (!actionUserEmail || String(commentId).startsWith("pending-")) return;
    setActionCommentError("");
    try {
      const response = await fetch(`${actionApiUrl}/api/action-comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorEmail: actionUserEmail }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to delete comment");
      setActionComments((current) => ({ ...current, [actionKey]: (current[actionKey] || []).filter((comment) => String(comment.id) !== String(commentId)) }));
    } catch (error) {
      setActionCommentError(error.message || "Unable to delete this comment.");
    }
  }

  async function voteOnActionComment(actionKey, commentId, vote) {
    if (!actionUserEmail || String(commentId).startsWith("pending-")) return;
    setActionCommentError("");
    try {
      const response = await fetch(`${actionApiUrl}/api/action-comments/${encodeURIComponent(commentId)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorEmail: actionUserEmail, vote }),
      });
      const comment = await response.json();
      if (!response.ok) throw new Error(comment.error || "Unable to save reaction");
      setActionComments((current) => ({ ...current, [actionKey]: (current[actionKey] || []).map((entry) => String(entry.id) === String(commentId) ? comment : entry) }));
    } catch (error) {
      setActionCommentError(error.message || "Unable to save this reaction.");
    }
  }

  function currentCopilotContext() {
    const priorityFacilities = [...facilityAlerts]
      .slice(0, 12)
      .map((facility) => ({
        facility: facility.name,
        district: facility.district,
        province: facility.province,
        levelOfCare: facility.facilityLevel,
        availability: formatPercent(facility.availability),
        averageMos: formatMos(facility.mos),
        stockoutItems: facility.stockoutItemCount || 0,
        lowStockItems: facility.lowStockItemCount || 0,
      }));
    const lowestProvinces = [...scopedProvinceRows]
      .sort((a, b) => a.availability - b.availability || b.riskRows - a.riskRows)
      .slice(0, 10)
      .map((province) => ({ name: province.name, availability: formatPercent(province.availability), averageMos: formatMos(province.mos), stockoutRows: province.stockout || 0, riskRows: province.riskRows || 0 }));
    const highRiskCommodities = commodityGroupRows(commodityScopeRows, "item")
      .filter((commodity) => commodity.rows > 0)
      .slice(0, 15)
      .map((commodity) => ({ commodity: commodity.name, availability: formatPercent(commodity.availability), averageMos: formatMos(commodity.mos), reportingRows: commodity.rows }));
    return {
      reportingPeriod: fieldData.label,
      activeDashboardPage: activePageLabel,
      filters: {
        province: selectedProvince === "all" ? "All provinces" : selectedProvince,
        district: selectedDistrict === "all" ? "All districts" : selectedDistrict,
        levelOfCare: facilityCareLevelLabel(selectedFacilityLevel),
        reportingUnit: selectedFacility === "all" ? "All reporting units" : selectedFacility,
      },
      nationalSummary: {
        availability: formatPercent(fieldKpis.availability),
        averageMos: formatMos(fieldAverageMos),
        commodityRows: fieldKpis.rows || 0,
        stockoutRows: fieldKpis.stockout || 0,
        lowStockRows: (fieldKpis.nearCritical || 0) + (fieldKpis.understocked || 0),
        reportingUnits: filteredFacilities.length,
        reportingCoverage: formatPercent(expectedFacilityUnits ? (expectedFacilityUnits - missingFacilityUnits) / expectedFacilityUnits : 0),
      },
      lowestAvailabilityProvinces: lowestProvinces,
      priorityFacilities,
      highRiskCommodities,
      dataDefinition: "Availability is submitted tracer rows with stock on hand above zero. MOS is stock on hand divided by average monthly consumption. Missing submissions are not stockouts.",
    };
  }

  function localCopilotReply(question) {
    const text = question.toLowerCase().trim();
    const context = currentCopilotContext();
    const scope = `${context.reportingPeriod} | ${context.filters.province} | ${context.filters.district}`;
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!. ]*$/.test(text)) {
      return {
        text: `Hello. I can help analyse ${context.reportingPeriod} tracer data for ${context.filters.province}. Ask about stockouts, availability, MOS, reporting coverage, commodities, facilities, or priority follow-up actions.`,
        evidence: scope,
      };
    }
    if (/report|submission|compliance|missing/.test(text)) {
      return {
        text: `Reporting coverage in the active scope is ${context.nationalSummary.reportingCoverage}, based on ${context.nationalSummary.reportingUnits} submitted reporting units. Missing submissions are tracked separately and are not treated as stockouts.`,
        evidence: scope,
      };
    }
    if (/stockout|stock out|risk|urgent|priority|act/.test(text)) {
      const facilities = context.priorityFacilities.slice(0, 3)
        .map((facility) => `${facility.facility} (${facility.province}: ${facility.stockoutItems} stockout, ${facility.lowStockItems} low-stock items)`)
        .join("; ");
      return {
        text: facilities
          ? `Start with the highest-risk reporting facilities: ${facilities}. Validate physical stock, check the submitted AMC, then consider redistribution from facilities with excess stock for the same commodity.`
          : "No priority facility alerts are available in the active scope. Try widening the filters or select another reporting period.",
        evidence: scope,
      };
    }
    if (/province|availability|mos|month.?s? of stock/.test(text)) {
      const provinces = context.lowestAvailabilityProvinces.slice(0, 3)
        .map((province) => `${province.name}: ${province.availability} availability, ${province.averageMos} MOS`)
        .join("; ");
      return {
        text: provinces
          ? `The lowest availability in the active scope is: ${provinces}. The selected scope overall is ${context.nationalSummary.availability} availability with ${context.nationalSummary.averageMos} average MOS.`
          : "No provincial performance rows are available for the active filters.",
        evidence: scope,
      };
    }
    return null;
  }

  async function askCopilot(question = copilotQuestion) {
    const message = question.trim();
    if (!message || copilotLoading) return;
    const requestMessage = { id: `question-${Date.now()}`, role: "user", text: message };
    const conversation = copilotMessages
      .filter((entry) => entry.role === "user" || (entry.role === "assistant" && Number.isInteger(Number(entry.id))))
      .slice(-6)
      .map((entry) => ({ role: entry.role, text: entry.text }));
    setCopilotMessages((current) => [...current, requestMessage]);
    setCopilotQuestion("");
    if (!copilotApiUrl) {
      setCopilotMessages((current) => [...current, { id: `error-${Date.now()}`, role: "assistant", text: "Tracer Copilot is available from the secure dashboard. Sign in at the Render dashboard to use it." }]);
      return;
    }
    setCopilotLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${copilotApiUrl}/api/copilot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ question: message, context: { ...currentCopilotContext(), conversation } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tracer Copilot could not answer right now.");
      setCopilotMessages((current) => [...current, { id: data.id, role: "assistant", text: data.answer, evidence: `${fieldData.label} | ${selectedProvince === "all" ? "All provinces" : selectedProvince} | ${selectedDistrict === "all" ? "All districts" : selectedDistrict}` }]);
    } catch (error) {
      const fallback = localCopilotReply(message);
      const text = error.name === "AbortError"
        ? "Tracer Copilot took too long to respond. Try again in a moment."
        : error.message || "Tracer Copilot could not answer right now.";
      setCopilotMessages((current) => [...current, fallback
        ? { id: `fallback-${Date.now()}`, role: "assistant", text: fallback.text, evidence: fallback.evidence, retryQuestion: message }
        : { id: `error-${Date.now()}`, role: "assistant", text, retryQuestion: message }]);
    } finally {
      window.clearTimeout(timeout);
      setCopilotLoading(false);
    }
  }

  async function rateCopilotAnswer(messageId, rating) {
    if (!Number.isInteger(Number(messageId)) || !copilotApiUrl) return;
    setCopilotFeedback((current) => ({ ...current, [messageId]: rating }));
    try {
      const response = await fetch(`${copilotApiUrl}/api/copilot/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: Number(messageId), rating }),
      });
      if (!response.ok) throw new Error("Unable to save feedback");
    } catch {
      setCopilotFeedback((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  }

  function exportStockCategoryExcel() {
    if (!selectedStockCategory) return;
    const rows = [
      ["ZAMMSA weekly stock status"],
      ["Programme", stockStreamLabels[stockStream] || stockStream],
      ["Reporting week", stockData?.label || ""],
      ["Category", selectedStockCategory],
      [],
      ["Commodity", "Availability", "Status"],
      ...selectedStockItems.map((item) => [item.name, formatPercent(item.availability), item.status]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zammsa-${selectedStockCategory.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stockData?.date || "weekly-stock"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportStockCategoryPdf() {
    if (!selectedStockCategory) return;
    const report = window.open("", "_blank", "noopener,noreferrer");
    if (!report) return;
    const rows = selectedStockItems.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatPercent(item.availability))}</td><td>${escapeHtml(item.status)}</td></tr>`).join("");
    report.document.write(`<!doctype html><html><head><title>${escapeHtml(selectedStockCategory)} - ZAMMSA weekly stock status</title><style>body{font-family:Arial,sans-serif;color:#17251d;padding:28px}h1{font-size:22px;margin:0 0 6px}p{color:#52665a;margin:4px 0 18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cadbd0;padding:9px;text-align:left}th{background:#eaf3ed;color:#075e3b}@media print{body{padding:0}}</style></head><body><h1>${escapeHtml(selectedStockCategory)}</h1><p>${escapeHtml(stockStreamLabels[stockStream] || stockStream)} | ${escapeHtml(stockData?.label || "")}</p><table><thead><tr><th>Commodity</th><th>Availability</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`);
    report.document.close();
  }

  function exportCsv() {
    const headers = ["Province", "District", "Facility level", "Reporting unit", "Reporting status", "Submission date", "Availability", "Confirmed stock-outs", "Low-stock commodities", "Stocked to plan", "Overstocked", "Last reporting date", "Active alert", "Follow-up status"];
    const lines = [
      headers.map(csvCell).join(","),
      ...filteredFacilityAlerts.map((facility) => [
        facility.province,
        facility.district,
        facility.facilityLevel,
        facility.isAggregate ? `All ${facility.facilityLevel.toLowerCase()} facilities` : facility.name,
        facility.reportingStatus,
        facility.reportingStatus === "Facility did not report" ? "" : fieldData.reportDate,
        facility.reportingStatus === "Facility did not report" ? "" : formatPercent(facility.availability),
        facility.reportingStatus === "Facility did not report" ? "" : facility.stockoutItemCount,
        facility.reportingStatus === "Facility did not report" ? "" : facility.lowStockItemCount,
        facility.reportingStatus === "Facility did not report" ? "" : facility.accordingToPlanItemCount,
        facility.reportingStatus === "Facility did not report" ? "" : facility.overstockItemCount,
        facility.lastReportingDate || fieldData.label,
        facilityStatusOptions.filter((option) => option.matches(facility)).map((option) => option.shortLabel).join("; "),
        facility.reportingStatus === "Facility did not report" ? "Reporting follow-up required" : "Review submitted tracer",
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
          {visibleDashboardPages.map((page) => (
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
          <div className="sidebar-credit">
            <small>&copy; 2026 Zanga Musakuzi</small>
            <small>Principal Pharmacist - Data Analytics</small>
          </div>
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
                {specialisedFacilityLevelOptions.length > 0 && <optgroup label="Specialised services">
                  {specialisedFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                </optgroup>}
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
            <div><span>Average MOS</span><strong>{formatMos(fieldAverageMos)}</strong><small>Submitted stock position (12-month cap)</small></div>
            <div><span>Reporting units</span><strong>{filteredFacilities.length}</strong><small>{fieldData.counts.facilityUnits} in full report</small></div>
            <div><span>Stockout facilities</span><strong>{stockoutFacilityCount}</strong><small>At least one stockout item</small></div>
            <div><span>Low-stock facilities</span><strong>{lowStockFacilityCount}</strong><small>Below 2 MOS</small></div>
            <div><span>DHO districts reporting</span><strong>{fieldDistrictsReportedInScope}</strong><small>Health Centre + Health Post required</small></div>
          </div>
        </section>

        <section className="management-kpi-summary">
          <div className="management-kpi-head">
            <div>
              <p className="eyebrow dark">KPI Summary</p>
              <h2>National supply chain management snapshot</h2>
            </div>
            <span>Selected reporting period: {fieldData.label}</span>
          </div>
          <div className="management-kpi-grid">
            {managementKpis.map((kpi) => <div className={`management-kpi tone-${kpi.tone}`} key={kpi.label}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small>{kpi.sub}</small>
            </div>)}
          </div>
          <div className="management-kpi-note">
            <b>External feeds pending:</b> eLMIS variance, data timeliness, delivery adherence, central-edition coverage, connectivity, and pipeline milestones.
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
                      <button type="button" className={selectedStockCategory === row.name ? "stock-category-row active" : "stock-category-row"} key={row.name} onClick={() => { setStockCategory(row.name); setStockCategoryDialog(true); }}>
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
            </>
          ) : <div className="empty-state">No weekly stock data is available.</div>}
        </section>

        <section className="field-visibility">
          <div className="field-head">
            <div>
              <p className="eyebrow dark">Facility To National Drilldown</p>
              <h2>Province, district, facility, programme, and commodity visibility</h2>
              <p>Click a province or district to narrow the reporting units and commodity alerts.</p>
              {isNationalUnfilteredScope && approvedProvincePerformanceOverrides[fieldData.id] ? <p className="data-warning-label">Province MOS and availability use the programme-approved Power BI presentation values for {fieldData.label}; cleaned calculations remain available in the underlying tracer data.</p> : null}
            </div>
          </div>
          <div className="field-kpis">
            <div><span>Availability</span><strong>{formatPercent(fieldKpis.availability)}</strong><small>{fieldKpis.rows.toLocaleString()} commodity rows</small></div>
            <div><span>Average MOS</span><strong>{formatMos(fieldAverageMos)}</strong><small>{fieldKpis.quantity.toLocaleString()} SOH submitted (12-month cap)</small></div>
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
              <h3>{facilityAlertsHeading}</h3>
              <p>{filteredFacilityAlerts.length.toLocaleString()} of {assessedFacilities.length.toLocaleString()} expected or reporting facilities match — {fieldData.label}{selectedProvince !== "all" ? ` · ${selectedProvince}` : " · Zambia"}{selectedDistrict !== "all" ? ` · ${selectedDistrict}` : ""}.</p>
            </div>
            <div className="facility-alert-kpis">
              <button type="button" className={!facilityStatusFilters.length ? "active tone-all" : "tone-all"} aria-pressed={!facilityStatusFilters.length} onClick={() => { setFacilityStatusFilters([]); setFacilityAlertPage(1); }}><i aria-hidden="true">●</i><b>{assessedFacilities.length.toLocaleString()}</b><span>All facilities</span><small>100% of assessed</small></button>
              {facilityStatusOptions.map((option) => <button type="button" className={`${facilityStatusFilters.includes(option.id) ? "active " : ""}tone-${option.tone}`} aria-pressed={facilityStatusFilters.includes(option.id)} onClick={() => toggleFacilityStatusFilter(option.id)} key={option.id}><i aria-hidden="true">{option.icon}</i><b>{facilityStatusCounts[option.id].toLocaleString()}</b><span>{option.label}</span><small>{assessedFacilities.length ? formatPercent(facilityStatusCounts[option.id] / assessedFacilities.length) : "0%"} of assessed</small></button>)}
            </div>
          </div>
          <div className="facility-alert-filter-summary">
            <span>{activeFacilityStatusOptions.length ? <>Showing facilities with: <b>{activeFacilityStatusOptions.map((option) => option.shortLabel).join(" OR ")}</b></> : <b>Showing all assessed facilities</b>}</span>
            <div><button type="button" className={facilityAlertView === "list" ? "active" : ""} onClick={() => setFacilityAlertView("list")}>List</button><button type="button" className={facilityAlertView === "map" ? "active" : ""} onClick={() => setFacilityAlertView("map")}>Map</button>{facilityStatusFilters.length ? <button type="button" onClick={() => { setFacilityStatusFilters([]); setFacilityAlertPage(1); }}>Clear status filters</button> : null}<button type="button" onClick={exportCsv}>Export filtered CSV</button></div>
          </div>
          {facilityAlertView === "list" ? <>
            <div className="facility-alert-list">
              {visibleFacilityAlerts.length ? visibleFacilityAlerts.map((facility) => (
                <FacilityCard facility={facility} onOpen={setOpenFacility} onOpenReporting={openFacilityReportingFollowup} key={`${facility.province}-${facility.district}-${facility.facilityLevel}-${facility.name}`} />
              )) : <div className="empty-state">No facilities match the selected status and geography filters.</div>}
            </div>
            {filteredFacilityAlerts.length > facilityAlertPageSize ? <div className="non-reporting-pagination"><button type="button" disabled={facilityAlertCurrentPage <= 1} onClick={() => setFacilityAlertPage((page) => page - 1)}>Previous</button><span>Page {facilityAlertCurrentPage} of {facilityAlertPageCount} · {filteredFacilityAlerts.length.toLocaleString()} facilities</span><button type="button" disabled={facilityAlertCurrentPage >= facilityAlertPageCount} onClick={() => setFacilityAlertPage((page) => page + 1)}>Next</button></div> : null}
          </> : <div className="facility-status-map" aria-label="Filtered facility status map">
            <div className="facility-map-legend">{facilityStatusOptions.map((option) => <span className={`tone-${option.tone}`} key={option.id}><i />{option.shortLabel}</span>)}</div>
            <div className="facility-map-canvas">{filteredFacilityAlerts.map((facility) => {
              const primary = facility.reportingStatus === "Facility did not report" ? facilityStatusOptions[2] : facility.stockoutItemCount > 0 ? facilityStatusOptions[0] : facility.criticalLowStockItemCount > 0 || facility.lowStockItemCount > 0 ? facilityStatusOptions[1] : facility.overstockItemCount > 0 ? facilityStatusOptions[4] : facilityStatusOptions[3];
              return <button type="button" className={`facility-map-marker tone-${primary.tone}`} key={`map-${facilityIdentityKey(facility)}`} title={`${facility.name} · ${facility.district} · ${primary.shortLabel}`} onClick={() => facility.reportingStatus === "Facility did not report" ? openFacilityReportingFollowup(facility) : setOpenFacility(facility)}><i>{primary.icon}</i><span><b>{facility.isAggregate ? `All ${facility.facilityLevel.toLowerCase()} facilities` : facility.name}</b><small>{facility.district} · {facility.province}</small><small>{facility.reportingStatus === "Facility did not report" ? "Current stock status unknown" : `${facility.stockoutItemCount} stock-outs · ${facility.lowStockItemCount} low · ${facility.overstockItemCount} overstocked`}</small></span></button>;
            })}</div>
            {!filteredFacilityAlerts.length ? <div className="empty-state">No map markers match the selected filters.</div> : null}
          </div>}
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
                <div className="commodity-triage-tools">
                  <span>Show availability</span>
                  {["all", "95", "90", "80"].map((threshold) => <button type="button" className={commodityAvailabilityThreshold === threshold ? "active" : ""} aria-pressed={commodityAvailabilityThreshold === threshold} onClick={() => { setCommodityAvailabilityThreshold(threshold); setCommodityOptionPage(1); }} key={threshold}>{threshold === "all" ? "All" : `Below ${threshold}%`}</button>)}
                </div>
                <div className="commodity-triage-header">
                  <button type="button" onClick={() => changeCommodityListSort("name")}>Commodity {commodityListSort.key === "name" ? (commodityListSort.direction === "asc" ? "↑" : "↓") : ""}</button>
                  <button type="button" onClick={() => changeCommodityListSort("availability")}>Availability {commodityListSort.key === "availability" ? (commodityListSort.direction === "asc" ? "↑" : "↓") : ""}</button>
                  <button type="button" onClick={() => changeCommodityListSort("stockouts")}>Stockouts {commodityListSort.key === "stockouts" ? (commodityListSort.direction === "asc" ? "↑" : "↓") : ""}</button>
                  <button type="button" onClick={() => changeCommodityListSort("trend")}>Trend {commodityListSort.key === "trend" ? (commodityListSort.direction === "asc" ? "↑" : "↓") : ""}</button>
                </div>
                {visibleCommodityMatches.length ? <div className="commodity-triage-rows">{visibleCommodityMatches.map((item) => <button type="button" className={`commodity-triage-row tone-${item.tone}`} title={`${formatPercent(item.stockoutRate)} of submitted rows are stocked out`} key={item.name} onClick={() => { setSelectedCommodity(item.name); setQuery(item.name); setCommodityPage(1); setCommodityStatusFilter("all"); setCommodityTableProvince("all"); setCommodityTableDistrict("all"); setCommodityTableLevel("all"); setCommodityTableReportingStatus("all"); }}><span className="commodity-triage-name"><i className={`status-dot ${item.tone}`} aria-hidden="true" /><b>{item.name}</b></span><strong>{formatPercent(item.availability)}</strong><strong>{item.stockouts.toLocaleString()}</strong><span className={`commodity-trend trend-${item.trend}`}>{item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : item.trend === "steady" ? "→" : "–"}<small>{item.trendDelta === null ? "New" : `${item.trendDelta >= 0 ? "+" : ""}${(item.trendDelta * 100).toFixed(1)}pp`}</small></span></button>)}</div> : <p>No matching commodity was found in the selected reporting period and filters.</p>}
                {commodityMatches.length > 10 && <div className="commodity-match-pagination"><button type="button" disabled={commodityOptionPage <= 1} onClick={() => setCommodityOptionPage((page) => page - 1)}>Previous</button><button type="button" disabled={commodityOptionPage >= commodityOptionPageCount} onClick={() => setCommodityOptionPage((page) => page + 1)}>Next</button></div>}
              </div>}
            </div>
            <div className="selected-commodity-control">
              <span>Selected reporting week</span>
              <strong>{fieldData.label}</strong>
              {selectedCommodity && <button type="button" onClick={() => { setSelectedCommodity(""); setQuery(""); setCommodityOptionPage(1); setCommodityStatusFilter("all"); setCommodityTableProvince("all"); setCommodityTableDistrict("all"); setCommodityTableLevel("all"); setCommodityTableReportingStatus("all"); setOpenCommodityFacility(null); }}>Clear search</button>}
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
              <div className="commodity-summary-actions"><small>Current scope: {selectedProvince === "all" ? "All provinces" : selectedProvince} | {selectedDistrict === "all" ? "All districts" : selectedDistrict} | {facilityCareLevelLabel(selectedFacilityLevel)}</small><button type="button" onClick={openSelectedCommodityComparison}>Compare this commodity</button></div>
            </div>
            {commodityActiveFilters.length > 0 && <div className="commodity-filter-chips" aria-label="Active commodity filters">
              <span>Filtered by</span>
              {commodityActiveFilters.map((filter) => <button type="button" key={filter.key} onClick={() => clearCommodityCrossFilter(filter.key)} aria-label={`Clear ${filter.label} filter`}>{filter.label}<b aria-hidden="true">×</b></button>)}
              <button type="button" className="clear-all" onClick={() => { setCommodityTableProvince("all"); setCommodityTableDistrict("all"); setCommodityTableLevel("all"); setCommodityStatusFilter("all"); setCommodityPage(1); }}>Clear all</button>
            </div>}
            <div className="commodity-kpis">
              <button type="button" title="Facilities reporting this commodity in the selected scope. Click to see expected facilities that did not submit it." className={commodityStatusFilter === "all" ? "active" : ""} aria-pressed={commodityStatusFilter === "all"} onClick={() => { setCommodityStatusFilter("all"); setCommodityMissingOpen(true); }}><span>Facilities reporting <i className="kpi-help" aria-hidden="true">?</i></span><strong>{commodityKpiScopeRows.length}</strong><small>{commodityMissingFacilities.length} of {commodityExpectedFacilities.length} facilities did not report · click to review</small></button>
              <button type="button" title={`Availability is facilities with stock on hand above zero divided only by facilities that submitted this commodity. Reporting coverage is ${formatPercent(commodityReportingRate)}.`} className={commodityStatusFilter === "Available" ? "active" : ""} aria-pressed={commodityStatusFilter === "Available"} onClick={() => applyCommodityStatusFilter("Available")}><span>Commodity availability <i className="kpi-help" aria-hidden="true">?</i>{commodityReportingRate < 0.6 ? <i className="kpi-warning" title={`Caution: only ${formatPercent(commodityReportingRate)} of expected facilities submitted this commodity, so availability describes reporters rather than the full facility scope.`} aria-label="Low reporting coverage warning">!</i> : null}</span><strong>{formatPercent(commodityKpiScopeRows.length ? commodityKpiScopeRows.filter((row) => row.quantity > 0).length / commodityKpiScopeRows.length : 0)}</strong><small>{commodityKpiScopeRows.filter((row) => row.quantity > 0).length} available among {commodityKpiScopeRows.length} reporting facilities</small></button>
              <button type="button" title="Average months of stock across reporting facilities. MOS is stock on hand divided by average monthly consumption." className={commoditySort === "mos" && commodityStatusFilter === "all" ? "active" : ""} onClick={() => { setCommoditySort("mos"); applyCommodityStatusFilter("all"); }}><span>Average MOS <i className="kpi-help" aria-hidden="true">?</i></span><strong>{formatMos(commodityAverageMos)}</strong><small>Click to sort facilities by MOS</small></button>
              <button type="button" title="Stocked out: MOS is zero or below." className={`red ${commodityStatusFilter === "Stocked out" ? "active" : ""}`} aria-pressed={commodityStatusFilter === "Stocked out"} onClick={() => applyCommodityStatusFilter("Stocked out")}><span>Stocked out <i className="kpi-help" aria-hidden="true">?</i></span><strong>{commodityStatusCounts["Stocked out"] || 0}</strong><small>MOS = 0</small></button>
              <button type="button" title="Emergency stock: MOS is above zero and no more than 0.5 months." className={`amber ${commodityStatusFilter === "Emergency stock" ? "active" : ""}`} aria-pressed={commodityStatusFilter === "Emergency stock"} onClick={() => applyCommodityStatusFilter("Emergency stock")}><span>Emergency stock <i className="kpi-help" aria-hidden="true">?</i></span><strong>{commodityStatusCounts["Emergency stock"] || 0}</strong><small>Above 0 to 0.5 MOS</small></button>
              <button type="button" title="Understocked: MOS is above 0.5 and below 2 months." className={`amber ${commodityStatusFilter === "Understocked" ? "active" : ""}`} aria-pressed={commodityStatusFilter === "Understocked"} onClick={() => applyCommodityStatusFilter("Understocked")}><span>Understocked <i className="kpi-help" aria-hidden="true">?</i></span><strong>{commodityStatusCounts.Understocked || 0}</strong><small>Above 0.5 to below 2 MOS</small></button>
              <button type="button" title="According to plan: MOS is from 2 through 4 months." className={`green ${commodityStatusFilter === "According to plan" ? "active" : ""}`} aria-pressed={commodityStatusFilter === "According to plan"} onClick={() => applyCommodityStatusFilter("According to plan")}><span>According to plan <i className="kpi-help" aria-hidden="true">?</i></span><strong>{commodityStatusCounts["According to plan"] || 0}</strong><small>2 to 4 MOS</small></button>
              <button type="button" title="Overstocked: MOS is above 4 and below 12 months. Excess stock: MOS is 12 months or more." className={`blue ${commodityStatusFilter === "Overstocked / excess" ? "active" : ""}`} aria-pressed={commodityStatusFilter === "Overstocked / excess"} onClick={() => applyCommodityStatusFilter("Overstocked / excess")}><span>Overstocked / excess <i className="kpi-help" aria-hidden="true">?</i></span><strong>{(commodityStatusCounts.Overstocked || 0) + (commodityStatusCounts["Excess stock"] || 0)}</strong><small>Above 4 MOS</small></button>
            </div>
            <div className="commodity-week-change" aria-label="What changed since last week">
              <div><p className="eyebrow dark">What changed</p><strong>{commodityWeekChange ? `${commodityWeekChange.previousLabel} → ${fieldData.label}` : "No comparable prior-week submission"}</strong></div>
              {commodityWeekChange ? <div className="commodity-change-badges">
                <span className={commodityWeekChange.newStockouts > 0 ? "negative" : "neutral"}><b>{commodityWeekChange.newStockouts > 0 ? "▲" : "•"} {commodityWeekChange.newStockouts}</b> new stockouts</span>
                <span className={commodityWeekChange.resolvedStockouts > 0 ? "positive" : "neutral"}><b>{commodityWeekChange.resolvedStockouts > 0 ? "▼" : "•"} {commodityWeekChange.resolvedStockouts}</b> resolved stockouts</span>
                <span className={commodityWeekChange.availabilityDelta >= 0 ? "positive" : "negative"}><b>{commodityWeekChange.availabilityDelta >= 0 ? "▲" : "▼"} {Math.abs(commodityWeekChange.availabilityDelta * 100).toFixed(1)}pp</b> availability</span>
                <span className={commodityWeekChange.mosDelta >= 0 ? "positive" : "negative"}><b>{commodityWeekChange.mosDelta >= 0 ? "▲" : "▼"} {Math.abs(commodityWeekChange.mosDelta).toFixed(1)}</b> average MOS</span>
                <span className={commodityWeekChange.facilityDelta >= 0 ? "positive" : "negative"}><b>{commodityWeekChange.facilityDelta >= 0 ? "+" : ""}{commodityWeekChange.facilityDelta}</b> reporting facilities</span>
              </div> : <p>Choose a commodity with observations in the preceding week to calculate facility-level changes.</p>}
            </div>
            <div className="commodity-totals"><span>Total SOH: <b>{Math.round(commodityTotalSoh).toLocaleString()}</b></span><span>Total AMC: <b>{Math.round(commodityTotalAmc).toLocaleString()}</b></span><span>Reporting rate: <b>{formatPercent(commodityReportingRate)}</b> ({commodityKpiScopeRows.length}/{commodityExpectedFacilities.length} facilities)</span><span>Incomplete commodity records: <b>Not classified as stockout</b></span></div>
            <div className="commodity-chart-grid">
              <div className="commodity-chart-panel"><h3>Availability by province</h3>{commodityProvinceRows.map((row) => <button type="button" aria-pressed={commodityTableProvince === row.name} className={`commodity-bar ${commodityTableProvince === row.name ? "active" : ""}`} key={row.name} onClick={() => applyCommodityProvinceFilter(row.name)}><span>{row.name}</span><i><b style={{ width: `${Math.round(row.availability * 100)}%` }} /></i><strong>{formatPercent(row.availability)}</strong></button>)}</div>
              <div className="commodity-chart-panel"><h3>Average MOS by level of care</h3>{commodityLevelRows.map((row) => <button type="button" aria-pressed={commodityTableLevel === row.name} className={`commodity-bar ${commodityTableLevel === row.name ? "active" : ""}`} key={row.name} onClick={() => applyCommodityLevelFilter(row.name)}><span>{row.name}</span><i><b style={{ width: `${Math.min((row.mos / 12) * 100, 100)}%` }} /></i><strong>{formatMos(row.mos)}</strong></button>)}</div>
              <div className="commodity-chart-panel commodity-week-chart-panel">
                <div className="commodity-week-chart-head">
                  <div><h3>Weekly availability and MOS</h3><span><i /> Commodity availability <b /> MOS <em /> National average</span></div>
                  <div className="commodity-trend-window" role="group" aria-label="Trend period">
                    {[4, 12, 52].map((weeks) => <button type="button" className={commodityTrendWindow === weeks ? "active" : ""} aria-pressed={commodityTrendWindow === weeks} onClick={() => setCommodityTrendWindow(weeks)} key={weeks}>{weeks}W</button>)}
                  </div>
                </div>
                {commodityZeroAvailabilityRun?.weeks >= 4 && <div className="commodity-zero-alert" role="alert"><b>Prolonged 0% availability</b><span>{commodityZeroAvailabilityRun.weeks} consecutive submitted weeks, from {commodityZeroAvailabilityRun.startLabel} to {commodityZeroAvailabilityRun.endLabel}. Escalate for stock verification and replenishment.</span></div>}
                <div className="commodity-week-chart-scroll">
                  <div className="commodity-week-chart" style={{ minWidth: `${Math.max(520, commodityTrendVisibleRows.length * 48)}px` }}>
                    <div className="commodity-week-axis availability">Availability (%)</div>
                    <div className="commodity-week-axis mos">MOS</div>
                    <div className="commodity-week-grid" aria-hidden="true">{[0, 25, 50, 75, 100].map((value) => <i key={value} style={{ bottom: `${value}%` }}><small>{value}%</small></i>)}</div>
                    <div className="commodity-week-columns" style={{ "--commodity-columns": commodityTrendVisibleRows.length }}>{commodityTrendVisibleRows.map((row) => <button type="button" className={row.periodId === fieldPeriodId ? "active" : ""} aria-pressed={row.periodId === fieldPeriodId} key={row.periodId} title={`${row.label}: ${formatPercent(row.availability)} commodity availability, ${formatMos(row.mos)} MOS, ${formatPercent(row.nationalAvailability)} national average`} onClick={() => selectCommodityTrendPeriod(row.periodId)}><i style={{ height: `${Math.round(row.availability * 100)}%` }}><b>{formatPercent(row.availability)}</b></i><em style={{ bottom: `${Math.min((row.mos / commodityTrendMosScale) * 100, 100)}%` }}>{formatMos(row.mos)}</em><span>{row.label.replace("Week ", "W")}</span></button>)}</div>
                    <svg className="commodity-week-mos-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Commodity MOS and national availability benchmark"><polyline className="mos" points={commodityTrendMosPoints} /><polyline className="national" points={commodityTrendNationalPoints} /></svg>
                  </div>
                </div>
                <small className="commodity-week-note">Click a week to refresh the KPI cards and facility table while retaining the active geography and care-level filters. Periods without a submitted commodity observation are excluded rather than plotted as 0%.</small>
              </div>
            </div>
            <div className="table-tools commodity-table-tools" ref={commodityTableRef}>
              <input value={commodityFacilityQuery} onChange={(event) => { setCommodityFacilityQuery(event.target.value); setCommodityPage(1); }} placeholder="Search facility, district, or province" />
              <select aria-label="Filter commodity table by province" value={commodityTableProvince} onChange={(event) => { setCommodityTableProvince(event.target.value); setCommodityTableDistrict("all"); setCommodityTableLevel("all"); setCommodityPage(1); }}><option value="all">All provinces</option>{commodityTableProvinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}</select>
              <select aria-label="Filter commodity table by district" value={commodityTableDistrict} onChange={(event) => { setCommodityTableDistrict(event.target.value); setCommodityTableLevel("all"); setCommodityPage(1); }}><option value="all">All districts</option>{commodityTableDistrictOptions.map((district) => <option key={district} value={district}>{district}</option>)}</select>
              <select aria-label="Filter commodity table by facility level" value={commodityTableLevel} onChange={(event) => { setCommodityTableLevel(event.target.value); setCommodityPage(1); }}><option value="all">All facility levels</option>{commodityTableLevelOptions.map((level) => <option key={level} value={level}>{level}</option>)}</select>
              <select aria-label="Filter commodity table by stock status" value={commodityStatusFilter} onChange={(event) => { setCommodityStatusFilter(event.target.value); setCommodityPage(1); }}><option value="all">All stock statuses</option><option value="Available">Available ({commodityKpiScopeRows.filter((row) => row.quantity > 0).length})</option>{["Stocked out", "Emergency stock", "Understocked", "According to plan", "Overstocked", "Excess stock"].map((status) => <option key={status} value={status}>{status} ({commodityStatusCounts[status] || 0})</option>)}<option value="Overstocked / excess">Overstocked / excess ({(commodityStatusCounts.Overstocked || 0) + (commodityStatusCounts["Excess stock"] || 0)})</option></select>
              <select aria-label="Filter commodity table by reporting status" value={commodityTableReportingStatus} onChange={(event) => { setCommodityTableReportingStatus(event.target.value); setCommodityPage(1); }}><option value="all">All reporting statuses</option><option value="Reported">Reported</option></select>
              <select value={commoditySort} onChange={(event) => setCommoditySort(event.target.value)}><option value="mos">Sort by MOS</option><option value="stock">Sort by stock on hand</option><option value="province">Sort by geography</option><option value="facility">Sort by facility</option><option value="status">Sort by stock status</option></select>
              <select value={commodityPageSize} onChange={(event) => { setCommodityPageSize(Number(event.target.value)); setCommodityPage(1); }}><option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option></select>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Province</th><th>District</th><th>Facility</th><th>Facility level</th><th>8-week MOS</th><th>SOH</th><th>AMC</th><th>MOS</th><th>Stock status</th><th>Reporting status</th><th /></tr></thead>
                <tbody>{commodityVisibleRows.length ? commodityVisibleRows.map((row) => {
                  const facilityKey = `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}`;
                  const status = commodityStockStatus(row.mos);
                  const tone = commodityStatusTone(status);
                  return <tr className="commodity-facility-row" tabIndex="0" aria-label={`Open ${row.facility} commodity basket`} onClick={() => setOpenCommodityFacility(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenCommodityFacility(row); } }} key={facilityKey}><td>{row.province}</td><td>{row.district}</td><td><strong>{row.facility}</strong></td><td>{row.facilityLevel}</td><td className="commodity-sparkline-cell"><MosSparkline values={commodityFacilityTrendMap.get(facilityKey) || []} /></td><td>{Math.round(row.quantity).toLocaleString()}</td><td>{Math.round(row.amc).toLocaleString()}</td><td className={`commodity-mos-cell tone-${tone}`}><strong>{formatMos(row.mos)}</strong></td><td className={`commodity-status-cell tone-${tone}`}><span>{status}</span></td><td><span className="comparison-signal green">Reported</span></td><td><button type="button" className="ghost-button" onClick={(event) => { event.stopPropagation(); setOpenCommodityFacility(row); }}>View basket</button></td></tr>;
                }) : <tr><td colSpan="11">No reporting facilities match the selected commodity filters.</td></tr>}</tbody>
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
                if (periodType === "weekly") {
                  const weeks = tracerReportingPeriods.filter((period) => String(period.month).startsWith(comparisonYear));
                  const latest = weeks.at(-1)?.id || "";
                  const baseline = weeks.at(-2)?.id || latest;
                  setComparisonBaselineStart(baseline);
                  setComparisonBaselineEnd(baseline);
                  setComparisonRangeStart(latest);
                  setComparisonRangeEnd(latest);
                } else if (periodType === "monthly") {
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
                <option value="weekly">Weekly</option>
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
                if (comparisonPeriodType === "weekly") {
                  const weeks = tracerReportingPeriods.filter((period) => String(period.month).startsWith(year));
                  const latestWeek = weeks.at(-1)?.id || "";
                  const baselineWeek = weeks.at(-2)?.id || latestWeek;
                  setComparisonBaselineStart(baselineWeek);
                  setComparisonBaselineEnd(baselineWeek);
                  setComparisonRangeStart(latestWeek);
                  setComparisonRangeEnd(latestWeek);
                } else if (comparisonPeriodType === "monthly") {
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
              <span>First period</span>
              <select value={comparisonBaselineStart} onChange={(event) => {
                setComparisonBaselineStart(event.target.value);
                setComparisonBaselineEnd(event.target.value);
              }}>
                {comparisonRangeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>Second period</span>
              <select value={comparisonRangeStart} onChange={(event) => {
                setComparisonRangeStart(event.target.value);
                setComparisonRangeEnd(event.target.value);
              }}>
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
                {comparisonSpecialisedFacilityLevelOptions.length > 0 && <optgroup label="Specialised services">
                  {comparisonSpecialisedFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
                </optgroup>}
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
              <select value={comparisonCompareBy} onChange={(event) => { setComparisonCompareBy(event.target.value); setComparisonFocusA(""); setComparisonFocusB(""); }}>
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

          {comparisonCommodity !== "all" && <div className="comparison-commodity-context"><span>Comparing commodity</span><strong>{comparisonCommodity}</strong><button type="button" onClick={() => { setSelectedCommodity(comparisonCommodity); setQuery(comparisonCommodity); setActivePage("commodities"); }}>Back to Commodity Intelligence</button></div>}

          {["province", "district"].includes(comparisonCompareBy) && comparisonFocusOptions.length > 0 && <div className="comparison-focus-mode">
            <div className="comparison-focus-head"><div><p className="eyebrow dark">Side-by-side compare</p><h3>Choose two {comparisonCompareBy === "province" ? "provinces" : "districts"}</h3></div><div><label>First<select value={effectiveComparisonFocusA} onChange={(event) => setComparisonFocusA(event.target.value)}>{comparisonFocusOptions.filter((name) => name !== effectiveComparisonFocusB).map((name) => <option value={name} key={name}>{name}</option>)}</select></label><span>versus</span><label>Second<select value={effectiveComparisonFocusB} onChange={(event) => setComparisonFocusB(event.target.value)}>{comparisonFocusOptions.filter((name) => name !== effectiveComparisonFocusA).map((name) => <option value={name} key={name}>{name}</option>)}</select></label></div></div>
            <div className="comparison-focus-cards">{comparisonFocusCards.map((row) => {
              const availabilityDelta = normalizeRate(row.current.availability) - normalizeRate(row.previous.availability);
              return <article key={row.name}><h4>{row.name}</h4><div><span><small>{comparisonPreviousLabel}</small><b>{formatPercent(row.previous.availability)}</b></span><em>→</em><span><small>{comparisonCurrentLabel}</small><b>{formatPercent(row.current.availability)}</b></span></div><p className={availabilityDelta >= 0 ? "positive" : "negative"}>{availabilityDelta >= 0 ? "▲" : "▼"} {Math.abs(availabilityDelta * 100).toFixed(1)}pp availability</p><dl><div><dt>Current MOS</dt><dd>{formatMos(row.current.mos)}</dd></div><div><dt>Stockouts</dt><dd>{row.current.stockout.toLocaleString()}</dd></div><div><dt>Facilities/rows</dt><dd>{row.current.rows.toLocaleString()}</dd></div></dl></article>;
            })}</div>
          </div>}

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
              <h2>Reporting follow-up, trends, and weekly report library</h2>
              <p>Use this workspace to identify persistent reporting gaps, inspect patterns over time, and review the weekly tracer submissions. Live compliance monitoring remains under Reporting Rate.</p>
            </div>
          </div>
          <div className="reporting-filter-bar quality-primary-filters">
            <label><span>Start month</span><select value={qualityRangeStart} onChange={(event) => setQualityRangeStart(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
            <label><span>End month</span><select value={qualityRangeEnd} onChange={(event) => setQualityRangeEnd(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
            <label><span>Reporting period</span><select value={qualityGranularity} onChange={(event) => { setQualityGranularity(event.target.value); setQualityPointFilter("all"); }}><option value="week">Reporting week</option><option value="month">Month</option></select></label>
            <label><span>Province</span><select value={qualityProvinceFilter} onChange={(event) => { setQualityProvinceFilter(event.target.value); setQualityDistrictFilter("all"); }}><option value="all">Zambia - all provinces</option>{qualityProvinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}</select></label>
            <label><span>District</span><select value={qualityDistrictFilter} onChange={(event) => setQualityDistrictFilter(event.target.value)}><option value="all">All districts</option>{qualityDistrictOptions.map((district) => <option value={district} key={district}>{district}</option>)}</select></label>
            <label><span>Level of care</span><select value={qualityFacilityLevelFilter} onChange={(event) => setQualityFacilityLevelFilter(event.target.value)}><option value="all">All levels</option>{qualityFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}</select></label>
          </div>
          <div className="quality-compact-workspace">
            <div className="reporting-filter-bar quality-compact-redundant-filters">
              <label><span>Start month</span><select value={qualityRangeStart} onChange={(event) => setQualityRangeStart(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
              <label><span>End month</span><select value={qualityRangeEnd} onChange={(event) => setQualityRangeEnd(event.target.value)}>{qualityMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}</select></label>
              <label><span>Reporting period</span><select value={qualityGranularity} onChange={(event) => { setQualityGranularity(event.target.value); setQualityPointFilter("all"); }}><option value="week">Reporting week</option><option value="month">Month</option></select></label>
              <label><span>Province</span><select value={qualityProvinceFilter} onChange={(event) => { setQualityProvinceFilter(event.target.value); setQualityDistrictFilter("all"); }}><option value="all">All provinces</option>{qualityProvinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}</select></label>
              <label><span>District</span><select value={qualityDistrictFilter} onChange={(event) => setQualityDistrictFilter(event.target.value)}><option value="all">All districts</option>{qualityDistrictOptions.map((district) => <option value={district} key={district}>{district}</option>)}</select></label>
              <label><span>Level of care</span><select value={qualityFacilityLevelFilter} onChange={(event) => setQualityFacilityLevelFilter(event.target.value)}><option value="all">All levels</option>{qualityFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}</select></label>
            </div>
            <div className="quality-compact-grid">
              <div className="quality-panel">
                <div className="quality-panel-head"><div><h3>DHO district reporting trend</h3><p>{qualityTimelineNarrative} Both Health Centre and Health Post reports are required; hospital reports are excluded.</p></div><span>{qualityDistrictReportingTrendRows.length} periods</span></div>
                <div className="reporting-trend-graph compact"><div className="reporting-trend-axis">District reporting rate (%)</div><div className="reporting-trend-grid" aria-hidden="true">{[0, 25, 50, 75, 100].map((value) => <i key={value} style={{ bottom: `${value}%` }}><small>{value}%</small></i>)}</div><div className="reporting-trend-points" style={{ "--trend-points": qualityDistrictReportingTrendRows.length }}>{qualityDistrictReportingTrendRows.map((row) => <button type="button" className={qualityPointFilter === row.id ? "active" : ""} key={row.id} style={{ "--trend-rate": `${100 - normalizeRate(row.rate) * 100}%` }} onClick={() => setQualityPointFilter((current) => current === row.id ? "all" : row.id)}><b>{formatPercent(row.rate)}</b><span>{qualityGranularity === "month" ? row.label.replace(" 2026", "") : row.label.replace("Week ", "W")}</span></button>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={qualityDistrictReportingTrendPoints} /></svg></div>
              </div>
              <div className="quality-panel quality-compact-summary">
                <div className="quality-panel-head"><div><h3>Follow-up priority</h3><p>Most persistent gaps in the current filters. Open a history to see exactly which reporting weeks were missed.</p></div><span>{qualityFollowupRows.length} shown</span></div>
                <div className="followup-priority-list">{qualityFollowupRows.length ? qualityFollowupRows.map((row) => <button type="button" key={`${row.province}-${row.district}-${row.facilityLevel}-${row.name}`} onClick={() => setOpenReportingFacility(row)}><span><b>{row.name}</b><small>{row.district} | {row.province}</small></span><strong>{row.missedReports} missed</strong></button>) : <div className="empty-state">No reporting gaps match the selected filters.</div>}</div>
                <div className="quality-detail-actions"><button type="button" onClick={() => setQualityDetailDialog("districts")}>Open timeline details</button><button type="button" onClick={() => setQualityDetailDialog("followup")}>Open follow-up register</button></div>
              </div>
            </div>
            <div className="quality-gap-timeline-panel">
              <div className="quality-panel-head"><div><h3>Exact submission-gap timeline</h3><p>{qualityGapScopeLabel}. Red periods contain one or more missing reporting units; click a period to filter the follow-up list.</p></div><span>{qualityGapTimelineRows.filter((row) => row.missing > 0).length} periods with gaps</span></div>
              <div className="quality-gap-timeline" style={{ "--gap-periods": Math.min(qualityGapTimelineRows.length, 14) }}>
                {qualityGapTimelineRows.map((row) => <button type="button" className={`${row.missing ? "missing" : "reported"} ${qualityPointFilter === row.id ? "active" : ""}`} key={row.id} onClick={() => { setQualityGranularity("week"); setQualityPointFilter((current) => current === row.id ? "all" : row.id); setQualityTablePage(1); }} title={`${row.label}: ${row.reported} of ${row.expected} reporting units submitted`}><span>{row.label.replace(/^Week\s+/i, "W")}</span><b>{row.missing ? `${row.missing} missed` : "Complete"}</b><small>{row.reported}/{row.expected} received</small></button>)}
              </div>
            </div>
            <div className="weekly-library-preview">
              <div className="quality-panel-head"><div><h3>Weekly report library</h3><p>Latest submitted tracer reporting periods. National report files will open here once they are loaded.</p></div><button type="button" onClick={() => setQualityDetailDialog("library")}>View all reports</button></div>
              <div className="table-scroll"><table><thead><tr><th>Reporting period</th><th>Provinces</th><th>DHO districts</th><th>Facility reporting units</th><th>Rate</th><th /></tr></thead><tbody>{weeklyReportLibraryRows.slice(0, 6).map((row) => <tr key={row.id}><td>{row.label}</td><td>{row.provinces}</td><td title={`${row.partialDistricts} partial primary-care; ${row.hospitalOnlyDistricts} hospital-only`}>{row.districts}/{row.expectedDistricts}</td><td>{row.reportedFacilities}/{row.expectedFacilities}</td><td><span className={`comparison-signal ${reportingTone(row.rate)}`}>{formatPercent(row.rate)}</span></td><td><button type="button" className="ghost-button" onClick={() => { setSelectedLibraryPeriodId(row.id); setQualityDetailDialog("pending-report"); }}>Open</button></td></tr>)}</tbody></table></div>
            </div>
          </div>
          <div className="dq-detail-source">
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
              <label><span>Facility level</span><select value={qualityFacilityLevelFilter} onChange={(event) => setQualityFacilityLevelFilter(event.target.value)}><option value="all">All levels</option>{qualityFacilityLevelOptions.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}</select></label>
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
          </div>
        </section>

        <section className="reporting-rate-section">
          <div className="section-head">
            <div>
              <p className="eyebrow dark">Reporting Rate</p>
              <h2>{reportStatus === "Not Reported" ? `Facilities that did not report — ${reportData.label}` : "District and facility reporting performance"}</h2>
              <p>A district counts as reported only when its DHO submission includes both Health Centre and Health Post reporting. Combined primary-care source sheets count for both; Level 1, 2, or 3 hospital submissions never make the district count as reported.</p>
              {reportFacilityName !== "all" ? <p className="active-reporting-context">Reporting unit: <b>{reportFacilityName}</b> <button type="button" onClick={() => setReportFacilityName("all")}>Clear</button></p> : null}
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
                <option value="all">All submitted facility levels</option>
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
            <KpiCard label="Expected districts" value={reportingKpis.expected.toLocaleString()} sub="Districts expected to submit" />
            <KpiCard label="DHO districts submitted" value={reportingKpis.reported.toLocaleString()} sub="Both Health Centre and Health Post received" />
            <KpiCard label="Districts not complete" value={reportingKpis.notReported.toLocaleString()} sub={`${reportingKpis.partial} partial · ${reportingKpis.hospitalOnly} hospital-only`} tone="red" />
            <KpiCard label="District reporting rate" value={formatPercent(reportingKpis.rate)} sub="Districts submitted / expected" tone={reportingTone(reportingKpis.rate)} />
            <KpiCard label="Facilities expected" value={reportingFacilityKpis.expected.toLocaleString()} sub="Expected units in current facility filters" />
            <KpiCard label="Reports received" value={reportingFacilityKpis.received.toLocaleString()} sub="Valid tracer submissions received" />
            <KpiCard label="Reports missing" value={reportingFacilityKpis.missing.toLocaleString()} sub="Expected units without a valid submission" tone={reportingFacilityKpis.missing ? "red" : undefined} />
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
                  <p>{reportDrillProvince ? "Click a district to show submitted facilities." : "Click a province to drill down to district reporting rate."}</p>
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
                  <h3>{reportStatus === "Not Reported" ? "Facilities requiring reporting follow-up" : reportDrillDistrict ? `${reportDrillDistrict} reporting facilities` : "Reporting facilities"}</h3>
                  <p>{reportStatus === "Not Reported" ? "No tracer was submitted for the selected reporting period. Stock position remains unknown." : "Each row is one expected reporting facility or aggregate facility level for the selected week."}</p>
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
                      <th>Last reporting period</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportingFacilityRows.length ? reportingFacilityRows.map((row) => (
                      <tr key={`${row.province}-${row.district}-${row.facilityType}-${row.facilityName}`}>
                        <td>{row.facilityName}</td>
                        <td>{row.facilityType}</td>
                        <td><span className={`status-pill ${row.status === "Reported" ? "reported" : "missing"}`}>{row.status}</span></td>
                        <td>{row.lastReportingPeriod}</td>
                        <td>{row.status === "Not Reported" ? <button type="button" className="ghost-button" onClick={() => openFacilityReportingFollowup(row.sourceFacility)}>Open follow-up</button> : <span>Submitted</span>}</td>
                      </tr>
                    )) : <tr><td colSpan="5">No facilities match the selected reporting filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="table-panel reporting-table">
            <div className="table-headline">
              <div>
                <h2>Reporting rate detail</h2>
                <p>District reporting summary for the selected reporting filters.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>District</th>
                    <th>Expected</th>
                    <th>Reported</th>
                    <th>Not Reported</th>
                    <th>Health Centre</th>
                    <th>Health Post</th>
                    <th>DHO assessment</th>
                    <th>Reporting Rate %</th>
                  </tr>
                </thead>
                <tbody>
                  {reportingRows.map((row) => (
                    <tr key={`${row.province}-${row.district}`}>
                      <td>{row.province}</td>
                      <td>{row.district}</td>
                      <td>{row.expected.toLocaleString()}</td>
                      <td>{row.reported.toLocaleString()}</td>
                      <td>{row.notReported.toLocaleString()}</td>
                      <td>{row.combinedPrimaryCareReported ? "Combined" : row.healthCentreReported ? "Received" : "Missing"}</td>
                      <td>{row.combinedPrimaryCareReported ? "Combined" : row.healthPostReported ? "Received" : "Missing"}</td>
                      <td><span className={`comparison-signal ${row.reported ? "green" : "red"}`}>{row.detailStatus}</span></td>
                      <td><span className={`comparison-signal ${reportingTone(row.rate)}`}>{formatPercent(row.rate)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="predictive-analysis">
          <div className="section-head predictive-head">
            <div>
              <p className="eyebrow dark">Predictive analysis</p>
              <h2>Stockout risk overview</h2>
              <p>Optimized Holt/Holt-Winters demand forecasts combined with submitted stockout evidence. Validate physical stock before action.</p>
              <small>Cut-off: {fieldData.reportDate} · {predictiveHistoryPeriods.length} reporting weeks analysed</small>
            </div>
          </div>

          <section className="predictive-model-banner" aria-label="Live predictive forecasting status">
            <div className="predictive-model-banner-head">
              <div>
                <span>FORECAST ENGINE ACTIVE</span>
                <h3>Optimized forecasting is live in Tracer</h3>
                <p>Weekly AMC history now drives projected MOS, six-week demand forecasts, 95% uncertainty intervals and buffered reorder recommendations. Current facility evidence is blended with model risk to surface earlier warnings.</p>
              </div>
              <button type="button" onClick={() => setPredictiveTab("commodities")}>Open forecast warning register</button>
            </div>
            <div className="predictive-model-banner-metrics">
              <article><span>Commodities modelled</span><strong>{predictiveModelSummary.modelled.toLocaleString()}</strong><small>Holt trend and seasonal models</small></article>
              <article><span>Seasonal fits</span><strong>{predictiveModelSummary.seasonal.toLocaleString()}</strong><small>Six-week Holt-Winters cycle</small></article>
              <article><span>Median model MAPE</span><strong>{predictiveModelSummary.medianMape === null ? "-" : `${predictiveModelSummary.medianMape.toFixed(1)}%`}</strong><small>Forecast error diagnostic</small></article>
              <article><span>Recommended units</span><strong>{Math.round(predictiveModelSummary.reorderUnits).toLocaleString()}</strong><small>Before confirmed pipeline</small></article>
            </div>
          </section>

          <div className="predictive-tabs" role="tablist" aria-label="Predictive analysis views">
            {[
              ["overview", "Risk overview"],
              ["evidence", "Province evidence"],
              ["performance", "Forecast performance"],
              ["commodities", "All Commodities Under Threat"],
              ["actions", "Recommended actions"],
            ].map(([id, label]) => <button type="button" role="tab" aria-selected={predictiveTab === id} className={predictiveTab === id ? "active" : ""} onClick={() => setPredictiveTab(id)} key={id}>{label}</button>)}
          </div>

          {predictiveTab === "overview" && <>
            <div className="stats-grid predictive-kpis">
              <KpiCard label="National risk score" value={formatPercent(predictiveAverageLikelihood)} sub={forecastRiskLabel(predictiveAverageLikelihood)} tone={forecastRiskTone(predictiveAverageLikelihood)} />
              <KpiCard label="Highest-risk province" value={predictiveTopProvince ? shortProvinceName(predictiveTopProvince.province) : "-"} sub={predictiveTopProvince ? `${formatPercent(predictiveTopProvince.likelihood)} priority score` : "No matching reports"} tone={predictiveTopProvince?.tone || "neutral"} />
              <KpiCard label="High-risk provinces" value={predictiveHighRiskRows.length.toLocaleString()} sub="Priority score of 60% or above" tone={predictiveHighRiskRows.length ? "red" : "green"} />
              <KpiCard label="Facilities requiring attention" value={predictiveImpact.current.toLocaleString()} sub="Stockout or low-stock alert" tone={predictiveImpact.current ? "amber" : "green"} />
            </div>

            <div className="predictive-insight-strip"><b>Current outlook:</b> National priority score is {formatPercent(predictiveAverageLikelihood)} ({forecastRiskLabel(predictiveAverageLikelihood).toLowerCase()}). {predictiveTopProvince ? `${shortProvinceName(predictiveTopProvince.province)} ranks highest at ${formatPercent(predictiveTopProvince.likelihood)}.` : "No province ranking is available."} {predictiveWorseningCount} province{predictiveWorseningCount === 1 ? " has" : "s have"} a worsening pattern. Holt models cover {predictiveModelSummary.modelled} commodities; {predictiveModelSummary.seasonal} use an identified six-week seasonal cycle. {predictiveTopTransfer ? "One immediate redistribution opportunity is highlighted." : "No same-province redistribution opportunity is currently identified."}</div>

            <div className="predictive-overview-grid">
              <div className="quality-panel predictive-ranking-panel">
                <div className="quality-panel-head"><div><h3>Province risk ranking</h3><p>Select a province to apply it to the dashboard filters.</p></div><span>{predictiveProvinceRows.length} provinces</span></div>
                <div className="predictive-ranking-list">
                  {predictiveProvinceRows.map((row, index) => (
                    <button type="button" key={row.province} className={`predictive-rank-row risk-${row.tone}`} onClick={() => selectProvince(row.province)}>
                      <b className="predictive-rank-number">{index + 1}</b>
                      <span>{shortProvinceName(row.province)}<small>{row.label} · {predictiveAttentionByProvince.get(row.province) || 0} facilities affected</small></span>
                      <div className="predictive-risk-track"><i style={{ width: `${Math.round(row.likelihood * 100)}%` }} /></div>
                      <em className={`predictive-movement ${row.movement}`}>{row.movement === "up" ? "↑" : row.movement === "down" ? "↓" : "→"}</em>
                      <strong>{formatPercent(row.likelihood)}</strong>
                    </button>
                  ))}
                  {!predictiveProvinceRows.length && <div className="empty-state">No historical province stock reports match the current filters.</div>}
                </div>
              </div>

              <div className="predictive-action-card">
                <p className="eyebrow dark">Priority action</p>
                {predictiveTopTransfer ? <>
                  <h3 title={predictiveTopTransfer.commodity}>{predictiveTopTransfer.commodity}</h3>
                  <dl>
                    <div><dt>Source</dt><dd>{predictiveTopTransfer.sourceFacility}<small>{predictiveTopTransfer.sourceDistrict}</small></dd></div>
                    <div><dt>Destination</dt><dd>{predictiveTopTransfer.destinationFacility}<small>{predictiveTopTransfer.destinationDistrict}</small></dd></div>
                    <div><dt>Source SOH</dt><dd>{Math.round(predictiveTopTransfer.sourceQty || 0).toLocaleString()}</dd></div>
                    <div><dt>Responsible</dt><dd>Provincial pharmacist</dd></div>
                    <div><dt>Status</dt><dd><span className={`comparison-signal ${predictiveTopTransferStatus === "Completed" ? "green" : predictiveTopTransferStatus === "In progress" ? "amber" : "red"}`}>{predictiveTopTransferStatus}</span></dd></div>
                  </dl>
                </> : <div className="empty-state">Validate procurement or inter-provincial options; no same-province transfer is currently available.</div>}
                <button type="button" onClick={() => setActivePage("actions")}>Open action tracker</button>
              </div>
            </div>

            <div className="predictive-support-grid">
              <div className="quality-panel predictive-timeline-panel">
                <div className="quality-panel-head"><div><h3>National risk trend</h3><p>Commodity rows below 2 MOS over the last 12 reporting weeks.</p></div></div>
                <div className="predictive-line-chart">
                  <div className="predictive-line-axis"><span>{formatPercent(predictiveTimelineScale)}</span><span>{formatPercent(predictiveTimelineScale / 2)}</span><span>0.0%</span></div>
                  <div className="predictive-line-plot"><i className="grid top" /><i className="grid middle" /><i className="grid bottom" /><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Twelve-week national risk trend"><polyline points={predictiveTimelinePoints} /></svg>{predictiveTimelineVisible.map((row, index) => <span key={row.label} style={{ left: `${predictiveTimelineVisible.length > 1 ? (index / (predictiveTimelineVisible.length - 1)) * 100 : 50}%` }}>{row.label.replace("Week ", "W")}</span>)}</div>
                </div>
              </div>
              <div className="quality-panel predictive-commodity-panel">
                <div className="quality-panel-head"><div><h3>Top five risk-driving commodities</h3><p>Affected facilities and provinces in the latest submission.</p></div><button type="button" className="table-link" onClick={() => setActivePage("commodities")}>View all commodities</button></div>
                <div className="predictive-commodity-list">{predictiveCommodityTopFive.map((row) => <button type="button" className={`risk-${row.tone}`} key={row.name} onClick={() => { setSelectedCommodity(row.name); setQuery(row.name); setActivePage("commodities"); }}><span title={row.name}>{row.name}<small>{row.affectedFacilities} facilities · {row.affectedProvinces} provinces · MOS {formatMos(Math.min(12, row.mos || 0))}</small></span><div className="predictive-risk-track"><i style={{ width: `${Math.round(row.likelihood * 100)}%` }} /></div><b>{formatPercent(row.likelihood)}</b></button>)}</div>
              </div>
            </div>
          </>}

          {predictiveTab === "evidence" && <div className="predictive-tab-panel">
            <div className="predictive-layout">
              <div className="quality-panel predictive-method-panel">
                <div className="quality-panel-head"><div><h3>Optimized forecasting model</h3><p>Parameters are selected per commodity by minimizing in-sample squared error.</p></div></div>
                <div className="predictive-method-list"><div><b>{predictiveModelSummary.modelled}</b><span>Commodities modelled</span></div><div><b>{predictiveModelSummary.seasonal}</b><span>Holt-Winters seasonal fits</span></div><div><b>{predictiveModelSummary.medianMape === null ? "-" : `${predictiveModelSummary.medianMape.toFixed(1)}%`}</b><span>Median MAPE</span></div><div><b>95%</b><span>Residual-based prediction interval</span></div><div><b>{Math.round(predictiveModelSummary.reorderUnits).toLocaleString()}</b><span>Aggregate recommended units</span></div></div>
              </div>
              <div className="quality-panel predictive-data-warning"><h3>Data quality treatment</h3><p>MOS is calculated from submitted commodity rows and capped at 12 months for display. Zero or extremely low AMC can produce implausible uncapped values, so these should be validated at source.</p></div>
            </div>
            <div className="table-panel predictive-table">
              <div className="table-headline"><div><h2>Province evidence</h2><p>Underlying submitted indicators supporting the priority ranking.</p></div></div>
              <div className="table-scroll"><table><thead><tr><th>Rank</th><th>Province</th><th>Priority score</th><th>Risk band</th><th>Movement</th><th>Latest stockout</th><th>Below 2 MOS</th><th>Emergency stock</th><th>Availability</th><th>Capped MOS</th><th>Weeks used</th><th>Latest report</th></tr></thead><tbody>
                {predictiveProvinceRows.map((row, index) => <tr key={row.province}><td>{index + 1}</td><td>{shortProvinceName(row.province)}</td><td><span className={`comparison-signal ${row.tone}`}>{formatPercent(row.likelihood)}</span></td><td>{row.label}</td><td>{row.movement === "up" ? "Worsening ↑" : row.movement === "down" ? "Improving ↓" : "Stable →"}</td><td>{formatPercent(row.currentStockoutRate)}</td><td>{formatPercent(row.currentRiskRate)}</td><td>{formatPercent(row.emergencyRate)}</td><td>{formatPercent(row.availability)}</td><td>{formatMos(predictiveProvinceMos.get(row.province))}{(row.mos || 0) > 12 ? <small className="data-warning-label">Validate AMC</small> : null}</td><td>{row.observations}</td><td>{row.lastReport}</td></tr>)}
                {!predictiveProvinceRows.length && <tr><td colSpan="12">No province evidence is available for the selected scope.</td></tr>}
              </tbody></table></div>
            </div>
          </div>}

          {predictiveTab === "performance" && <div className="predictive-feedback-section predictive-tab-panel">
            <div className="table-headline predictive-feedback-headline"><div><p className="eyebrow dark">Model validation</p><h2>Priority score versus actual stockouts</h2><p>Each completed week compares the preceding priority score with the next submitted stockout rate.</p></div><span>Latest outcome: <b>{predictiveFeedback.latestActualLabel || "No completed comparison"}</b></span></div>
            <div className="stats-grid predictive-feedback-kpis"><KpiCard label="Score agreement" value={predictiveFeedback.total ? formatPercent(predictiveFeedback.accuracy) : "-"} sub="1 minus the absolute difference between score and actual stockout rate" tone={predictiveFeedback.accuracy >= 0.75 ? "green" : predictiveFeedback.accuracy >= 0.55 ? "amber" : "red"} /><KpiCard label="Scores tested" value={predictiveFeedback.total.toLocaleString()} sub="Province scores with a next-week outcome" /><KpiCard label="Confirmed high risk" value={predictiveFeedback.confirmed.toLocaleString()} sub={`${predictiveFeedback.highForecasts} high-risk alerts issued`} tone="red" /><KpiCard label="Follow-up flags" value={predictiveFeedback.missedActions.length.toLocaleString()} sub="High risk persisted into the next week" tone={predictiveFeedback.missedActions.length ? "amber" : "green"} /></div>
            <div className="quality-panel predictive-feedback-panel"><div className="quality-panel-head"><div><h3>Latest scorecard</h3><p>Priority score compared directly with submitted stockout outcome.</p></div></div><div className="predictive-feedback-list">{predictiveFeedbackRows.map((row) => <button type="button" key={`${row.province}-${row.actualLabel}`} onClick={() => selectProvince(row.province)}><span><b>{shortProvinceName(row.province)}</b><small>{row.forecastLabel} score to {row.actualLabel} outcome</small></span><span><small>Score</small><b>{formatPercent(row.predictedLikelihood)}</b></span><span><small>Actual stockout</small><b>{formatPercent(row.actualStockoutRate)}</b></span><span className={`comparison-signal ${row.confirmed ? "red" : row.accuracy >= 0.75 ? "green" : "amber"}`}>{formatPercent(row.accuracy)}</span></button>)}{!predictiveFeedbackRows.length && <div className="empty-state">At least two submitted weeks are needed for validation.</div>}</div></div>
          </div>}

          {predictiveTab === "commodities" && <div className="predictive-tab-panel predictive-commodity-workspace">
            <div className="table-headline predictive-commodity-headline">
              <div>
                <p className="eyebrow dark">Priority commodities</p>
                <h2>All Commodities Under Threat</h2>
                <p>Ranked from the selected reporting scope. A threat is a submitted commodity with stockout, emergency, or low-stock pressure.</p>
              </div>
              <span>{predictiveThreatRows.length} commodities</span>
            </div>

            <div className="predictive-commodity-controls">
              <label>Search commodity<input value={predictiveCommodityQuery} onChange={(event) => { setPredictiveCommodityQuery(event.target.value); setPredictiveCommodityPage(1); }} placeholder="Search commodity or programme" /></label>
              <label>Risk filter<select value={predictiveCommodityStatus} onChange={(event) => { setPredictiveCommodityStatus(event.target.value); setPredictiveCommodityPage(1); }}><option value="at-risk">All under threat</option><option value="stockout">Stocked out</option><option value="emergency">Emergency (0.5 MOS or less)</option><option value="low-stock">Low stock (0.5 to below 2 MOS)</option><option value="high-risk">High priority score</option></select></label>
            </div>

            <div className="predictive-commodity-chart quality-panel">
              <div className="quality-panel-head"><div><h3>Top commodity risk scores</h3><p>Highest priority commodities in the current selection.</p></div></div>
              <div className="predictive-commodity-bars">{predictiveThreatRows.slice(0, 10).map((row, index) => <button type="button" key={row.name} className={`risk-${row.tone}`} onClick={() => { setSelectedCommodity(row.name); setQuery(row.name); setActivePage("commodities"); }}><b>{index + 1}</b><span title={row.name}>{row.name}<small>{row.affectedFacilities} facilities affected · {row.affectedProvinces} provinces</small></span><div className="predictive-risk-track"><i style={{ width: `${Math.round(row.likelihood * 100)}%` }} /></div><strong>{formatPercent(row.likelihood)}</strong></button>)}{!predictiveThreatRows.length && <div className="empty-state">No threatened commodities match the current filters.</div>}</div>
            </div>

            <div className="table-panel predictive-threat-table">
              <div className="table-headline"><div><h2>Commodity risk register</h2><p>Use the commodity name to open facility-level evidence in Commodity Intelligence.</p></div></div>
              <div className="table-scroll"><table><thead><tr><th>Rank</th><th>Commodity</th><th>Programme</th><th>Priority score</th><th>Risk band</th><th>Stockout</th><th>Current MOS</th><th>Projected MOS</th><th>Forecast AMC</th><th>95% interval</th><th>Model</th><th>Recommended order</th><th>Facilities affected</th><th>Likely timeframe</th><th></th></tr></thead><tbody>
                {predictiveThreatPageRows.map((row, index) => <tr key={row.name}><td>{((Math.min(predictiveCommodityPage, predictiveThreatPages) - 1) * predictiveThreatPageSize) + index + 1}</td><td><strong>{row.name}</strong></td><td>{row.programme}</td><td><span className={`comparison-signal ${row.tone}`}>{formatPercent(row.likelihood)}</span></td><td>{row.label}</td><td>{formatPercent(row.stockoutRate)}</td><td>{formatMos(row.mos)}</td><td>{formatMos(row.projectedMos)}</td><td>{Math.round(row.forecastDemand || 0).toLocaleString()}</td><td>{Math.round(row.forecastLower95 || 0).toLocaleString()}–{Math.round(row.forecastUpper95 || 0).toLocaleString()}</td><td>{row.forecastMethod === "holt_winters_additive" ? "Holt-Winters" : "Holt linear"}<small className="data-warning-label">MAPE {Number.isFinite(row.forecastMape) ? `${row.forecastMape.toFixed(1)}%` : "-"}</small></td><td>{Math.round(row.recommendedOrderQty || 0).toLocaleString()}</td><td>{row.affectedFacilities}</td><td>{row.horizon}</td><td><button type="button" className="table-link" onClick={() => { setSelectedCommodity(row.name); setQuery(row.name); setActivePage("commodities"); }}>View details</button></td></tr>)}
                {!predictiveThreatPageRows.length && <tr><td colSpan="15">No commodities match the selected threat filter.</td></tr>}
              </tbody></table></div>
              <div className="predictive-pagination"><button type="button" disabled={predictiveCommodityPage <= 1} onClick={() => setPredictiveCommodityPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {Math.min(predictiveCommodityPage, predictiveThreatPages)} of {predictiveThreatPages}</span><button type="button" disabled={predictiveCommodityPage >= predictiveThreatPages} onClick={() => setPredictiveCommodityPage((page) => Math.min(predictiveThreatPages, page + 1))}>Next</button></div>
            </div>
          </div>}

          {predictiveTab === "actions" && <div className="predictive-tab-panel predictive-actions-view">
            <div className="predictive-action-card expanded"><p className="eyebrow dark">Immediate redistribution opportunity</p>{predictiveTopTransfer ? <><h3>{predictiveTopTransfer.commodity}</h3><p>Validate movement from <b>{predictiveTopTransfer.sourceFacility}</b> in {predictiveTopTransfer.sourceDistrict} to <b>{predictiveTopTransfer.destinationFacility}</b> in {predictiveTopTransfer.destinationDistrict}.</p><dl><div><dt>Source SOH</dt><dd>{Math.round(predictiveTopTransfer.sourceQty || 0).toLocaleString()}</dd></div><div><dt>Destination MOS</dt><dd>{formatMos(predictiveTopTransfer.destinationMos)}</dd></div><div><dt>Responsible</dt><dd>Provincial pharmacist</dd></div><div><dt>Status</dt><dd>{predictiveTopTransferStatus}</dd></div></dl></> : <div className="empty-state">No same-province redistribution opportunity is available.</div>}<button type="button" onClick={() => setActivePage("actions")}>Open action tracker</button></div>
            <div className="quality-panel predictive-recommendation-panel"><div className="quality-panel-head"><div><h3>Province recommendations</h3><p>Next actions based on current priority score and available redistribution options.</p></div></div><div className="predictive-recommendation-list">{predictiveRecommendations.map((row, index) => <div key={row.province} className={`risk-${row.tone}`}><b>{index + 1}</b><span><strong>{shortProvinceName(row.province)}</strong><small>{formatPercent(row.likelihood)} priority score · {row.label}</small>{row.transfer ? <em>Validate {row.transfer.commodity} from {row.transfer.sourceFacility} to {row.transfer.destinationFacility}. Status: {row.actionStatus}.</em> : <em>Validate physical counts and prepare replenishment; no same-province transfer is identified.</em>}</span></div>)}{!predictiveRecommendations.length && <div className="empty-state">No recommendation is available for the selected scope.</div>}</div></div>
          </div>}
        </section>

        <section className="action-tracker">
          <div className="action-tracker-head">
            <div>
              <p className="eyebrow dark">Control Tower Action Tracker</p>
              <h2>Commodity action tracker</h2>
              <p>Search a medicine to match urgent zero-stock facilities with safe overstocked or well-stocked sources.</p>
            </div>
            <div className="action-summary">
              <span><b>{actionSummary.Open}</b> open</span>
              <span><b>{actionSummary["In progress"]}</b> in progress</span>
              <span><b>{actionSummary.Completed}</b> completed</span>
            </div>
          </div>
          <div className="redistribution-panel">
            <div className="redistribution-head">
              <div>
                <p className="eyebrow dark">Redistribution Recommendations</p>
                <h3>Searchable priority redistribution actions</h3>
                <p>Overstocked sources are considered first, then facilities above two MOS. Sources retain at least one MOS, with same-district and same-province matches prioritised.</p>
              </div>
              <div className="redistribution-summary">
                <span><b>{actionCommodityCandidates.length}</b> suggested transfers</span>
                <span><b>{new Set(actionCommodityCandidates.map((item) => item.province)).size}</b> provinces</span>
              </div>
            </div>
            <div className="action-tracker-tools">
              <label className="action-commodity-search">
                <span>Search medicine</span>
                <input value={actionCommodityQuery} onChange={(event) => { setActionCommodityQuery(event.target.value); setActionPage(1); }} placeholder="Search by commodity name" />
              </label>
              <label className="action-page-size">
                <span>Rows to show</span>
                <select value={actionPageSize} onChange={(event) => { setActionPageSize(Number(event.target.value)); setActionPage(1); }}>
                  <option value="10">10</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>
              <div className="action-user-identity"><span>Commenting as</span><strong>{actionUserEmail || "Signed-in email loading..."}</strong></div>
              <span className={`action-sync ${actionSyncState}`}>{actionSyncState === "shared" ? "Shared comments connected" : actionSyncState === "loading" ? "Connecting comments" : "Comments unavailable"}</span>
            </div>
            {actionCommentError && <p className="action-comment-error">{actionCommentError}</p>}
            <div className="action-table-wrap redistribution-table">
              <table>
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>Commodity</th>
                    <th>Source facility</th>
                    <th>Urgent receiving facility</th>
                    <th>Suggested action</th>
                    <th>Action status</th>
                    <th>Comment status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActionCommodityCandidates.length ? visibleActionCommodityCandidates.map((item, index) => {
                    const actionKey = redistributionActionKey(item);
                    const actionUpdate = actionUpdates[actionKey] || {};
                    const comments = Array.isArray(actionComments[actionKey]) ? actionComments[actionKey] : [];
                    return <tr key={`${actionKey}-${index}`}>
                      <td>{item.sourceProvince === item.destinationProvince ? item.destinationProvince : <><strong>{item.sourceProvince}</strong><small>to {item.destinationProvince}</small></>}</td>
                      <td>{item.commodity}</td>
                      <td className={item.sourceStatus === "Overstocked" ? "redistribution-source-high" : "redistribution-source-secondary"}>
                        <span className={`source-status-pill ${item.sourceStatus === "Overstocked" ? "overstocked" : "well-stocked"}`}>{item.sourceStatus}</span>
                        <strong>{item.sourceFacility}</strong>
                        <small>{item.sourceDistrict} | {item.sourceLevel}</small>
                        <small>Current: Qty {item.sourceQty?.toLocaleString?.() ?? item.sourceQty} | MOS {formatMos(item.sourceMos)}</small>
                        <small>Transfer: {item.proposedTransferQty?.toLocaleString?.() ?? item.proposedTransferQty} | After: Qty {item.sourceQtyAfter?.toLocaleString?.() ?? item.sourceQtyAfter}, MOS {formatMos(item.sourceMosAfter)}</small>
                      </td>
                      <td className="redistribution-destination-urgent">
                        <span className="source-status-pill urgent">Zero quantity + zero MOS</span>
                        <strong>{item.destinationFacility}</strong>
                        <small>{item.destinationDistrict} | {item.destinationLevel}</small>
                        <small>Current: Qty {item.destinationQty?.toLocaleString?.() ?? item.destinationQty} | MOS {formatMos(item.destinationMos)}</small>
                        <small>Receive: {item.proposedTransferQty?.toLocaleString?.() ?? item.proposedTransferQty} | After: Qty {item.destinationQtyAfter?.toLocaleString?.() ?? item.destinationQtyAfter}, MOS {formatMos(item.destinationMosAfter)}</small>
                      </td>
                      <td>
                        <span className="priority-pill critical">Urgent receiver</span>
                        <span className={`geography-pill geography-${item.geographyPriority.toLowerCase().replaceAll(" ", "-")}`}>{item.geographyPriority}</span>
                        <p>Validate physical stock, then transfer <b>{item.proposedTransferQty?.toLocaleString?.() ?? item.proposedTransferQty}</b>. The source retains {formatMos(item.sourceMosAfter)} MOS.</p>
                      </td>
                      <td>
                        <select value={actionUpdate.status || "Open"} onChange={(event) => updateRedistributionAction(item, event.target.value)}>
                          <option>Open</option>
                          <option>In progress</option>
                          <option>Completed</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" className="action-comment-summary" onClick={() => setOpenActionComments({ actionKey, item })}>{comments.length} {comments.length === 1 ? "comment" : "comments"}</button>
                        {actionUpdate.updatedAt && <small>Status updated by {actionUpdate.updatedBy || "user"} {new Date(actionUpdate.updatedAt).toLocaleString()}</small>}
                      </td>
                    </tr>;
                  }) : (
                    <tr>
                      <td colSpan="7">No safe source above two MOS was found for a facility reporting both zero quantity and zero MOS for this medicine search.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="action-pagination">
              <button type="button" disabled={actionCurrentPage <= 1} onClick={() => setActionPage((page) => Math.max(1, page - 1))}>Previous</button>
              <span>Page {actionCurrentPage} of {actionPageCount} | Showing {visibleActionCommodityCandidates.length} of {actionCommodityCandidates.length} transfers</span>
              <button type="button" disabled={actionCurrentPage >= actionPageCount} onClick={() => setActionPage((page) => Math.min(actionPageCount, page + 1))}>Next</button>
            </div>
          </div>
        </section>
        <section className="submission-import-section">
          <div className="section-head">
            <div>
              <p className="eyebrow dark">Administrator workspace</p>
              <h2>Import provincial tracer submissions</h2>
              <p>Upload all provincial Excel reports for one reporting week. The dashboard checks each workbook, creates a consolidated master list for review, and can commit the original reports to the protected GitHub repository.</p>
            </div>
            <span>{dashboardUser?.email || "Administrator sign-in required"}</span>
          </div>
          {isDashboardAdmin ? <>
            <div className="submission-import-form">
              <label><span>Reporting week</span><input value={importPeriod} onChange={(event) => setImportPeriod(event.target.value)} placeholder={fieldData.label} /></label>
              <label className="submission-file-input"><span>Provincial Excel reports</span><input type="file" accept=".xlsx" multiple onChange={(event) => { setImportFiles([...event.target.files]); setImportResult(null); setImportError(""); }} /><small>{importFiles.length ? `${importFiles.length} file(s): ${importFiles.map((file) => file.name).join(", ")}` : "Choose the provincial .xlsx tracer submissions for this reporting week."}</small></label>
              <div className="submission-import-actions"><button type="button" onClick={() => submitProvincialImport("validate")} disabled={Boolean(importBusy)}>{importBusy === "validate" ? "Validating..." : "Validate submissions"}</button><button type="button" className="ghost-button" onClick={() => submitProvincialImport("master")} disabled={Boolean(importBusy)}>Download master Excel</button><button type="button" className="publish-button" onClick={() => submitProvincialImport("publish")} disabled={Boolean(importBusy)}>{importBusy === "publish" ? "Publishing..." : "Commit reports to GitHub"}</button></div>
            </div>
            {importError && <div className="submission-import-message error">{importError}</div>}
            {importResult && <div className="submission-import-result"><div className="submission-import-summary"><strong>{importResult.totalRecords?.toLocaleString() || 0}</strong><span>recognised tracer rows</span><strong>{importResult.recognisedSheets || 0}</strong><span>recognised worksheets</span></div>{importResult.message && <p className="success">{importResult.message}</p>}{!importResult.githubConfigured && <p className="submission-import-warning">GitHub publishing is not configured yet. The administrator can still validate submissions and download the consolidated master workbook. Add `GITHUB_TOKEN` in Render to enable repository commits.</p>}{importResult.warnings?.map((warning) => <p className="submission-import-warning" key={warning}>{warning}</p>)}<div className="table-scroll compact-table"><table><thead><tr><th>Provincial workbook</th><th>Tracer rows</th><th>Recognised sheets</th></tr></thead><tbody>{importResult.files?.map((file) => <tr key={file.name}><td>{file.name}</td><td>{file.records.toLocaleString()}</td><td>{file.sheets.map((sheet) => `${sheet.sheetName} (${sheet.rows})`).join(", ") || "No recognised tracer table"}</td></tr>)}</tbody></table></div></div>}
          </> : <div className="empty-state">Only a signed-in dashboard administrator can upload or publish provincial tracer submissions.</div>}
        </section>
      </main>
      <button type="button" className={`copilot-launcher ${activePage === "predictive" ? "copilot-launcher-compact" : ""}`} onClick={() => setCopilotOpen(true)} aria-label="Open Tracer Copilot">
        <span>AI</span> Ask Tracer Copilot
      </button>
      {copilotOpen && <div className="copilot-backdrop" role="presentation" onMouseDown={() => setCopilotOpen(false)}>
        <aside className="copilot-drawer" role="dialog" aria-modal="true" aria-label="Tracer Copilot" onMouseDown={(event) => event.stopPropagation()}>
          <div className="copilot-head">
            <div><p className="eyebrow dark">Tracer Copilot</p><h2>Ask the selected tracer data</h2><span>{fieldData.label} | {selectedProvince === "all" ? "Zambia" : selectedProvince}</span></div>
            <button type="button" className="ghost-button" onClick={() => setCopilotOpen(false)}>Close</button>
          </div>
          <p className="copilot-guidance">Answers use only the active reporting period and filters. Check the evidence line before taking action.</p>
          <div className="copilot-suggestions">
            {copilotSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => askCopilot(suggestion)} disabled={copilotLoading}>{suggestion}</button>)}
          </div>
          <div className="copilot-messages" aria-live="polite">
            {copilotMessages.length ? copilotMessages.map((message) => <article className={`copilot-message ${message.role}`} key={message.id}>
              <strong>{message.role === "user" ? "You" : "Tracer Copilot"}</strong>
              <p>{message.text}</p>
              {message.evidence && <small>Evidence: {message.evidence}</small>}
              {message.retryQuestion && <button type="button" className="copilot-retry" onClick={() => askCopilot(message.retryQuestion)}>Try again</button>}
              {message.role === "assistant" && Number.isInteger(Number(message.id)) && <div className="copilot-feedback"><span>Was this useful?</span><button type="button" className={copilotFeedback[message.id] === 1 ? "active" : ""} onClick={() => rateCopilotAnswer(message.id, 1)}>Helpful</button><button type="button" className={copilotFeedback[message.id] === -1 ? "active" : ""} onClick={() => rateCopilotAnswer(message.id, -1)}>Needs correction</button></div>}
            </article>) : <div className="copilot-empty">Ask about availability, stockouts, reporting, commodities, provinces, districts, or immediate follow-up actions.</div>}
            {copilotLoading && <div className="copilot-loading">Analysing the selected tracer data...</div>}
          </div>
          <form className="copilot-form" onSubmit={(event) => { event.preventDefault(); askCopilot(); }}>
            <textarea value={copilotQuestion} onChange={(event) => setCopilotQuestion(event.target.value)} placeholder="Ask a question about the selected tracer data" maxLength="1200" />
            <button type="submit" disabled={!copilotQuestion.trim() || copilotLoading}>Send</button>
          </form>
        </aside>
      </div>}
      <FacilityTracerModal
        key={openFacility ? `${openFacility.province}-${openFacility.district}-${openFacility.facilityLevel}-${openFacility.name}` : "closed"}
        facility={openFacility}
        report={fieldData}
        onClose={() => setOpenFacility(null)}
        onOpenActions={() => { setOpenFacility(null); setActivePage("actions"); }}
      />
      {openActionComments && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setOpenActionComments(null)}>
        <section className="commodity-detail-panel action-comments-dialog" role="dialog" aria-modal="true" aria-label="Action comments" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head">
            <div><p className="eyebrow dark">Control Tower Action Tracker</p><h2>Comments</h2><span>{openActionComments.item.commodity} | {openActionComments.item.province}</span></div>
            <button type="button" onClick={() => setOpenActionComments(null)}>Close</button>
          </div>
          <div className="action-comment-form action-comment-dialog-form">
            <label htmlFor="action-comment-dialog"><span>Add a comment</span><textarea id="action-comment-dialog" value={actionCommentDrafts[openActionComments.actionKey] || ""} onChange={(event) => setActionCommentDrafts((current) => ({ ...current, [openActionComments.actionKey]: event.target.value }))} placeholder="Write a comment" maxLength="1600" /></label>
            <button type="button" className="comment-add-button" onClick={() => addActionComment(openActionComments.item)}>Add comment</button>
          </div>
          <div className="action-comment-list action-comment-dialog-list">
            {(actionComments[openActionComments.actionKey] || []).length ? (actionComments[openActionComments.actionKey] || []).map((comment) => <div className="action-comment" key={comment.id}>
              <strong>{comment.author}</strong>
              <small>{new Date(comment.createdAt).toLocaleString()}</small>
              <p>{comment.body}</p>
              <div className="action-comment-actions">
                <button type="button" className="comment-vote" title="Agree" onClick={() => voteOnActionComment(openActionComments.actionKey, comment.id, 1)}>👍 {comment.upvotes || 0}</button>
                <button type="button" className="comment-vote" title="Disagree" onClick={() => voteOnActionComment(openActionComments.actionKey, comment.id, -1)}>👎 {comment.downvotes || 0}</button>
                {actionUserEmail && comment.author?.toLowerCase() === actionUserEmail.toLowerCase() ? <button type="button" className="comment-delete" onClick={() => deleteActionComment(openActionComments.actionKey, comment.id)}>Delete</button> : null}
              </div>
            </div>) : <div className="empty-state">No comments have been added to this action yet.</div>}
          </div>
        </section>
      </div>}
      {stockCategoryDialog && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setStockCategoryDialog(false)}>
        <section className="commodity-detail-panel stock-category-dialog" role="dialog" aria-modal="true" aria-label="ZAMMSA stock category details" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head"><div><p className="eyebrow dark">ZAMMSA Weekly Stock Status</p><h2>{selectedStockCategory}</h2><span>{stockStreamLabels[stockStream] || stockStream} | {stockData?.label}</span></div><button type="button" onClick={() => setStockCategoryDialog(false)}>Close</button></div>
          <div className="stock-category-dialog-actions"><span>{selectedStockItems.length} commodities in this category</span><div><button type="button" onClick={exportStockCategoryExcel}>Export Excel</button><button type="button" onClick={exportStockCategoryPdf}>Export PDF</button></div></div>
          {selectedStockItems.length ? <div className="table-scroll compact-table weekly-stock-table"><table><thead><tr><th>Commodity</th><th>Availability</th><th>Status</th></tr></thead><tbody>{selectedStockItems.map((item) => <tr key={`${item.category}-${item.name}`}><td>{item.name}</td><td>{formatPercent(item.availability)}</td><td><span className={item.availability > 0 ? "status-pill reported" : "status-pill missing"}>{item.status}</span></td></tr>)}</tbody></table></div> : <div className="empty-state">No commodity rows are available for this category in the selected stock report.</div>}
        </section>
      </div>}
      {commodityMissingOpen && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setCommodityMissingOpen(false)}>
        <section className="commodity-detail-panel commodity-missing-dialog" role="dialog" aria-modal="true" aria-label="Facilities missing commodity reports" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head"><div><p className="eyebrow dark">Data-quality context</p><h2>Facilities that did not report this commodity</h2><span>{selectedCommodity} · {fieldData.label}</span></div><button type="button" onClick={() => setCommodityMissingOpen(false)}>Close</button></div>
          <div className={`commodity-reporting-callout ${commodityReportingRate < 0.6 ? "warning" : ""}`}><strong>{formatPercent(commodityReportingRate)} reporting coverage</strong><p>{commodityKpiScopeRows.length} of {commodityExpectedFacilities.length} expected facilities submitted this commodity. Availability is calculated only from those {commodityKpiScopeRows.length} reporting facilities; the {commodityMissingFacilities.length} facilities below are not counted as stockouts.</p></div>
          {commodityMissingFacilities.length ? <div className="table-scroll commodity-missing-table"><table><thead><tr><th>Province</th><th>District</th><th>Facility</th><th>Facility level</th><th>Action</th></tr></thead><tbody>{commodityMissingFacilities.map((facility) => <tr key={`${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`}><td>{facility.province}</td><td>{facility.district}</td><td><strong>{facility.name}</strong></td><td>{facility.facilityLevel}</td><td><span className="comparison-signal amber">Verify submission</span></td></tr>)}</tbody></table></div> : <div className="empty-state">Every expected facility in the selected scope submitted this commodity.</div>}
        </section>
      </div>}
      {openCommodityFacility && <div className="commodity-detail-backdrop commodity-facility-drawer-backdrop" role="presentation" onMouseDown={() => setOpenCommodityFacility(null)}>
        <section className="commodity-detail-panel commodity-facility-drawer" role="dialog" aria-modal="true" aria-label="Facility commodity basket" onMouseDown={(event) => event.stopPropagation()}>
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
          <div className="facility-basket-section">
            <div className="facility-basket-head"><div><p className="eyebrow dark">Full facility picture</p><h3>Complete commodity basket</h3><span>{fieldData.label} · risk items shown first</span></div><div><b>{commodityFacilityBasketSummary.total}</b><span>commodities</span><b className="red">{commodityFacilityBasketSummary.stockouts}</b><span>stockouts</span><b className="amber">{commodityFacilityBasketSummary.belowPlan}</b><span>below plan</span><b>{formatPercent(commodityFacilityBasketSummary.total ? commodityFacilityBasketSummary.available / commodityFacilityBasketSummary.total : 0)}</b><span>available</span></div></div>
            {commodityFacilityBasket.length ? <div className="table-scroll facility-basket-table"><table><thead><tr><th>Commodity</th><th>Programme</th><th>SOH</th><th>AMC</th><th>MOS</th><th>Stock status</th></tr></thead><tbody>{commodityFacilityBasket.map((row) => {
              const status = commodityStockStatus(row.mos);
              const tone = commodityStatusTone(status);
              return <tr className={row.item === selectedCommodity ? "selected" : ""} key={row.item}><td><strong>{row.item}</strong>{row.item === selectedCommodity ? <small>Selected commodity</small> : null}</td><td>{row.programme}</td><td>{Math.round(row.quantity).toLocaleString()}</td><td>{Math.round(row.amc).toLocaleString()}</td><td className={`commodity-mos-cell tone-${tone}`}><strong>{formatMos(row.mos)}</strong></td><td className={`commodity-status-cell tone-${tone}`}><span>{status}</span></td></tr>;
            })}</tbody></table></div> : <div className="empty-state">No commodity basket rows were submitted for this facility in the selected week.</div>}
          </div>
          <div className="commodity-detail-note"><b>Reporting status:</b> Reported for {fieldData.label}. Quantity received, dispensed/consumed, losses, adjustments, and days out of stock are not present in the submitted tracer source and are therefore not estimated.</div>
        </section>
      </div>}
      {qualityDetailDialog && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setQualityDetailDialog("")}>
        <section className="commodity-detail-panel quality-detail-dialog" role="dialog" aria-modal="true" aria-label="Data quality details" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head"><div><p className="eyebrow dark">Data Quality</p><h2>{qualityDetailDialog === "districts" ? "Province and district timeline details" : qualityDetailDialog === "library" ? "Weekly tracer report library" : qualityDetailDialog === "pending-report" ? "National report pending" : "Reporting follow-up register"}</h2><span>{qualityDetailDialog === "library" ? "January to June 2026" : qualityDetailDialog === "pending-report" ? selectedLibraryPeriod?.label : `${monthLabel(qualityRangeLower)} to ${monthLabel(qualityRangeUpper)}`}</span></div><button type="button" onClick={() => setQualityDetailDialog("")}>Close</button></div>
          {qualityDetailDialog === "districts" ? <>
            <div className="quality-drill-path"><button type="button" onClick={() => { resetFieldHierarchy(); setActivePage("quality"); }}>Zambia</button><span>/</span><button type="button" disabled={selectedProvince === "all"} onClick={() => selectQualityProvince(selectedProvince)}>{selectedProvince === "all" ? "Select province" : selectedProvince}</button></div>
            <div className="quality-grid"><QualityTable title="Provincial district-level reporting" rows={provinceQualityRows} firstColumn="Province" onSelect={(row) => selectQualityProvince(row.name)} /><ReportingBars title="Province reporting percentage" rows={[...provinceQualityRows].sort((a, b) => (a.rate || qualityRate(a)) - (b.rate || qualityRate(b)))} onSelect={(row) => selectQualityProvince(row.name)} /></div>
            {selectedProvinceQuality ? <div className="quality-note"><strong>{selectedProvinceQuality.name}</strong><span>{selectedProvinceQuality.reported.toLocaleString()} of {selectedProvinceQuality.expected.toLocaleString()} expected district-level reports submitted, with {selectedProvinceQuality.missing.toLocaleString()} missing.</span></div> : null}
            {selectedProvince === "all" ? <div className="empty-state">Select a province in the top dashboard filter to see its district-level reporting.</div> : <div className="quality-level-sections">{qualityLevelSections.map((section) => <QualityLevelSection section={section} key={section.level} />)}</div>}
          </> : qualityDetailDialog === "library" ? <>
            {selectedLibraryPeriod ? <div className="library-report-summary"><div><span>Selected reporting period</span><strong>{selectedLibraryPeriod.label}</strong><small>{selectedLibraryPeriod.source}</small></div><div><span>Province footprint</span><strong>{selectedLibraryPeriod.provinces} provinces</strong><small>Submitted in this period</small></div><div><span>DHO district compliance</span><strong>{selectedLibraryPeriod.districts}/{selectedLibraryPeriod.expectedDistricts}</strong><small>{selectedLibraryPeriod.partialDistricts} partial · {selectedLibraryPeriod.hospitalOnlyDistricts} hospital-only</small></div><div><span>Facility reporting units</span><strong>{selectedLibraryPeriod.reportedFacilities}/{selectedLibraryPeriod.expectedFacilities}</strong><small>{formatPercent(selectedLibraryPeriod.rate)} reporting rate</small></div></div> : null}
            <div className="table-panel weekly-library-table"><div className="table-scroll"><table><thead><tr><th>Reporting period</th><th>Provinces</th><th>DHO districts</th><th>Facility reporting units</th><th>Reporting rate</th><th /></tr></thead><tbody>{weeklyReportLibraryRows.map((row) => <tr className={row.id === selectedLibraryPeriod?.id ? "selected-library-row" : ""} key={row.id}><td>{row.label}</td><td>{row.provinces}</td><td title={`${row.partialDistricts} partial primary-care; ${row.hospitalOnlyDistricts} hospital-only`}>{row.districts}/{row.expectedDistricts}</td><td>{row.reportedFacilities}/{row.expectedFacilities}</td><td><span className={`comparison-signal ${reportingTone(row.rate)}`}>{formatPercent(row.rate)}</span></td><td><button type="button" className="ghost-button" onClick={() => setSelectedLibraryPeriodId(row.id)}>Inspect</button></td></tr>)}</tbody></table></div></div>
          </> : qualityDetailDialog === "pending-report" ? <div className="national-report-pending"><p className="eyebrow dark">Weekly National Tracer Report</p><h3>{selectedLibraryPeriod?.label}</h3><p>The national report for this reporting week has not yet been loaded. Once available, this window will open the uploaded report directly.</p><button type="button" onClick={() => setQualityDetailDialog("library")}>Back to report library</button></div> : <>
            <div className="reporting-filter-bar"><label><span>Reporting status</span><select value={qualityStatusFilter} onChange={(event) => setQualityStatusFilter(event.target.value)}><option value="non-reporting">Any reporting gap</option><option value="all">All reporting units</option><option value="Fully reported">Fully reported</option><option value="Minor reporting gaps">Minor reporting gaps</option><option value="Irregular reporting">Irregular reporting</option><option value="Persistent non-reporting">Persistent non-reporting</option><option value="No reporting">No reporting</option></select></label><label><span>Search</span><input value={qualitySearch} onChange={(event) => { setQualitySearch(event.target.value); setQualityTablePage(1); }} placeholder="Facility, district, or province" /></label><div className="export-actions"><button type="button" onClick={exportNonReportingCsv}>Export CSV</button><button type="button" onClick={() => window.print()}>Export PDF</button></div></div>
            <div className="table-panel non-reporting-table"><div className="table-scroll"><table><thead><tr><th>Province</th><th>District</th><th>Facility / reporting unit</th><th>Facility level</th><th>Expected</th><th>Submitted</th><th>Missed</th><th>Rate</th><th>Latest report</th><th>Status</th><th /></tr></thead><tbody>{visibleNonReportingFacilityRows.length ? visibleNonReportingFacilityRows.map((row) => <tr key={`${row.province}-${row.district}-${row.facilityLevel}-${row.name}`}><td>{row.province}</td><td>{row.district}</td><td>{row.name}</td><td>{row.facilityLevel}</td><td>{row.expectedReports}</td><td>{row.reportsSubmitted}</td><td>{row.missedReports}</td><td>{formatPercent(row.rate)}</td><td>{row.latestReport}</td><td><span className={`comparison-signal ${row.missedReports ? "red" : "green"}`}>{row.consistency}</span></td><td><button type="button" className="ghost-button" onClick={() => setOpenReportingFacility(row)}>History</button></td></tr>) : <tr><td colSpan="11">No expected reporting units match the selected filters.</td></tr>}</tbody></table></div><div className="non-reporting-pagination"><button type="button" disabled={qualityTableCurrentPage <= 1} onClick={() => setQualityTablePage((page) => page - 1)}>Previous</button><span>Page {qualityTableCurrentPage} of {qualityTablePageCount}</span><button type="button" disabled={qualityTableCurrentPage >= qualityTablePageCount} onClick={() => setQualityTablePage((page) => page + 1)}>Next</button></div></div>
          </>}
        </section>
      </div>}
      {openReportingFacility && <div className="commodity-detail-backdrop" role="presentation" onMouseDown={() => setOpenReportingFacility(null)}>
        <section className="commodity-detail-panel" role="dialog" aria-modal="true" aria-label="Facility reporting history" onMouseDown={(event) => event.stopPropagation()}>
          <div className="commodity-detail-head"><div><p className="eyebrow dark">Data Quality &gt; Non-Reporting Facilities &gt; {openReportingFacility.name}</p><h2>{openReportingFacility.name}</h2><span>{openReportingFacility.district} | {openReportingFacility.province} | {openReportingFacility.facilityLevel}</span></div><button type="button" onClick={() => setOpenReportingFacility(null)}>Close</button></div>
          <div className="commodity-detail-kpis"><div><span>Expected reports</span><strong>{openReportingFacility.expectedReports}</strong></div><div><span>Reports received</span><strong>{openReportingFacility.reportsSubmitted}</strong></div><div><span>Reporting rate</span><strong>{formatPercent(openReportingFacility.rate)}</strong></div><div className={openReportingFacility.missedReports ? "red" : "green"}><span>Consistency</span><strong>{openReportingFacility.consistency}</strong></div></div>
          <div className="commodity-history"><h3>Period-by-period reporting history</h3><p>{monthLabel(qualityRangeLower)} to {monthLabel(qualityRangeUpper)}. Red columns identify the exact dates this reporting unit did not submit.</p><div className="facility-gap-graph">{openReportingFacility.history.map((row) => <div className={row.reported ? "reported" : "missing"} key={row.id} title={`${row.label}: ${row.reported ? "Reported" : "Not reported"}`}><i style={{ height: row.reported ? "100%" : "18%" }} /><span>{row.label.replace(/^Week\s+/i, "W")}</span><b>{row.reported ? "Yes" : "No"}</b></div>)}</div><div className="commodity-history-list">{openReportingFacility.history.map((row) => <div key={row.id}><span>{row.label}</span><b>Expected: Yes</b><b>Reported: {row.reported ? "Yes" : "No"}</b><em>{row.reported ? "Reported" : "Not reported"}</em></div>)}</div></div>
          <div className="commodity-detail-note"><b>Latest successful report:</b> {openReportingFacility.latestReport}. <b>Consecutive periods missed:</b> {openReportingFacility.consecutiveMissed}. Aggregate health-post and health-centre reporting units are shown where named facility submissions are not present in the source.</div>
        </section>
      </div>}
    </div>
  );
}

export default App;
