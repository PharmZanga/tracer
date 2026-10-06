export function reportPeriodKey(period, type) {
  if (type === "monthly") return period.month;
  if (type === "quarterly") return `${period.month.slice(0, 4)}-Q${Math.ceil(Number(period.month.slice(5, 7)) / 3)}`;
  return period.id;
}

export function reportOptions(catalogue, type, year) {
  const groups = new Map();
  for (const period of catalogue.filter((p) => p.month.startsWith(`${year}-`))) {
    const key = reportPeriodKey(period, type);
    const group = groups.get(key) || { id: key, periods: [], months: new Set() };
    group.periods.push(period);
    group.months.add(period.month);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    months: [...group.months].sort(),
    label: type === "weekly" ? group.periods[0].label
      : type === "monthly" ? new Date(`${group.id}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lusaka" })
        : `${group.id.slice(0, 4)} Quarter ${group.id.at(-1)}${group.months.size < 3 ? " (partial)" : ""}`,
  }));
}

export function selectReportPeriods(periods, option) {
  const ids = new Set(option?.periods.map((p) => p.id) || []);
  return periods.filter((p) => ids.has(p.id)).sort((a,b) => a.reportDate.localeCompare(b.reportDate));
}

export function matchingStockPeriods(stockPeriods, option, type) {
  if (!option) return [];
  if (type !== "weekly") return stockPeriods.filter((p) => option.months.includes(p.date.slice(0,7)));
  const end = new Date(`${option.periods[0].reportDate}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return stockPeriods.filter((p) => p.date >= start.toISOString().slice(0,10) && p.date <= end.toISOString().slice(0,10));
}
