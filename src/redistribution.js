const EPSILON = 0.000001;

function normaliseCommodity(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function collapseFacilityCommodityRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const commodity = String(row.item || row.commodity || "").trim();
    if (!commodity) return;
    const key = [row.province, row.district, row.facilityLevel, row.facility, normaliseCommodity(commodity)].join("|");
    const current = grouped.get(key) || {
      province: row.province || "Unknown province",
      district: row.district || "Unknown district",
      facilityLevel: row.facilityLevel || "Unknown level",
      facility: row.facility || "Unknown facility",
      commodity,
      quantity: 0,
      amc: 0,
      submittedMos: [],
    };
    current.quantity += Number(row.quantity || 0);
    current.amc += Number(row.amc || 0);
    if (Number.isFinite(Number(row.mos))) current.submittedMos.push(Number(row.mos));
    grouped.set(key, current);
  });

  return [...grouped.values()].map((row) => ({
    ...row,
    quantity: roundQuantity(row.quantity),
    amc: roundQuantity(row.amc),
    mos: row.amc > EPSILON
      ? row.quantity / row.amc
      : (row.submittedMos.length ? row.submittedMos.reduce((sum, value) => sum + value, 0) / row.submittedMos.length : null),
  }));
}

function geographyRank(source, destination) {
  if (source.province === destination.province && source.district === destination.district) return 0;
  if (source.province === destination.province) return 1;
  return 2;
}

function geographyLabel(rank) {
  if (rank === 0) return "Same district";
  if (rank === 1) return "Same province";
  return "Cross-province";
}

/**
 * Match urgent zero-SOH/zero-MOS facilities to safe sources.
 * Overstocked sources (>4 MOS) are exhausted before well-stocked sources (>2 MOS).
 * Each source keeps at least one AMC (one month of stock) across all recommendations.
 */
export function buildRedistributionCandidates(rows) {
  const facilityItems = collapseFacilityCommodityRows(rows);
  const destinations = facilityItems
    .filter((row) => row.quantity <= EPSILON && Number(row.mos) <= EPSILON && row.amc > EPSILON)
    .sort((a, b) => a.commodity.localeCompare(b.commodity) || a.province.localeCompare(b.province) || a.district.localeCompare(b.district) || a.facility.localeCompare(b.facility));
  const sourcePools = facilityItems
    .filter((row) => row.quantity > EPSILON && row.amc > EPSILON && row.mos > 2 + EPSILON)
    .map((row) => ({
      ...row,
      sourceType: row.mos > 4 ? "Overstocked" : "Well stocked (>2 MOS)",
      sourcePriorityRank: row.mos > 4 ? 0 : 1,
      originalQuantity: row.quantity,
      remainingQuantity: row.quantity,
    }));
  const candidates = [];

  destinations.forEach((destination) => {
    const matchingSources = sourcePools
      .filter((source) => normaliseCommodity(source.commodity) === normaliseCommodity(destination.commodity))
      .filter((source) => source.facility !== destination.facility || source.district !== destination.district || source.province !== destination.province)
      .filter((source) => source.remainingQuantity - source.amc > EPSILON)
      .sort((a, b) => a.sourcePriorityRank - b.sourcePriorityRank
        || geographyRank(a, destination) - geographyRank(b, destination)
        || (b.remainingQuantity - b.amc) - (a.remainingQuantity - a.amc)
        || b.mos - a.mos
        || a.facility.localeCompare(b.facility));

    const liveSource = matchingSources[0];
    if (!liveSource) return;

    const releasableQuantity = Math.max(0, liveSource.remainingQuantity - liveSource.amc);
    const proposedTransferQty = roundQuantity(Math.min(destination.amc, releasableQuantity));
    if (proposedTransferQty <= EPSILON) return;
    liveSource.remainingQuantity = roundQuantity(liveSource.remainingQuantity - proposedTransferQty);
    const locationRank = geographyRank(liveSource, destination);

    candidates.push({
      province: destination.province,
      commodity: destination.commodity,
      sourceProvince: liveSource.province,
      sourceFacility: liveSource.facility,
      sourceDistrict: liveSource.district,
      sourceLevel: liveSource.facilityLevel,
      sourceStatus: liveSource.sourceType,
      sourcePriority: liveSource.sourcePriorityRank === 0 ? "Highest priority source" : "Secondary priority source",
      sourceMos: liveSource.mos,
      sourceQty: liveSource.originalQuantity,
      proposedTransferQty,
      sourceQtyAfter: liveSource.remainingQuantity,
      sourceMosAfter: liveSource.remainingQuantity / liveSource.amc,
      destinationProvince: destination.province,
      destinationFacility: destination.facility,
      destinationDistrict: destination.district,
      destinationLevel: destination.facilityLevel,
      destinationStatus: "Urgent: zero quantity and zero MOS",
      destinationMos: destination.mos,
      destinationQty: destination.quantity,
      destinationQtyAfter: proposedTransferQty,
      destinationMosAfter: proposedTransferQty / destination.amc,
      priority: "Urgent receiver",
      geographyPriority: geographyLabel(locationRank),
    });
  });

  const locationSortRank = (value) => (value === "Same district" ? 0 : value === "Same province" ? 1 : 2);
  return candidates.sort((a, b) => (a.sourceStatus === "Overstocked" ? 0 : 1) - (b.sourceStatus === "Overstocked" ? 0 : 1)
    || locationSortRank(a.geographyPriority) - locationSortRank(b.geographyPriority)
    || a.destinationProvince.localeCompare(b.destinationProvince)
    || a.destinationDistrict.localeCompare(b.destinationDistrict)
    || a.commodity.localeCompare(b.commodity));
}
