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
  if (!period.items) {
    return (period.categories || []).map((row) => ({
      name: row.name,
      available: row.available ?? null,
      total: row.total ?? null,
      availability: row.availability || 0,
    }));
  }
  const grouped = new Map();
  period.items.forEach((item) => {
    const current = grouped.get(item.category) || { name: item.category, available: 0, total: 0, availability: 0 };
    current.total += 1;
    if ((item.availability || 0) > 0) current.available += 1;
    grouped.set(item.category, current);
  });
  return [...grouped.values()].map((row) => ({ ...row, availability: row.total ? row.available / row.total : 0 }));
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
  return "level3";
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

function comparisonPeriodMatches(period, filters) {
  const year = String(filters.year);
  if (!String(period.month || "").startsWith(year)) return false;
  if (filters.periodType === "yearly") return true;
  if (filters.periodType === "quarterly") return quarterOfMonth(period.month) === filters.quarter;
  return period.month === filters.month;
}

function comparisonRowsForPeriod(period, filters) {
  const provinceFilter = (row) => filters.province === "all" || row.province === filters.province || row.name === filters.province;
  const districtFilter = (row) => filters.district === "all" || row.district === filters.district || row.name === filters.district;
  const facilityLevelFilter = (row) => filters.facilityLevel === "all" || row.facilityLevel === filters.facilityLevel;
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

  const groups = careLevelBuckets.map((bucket) => {
    const facilities = (period.facilities || [])
      .filter(provinceFilter)
      .filter(districtFilter)
      .filter(facilityLevelFilter)
      .filter((facility) => careLevelBucket(facility.facilityLevel) === bucket.id);
    return {
      ...combineRollups(facilities, makeEmptyRollup(bucket.label)),
      name: bucket.label,
      group: bucket.label,
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
  const [comparisonQuarter, setComparisonQuarter] = useState("Q2");
  const [comparisonMonth, setComparisonMonth] = useState(tracerReportingPeriods.at(-1).month);
  const [comparisonProvince, setComparisonProvince] = useState("all");
  const [comparisonDistrict, setComparisonDistrict] = useState("all");
  const [comparisonFacilityLevel, setComparisonFacilityLevel] = useState("all");
  const [comparisonCommodity, setComparisonCommodity] = useState("all");
  const [comparisonProgram, setComparisonProgram] = useState("all");
  const [comparisonCompareBy, setComparisonCompareBy] = useState("level");
  const [comparisonMetric, setComparisonMetric] = useState("availability");
  const [query, setQuery] = useState("");
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
  const facilityLevelOptions = [...new Set(fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => selectedDistrict === "all" || facility.district === selectedDistrict)
    .map((facility) => facility.facilityLevel))].sort();
  const facilityOptions = selectedDistrict === "all" ? [] : fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => facility.district === selectedDistrict)
    .filter((facility) => selectedFacilityLevel === "all" || facility.facilityLevel === selectedFacilityLevel)
    .map((facility) => `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}`)
    .sort();

  const filteredFacilities = fieldData.facilities
    .filter((facility) => selectedProvince === "all" || facility.province === selectedProvince)
    .filter((facility) => selectedDistrict === "all" || facility.district === selectedDistrict)
    .filter((facility) => selectedFacilityLevel === "all" || facility.facilityLevel === selectedFacilityLevel)
    .filter((facility) => selectedFacility === "all" || `${facility.province}|${facility.district}|${facility.facilityLevel}|${facility.name}` === selectedFacility);

  const fieldKpis = combineRollups(filteredFacilities, fieldData.national);
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
  });
  const bestProvince = [...fieldData.provinces].sort((a, b) => b.availability - a.availability)[0];
  const worstProvince = fieldData.provinces[0];
  const stockoutFacilityCount = filteredFacilities.filter((facility) => facility.stockoutItemCount > 0).length;
  const lowStockFacilityCount = filteredFacilities.filter((facility) => facility.lowStockItemCount > 0).length;
  const redistributionCandidates = buildRedistributionCandidates(filteredFacilities);
  const redistributionProvinceCount = new Set(redistributionCandidates.map((item) => item.province)).size;
  const facilityAlerts = filteredFacilities
    .filter((facility) => facility.stockoutItemCount > 0 || facility.lowStockItemCount > 0)
    .sort((a, b) => Number(a.isAggregate) - Number(b.isAggregate) || b.stockoutItemCount - a.stockoutItemCount || b.lowStockItemCount - a.lowStockItemCount)
    .slice(0, 48);
  const districtsInScope = fieldData.districts
    .filter((district) => selectedProvince === "all" || district.province === selectedProvince);

  const commoditiesInScope = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fieldData.commodities
      .filter((commodity) => !q || commodity.name.toLowerCase().includes(q))
      .slice(0, 120);
  }, [fieldData, query]);

  const comments = fieldData.comments || [];
  const expectedProvinces = 10;
  const reportingRate = expectedProvinces ? fieldData.counts.provinces / expectedProvinces : 0;
  const expectedDistricts = fieldData.counts.expectedDistricts || fieldData.counts.districts;
  const expectedFacilityUnits = fieldData.counts.expectedLevelReports || fieldData.counts.expectedFacilityUnits || fieldData.counts.facilityUnits;
  const missingDistricts = fieldData.counts.missingDistricts || 0;
  const missingFacilityUnits = fieldData.counts.missingFacilityUnits || 0;
  const dataQuality = fieldData.dataQuality || { provinces: [], districts: [], facilityTypes: [] };
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
    .filter((row) => !row.facilityLevel || selectedFacilityLevel === "all" || row.facilityLevel === selectedFacilityLevel);
  const productCategoryRows = aggregateRollups(scopedProgrammeRows, "name")
    .sort((a, b) => a.availability - b.availability || (a.mos || 0) - (b.mos || 0))
    .slice(0, 36);
  const comparisonYears = [...new Set(tracerReportingPeriods.map((period) => String(period.month).slice(0, 4)))].sort();
  const comparisonMonths = [...new Set(tracerReportingPeriods
    .filter((period) => String(period.month).startsWith(comparisonYear))
    .map((period) => period.month))].sort();
  const comparisonDistrictOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.districts || [])
    .filter((row) => comparisonProvince === "all" || row.province === comparisonProvince)
    .map((row) => row.name))].sort();
  const comparisonFacilityLevelOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.facilityLevels || []))]
    .map((row) => row.name || row.facilityLevel || row)
    .filter(Boolean)
    .sort();
  const comparisonCommodityOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.commodities || []).map((row) => row.name))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 600);
  const comparisonProgramOptions = [...new Set(tracerReportingPeriods.flatMap((period) => period.programmes || []).map((row) => row.name))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const comparisonFilters = {
    periodType: comparisonPeriodType,
    year: comparisonYear,
    quarter: comparisonQuarter,
    month: comparisonMonth,
    province: comparisonProvince,
    district: comparisonDistrict,
    facilityLevel: comparisonFacilityLevel,
    commodity: comparisonCommodity,
    program: comparisonProgram,
    compareBy: comparisonCompareBy,
  };
  const comparisonPeriods = tracerReportingPeriods
    .filter((period) => comparisonPeriodMatches(period, comparisonFilters))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const previousComparisonPeriods = (() => {
    if (!comparisonPeriods.length) return [];
    const firstDate = comparisonPeriods[0].reportDate;
    const sameYearPeriods = tracerReportingPeriods
      .filter((period) => String(period.month).startsWith(comparisonYear) && period.reportDate < firstDate)
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    if (comparisonPeriodType === "monthly") {
      const previousMonth = sameYearPeriods[0]?.month;
      return previousMonth ? tracerReportingPeriods.filter((period) => period.month === previousMonth) : [];
    }
    if (comparisonPeriodType === "quarterly") {
      const previousQuarter = sameYearPeriods[0] ? quarterOfMonth(sameYearPeriods[0].month) : "";
      return previousQuarter ? tracerReportingPeriods.filter((period) => String(period.month).startsWith(comparisonYear) && quarterOfMonth(period.month) === previousQuarter) : [];
    }
    return tracerReportingPeriods.filter((period) => String(period.month).startsWith(String(Number(comparisonYear) - 1)));
  })();
  const comparisonRows = aggregateComparisonRows(comparisonPeriods, comparisonFilters)
    .sort((a, b) => comparisonMetricValue(b, comparisonMetric) - comparisonMetricValue(a, comparisonMetric) || a.name.localeCompare(b.name));
  const previousComparisonRows = aggregateComparisonRows(previousComparisonPeriods, comparisonFilters);
  const comparisonCurrent = combineRollups(comparisonRows, makeEmptyRollup("Current comparison"));
  const comparisonPrevious = combineRollups(previousComparisonRows, makeEmptyRollup("Previous comparison"));
  const comparisonDelta = comparisonMetricValue(comparisonCurrent, comparisonMetric) - comparisonMetricValue(comparisonPrevious, comparisonMetric);
  const comparisonBest = comparisonRows[0] || makeEmptyRollup("No data");
  const comparisonWorst = comparisonRows.at(-1) || makeEmptyRollup("No data");
  const comparisonGap = comparisonMetricValue(comparisonBest, comparisonMetric) - comparisonMetricValue(comparisonWorst, comparisonMetric);
  const comparisonTrendGroups = comparisonRows.slice(0, 5).map((row) => row.name);
  const comparisonTrendRows = comparisonPeriods.map((period) => {
    const periodRows = comparisonRowsForPeriod(period, comparisonFilters);
    return {
      period,
      values: comparisonTrendGroups.map((name) => {
        const row = periodRows.find((item) => (item.group || item.name) === name);
        return { name, value: row ? comparisonMetricValue(row, comparisonMetric) : 0 };
      }),
    };
  });
  const comparisonCommodityRows = aggregateRollups(comparisonPeriods.flatMap((period) => period.commodities || []), "name")
    .filter((row) => comparisonCommodity === "all" || row.name === comparisonCommodity)
    .sort((a, b) => a.availability - b.availability || b.riskRows - a.riskRows)
    .slice(0, 60);
  const comparisonInsights = [
    `${comparisonBest.name} has the highest ${comparisonMetricLabel(comparisonMetric).toLowerCase()} at ${formatComparisonMetric(comparisonMetricValue(comparisonBest, comparisonMetric), comparisonMetric)}.`,
    `${comparisonWorst.name} is the lowest performer at ${formatComparisonMetric(comparisonMetricValue(comparisonWorst, comparisonMetric), comparisonMetric)}.`,
    `The performance gap across the selected comparison is ${formatComparisonMetric(comparisonGap, comparisonMetric)}.`,
    comparisonDelta >= 0
      ? `The current selection improved by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} compared to the previous comparable period.`
      : `The current selection declined by ${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} compared to the previous comparable period.`,
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
          <div className="global-filter-bar">
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
            <label>
              <span>Province</span>
              <select value={selectedProvince} onChange={(event) => changeProvinceFilter(event.target.value)}>
                <option value="all">All provinces</option>
                {provinceOptions.map((province) => <option value={province} key={province}>{province}</option>)}
              </select>
            </label>
            <label>
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
                {facilityLevelOptions.map((level) => <option value={level} key={level}>{level}</option>)}
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
            </label>
            <button type="button" onClick={resetFieldHierarchy}>Clear</button>
          </div>
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
            <TopRowsTable title="Province availability" rows={fieldData.provinces.slice(0, 10)} onSelect={(row) => selectProvince(row.name)} />
            <TopRowsTable title={selectedProvince === "all" ? "Districts needing attention" : `Districts in ${selectedProvince}`} rows={districtsInScope.slice(0, 12)} onSelect={(row) => selectDistrict(row.name)} />
            <TopRowsTable title="Programme pressure" rows={fieldData.programmes.slice(0, 12)} />
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
              <h2>Commodity Intelligence</h2>
              <p>Search tracer commodities and see national stockout, low-stock, and MOS position from the selected weekly submission.</p>
            </div>
            <div className="export-actions">
              <button type="button" onClick={exportCsv}>Export Facility CSV</button>
              <button type="button" onClick={() => window.print()}>Export PDF</button>
            </div>
          </div>
          <div className="table-tools">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tracer commodity" />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Commodity</th>
                  <th>Availability</th>
                  <th>MOS</th>
                  <th>Stockout rows</th>
                  <th>Low-stock rows</th>
                  <th>Risk rows</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {commoditiesInScope.map((item) => {
                  const tone = classifyRollup(item);
                  return (
                    <tr key={item.name}>
                      <td>{item.name}</td>
                      <td>{formatPercent(item.availability)}</td>
                      <td>{formatMos(item.mos)}</td>
                      <td>{item.stockout.toLocaleString()}</td>
                      <td>{(item.nearCritical + item.understocked).toLocaleString()}</td>
                      <td>{item.riskRows.toLocaleString()}</td>
                      <td><span className={`comparison-signal ${tone}`}>{statusLabels[tone] || statusLabels[item.status] || (tone === "red" ? "Critical" : tone === "amber" ? "Monitor" : "Stable")}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
              <select value={comparisonPeriodType} onChange={(event) => setComparisonPeriodType(event.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label>
              <span>Year</span>
              <select value={comparisonYear} onChange={(event) => {
                const year = event.target.value;
                setComparisonYear(year);
                const firstMonth = comparisonMonths.find((month) => month.startsWith(year)) || `${year}-01`;
                setComparisonMonth(firstMonth);
              }}>
                {comparisonYears.map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
            </label>
            <label>
              <span>Quarter</span>
              <select value={comparisonQuarter} onChange={(event) => setComparisonQuarter(event.target.value)} disabled={comparisonPeriodType !== "quarterly"}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </label>
            <label>
              <span>Month</span>
              <select value={comparisonMonth} onChange={(event) => setComparisonMonth(event.target.value)} disabled={comparisonPeriodType !== "monthly"}>
                {comparisonMonths.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
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
                {comparisonFacilityLevelOptions.map((level) => <option value={level} key={level}>{level}</option>)}
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

          <div className="stats-grid comparison-kpis">
            <KpiCard
              label={`Average ${comparisonMetricLabel(comparisonMetric)}`}
              value={formatComparisonMetric(comparisonMetricValue(comparisonCurrent, comparisonMetric), comparisonMetric)}
              sub={`${comparisonDelta >= 0 ? "+" : "-"}${formatComparisonMetric(Math.abs(comparisonDelta), comparisonMetric)} vs previous period`}
              tone={comparisonTone(comparisonMetricValue(comparisonCurrent, comparisonMetric), comparisonMetric)}
            />
            <KpiCard label="Highest performing" value={comparisonBest.name} sub={formatComparisonMetric(comparisonMetricValue(comparisonBest, comparisonMetric), comparisonMetric)} />
            <KpiCard label="Lowest performing" value={comparisonWorst.name} sub={formatComparisonMetric(comparisonMetricValue(comparisonWorst, comparisonMetric), comparisonMetric)} tone={comparisonTone(comparisonMetricValue(comparisonWorst, comparisonMetric), comparisonMetric)} />
            <KpiCard label="Performance gap" value={formatComparisonMetric(comparisonGap, comparisonMetric)} sub={`${comparisonRows.length} comparison rows`} tone="amber" />
            <KpiCard label="Periods included" value={comparisonPeriods.length.toLocaleString()} sub={comparisonPeriodType} tone="blue" />
          </div>

          <div className="comparison-layout">
            <div className="comparison-panel">
              <div className="quality-panel-head">
                <div>
                  <h3>{comparisonMetricLabel(comparisonMetric)} comparison</h3>
                  <p>Ranked by selected metric for the active filters.</p>
                </div>
                <span>{comparisonRows.length} rows</span>
              </div>
              <div className="comparison-bars">
                {comparisonRows.slice(0, 14).map((row) => {
                  const value = comparisonMetricValue(row, comparisonMetric);
                  const barWidth = comparisonMetric === "mos" ? Math.min((value / 6) * 100, 100) : comparisonMetric === "amc" ? Math.min((value / Math.max(comparisonMetricValue(comparisonBest, comparisonMetric), 1)) * 100, 100) : normalizeRate(value) * 100;
                  return (
                    <div className={`comparison-bar-row comparison-${comparisonTone(value, comparisonMetric)}`} key={row.name}>
                      <span>{row.name}</span>
                      <div><i style={{ width: `${barWidth}%` }} /></div>
                      <b>{formatComparisonMetric(value, comparisonMetric)}</b>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="comparison-panel">
              <div className="quality-panel-head">
                <div>
                  <h3>Trend comparison</h3>
                  <p>Top comparison rows across selected reporting weeks.</p>
                </div>
                <span>{comparisonTrendRows.length} periods</span>
              </div>
              <div className="comparison-trend">
                {comparisonTrendRows.map((row) => (
                  <div className="comparison-trend-row" key={row.period.id}>
                    <strong>{shortPeriodLabel(row.period)}</strong>
                    <div>
                      {row.values.map((item) => (
                        <span
                          title={`${item.name}: ${formatComparisonMetric(item.value, comparisonMetric)}`}
                          style={{ height: `${Math.max(8, comparisonMetric === "mos" ? Math.min(item.value / 6, 1) * 68 : comparisonMetric === "amc" ? 32 : normalizeRate(item.value) * 68)}px` }}
                          key={`${row.period.id}-${item.name}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="comparison-legend">
                {comparisonTrendGroups.map((name) => <span key={name}>{name}</span>)}
              </div>
            </div>
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
    </div>
  );
}

export default App;
