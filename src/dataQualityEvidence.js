export function reportingFacilityType(facilityLevel = "") {
  const level = String(facilityLevel).toUpperCase();
  if (level.includes("PRIMARY CARE")) return "Health Centres and Posts (combined)";
  if (level.includes("HEALTH POST")) return "Health Posts";
  if (level.includes("HEALTH CENTRE") || level.includes("HEALTH CENTER")) return "Health Centres";
  if (level.includes("RENAL")) return "Renal Units";
  if (level.includes("CANCER")) return "Cancer Units";
  if (level.includes("MENTAL")) return "Mental Health Units";
  if (level.includes("OPTH") || level.includes("OPHTH") || level.includes("EYE")) return "Ophthalmology Units";
  if (level.includes("TB") || level.includes("MDR")) return "TB-DS/MDR Units";
  if (level.includes("HEART")) return "Heart Units";
  if (level.includes("WOMEN") || level.includes("NEW BORN")) return "Women And Newborn Units";
  if (level.includes("LEVEL 2") || level.includes("GENERAL HOSPITAL")) return "Level 2 Hospitals";
  if (level.includes("LEVEL 1") || level.includes("DISTRICT")) return "Level 1 Hospitals";
  if (level.includes("LEVEL 3") || level.includes("TERTIARY") || level.includes("SPECIAL")) return "Level 3/Specialised Hospitals";
  return "Other reporting units";
}

function normalisedReportingText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function namedFacilityMatchesDistrict(facility) {
  const district = normalisedReportingText(facility?.district);
  const name = normalisedReportingText(facility?.name || facility?.facility);
  return Boolean(district && name && name.includes(district));
}

export function facilityNameMatchesDifferentDistrict(facility, districtNames = []) {
  const ownDistrict = normalisedReportingText(facility?.district);
  const name = normalisedReportingText(facility?.name || facility?.facility);
  if (!ownDistrict || !name) return false;

  return districtNames.some((districtName) => {
    const candidate = normalisedReportingText(districtName);
    return candidate && candidate !== ownDistrict && name.includes(candidate);
  });
}

// A named hospital may legitimately not include its district in the facility
// name (for example, mission and specialist hospitals). It is excluded only
// when the submitted name explicitly identifies a different known district.
export function sourceSupportedHospitalFacility(facility, districtNames = []) {
  const type = reportingFacilityType(facility?.facilityLevel);
  return !["Health Centres", "Health Posts", "Health Centres and Posts (combined)"].includes(type)
    && !facilityNameMatchesDifferentDistrict(facility, districtNames);
}
