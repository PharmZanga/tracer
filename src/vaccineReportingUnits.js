function keyPart(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function provinceKey(value) {
  return keyPart(value).replace(/PROVINCE$/, "");
}

function displayProvince(value) {
  return String(value || "")
    .replace(/\s+PROVINCE$/i, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildVaccineReportingUnits(districts = []) {
  const provinceNames = new Map();
  const units = districts.map((district) => {
    const province = displayProvince(district.province);
    const provinceId = provinceKey(district.province);
    provinceNames.set(provinceId, province);
    return {
      key: `district:${provinceId}:${keyPart(district.name)}`,
      province,
      district: district.name,
      unitType: "district",
    };
  });

  [...provinceNames.entries()].forEach(([provinceId, province]) => {
    units.push({
      key: `office:${provinceId}`,
      province,
      district: `${province} PHO`,
      unitType: "provincial_office",
    });
  });
  return units.sort((a, b) => a.province.localeCompare(b.province) || a.district.localeCompare(b.district));
}

export function cleanVaccineReportingRows(rows = [], reportingUnits = []) {
  const districts = new Map();
  const provincialOffices = new Map();
  reportingUnits.forEach((unit) => {
    const provinceId = provinceKey(unit.province);
    if (unit.unitType === "provincial_office") provincialOffices.set(provinceId, unit);
    else districts.set(`${provinceId}|${keyPart(unit.district)}`, unit);
  });

  return rows.flatMap((row) => {
    const provinceId = provinceKey(row.province);
    const sourceDistrict = keyPart(row.district);
    const unit = sourceDistrict === "PHO" || sourceDistrict === "LPHO"
      ? provincialOffices.get(provinceId)
      : districts.get(`${provinceId}|${sourceDistrict}`);
    return unit ? [{ ...row, province: unit.province, district: unit.district, reportingUnitKey: unit.key, reportingUnitType: unit.unitType }] : [];
  });
}
