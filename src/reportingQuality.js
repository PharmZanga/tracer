export const DISTRICT_PRIMARY_CARE_LEVELS = Object.freeze({
  healthCentre: "HEALTH CENTRE",
  healthPost: "HEALTH POST",
  combined: "PRIMARY CARE - NOT SPECIFIED",
});

// District reporting is a DHO measure. Hospital reports are deliberately kept
// outside this calculation, even when a Level 1/2/3 hospital is located in the
// district. A combined primary-care row is accepted because several source
// workbooks submit Health Centre and Health Post data on one combined sheet.
export function primaryCareDistrictRows(period) {
  const expectedDistricts = period?.dataQuality?.districts || [];
  const rowsByDistrict = new Map(expectedDistricts.map((row) => [
    `${row.province}|${row.name}`,
    {
      province: row.province,
      name: row.name,
      healthCentreReported: false,
      healthPostReported: false,
      combinedPrimaryCareReported: false,
      hospitalOrOtherReported: false,
    },
  ]));

  (period?.facilities || []).forEach((facility) => {
    const row = rowsByDistrict.get(`${facility.province}|${facility.district}`);
    if (!row) return;
    if (facility.facilityLevel === DISTRICT_PRIMARY_CARE_LEVELS.healthCentre) row.healthCentreReported = true;
    else if (facility.facilityLevel === DISTRICT_PRIMARY_CARE_LEVELS.healthPost) row.healthPostReported = true;
    else if (facility.facilityLevel === DISTRICT_PRIMARY_CARE_LEVELS.combined) row.combinedPrimaryCareReported = true;
    else row.hospitalOrOtherReported = true;
  });

  return [...rowsByDistrict.values()].map((row) => {
    const splitReports = Number(row.healthCentreReported) + Number(row.healthPostReported);
    const submitted = row.combinedPrimaryCareReported || splitReports === 2;
    const partial = !row.combinedPrimaryCareReported && splitReports === 1;
    const primaryCareReports = row.combinedPrimaryCareReported ? 2 : splitReports;
    return {
      ...row,
      expected: 1,
      reported: submitted ? 1 : 0,
      missing: submitted ? 0 : 1,
      notReported: submitted ? 0 : 1,
      rate: submitted ? 1 : 0,
      submitted,
      partial,
      hospitalOnly: !submitted && !partial && row.hospitalOrOtherReported,
      primaryCareReports,
      status: submitted ? "Reported" : "Not Reported",
      detailStatus: submitted ? "Complete DHO submission" : partial ? "Partial — DHO incomplete" : row.hospitalOrOtherReported ? "Hospital-only submission" : "No primary-care submission",
    };
  });
}

export function primaryCareDistrictSummary(period) {
  const rows = primaryCareDistrictRows(period);
  const reported = rows.filter((row) => row.submitted).length;
  const partial = rows.filter((row) => row.partial).length;
  const hospitalOnly = rows.filter((row) => row.hospitalOnly).length;
  return {
    rows,
    expected: rows.length,
    reported,
    missing: rows.length - reported,
    partial,
    hospitalOnly,
    rate: rows.length ? reported / rows.length : 0,
  };
}
