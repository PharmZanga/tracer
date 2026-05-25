import { useMemo, useState } from "react";
import { categories, managementConcerns, programmePressure, reports, trend } from "./zammsaData.js";
import { tracerFacilityData } from "./tracerFacilityData.js";
import { weeklyAvailability } from "./weeklyAvailability.js";
import { stockHistory } from "./zammsaHistory.js";

const STATUS_META = {
  red: { label: "Stockout", metric: "critical" },
  amber: { label: "Near-critical", metric: "near" },
  blue: { label: "Overstock", metric: "over" },
  green: { label: "Adequate", metric: null },
  neutral: { label: "Data gap", metric: "gaps" },
};

const concernFilters = {
  "Persistent stockouts": { status: "red", query: "", category: "all" },
  "Deteriorating supply": { status: "amber", query: "", category: "all" },
  "Programme risk areas": { status: "all", query: "", category: "Anaesthetics" },
  "Extreme overstock": { status: "blue", query: "", category: "all" },
  "AMI and TBD gaps": { status: "neutral", query: "", category: "all" },
  "Volatile reporting base": { status: "neutral", query: "", category: "all" },
};

const quickRanges = [
  { label: "All reports", start: 0, end: 3 },
  { label: "Latest report", start: 3, end: 3 },
  { label: "Last 30 days", start: 2, end: 3 },
  { label: "April 2026", start: 1, end: 2 },
  { label: "Year to date", start: 0, end: 3 },
];

const suggestedQuestions = [
  "What is national tracer availability?",
  "Which commodities will finish soon?",
  "What are the biggest risks?",
  "Which programmes are under pressure?",
  "What changed from 1 May to 8 May?",
  "How many stockouts are there?",
  "What should management do next?",
];

const tracerBaskets = [
  { label: "Essential medicines", categories: ["Essential Medicines", "Anti-infective", "Gastrointestinal", "Cardiovascular", "Diabetes"] },
  { label: "Malaria", categories: ["Anti-malarials"] },
  { label: "TB", categories: ["Anti-TB"] },
  { label: "HIV / ARV", categories: ["ARV"] },
  { label: "Reproductive health", categories: ["Reproductive Health"] },
  { label: "Anaesthesia and theatre", categories: ["Anaesthetics", "Medical/Surgical", "IV Fluids"] },
  { label: "Laboratory", categories: ["Laboratory"] },
];

const programmeWarehouseMap = [
  { tracer: "ART", zammsa: "ARV", label: "HIV / ART" },
  { tracer: "MALARIA", zammsa: "Anti-malarials", label: "Malaria" },
  { tracer: "TB-DS", zammsa: "Anti-TB", label: "Drug-sensitive TB" },
  { tracer: "TB-MDR", zammsa: "Anti-TB", label: "MDR-TB" },
  { tracer: "ANTIBIOTIC", zammsa: "Anti-infective", label: "Antibiotics" },
  { tracer: "REPRODUCTIVE HEALTH", zammsa: "Reproductive Health", label: "Reproductive health" },
  { tracer: "ANAESTHESIA", zammsa: "Anaesthetics", label: "Anaesthesia" },
  { tracer: "RENAL", zammsa: "Renal", label: "Renal" },
  { tracer: "CARDIOVASCULAR", zammsa: "Cardiovascular", label: "Cardiovascular" },
  { tracer: "CANCER", zammsa: "Anti-cancer", label: "Cancer" },
];

function classify(mos) {
  if (mos === null || mos === undefined) return { label: "Data gap", tone: "neutral", rank: 4 };
  if (mos <= 0.1) return { label: "Stockout", tone: "red", rank: 0 };
  if (mos < 1) return { label: "Near-critical", tone: "amber", rank: 1 };
  if (mos > 24) return { label: "Overstock", tone: "blue", rank: 3 };
  return { label: "Adequate", tone: "green", rank: 2 };
}

function formatMos(value) {
  if (value === null || value === undefined) return "TBD";
  if (value >= 100) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pct(current, previous) {
  if (!previous) return "New";
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${Math.round(change)}%`;
}

function metricValue(point, status) {
  const metric = STATUS_META[status]?.metric;
  return metric ? point[metric] : point.total - point.critical - point.near - point.over - point.gaps;
}

function reportIndexFromDate(value) {
  const exact = reports.findIndex((report) => report.key === value);
  return exact >= 0 ? exact : reports.length - 1;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function topItems(items, count = 5) {
  return items.slice(0, count).map((item) => `${item.code} ${item.item}`).join("; ");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function availabilityPercent(numerator, denominator) {
  if (!denominator) return "0.0%";
  return formatPercent(numerator / denominator);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + Math.ceil(days));
  return date;
}

function formatShortDate(date) {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function forecastFlag(mos) {
  if (mos === null || mos === undefined) return { label: "Data gap", tone: "neutral", horizon: "Needs AMI/MOS" };
  if (mos <= 0.1) return { label: "Stocked out now", tone: "red", horizon: "Now" };
  if (mos <= 1) return { label: "Finishes within 30 days", tone: "red", horizon: "0-30 days" };
  if (mos <= 2) return { label: "Finishes within 60 days", tone: "amber", horizon: "31-60 days" };
  if (mos <= 3) return { label: "Finishes within 90 days", tone: "amber", horizon: "61-90 days" };
  if (mos <= 4) return { label: "According to plan", tone: "green", horizon: "91-120 days" };
  return { label: "Sufficient cover", tone: "blue", horizon: "Above 120 days" };
}

function buildFullCommodityHistory(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = `${row.code || "-"}|${row.item}|${row.category}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        code: row.code || "-",
        item: row.item,
        category: row.category,
        mos: Array(reports.length).fill(null),
        ami: Array(reports.length).fill(null),
        stockOnHand: Array(reports.length).fill(null),
        comments: Array(reports.length).fill(""),
        present: Array(reports.length).fill(false),
      });
    }
    const entry = grouped.get(key);
    const reportIndex = reports.findIndex((report) => report.key === row.reportDate);
    if (reportIndex >= 0) {
      entry.mos[reportIndex] = row.mos;
      entry.ami[reportIndex] = row.ami;
      entry.stockOnHand[reportIndex] = row.stockOnHand;
      entry.comments[reportIndex] = row.comment || "";
      entry.present[reportIndex] = true;
    }
  });
  return [...grouped.values()];
}

function countDataQuality(rows, reportIndex) {
  return rows.reduce((acc, item) => {
    if (item.ami[reportIndex] === null || item.ami[reportIndex] === undefined) acc.amiMissing += 1;
    if ((item.comments[reportIndex] || "").toUpperCase().includes("TBD") || item.mos[reportIndex] === null || item.mos[reportIndex] === undefined) acc.tbdMos += 1;
    return acc;
  }, { amiMissing: 0, tbdMos: 0 });
}

function matchesDataQualityFilters(item, reportIndex, amiFilter, tbdFilter, sohFilter) {
  const amiMissing = item.ami[reportIndex] === null || item.ami[reportIndex] === undefined;
  const tbdMos = (item.comments[reportIndex] || "").toUpperCase().includes("TBD") || item.mos[reportIndex] === null || item.mos[reportIndex] === undefined;
  const soh = item.stockOnHand[reportIndex];
  const sohMissing = soh === null || soh === undefined;
  const amiMatches = amiFilter === "all" || (amiFilter === "missing" ? amiMissing : !amiMissing);
  const tbdMatches = tbdFilter === "all" || (tbdFilter === "tbd" ? tbdMos : !tbdMos);
  const sohMatches = sohFilter === "all" || (sohFilter === "missing" ? sohMissing : sohFilter === "zero" ? !sohMissing && soh <= 0 : !sohMissing && soh > 0);
  return amiMatches && tbdMatches && sohMatches;
}

const fullCommodityHistory = buildFullCommodityHistory(stockHistory);

function Stat({ label, value, tone, sub, active, onClick }) {
  return (
    <button className={`stat stat-${tone} ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </button>
  );
}

function Badge({ status }) {
  return <span className={`badge badge-${status.tone}`}>{status.label}</span>;
}

function TrendLine({ points, keys, height = 170 }) {
  const width = 620;
  const pad = 28;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const values = points.flatMap((point) => keys.map((key) => point[key]));
  const max = Math.max(...values, 1);
  const xFor = (index) => pad + (index / Math.max(points.length - 1, 1)) * usableW;
  const yFor = (value) => pad + usableH - (value / max) * usableH;
  const tones = { critical: "red", near: "amber", over: "blue", gaps: "green", mos: "blue" };

  return (
    <svg className="trend-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historic trend line chart">
      {[0, 0.5, 1].map((tick) => (
        <line key={tick} x1={pad} x2={width - pad} y1={pad + usableH * tick} y2={pad + usableH * tick} />
      ))}
      {keys.map((key) => {
        const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[key])}`).join(" ");
        return <path key={key} className={tones[key]} d={d} />;
      })}
      {points.map((point, index) => (
        <g key={point.key}>
          <text x={xFor(index)} y={height - 6} textAnchor="middle">{point.short}</text>
          {keys.map((key) => <circle key={key} className={tones[key]} cx={xFor(index)} cy={yFor(point[key])} r="4" />)}
        </g>
      ))}
    </svg>
  );
}

function Sparkline({ values, onClick }) {
  const cleaned = values.map((value) => (value === null || value === undefined ? null : Number(value)));
  const valid = cleaned.filter((value) => value !== null);
  const max = Math.max(...valid, 1);
  const min = Math.min(...valid, 0);
  const range = Math.max(max - min, 1);
  const points = cleaned.map((value, index) => {
    const x = 8 + index * 26;
    const y = value === null ? 30 : 52 - ((value - min) / range) * 42;
    return { x, y, value };
  });
  const d = points.filter((point) => point.value !== null).map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return (
    <button className="sparkline-button" type="button" onClick={onClick} aria-label="Open commodity trend">
      <svg viewBox="0 0 72 60">
        <path d={d} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.value === null ? 2 : 3} />)}
      </svg>
    </button>
  );
}

function RiskBars({ data, activeCategory, onCategory }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bars">
      {data.map((item) => (
        <button className={`bar-row ${activeCategory === item.label ? "active" : ""}`} type="button" key={item.label} onClick={() => onCategory(item.label)}>
          <span>{item.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${item.tone}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <b>{item.value}</b>
        </button>
      ))}
    </div>
  );
}

function AvailabilityBars({ categories }) {
  return (
    <div className="availability-bars">
      {categories.slice(0, 14).map((item) => (
        <div className="availability-row" key={item.category}>
          <span>{item.category}</span>
          <div className="availability-track">
            <div className={item.availability < 0.25 ? "red" : item.availability < 0.5 ? "amber" : "green"} style={{ width: `${item.availability * 100}%` }} />
          </div>
          <b>{formatPercent(item.availability)}</b>
        </div>
      ))}
    </div>
  );
}

function TracerBasketCard({ basket, onSelect }) {
  return (
    <button className="tracer-basket" type="button" onClick={onSelect}>
      <span>{basket.label}</span>
      <strong>{availabilityPercent(basket.serviceAvailable, basket.classifiable)}</strong>
      <div className="tracer-meter" aria-hidden="true">
        <div style={{ width: `${basket.classifiable ? (basket.serviceAvailable / basket.classifiable) * 100 : 0}%` }} />
      </div>
      <small>{basket.stockouts} stockouts, {basket.near} near-critical, {basket.gaps} data gaps</small>
    </button>
  );
}

function ForecastFlagPill({ flag }) {
  return <span className={`forecast-pill forecast-${flag.tone}`}>{flag.label}</span>;
}

function TracerRollupTable({ title, rows, subLabel = "rows", onSelect }) {
  return (
    <div className="field-table-panel">
      <h3>{title}</h3>
      <div className="field-rollup-list">
        {rows.map((row) => (
          <button type="button" key={`${row.province || ""}-${row.name}`} onClick={() => onSelect?.(row)}>
            <span>
              <b>{row.name}</b>
              {row.province ? <small>{row.province}</small> : null}
            </span>
            <div className="availability-track compact">
              <div className={row.availability < 0.5 ? "red" : row.availability < 0.75 ? "amber" : "green"} style={{ width: `${row.availability * 100}%` }} />
            </div>
            <strong>{formatPercent(row.availability)}</strong>
            <small>{row.riskRows.toLocaleString()} risk {subLabel}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function CommodityModal({ item, onClose }) {
  if (!item) return null;
  const status = classify(item.mos.at(-1));
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="code">{item.code}</span>
            <h2>{item.item}</h2>
            <p>{item.category}</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <TrendLine points={reports.map((report, index) => ({ ...report, mos: item.mos[index] ?? 0 }))} keys={["mos"]} />
        <div className="modal-grid">
          {reports.map((report, index) => (
            <div key={report.key}>
              <span>{report.label}</span>
              <strong>{item.present[index] ? formatMos(item.mos[index]) : "-"}</strong>
              <small>{classify(item.mos[index]).label}</small>
            </div>
          ))}
        </div>
        <Badge status={status} />
      </div>
    </div>
  );
}

function App() {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(reports.length - 1);
  const [view, setView] = useState("latest");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [amiFilter, setAmiFilter] = useState("all");
  const [tbdFilter, setTbdFilter] = useState("all");
  const [sohFilter, setSohFilter] = useState("all");
  const [activeConcern, setActiveConcern] = useState("");
  const [selectedCommodity, setSelectedCommodity] = useState(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("Ask about stockouts, programme pressure, overstock, data gaps, or recommended actions. I will answer from the loaded ZAMMSA report data.");
  const [weeklyProgramme, setWeeklyProgramme] = useState("EMMS");

  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const selectedReport = reports[end].key;
  const selectedMeta = reports[end];
  const selectedTrend = trend[end];
  const categoryRisks = programmePressure[selectedReport] || [];
  const hasSliceFilter = categoryFilter !== "all" || amiFilter !== "all" || tbdFilter !== "all" || sohFilter !== "all" || query.trim();
  const weeklyProgrammes = [...new Set(weeklyAvailability.reports.map((report) => report.programme))];
  const weeklyReports = weeklyAvailability.reports.filter((report) => report.programme === weeklyProgramme);
  const latestWeekly = weeklyReports.at(-1) || weeklyAvailability.reports.at(-1);
  const weeklyCategoryBars = latestWeekly.categories
    .map(([category, available, total, availability]) => ({ category, available, total, availability }))
    .sort((a, b) => a.availability - b.availability);
  const weeklyChange = weeklyAvailability.changesByProgramme?.[weeklyProgramme]?.at(-1) || weeklyAvailability.changes;
  const [fieldScope, setFieldScope] = useState("national");

  const filteredTrend = useMemo(() => {
    const q = query.toLowerCase();
    if (!hasSliceFilter) return trend.slice(start, end + 1);
    return reports.slice(start, end + 1).map((report, offset) => {
      const reportIndex = start + offset;
      const rows = fullCommodityHistory
        .filter((item) => item.present[reportIndex])
        .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
        .filter((item) => matchesDataQualityFilters(item, reportIndex, amiFilter, tbdFilter, sohFilter))
        .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q));
      const counts = rows.reduce((acc, item) => {
        const status = classify(item.mos[reportIndex]).tone;
        if (status === "red") acc.critical += 1;
        if (status === "amber") acc.near += 1;
        if (status === "blue") acc.over += 1;
        if (status === "neutral") acc.gaps += 1;
        return acc;
      }, { critical: 0, near: 0, over: 0, gaps: 0 });
      return { ...report, total: rows.length, ...counts, ...countDataQuality(rows, reportIndex) };
    });
  }, [amiFilter, categoryFilter, end, hasSliceFilter, query, sohFilter, start, tbdFilter]);

  const kpiTrend = filteredTrend.at(-1) || selectedTrend;
  const previousTrend = filteredTrend.length > 1 ? filteredTrend.at(-2) : trend[end - 1];

  const latestTracerRows = useMemo(() => fullCommodityHistory
    .map((item) => ({ ...item, status: classify(item.mos[end]) }))
    .filter((item) => item.present[end]), [end]);

  const nationalTracer = useMemo(() => {
    const counts = latestTracerRows.reduce((acc, item) => {
      acc.total += 1;
      if (item.status.tone === "neutral") acc.gaps += 1;
      if (item.status.tone === "red") acc.stockouts += 1;
      if (item.status.tone === "amber") acc.near += 1;
      if (item.status.tone === "green") acc.adequate += 1;
      if (item.status.tone === "blue") acc.over += 1;
      if (item.status.tone !== "neutral") acc.classifiable += 1;
      if (!["red", "neutral"].includes(item.status.tone)) acc.serviceAvailable += 1;
      return acc;
    }, { total: 0, classifiable: 0, serviceAvailable: 0, adequate: 0, near: 0, stockouts: 0, over: 0, gaps: 0 });
    return {
      ...counts,
      serviceRate: counts.classifiable ? counts.serviceAvailable / counts.classifiable : 0,
      adequateRate: counts.classifiable ? (counts.adequate + counts.over) / counts.classifiable : 0,
    };
  }, [latestTracerRows]);

  const tracerBasketSummaries = useMemo(() => tracerBaskets.map((basket) => {
    const rows = latestTracerRows.filter((item) => basket.categories.includes(item.category));
    return rows.reduce((acc, item) => {
      acc.total += 1;
      if (item.status.tone === "neutral") acc.gaps += 1;
      if (item.status.tone === "red") acc.stockouts += 1;
      if (item.status.tone === "amber") acc.near += 1;
      if (item.status.tone !== "neutral") acc.classifiable += 1;
      if (!["red", "neutral"].includes(item.status.tone)) acc.serviceAvailable += 1;
      return acc;
    }, { ...basket, total: 0, classifiable: 0, serviceAvailable: 0, stockouts: 0, near: 0, gaps: 0 });
  }).sort((a, b) => (a.classifiable ? a.serviceAvailable / a.classifiable : 0) - (b.classifiable ? b.serviceAvailable / b.classifiable : 0)), [latestTracerRows]);

  const forecastRows = useMemo(() => latestTracerRows
    .map((item) => {
      const mos = item.mos[end];
      const stockOnHand = item.stockOnHand[end];
      const ami = item.ami[end];
      const flag = forecastFlag(mos);
      const daysRemaining = mos === null || mos === undefined ? null : Math.max(0, mos * 30.4);
      return {
        ...item,
        ami,
        stockOnHand,
        flag,
        daysRemaining,
        stockoutDate: daysRemaining === null ? null : addDays(selectedReport, daysRemaining),
      };
    })
    .filter((item) => item.flag.tone === "red" || item.flag.horizon === "31-60 days" || item.flag.horizon === "61-90 days")
    .sort((a, b) => (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999) || a.item.localeCompare(b.item))
    .slice(0, 24), [end, latestTracerRows, selectedReport]);

  const forecastSummary = useMemo(() => {
    return latestTracerRows.reduce((acc, item) => {
      const flag = forecastFlag(item.mos[end]);
      if (flag.label === "Stocked out now") acc.now += 1;
      if (flag.horizon === "0-30 days") acc.days30 += 1;
      if (flag.horizon === "31-60 days") acc.days60 += 1;
      if (flag.horizon === "61-90 days") acc.days90 += 1;
      return acc;
    }, { now: 0, days30: 0, days60: 0, days90: 0 });
  }, [end, latestTracerRows]);

  const fieldKpis = tracerFacilityData.national;
  const weakestFieldProvinces = tracerFacilityData.provinces.slice(0, 8);
  const weakestFieldDistricts = tracerFacilityData.districts.slice(0, 8);
  const weakestFieldProgrammes = tracerFacilityData.programmes.slice(0, 8);
  const weakestFieldCommodities = tracerFacilityData.commodities.slice(0, 10);
  const facilityAlerts = tracerFacilityData.facilities.slice(0, 18);
  const stockoutFacilityCount = tracerFacilityData.facilities.filter((facility) => facility.stockoutItemCount > 0).length;
  const lowStockFacilityCount = tracerFacilityData.facilities.filter((facility) => facility.lowStockItemCount > 0).length;
  const criticalFacility = facilityAlerts[0];
  const fieldToWarehouseComparison = useMemo(() => {
    const latestWarehouseRows = fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end]);
    return programmeWarehouseMap.map((item) => {
      const field = tracerFacilityData.programmes.find((programmeItem) => programmeItem.name === item.tracer);
      const warehouseRows = latestWarehouseRows.filter((row) => row.category === item.zammsa);
      const warehouseRisk = warehouseRows.filter((row) => ["red", "amber"].includes(row.status.tone)).length;
      const warehouseStockouts = warehouseRows.filter((row) => row.status.tone === "red").length;
      const warehouseAvailable = warehouseRows.filter((row) => !["red", "neutral"].includes(row.status.tone)).length;
      const fieldStockoutRows = field?.stockout ?? 0;
      const fieldLowStockRows = (field?.nearCritical ?? 0) + (field?.understocked ?? 0);
      const fieldAvailability = field?.availability ?? null;
      const centralAvailable = warehouseRows.length > 0 && warehouseAvailable / warehouseRows.length >= 0.75;
      const centralAtRisk = warehouseStockouts > 0 || (warehouseRows.length > 0 && warehouseRisk / warehouseRows.length >= 0.25);
      const fieldHasStockout = fieldStockoutRows > 0;
      const fieldAtRisk = fieldAvailability !== null && fieldAvailability < 0.75;
      let signal = "No major mismatch";
      let signalTone = "green";
      if (centralAvailable && fieldHasStockout) {
        signal = "Distribution gap: central stock available, facilities stocked out";
        signalTone = "red";
      } else if (centralAtRisk && fieldAtRisk) {
        signal = "Systemwide shortage: field and central both at risk";
        signalTone = "red";
      } else if (centralAtRisk && fieldAvailability !== null && fieldAvailability >= 0.75) {
        signal = "Redistribution opportunity: field has some buffer, central at risk";
        signalTone = "amber";
      } else if (fieldAtRisk) {
        signal = "Facility replenishment risk";
        signalTone = "amber";
      } else if (centralAtRisk) {
        signal = "Central risk, monitor facilities";
        signalTone = "amber";
      }
      return {
        ...item,
        field,
        warehouseRows: warehouseRows.length,
        warehouseRisk,
        warehouseStockouts,
        warehouseAvailable,
        fieldStockoutRows,
        fieldLowStockRows,
        signal,
        signalTone,
      };
    }).filter((item) => item.field || item.warehouseRows);
  }, [end]);
  const mismatchSummary = useMemo(() => fieldToWarehouseComparison.reduce((acc, row) => {
    if (row.signal.startsWith("Distribution gap")) acc.distributionGaps += 1;
    if (row.signal.startsWith("Systemwide shortage")) acc.systemwideShortages += 1;
    if (row.signal.startsWith("Redistribution opportunity")) acc.redistributionOpportunities += 1;
    if (row.signalTone === "amber") acc.monitor += 1;
    return acc;
  }, { distributionGaps: 0, systemwideShortages: 0, redistributionOpportunities: 0, monitor: 0 }), [fieldToWarehouseComparison]);

  const filteredConcerns = useMemo(() => {
    if (statusFilter === "all" && categoryFilter === "all" && amiFilter === "all" && tbdFilter === "all" && sohFilter === "all" && !query) return managementConcerns;
    return managementConcerns.filter((concern) => {
      const filter = concernFilters[concern.title] || {};
      const statusMatches = statusFilter === "all" || filter.status === statusFilter || concern.tone === statusFilter;
      const categoryMatches = categoryFilter === "all" || concern.programme.includes(categoryFilter) || filter.category === categoryFilter;
      const queryMatches = !query || `${concern.title} ${concern.programme} ${concern.evidence}`.toLowerCase().includes(query.toLowerCase());
      const dataQualityMatches = (amiFilter === "all" && tbdFilter === "all" && sohFilter === "all") || concern.title === "AMI and TBD gaps" || concern.tone === "neutral";
      return statusMatches && categoryMatches && queryMatches && dataQualityMatches;
    });
  }, [statusFilter, categoryFilter, amiFilter, tbdFilter, sohFilter, query]);

  const drilldown = useMemo(() => {
    const q = query.toLowerCase();
    return fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end])
      .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q))
      .filter((item) => statusFilter === "all" || item.status.tone === statusFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => matchesDataQualityFilters(item, end, amiFilter, tbdFilter, sohFilter))
      .sort((a, b) => a.status.rank - b.status.rank || (a.mos[end] ?? 99999) - (b.mos[end] ?? 99999))
      .slice(0, 160);
  }, [amiFilter, end, query, statusFilter, categoryFilter, sohFilter, tbdFilter]);

  const exportRows = useMemo(() => drilldown.map((item) => ({
    code: item.code,
    commodity: item.item,
    category: item.category,
    mos: reports.map((report, index) => item.present[index] ? formatMos(item.mos[index]) : "-"),
    status: item.status.label,
  })), [drilldown]);

  function setStatus(status) {
    setStatusFilter((current) => (current === status ? "all" : status));
    setActiveConcern("");
  }

  function applyConcern(concern) {
    const filter = concernFilters[concern.title] || { status: "all", category: "all", query: "" };
    setStatusFilter(filter.status || "all");
    setCategoryFilter(filter.category || "all");
    setQuery(filter.query || "");
    setActiveConcern(concern.title);
  }

  function resetFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
    setAmiFilter("all");
    setTbdFilter("all");
    setSohFilter("all");
    setQuery("");
    setActiveConcern("");
  }

  function filterMissingAmi() {
    setAmiFilter((current) => (current === "missing" ? "all" : "missing"));
    setActiveConcern("");
  }

  function filterTbdMos() {
    setTbdFilter((current) => (current === "tbd" ? "all" : "tbd"));
    setActiveConcern("");
  }

  function applyQuickRange(range) {
    setRangeStart(range.start);
    setRangeEnd(range.end);
  }

  function exportCsv() {
    const headers = ["Code", "Commodity", "Category", ...reports.map((report) => `${report.short} MOS`), "Latest status"];
    const lines = [
      headers.map(csvCell).join(","),
      ...exportRows.map((row) => [row.code, row.commodity, row.category, ...row.mos, row.status].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zammsa-dashboard-${selectedReport}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  function answerQuestion(question) {
    const text = question.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const latestRows = fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end]);
    const stockouts = latestRows.filter((item) => item.status.tone === "red");
    const nearCritical = latestRows.filter((item) => item.status.tone === "amber");
    const overstock = latestRows.filter((item) => item.status.tone === "blue");
    const dataGaps = latestRows.filter((item) => item.status.tone === "neutral");
    const dataQuality = countDataQuality(latestRows, end);
    const programme = categories.find((category) => lower.includes(category.toLowerCase()));
    const emmsFirst = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-01");
    const emmsSecond = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-08");
    const emmsThird = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-15");
    const labPrevious = weeklyAvailability.reports.find((report) => report.programme === "LAB" && report.date === "2026-05-08");
    const labLatest = weeklyAvailability.reports.filter((report) => report.programme === "LAB").at(-1);

    if (lower.includes("15 may") || lower.includes("latest week")) {
      const latestEmms = weeklyAvailability.changesByProgramme.EMMS.at(-1);
      const newlyUnavailable = latestEmms.newlyUnavailable.map((item) => `${item.item} (${item.category})`).join("; ");
      setAssistantAnswer(`From 8 May to 15 May, EMMS availability moved from ${formatPercent(emmsSecond.availability)} to ${formatPercent(emmsThird.availability)}. There were ${latestEmms.newlyUnavailable.length} newly unavailable EMMS items and no recovered EMMS items. Newly unavailable: ${newlyUnavailable}. LAB moved from ${formatPercent(labPrevious.availability)} to ${formatPercent(labLatest.availability)}.`);
      return;
    }

    if (lower.includes("national") || lower.includes("tracer") || lower.includes("availability")) {
      const weakest = weakestFieldProvinces.slice(0, 3).map((row) => `${row.name} ${formatPercent(row.availability)}`).join(", ");
      setAssistantAnswer(`The weekly provincial tracer submission for ${tracerFacilityData.reportDate} contains ${tracerFacilityData.counts.rows.toLocaleString()} facility commodity rows from ${tracerFacilityData.counts.provinces} provinces, ${tracerFacilityData.counts.districts} districts, and ${tracerFacilityData.counts.facilityUnits} facility reporting units. Field availability is ${formatPercent(fieldKpis.availability)} with average MOS ${fieldKpis.mos}. Weakest provinces are ${weakest}.`);
      return;
    }

    if (lower.includes("district") || lower.includes("facility") || lower.includes("province")) {
      const districts = weakestFieldDistricts.slice(0, 4).map((row) => `${row.name}, ${row.province} ${formatPercent(row.availability)}`).join("; ");
      const facilityText = criticalFacility ? ` Highest facility alert: ${criticalFacility.name}, ${criticalFacility.district}, ${criticalFacility.province} with ${criticalFacility.stockoutItemCount} stockout commodities and ${criticalFacility.lowStockItemCount} low-stock commodities.` : "";
      setAssistantAnswer(`End-to-end field view starts from facility commodity rows, rolls them to districts, provinces, and national. Weakest current districts are: ${districts}.${facilityText} Use the facility alerts panel to see exact stockout and low-stock commodities.`);
      return;
    }

    if (lower.includes("distribution") || lower.includes("mismatch") || lower.includes("central") || lower.includes("warehouse")) {
      const gaps = fieldToWarehouseComparison
        .filter((row) => row.signal.startsWith("Distribution gap") || row.signal.startsWith("Systemwide shortage"))
        .slice(0, 4)
        .map((row) => `${row.label}: ${row.signal}`)
        .join("; ");
      setAssistantAnswer(`Central-to-facility comparison found ${mismatchSummary.distributionGaps} distribution gaps, ${mismatchSummary.systemwideShortages} systemwide shortage signals, and ${mismatchSummary.redistributionOpportunities} redistribution opportunities. Priority signals: ${gaps || "no red mismatch signals in the mapped programmes"}.`);
      return;
    }

    if (lower.includes("forecast") || lower.includes("soon") || lower.includes("finish") || lower.includes("run out")) {
      const urgent = forecastRows.slice(0, 5).map((item) => `${item.code} ${item.item} (${item.flag.horizon})`).join("; ");
      setAssistantAnswer(`Forecast for ${selectedMeta.label}: ${forecastSummary.now} commodities are stocked out now, ${forecastSummary.days30} are projected to finish within 30 days, ${forecastSummary.days60} within 60 days, and ${forecastSummary.days90} within 90 days. Top urgent items: ${urgent}.`);
      return;
    }

    if (lower.includes("what changed") || lower.includes("1 may") || lower.includes("8 may") || lower.includes("weekly")) {
      const recovered = weeklyAvailability.changes.recovered.map((item) => `${item.item} (${item.category})`).join("; ");
      setAssistantAnswer(`From 1 May to 8 May, EMMS availability moved from ${formatPercent(emmsFirst.availability)} to ${formatPercent(emmsSecond.availability)}. No items became newly unavailable in the matched EMMS list, and 2 recovered: ${recovered}.`);
      return;
    }

    if (lower.includes("lab")) {
      const lowLab = labLatest.categories.slice(0, 5).map(([category, , , availability]) => `${category} ${formatPercent(availability)}`).join(", ");
      setAssistantAnswer(`The 8 May LAB report shows overall availability of ${formatPercent(labLatest.availability)}. Lowest LAB categories are ${lowLab}.`);
      return;
    }

    if (programme) {
      const programmeRows = latestRows.filter((item) => item.category === programme);
      const pressure = programmeRows.filter((item) => ["red", "amber"].includes(item.status.tone));
      setAssistantAnswer(`${programme} has ${pressure.length} commodities in stockout or near-critical status in ${selectedMeta.label}. Priority examples: ${topItems(pressure) || "none in the public drilldown"}.`);
      return;
    }

    if (lower.includes("stockout") || lower.includes("out of stock") || lower.includes("critical")) {
      setAssistantAnswer(`There are ${stockouts.length} stockout commodities in ${selectedMeta.label}. The first priorities in the public drilldown are: ${topItems(stockouts)}.`);
      return;
    }

    if (lower.includes("near") || lower.includes("low stock")) {
      setAssistantAnswer(`There are ${nearCritical.length} near-critical commodities below 1 MOS. These should be reviewed before they become stockouts: ${topItems(nearCritical)}.`);
      return;
    }

    if (lower.includes("overstock") || lower.includes("expiry") || lower.includes("excess")) {
      setAssistantAnswer(`There are ${overstock.length} overstocked commodities above 24 MOS. Review expiry risk, redistribution options, and forecast assumptions. Examples: ${topItems(overstock)}.`);
      return;
    }

    if (lower.includes("data") || lower.includes("ami") || lower.includes("tbd")) {
      setAssistantAnswer(`${selectedMeta.label} has ${dataQuality.amiMissing} rows with missing AMI and ${dataQuality.tbdMos} rows with TBD MOS. These can overlap, so use them as two data-quality work queues rather than adding them together. ${dataGaps.length} rows cannot be classified by MOS until corrected.`);
      return;
    }

    if (lower.includes("programme") || lower.includes("pressure")) {
      const topProgrammes = categoryRisks.slice(0, 5).map((item) => `${item.label} (${item.value})`).join(", ");
      setAssistantAnswer(`The highest programme pressure areas in ${selectedMeta.label} are ${topProgrammes}. Click a programme bar to filter the full dashboard to that area.`);
      return;
    }

    if (lower.includes("action") || lower.includes("recommend") || lower.includes("management")) {
      setAssistantAnswer(`Recommended management focus: resolve persistent stockouts, review near-critical items for urgent procurement or redistribution, check extreme overstock for expiry/storage risk, and clean AMI/TBD data gaps so MOS can be trusted.`);
      return;
    }

    setAssistantAnswer(`For ${selectedMeta.label}: ${kpiTrend.critical} stockouts, ${kpiTrend.near} near-critical items, ${kpiTrend.over} overstocked items, ${kpiTrend.amiMissing ?? kpiTrend.gaps} missing AMI rows, and ${kpiTrend.tbdMos ?? kpiTrend.gaps} TBD MOS rows. Try asking about a programme, stockouts, overstock, or recommended actions.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">National Tracer Drug Availability</p>
          <h1>Facility-to-warehouse tracer visibility</h1>
          <p className="lede">Start with weekly provincial tracer submissions from health posts, health centres, and hospitals, then roll up district, province, and national risk before comparing against ZAMMSA inventory.</p>
        </div>
        <div className="report-card">
          <span>Weekly tracer submission</span>
          <strong>{tracerFacilityData.reportDate}</strong>
          <small>{tracerFacilityData.counts.rows.toLocaleString()} facility commodity rows across {tracerFacilityData.counts.provinces} provinces.</small>
          <small>Field availability: {formatPercent(fieldKpis.availability)} | Average MOS: {fieldKpis.mos}</small>
          <small>ZAMMSA comparison extract: {selectedMeta.label}</small>
          <button className="hero-export" type="button" onClick={exportCsv}>Export current CSV</button>
        </div>
      </section>

      <section className="field-visibility">
        <div className="field-head">
          <div>
            <p className="eyebrow dark">End-To-End Field Visibility</p>
            <h2>Weekly tracer rollup from facilities to national supply risk</h2>
            <p>This is based on the provincial tracer summary workbook: facility rows roll into districts, provinces, programmes, and national commodity pressure.</p>
          </div>
          <div className="field-scope-tabs">
            {["national", "province", "district", "programme"].map((scope) => (
              <button className={fieldScope === scope ? "active" : ""} type="button" key={scope} onClick={() => setFieldScope(scope)}>{scope}</button>
            ))}
          </div>
        </div>
        <div className="field-kpis">
          <div>
            <span>Field availability</span>
            <strong>{formatPercent(fieldKpis.availability)}</strong>
            <small>{fieldKpis.rows.toLocaleString()} submitted commodity rows</small>
          </div>
          <div>
            <span>Average field MOS</span>
            <strong>{fieldKpis.mos}</strong>
            <small>{fieldKpis.quantity.toLocaleString()} SOH across submissions</small>
          </div>
          <div>
            <span>Facility risk rows</span>
            <strong>{fieldKpis.riskRows.toLocaleString()}</strong>
            <small>Stockout, near-critical, or understocked</small>
          </div>
          <div>
            <span>Reporting footprint</span>
            <strong>{tracerFacilityData.counts.districts}</strong>
            <small>{tracerFacilityData.counts.facilityUnits} facility reporting units</small>
          </div>
        </div>
        <div className="facility-alerts">
          <div className="facility-alert-summary">
            <div>
              <p className="eyebrow dark">Weekly Facility Alerts</p>
              <h3>Facilities with stockouts and low stock</h3>
              <p>Stockout flags are submitted commodities at or near zero MOS. Low stock flags are commodities below 2 MOS but not yet stocked out.</p>
            </div>
            <div className="facility-alert-kpis">
              <span><b>{stockoutFacilityCount}</b> facilities with stockouts</span>
              <span><b>{lowStockFacilityCount}</b> facilities with low stock</span>
            </div>
          </div>
          <div className="facility-alert-list">
            {facilityAlerts.map((facility) => (
              <article key={`${facility.province}-${facility.district}-${facility.facilityLevel}-${facility.name}`}>
                <div className="facility-alert-head">
                  <div>
                    <h4>{facility.name}</h4>
                    <span>{facility.district} | {facility.province} | {facility.facilityLevel}</span>
                  </div>
                  <div className="facility-alert-counts">
                    <b>{facility.stockoutItemCount}</b>
                    <small>stockout</small>
                    <b>{facility.lowStockItemCount}</b>
                    <small>low stock</small>
                  </div>
                </div>
                <div className="facility-alert-items">
                  <div>
                    <strong>Stockout commodities</strong>
                    {facility.stockoutItems.length ? facility.stockoutItems.slice(0, 4).map((item) => (
                      <span key={`${facility.name}-stockout-${item.program}-${item.item}`}>{item.item} <small>{item.program}</small></span>
                    )) : <span>No stockouts submitted</span>}
                  </div>
                  <div>
                    <strong>Low-stock commodities</strong>
                    {facility.lowStockItems.length ? facility.lowStockItems.slice(0, 4).map((item) => (
                      <span key={`${facility.name}-low-${item.program}-${item.item}`}>{item.item} <small>{item.program} | MOS {item.mos}</small></span>
                    )) : <span>No low-stock items submitted</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="field-grid">
          <TracerRollupTable title="Lowest province availability" rows={weakestFieldProvinces} onSelect={(row) => setQuery(row.name)} />
          <TracerRollupTable title="Districts needing attention" rows={weakestFieldDistricts} subLabel="rows" onSelect={(row) => setQuery(row.name)} />
          <TracerRollupTable title="Programme pressure from facilities" rows={weakestFieldProgrammes} onSelect={(row) => setQuery(row.name)} />
        </div>
        <div className="field-commodity-panel">
          <h3>Facility commodities driving risk</h3>
          <div className="field-commodity-list">
            {weakestFieldCommodities.map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <b>{formatPercent(item.availability)}</b>
                <small>{item.stockout.toLocaleString()} stockout rows | MOS {item.mos}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="warehouse-comparison">
        <div>
          <p className="eyebrow dark">ZAMMSA Comparison Layer</p>
          <h2>Compare field tracer demand signals with national inventory position</h2>
          <p>Field availability and MOS come from district/facility submissions. ZAMMSA risk uses the latest national stock extract and highlights whether warehouse stock risk aligns with field shortages.</p>
          <div className="mismatch-cards">
            <span><b>{mismatchSummary.distributionGaps}</b> distribution gaps</span>
            <span><b>{mismatchSummary.systemwideShortages}</b> systemwide shortages</span>
            <span><b>{mismatchSummary.redistributionOpportunities}</b> redistribution opportunities</span>
          </div>
        </div>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Programme</th>
                <th>Field availability</th>
                <th>Field MOS</th>
                <th>Field stockout rows</th>
                <th>Field low-stock rows</th>
                <th>ZAMMSA category</th>
                <th>ZAMMSA available lines</th>
                <th>ZAMMSA risk lines</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {fieldToWarehouseComparison.map((row) => (
                <tr key={`${row.tracer}-${row.zammsa}`}>
                  <td>{row.label}</td>
                  <td>{row.field ? formatPercent(row.field.availability) : "-"}</td>
                  <td>{row.field?.mos ?? "-"}</td>
                  <td>{row.fieldStockoutRows.toLocaleString()}</td>
                  <td>{row.fieldLowStockRows.toLocaleString()}</td>
                  <td>{row.zammsa}</td>
                  <td>{row.warehouseAvailable}/{row.warehouseRows}</td>
                  <td>{row.warehouseRisk} risk, {row.warehouseStockouts} stockout</td>
                  <td><span className={`comparison-signal ${row.signalTone}`}>{row.signal}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tracer-overview" aria-label="National tracer availability overview">
        <div className="tracer-lead">
          <p className="eyebrow dark">Warehouse Inventory Signal</p>
          <h2>{formatPercent(nationalTracer.serviceRate)} ZAMMSA service availability</h2>
          <p>This secondary layer uses the ZAMMSA stock extract to show national inventory cover, stockout burden, near-critical items, and data gaps.</p>
        </div>
        <div className="tracer-metrics">
          <div>
            <span>Adequate cover</span>
            <strong>{formatPercent(nationalTracer.adequateRate)}</strong>
            <small>{nationalTracer.adequate + nationalTracer.over}/{nationalTracer.classifiable} classifiable items</small>
          </div>
          <div>
            <span>Stockout burden</span>
            <strong>{nationalTracer.stockouts}</strong>
            <small>{availabilityPercent(nationalTracer.stockouts, nationalTracer.classifiable)} of classifiable items</small>
          </div>
          <div>
            <span>Near-critical watchlist</span>
            <strong>{nationalTracer.near}</strong>
            <small>Below 1 MOS but above stockout threshold</small>
          </div>
          <div>
            <span>Data completion queue</span>
            <strong>{nationalTracer.gaps}</strong>
            <small>Missing AMI or TBD MOS rows</small>
          </div>
        </div>
        <div className="tracer-baskets">
          {tracerBasketSummaries.map((basket) => (
            <TracerBasketCard
              basket={basket}
              key={basket.label}
              onSelect={() => {
                setCategoryFilter(basket.categories.length === 1 ? basket.categories[0] : "all");
                setQuery("");
                setStatusFilter("all");
              }}
            />
          ))}
        </div>
      </section>

      <section className="forecast-section">
        <div className="forecast-head">
          <div>
            <p className="eyebrow dark">Forecast Flags</p>
            <h2>Soon-to-finish commodities and projected stockout dates</h2>
            <p>Forecast uses latest months of stock: MOS x 30.4 days. Items below 3 MOS are flagged for action before they become service interruptions.</p>
          </div>
          <div className="forecast-cards">
            <button type="button" onClick={() => setStatusFilter("red")}>
              <span>Stocked out now</span>
              <strong>{forecastSummary.now}</strong>
            </button>
            <button type="button" onClick={() => setStatusFilter("amber")}>
              <span>Finish in 30 days</span>
              <strong>{forecastSummary.days30}</strong>
            </button>
            <button type="button" onClick={() => resetFilters()}>
              <span>Finish in 60 days</span>
              <strong>{forecastSummary.days60}</strong>
            </button>
            <button type="button" onClick={() => resetFilters()}>
              <span>Finish in 90 days</span>
              <strong>{forecastSummary.days90}</strong>
            </button>
          </div>
        </div>
        <div className="forecast-table-wrap">
          <table className="forecast-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Commodity</th>
                <th>Programme</th>
                <th>MOS</th>
                <th>Days left</th>
                <th>Projected stockout</th>
                <th>SOH</th>
                <th>AMI / month</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.slice(0, 14).map((item) => (
                <tr key={`${item.code}-${item.item}`}>
                  <td><ForecastFlagPill flag={item.flag} /></td>
                  <td><b>{item.code}</b> {item.item}</td>
                  <td>{item.category}</td>
                  <td>{formatMos(item.mos[end])}</td>
                  <td>{item.daysRemaining === null ? "-" : Math.ceil(item.daysRemaining)}</td>
                  <td>{item.stockoutDate ? formatShortDate(item.stockoutDate) : "-"}</td>
                  <td>{item.stockOnHand === null || item.stockOnHand === undefined ? "-" : Math.round(item.stockOnHand).toLocaleString()}</td>
                  <td>{item.ami === null || item.ami === undefined ? "Missing" : Math.round(item.ami).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="control-strip">
        <div className="mode-tabs">
          <button className={view === "latest" ? "active" : ""} type="button" onClick={() => setView("latest")}>Command view</button>
          <button className={view === "historic" ? "active" : ""} type="button" onClick={() => setView("historic")}>Trend view</button>
        </div>
        <div className="range-control">
          <label>From <span>{reports[start].short}</span><input type="date" min={reports[0].key} max={reports.at(-1).key} value={reports[rangeStart].key} onChange={(event) => setRangeStart(reportIndexFromDate(event.target.value))} /></label>
          <label>To <span>{reports[end].short}</span><input type="date" min={reports[0].key} max={reports.at(-1).key} value={reports[rangeEnd].key} onChange={(event) => setRangeEnd(reportIndexFromDate(event.target.value))} /></label>
          <label>Fine tune <span>{reports[start].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeStart} onChange={(event) => setRangeStart(Number(event.target.value))} /></label>
          <label>Fine tune <span>{reports[end].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeEnd} onChange={(event) => setRangeEnd(Number(event.target.value))} /></label>
        </div>
        <div className="quick-ranges" aria-label="Quick date ranges">
          {quickRanges.map((range) => (
            <button className={start === range.start && end === range.end ? "active" : ""} type="button" key={range.label} onClick={() => applyQuickRange(range)}>{range.label}</button>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <Stat label="Critical stockouts" value={kpiTrend.critical} tone="red" sub={`${pct(kpiTrend.critical, previousTrend?.critical)} vs prior report${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "red"} onClick={() => setStatus("red")} />
        <Stat label="Near-critical" value={kpiTrend.near} tone="amber" sub={`More than 0.1 and below 1 MOS${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "amber"} onClick={() => setStatus("amber")} />
        <Stat label="Overstocked" value={kpiTrend.over} tone="blue" sub={`Above 24 months of stock${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "blue"} onClick={() => setStatus("blue")} />
        <Stat label="Missing AMI" value={kpiTrend.amiMissing ?? kpiTrend.gaps} tone="green" sub={`Rows needing AMI completion${hasSliceFilter ? " in filtered slice" : ""}`} active={amiFilter === "missing"} onClick={filterMissingAmi} />
        <Stat label="TBD MOS" value={kpiTrend.tbdMos ?? kpiTrend.gaps} tone="purple" sub={`Rows where MOS cannot yet be trusted${hasSliceFilter ? " in filtered slice" : ""}`} active={tbdFilter === "tbd"} onClick={filterTbdMos} />
      </section>

      <section className="trend-panel">
        <div>
          <h2>Tracer risk trend over selected window</h2>
          <p>Lines update when the date window changes; KPI clicks cross-filter the rest of the dashboard.</p>
        </div>
        <TrendLine points={filteredTrend} keys={["critical", "near", "over", "gaps"]} />
        <div className="legend">
          <span className="red">Critical</span><span className="amber">Near-critical</span><span className="blue">Overstock</span><span className="green">Data gaps</span>
        </div>
      </section>

      <section className="weekly-section">
        <div className="weekly-head">
          <div>
            <p className="eyebrow dark">Weekly Tracer Availability</p>
            <h2>Submitted weekly EMMS and LAB reports</h2>
            <p>Availability is based on the submitted Excel files for 1 May, 8 May, and 15 May. Item change lists compare the latest matched weekly submissions.</p>
          </div>
          <select value={weeklyProgramme} onChange={(event) => setWeeklyProgramme(event.target.value)}>
            {weeklyProgrammes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}
          </select>
        </div>
        <div className="weekly-grid">
          <div className="panel">
            <h2>{weeklyProgramme} availability trend</h2>
            <div className="weekly-trend">
              {weeklyReports.map((report) => (
                <div className="weekly-point" key={`${report.programme}-${report.date}`}>
                  <div style={{ height: `${40 + report.availability * 100}px` }} />
                  <strong>{formatPercent(report.availability)}</strong>
                  <span>{report.label}</span>
                  <small>{report.total ? `${report.available}/${report.total} available` : "Category average"}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="panel span-2">
            <h2>Lowest category availability - {latestWeekly.label}</h2>
            <AvailabilityBars categories={weeklyCategoryBars} />
          </div>
        </div>
        <div className="change-grid">
          <div className="change-card">
            <span>Newly unavailable ({weeklyChange.from} to {weeklyChange.to})</span>
            <strong>{weeklyChange.newlyUnavailable.length}</strong>
            {weeklyChange.newlyUnavailable.length ? (
              <ul>{weeklyChange.newlyUnavailable.map((item) => <li key={item.item}>{item.item} <small>{item.category}</small></li>)}</ul>
            ) : <p>No matched items moved from available to unavailable between {weeklyChange.from} and {weeklyChange.to}.</p>}
          </div>
          <div className="change-card recovered">
            <span>Recovered ({weeklyChange.from} to {weeklyChange.to})</span>
            <strong>{weeklyChange.recovered.length}</strong>
            {weeklyChange.recovered.length ? (
              <ul>{weeklyChange.recovered.map((item) => <li key={item.item}>{item.item} <small>{item.category}</small></li>)}</ul>
            ) : <p>No matched items recovered between {weeklyChange.from} and {weeklyChange.to}.</p>}
          </div>
        </div>
      </section>

      {view === "historic" && (
        <section className="timeline-grid">
          {["red", "amber", "blue", "neutral"].map((status) => (
            <div className="panel" key={status}>
              <h2>{STATUS_META[status].label} over time</h2>
              <div className="mini-trend">
                {filteredTrend.map((point) => (
                  <div className="mini-point" key={`${status}-${point.key}`}>
                    <div className={`mini-bar ${status === "neutral" ? "green" : status}`} style={{ height: `${28 + (metricValue(point, status) / Math.max(...filteredTrend.map((p) => metricValue(p, status)), 1)) * 80}px` }} />
                    <b>{metricValue(point, status)}</b>
                    <span>{point.short}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="workspace-grid">
        <div className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>Programme pressure</h2>
              <p>Click any programme bar to filter concerns and commodity rows.</p>
            </div>
          </div>
          <RiskBars data={categoryRisks} activeCategory={categoryFilter} onCategory={(category) => setCategoryFilter(categoryFilter === category ? "all" : category)} />
        </div>
        <div className="panel">
          <h2>Active filter state</h2>
          <div className="filter-state">
            <span>Status: <b>{statusFilter === "all" ? "All" : STATUS_META[statusFilter].label}</b></span>
            <span>Programme: <b>{categoryFilter === "all" ? "All" : categoryFilter}</b></span>
            <span>AMI: <b>{amiFilter === "all" ? "All" : amiFilter === "missing" ? "Missing only" : "Present only"}</b></span>
            <span>MOS/TBD: <b>{tbdFilter === "all" ? "All" : tbdFilter === "tbd" ? "TBD only" : "Confirmed only"}</b></span>
            <span>SOH: <b>{sohFilter === "all" ? "All" : sohFilter === "zero" ? "Zero only" : sohFilter === "available" ? "Available only" : "Missing only"}</b></span>
            <span>Data status: <b>Static extracts</b></span>
            <span>Rows shown: <b>{drilldown.length}</b></span>
          </div>
          <button className="ghost-button" type="button" onClick={resetFilters}>Clear filters</button>
        </div>
      </section>

      <section className="concerns-section">
        <div className="section-head">
          <div>
            <p className="eyebrow dark">Management Concerns</p>
            <h2>Interactive alert playbook</h2>
          </div>
        </div>
        <div className="concerns-grid">
          {filteredConcerns.map((concern) => (
            <button className={`concern concern-${concern.tone} ${activeConcern === concern.title ? "active" : ""}`} type="button" key={concern.title} onClick={() => applyConcern(concern)}>
              <div>
                <span>{concern.severity}</span>
                <small>{concern.programme}</small>
              </div>
              <h3>{concern.title}</h3>
              <p>{concern.evidence}</p>
              <b>{concern.action}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="assistant-panel">
        <div>
          <p className="eyebrow dark">Ask Tracer Copilot</p>
          <h2>Questions answered from this dashboard</h2>
          <p>This public version uses the loaded report data only. It does not send data to an external AI service.</p>
        </div>
        <div className="assistant-chat">
          <div className="suggested-questions">
            {suggestedQuestions.map((question) => (
              <button type="button" key={question} onClick={() => {
                setAssistantQuestion(question);
                answerQuestion(question);
              }}>{question}</button>
            ))}
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            answerQuestion(assistantQuestion);
          }}>
            <input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about national availability, stockouts, TB, malaria, or data gaps" />
            <button type="submit">Ask</button>
          </form>
          <div className="assistant-answer">{assistantAnswer}</div>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-headline">
          <div>
            <h2>Commodity drilldown</h2>
            <p>Exports use the current dashboard filters.</p>
          </div>
          <div className="export-actions">
            <button type="button" onClick={exportCsv}>Export CSV</button>
            <button type="button" onClick={exportPdf}>Export PDF</button>
          </div>
        </div>
        <div className="table-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, commodity, category, or concern evidence" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="red">Stockout</option>
            <option value="amber">Near-critical</option>
            <option value="blue">Overstock</option>
            <option value="green">Adequate</option>
            <option value="neutral">Data gap</option>
          </select>
          <select value={amiFilter} onChange={(event) => setAmiFilter(event.target.value)} aria-label="Filter by AMI status">
            <option value="all">All AMI</option>
            <option value="missing">Missing AMI only</option>
            <option value="present">AMI present only</option>
          </select>
          <select value={tbdFilter} onChange={(event) => setTbdFilter(event.target.value)} aria-label="Filter by MOS TBD status">
            <option value="all">All MOS</option>
            <option value="tbd">TBD MOS only</option>
            <option value="confirmed">MOS confirmed only</option>
          </select>
          <select value={sohFilter} onChange={(event) => setSohFilter(event.target.value)} aria-label="Filter by stock on hand status">
            <option value="all">All SOH</option>
            <option value="zero">Zero SOH only</option>
            <option value="available">SOH available only</option>
            <option value="missing">Missing SOH only</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Commodity</th>
                <th>Category</th>
                <th>MOS sparkline</th>
                {reports.map((report) => <th key={report.key}>{report.short} MOS</th>)}
                <th>Latest status</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.map((item) => (
                <tr key={item.code}>
                  <td className="code">{item.code}</td>
                  <td>{item.item}</td>
                  <td>{item.category}</td>
                  <td><Sparkline values={item.mos} onClick={() => setSelectedCommodity(item)} /></td>
                  {reports.map((report, index) => (
                    <td key={`${item.code}-${report.key}`} className={classify(item.mos[index]).tone}>
                      {item.present[index] ? formatMos(item.mos[index]) : "-"}
                    </td>
                  ))}
                  <td><Badge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <CommodityModal item={selectedCommodity} onClose={() => setSelectedCommodity(null)} />
    </main>
  );
}

export default App;
