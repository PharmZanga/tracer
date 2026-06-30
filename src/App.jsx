import { useMemo, useState } from "react";
import { tracerReportingPeriods } from "./tracerFacilityData.js";

const dashboardPages = [
  { id: "executive", short: "EX", label: "Executive Summary" },
  { id: "national", short: "NS", label: "National Stock Status" },
  { id: "provincial", short: "PP", label: "Provincial Performance" },
  { id: "facilities", short: "FA", label: "Facility Alerts" },
  { id: "commodities", short: "CI", label: "Commodity Intelligence" },
  { id: "programmes", short: "PR", label: "Programme Performance" },
  { id: "quality", short: "DQ", label: "Data Quality" },
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

function formatPercent(value) {
  return `${Math.round((value || 0) * 1000) / 10}%`;
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
    acc.availabilityWeighted += (row.availability || 0) * (row.rows || 0);
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
    group.availabilityWeighted = (group.availabilityWeighted || 0) + (row.availability || 0) * (row.rows || 0);
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
  const expectedFacilityUnits = fieldData.counts.expectedFacilityUnits || fieldData.counts.facilityUnits;
  const missingDistricts = fieldData.counts.missingDistricts || 0;
  const missingFacilityUnits = fieldData.counts.missingFacilityUnits || 0;
  const dataQuality = fieldData.dataQuality || { provinces: [], districts: [], facilityTypes: [] };
  const provinceQualityRows = dataQuality.provinces || [];
  const selectedProvinceQuality = selectedProvince === "all"
    ? null
    : provinceQualityRows.find((row) => row.name === selectedProvince);
  const districtQualityRows = (dataQuality.districts || [])
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince);
  const selectedDistrictQuality = selectedDistrict === "all"
    ? null
    : districtQualityRows.find((row) => row.name === selectedDistrict);
  const facilityTypeRows = (dataQuality.facilityTypes || [])
    .filter((row) => selectedProvince === "all" || row.province === selectedProvince)
    .filter((row) => selectedDistrict === "all" || row.district === selectedDistrict);
  const facilityTypeSummaryRows = selectedDistrict === "all"
    ? aggregateQualityRows(facilityTypeRows, "type", "type").sort((a, b) => a.type.localeCompare(b.type))
    : facilityTypeRows.sort((a, b) => a.type.localeCompare(b.type));
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
              <h2>Province, district, and facility reporting footprint</h2>
              <p>Expected facilities are taken from the clean tracer facility universe. Reported means the facility or aggregate reporting unit appears in the selected week.</p>
            </div>
          </div>
          <div className="stats-grid">
            <KpiCard label="Province reporting" value={`${fieldData.counts.provinces}/${expectedProvinces}`} sub={`${formatPercent(reportingRate)} provincial footprint`} />
            <KpiCard label="District reporting" value={`${fieldData.counts.districts}/${expectedDistricts}`} sub={`${missingDistricts} districts did not submit`} />
            <KpiCard label="Reporting units" value={`${fieldData.counts.facilityUnits}/${expectedFacilityUnits}`} sub={`${missingFacilityUnits} facility units did not submit`} />
            <KpiCard label="Reporting rate" value={formatPercent(fieldData.counts.facilityUnits / expectedFacilityUnits)} sub="Reported facility footprint" />
            <KpiCard label="Selected scope" value={selectedDistrict !== "all" ? selectedDistrict : selectedProvince !== "all" ? selectedProvince : "Zambia"} sub="Click tables below to drill down" />
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
            <span>/</span>
            <button type="button" disabled={selectedDistrict === "all"}>{selectedDistrict === "all" ? "Select district" : selectedDistrict}</button>
          </div>
          <div className="quality-grid">
            <QualityTable title="Provincial reporting footprint" rows={provinceQualityRows} firstColumn="Province" onSelect={(row) => selectQualityProvince(row.name)} />
            <ReportingBars title="Province reporting footprint" rows={[...provinceQualityRows].sort((a, b) => (a.rate || qualityRate(a)) - (b.rate || qualityRate(b)))} onSelect={(row) => selectQualityProvince(row.name)} />
          </div>
          <div className="quality-grid">
            <QualityTable
              title={selectedProvince === "all" ? "District reporting footprint" : `${selectedProvince} district reporting`}
              rows={districtQualityRows}
              firstColumn="District"
              onSelect={(row) => selectQualityDistrict(row.name)}
            />
            <QualityTable
              title={selectedDistrict === "all" ? "Facility type reporting in selected scope" : `${selectedDistrict} facility type reporting`}
              rows={facilityTypeSummaryRows}
              firstColumn="Facility type"
            />
          </div>
          <div className="quality-grid">
            <QualityTable title="Bottom 10 districts by reporting" rows={bottomDistrictRows} firstColumn="District" onSelect={(row) => selectQualityDistrict(row.name)} />
            <QualityTable title="Top 10 districts by reporting" rows={topDistrictRows} firstColumn="District" onSelect={(row) => selectQualityDistrict(row.name)} />
          </div>
          {selectedProvinceQuality ? (
            <div className="quality-note">
              <strong>{selectedProvinceQuality.name}</strong>
              <span>{selectedProvinceQuality.reported.toLocaleString()} of {selectedProvinceQuality.expected.toLocaleString()} expected facility units reported, with {selectedProvinceQuality.missing.toLocaleString()} missing.</span>
            </div>
          ) : null}
          {selectedDistrictQuality ? (
            <div className="quality-note">
              <strong>{selectedDistrictQuality.name}</strong>
              <span>{selectedDistrictQuality.reported.toLocaleString()} of {selectedDistrictQuality.expected.toLocaleString()} expected facility units reported, with {selectedDistrictQuality.missing.toLocaleString()} missing.</span>
            </div>
          ) : null}
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
