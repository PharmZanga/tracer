"""Import and normalize the supplied October Week 2 provincial submissions."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\october\week 2")
OUTPUT = ROOT / "public/data/tracer/2026/oct.json"
BOOTSTRAP = ROOT / "src/tracerBootstrap.js"
GENERATOR = ROOT / "tools/generate_tracer_facility_data.py"
DATA_MODULES = [
    ROOT / "public/data/tracer/2026/jan-feb.json",
    ROOT / "public/data/tracer/2026/mar-apr.json",
    ROOT / "public/data/tracer/2026/may-jun.json",
    ROOT / "public/data/tracer/2026/jul-aug.json",
    ROOT / "public/data/tracer/2026/sep.json",
    OUTPUT,
]
FILES = {
    "COPPERBELT PROVINCE": "18.10.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx",
    "NORTH-WESTERN PROVINCE": "18-10-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx",
    "WESTERN PROVINCE": "18-10-2026WESTERNPROVINCE2025TRACERWEEKLYREPORT.xlsx",
    "EASTERN PROVINCE": "18th Oct EASTERN_PROVINCE_2026_TRACER_WEEKLY_REPORT_PROVINCES_(1).xlsx",
    "NORTHERN PROVINCE": "NORTHERN PROVINCE TRACER WEEKLY REPORT 18th OCTOBER,2026.xlsx",
    "SOUTHERN PROVINCE": "SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 16.10.26 (1).xlsx",
    "LUAPULA PROVINCE": "18.10.26_LUAPULA PROVINCE 2026 TRACER WEEKLY REPORT.xlsx",
    "CENTRAL PROVINCE": "19_10_2026 CENTRAL PROVINCE 2026 TRACER WEEKLY REPORT.xlsx",
}

# Week 2 source normalization parameters. Stock-on-hand values are whole units;
# dash markers and negative quantities mean zero. Availability must be derived
# from the Quantity field (never AMC/MOS) and use the commodity rows in scope.
WEEK2_PARAMETERS = {
    "quantityField": "QUANTITY",
    "unreportedCommodityRowWhenSOHAmcMosAllBlank": True,
    "facilityReportRequiresAnyMetricEntryInBlock": True,
    "unnamedBlankFacilityBlockIsTemplateNotExpected": True,
    "namedBlankFacilityBlockRequiresHistoricalSameProvinceDistrictServiceEvidence": True,
    "specialtyServiceExpectedOnlyWithLocalHistoricalEvidence": True,
    "facilityNameAndDistrictMustMatchSubmissionProvince": True,
    "knownFacilityIdentityMustMatchLocalProvince": True,
    "dashStockOnHandIsZero": True,
    "blankStockOnHandIsZero": True,
    "blankStockOnHandWithinReportedColumnIsZero": True,
    "negativeStockOnHandIsZero": True,
    "stockOnHandRounding": "floor",
    "mosDerivedFromNormalizedStockOnHand": True,
    "availabilityCountsPositiveStockOnHand": True,
    "availabilityDenominator": "commodity_rows_in_scope",
}

def normalize_week2_rows(generator, sources, report_date, invalid_source_blocks=None):
    """Exclude wholly blank metric rows/blocks, then normalize reported rows."""
    blank_markers = {"-", "–", "—"}

    def has_entry(value):
        return value is not None and (not isinstance(value, str) or bool(value.strip()))

    source_groups = {}
    for source in sources:
        for row in generator.iter_raw_matrix_rows(source, report_date):
            key = (
                row.get("_RAW_SOURCE_WORKBOOK"),
                row.get("_RAW_SOURCE_SHEET"),
                row.get("_RAW_SOH_COLUMN"),
            )
            source_groups.setdefault(key, []).append(row)

    invalid_source_blocks = invalid_source_blocks or set()

    stats = {"sourceBlocks": len(source_groups), "allMetricBlankBlocks": 0, "allMetricBlankBlockRowsExcluded": 0,
             "allMetricBlankRowsExcluded": 0, "provinceMismatchRowsExcluded": 0,
             "blankSOHRowsSetToZero": 0, "dashSOHRowsSetToZero": 0,
             "allMetricBlankBlockDetails": []}
    normalized = []
    for rows in source_groups.values():
        first = rows[0]
        source_block_key = (
            first.get("_RAW_SOURCE_WORKBOOK"),
            first.get("_RAW_SOURCE_SHEET"),
            first.get("_RAW_SOH_COLUMN"),
        )
        if source_block_key in invalid_source_blocks:
            stats["provinceMismatchRowsExcluded"] += len(rows)
            continue
        reported_column = any(
            has_entry(row.get("_RAW_QUANTITY_INPUT"))
            or has_entry(row.get("AMC"))
            or has_entry(row.get("MOS"))
            for row in rows
        )
        if not reported_column:
            stats["allMetricBlankBlocks"] += 1
            stats["allMetricBlankBlockRowsExcluded"] += len(rows)
            first = rows[0]
            stats["allMetricBlankBlockDetails"].append({
                "province": first.get("PROVINCE"),
                "district": first.get("DISTRICT"),
                "facility": first.get("FACILITY NAME"),
                "facilityLevel": first.get("FACILITY LEVEL"),
                "sheet": first.get("_RAW_SOURCE_SHEET"),
                "column": first.get("_RAW_SOH_COLUMN"),
                "rows": len(rows),
            })
            continue
        for row in rows:
            raw_quantity = row.get("_RAW_QUANTITY_INPUT")
            raw_amc = row.get("AMC")
            raw_mos = row.get("MOS")
            if not any(has_entry(value) for value in (raw_quantity, raw_amc, raw_mos)):
                stats["allMetricBlankRowsExcluded"] += 1
                continue
            quantity = generator.num(row.get("QUANTITY"))
            row["_SOURCE_QUANTITY"] = quantity
            row["_SOURCE_MOS"] = generator.num(row.get("MOS"))
            if isinstance(raw_quantity, str) and raw_quantity.strip() in blank_markers:
                quantity = 0
                row["_SOURCE_QUANTITY"] = 0
                stats["dashSOHRowsSetToZero"] += 1
            elif raw_quantity is None or (isinstance(raw_quantity, str) and not raw_quantity.strip()):
                quantity = 0
                stats["blankSOHRowsSetToZero"] += 1
            amc = generator.num(row.get("AMC"))
            if quantity is not None:
                quantity = max(0, int(quantity))
            row["QUANTITY"] = quantity
            row["MOS"] = quantity / amc if quantity is not None and amc is not None and amc > 0 else None
            # Keep missing SOH in the availability denominator as unavailable,
            # matching the dashboard's established reporting convention.
            row["AVAILABILITY"] = 1 if quantity is not None and quantity > 0 else 0
            normalized.append(row)
    normalize_week2_rows.last_stats = stats
    yield from normalized


def audit_province_facility_blocks(generator, sources):
    """Flag specialty-unit template names that conflict with their province."""
    from collections import defaultdict

    district_owners = defaultdict(set)
    for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items():
        for district in districts:
            canonical = generator.canonical_district(province, district)
            if canonical:
                district_owners[canonical].add(province)

    invalid_blocks = set()
    findings = []
    skip = {"SITUATION BOARD", "SUMMARY", "SUMMARY SHEET", "COMMENTS", "COMMENT", "RECOMMENDATIONS", "RECOMEDATIONS", "PROGRAM"}
    for source in sources:
        source_province = generator.normalize_province(source["province"])
        workbook = generator.openpyxl.load_workbook(source["path"], read_only=False, data_only=True)
        for ws in workbook.worksheets:
            if ws.title.strip().upper() in skip or ws.max_row < 4 or ws.max_column < 7:
                continue
            level = generator.raw_facility_level(ws.title.strip(), ws.cell(1, 1).value)
            if level in {"HEALTH POST", "HEALTH CENTRE", "PRIMARY CARE - NOT SPECIFIED"}:
                continue
            for quantity_col, district_col, facility_col in generator.raw_sheet_facility_blocks(ws):
                district_text = generator.clean(ws.cell(2, district_col).value)
                facility_text = generator.clean(ws.cell(2, facility_col).value)
                if not facility_text or not isinstance(facility_text, str):
                    continue
                district = generator.normalize_district(district_text) if district_text else None
                owner = next((
                    province for province in generator.VALID_DISTRICTS_BY_PROVINCE
                    if district_text and generator.canonical_district(province, district_text)
                ), None)
                facility_key = generator.facility_match_key(facility_text)
                known_identity = (
                    generator.VERIFIED_FACILITY_IDENTITIES.get(facility_key)
                    or generator.RAW_FACILITY_IDENTITIES.get(facility_key)
                )
                expected_province = known_identity[0] if known_identity else owner
                reasons = []
                correctable_local_district = bool(
                    known_identity and known_identity[0] == source_province
                    and not generator.canonical_district(source_province, district_text)
                )
                placeholder_label = (
                    "name of district" in facility_key
                    or facility_key in {"facility name", "hospital name", "name of facility"}
                    or (district and "name of district" in district)
                )
                if placeholder_label:
                    reasons.append("template_placeholder_name")
                elif owner and owner != source_province:
                    reasons.append("district_belongs_to_another_province")
                elif district and not owner and correctable_local_district:
                    reasons.append("district_header_misaligned_corrected_from_local_history")
                elif district and not owner:
                    reasons.append("district_not_in_national_roster")
                if known_identity and known_identity[0] != source_province and not placeholder_label:
                    reasons.append("facility_name_is_verified_in_another_province")
                if not reasons:
                    continue
                excluded = any(reason in reasons for reason in (
                    "template_placeholder_name", "district_belongs_to_another_province",
                    "district_not_in_national_roster", "facility_name_is_verified_in_another_province",
                ))
                if excluded:
                    invalid_blocks.add((str(source["path"]), ws.title.strip(), quantity_col))
                findings.append({
                    "submissionProvince": source_province,
                    "sheet": ws.title.strip(),
                    "districtAsEntered": str(district_text or ""),
                    "facilityAsEntered": facility_text,
                    "verifiedProvince": expected_province,
                    "reasons": reasons,
                    "correctedDistrict": known_identity[1] if correctable_local_district else None,
                    "excludedFromMetrics": excluded,
                    "sourceWorkbook": source["path"].name,
                })
        workbook.close()
    findings.sort(key=lambda item: (item["submissionProvince"], item["sheet"], item["districtAsEntered"], item["facilityAsEntered"]))
    return findings, invalid_blocks

def load_generator():
    spec = importlib.util.spec_from_file_location("tracer_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module

def load_periods(path):
    return json.loads(path.read_text(encoding="utf-8"))["tracerReportingPeriods"]

def compact_bootstrap(period):
    keys = (
        "id", "reportDate", "label", "month", "week", "source", "counts", "national",
        "provinces", "districts", "facilityLevels", "programmes", "programmeScopes",
        "commodities", "missingFacilities",
    )
    bootstrap = {key: period[key] for key in keys}
    bootstrap["facilities"] = []
    bootstrap["dataQuality"] = {"provinces": [], "districts": [], "facilityTypes": []}
    return bootstrap

def main():
    missing = [name for name in FILES.values() if not (DIRECTORY / name).is_file()]
    if missing:
        raise FileNotFoundError("Missing expected Week 2 submission(s): " + ", ".join(missing))

    generator = load_generator()
    generator.RAW_FACILITY_IDENTITIES.clear()
    generator.RAW_FACILITY_IDENTITIES.update(generator.load_raw_facility_identities())
    # Provincial templates may embed malformed font metadata in decorative
    # drawings. The facility matrix parser does not use charts or images.
    generator.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
    sources = [
        {"province": province, "path": DIRECTORY / filename, "primaryCareSummaryLayout": True}
        for province, filename in FILES.items()
    ]
    province_facility_findings, invalid_source_blocks = audit_province_facility_blocks(generator, sources)
    normalized_rows = list(normalize_week2_rows(generator, sources, "2026-10-18", invalid_source_blocks))
    period = generator.summarize({
        "rows": normalized_rows,
        "includeZeroQuantityWithData": True,
        "source": "October Week 2: eight of ten provincial submissions received; SOH normalized to whole units",
        "reportDate": "2026-10-18",
        "label": "Week 2 - 18 October 2026",
        "month": "2026-10",
        "week": "Week 2",
    })
    print("Facility-block reporting classification: " + json.dumps(normalize_week2_rows.last_stats, sort_keys=True))
    expected_provinces = set(FILES)
    actual_provinces = {row["name"] for row in period["provinces"]}
    if actual_provinces != expected_provinces:
        raise ValueError(f"Province attribution mismatch: expected {sorted(expected_provinces)}, got {sorted(actual_provinces)}")
    if period["counts"]["provinces"] != 8 or period["counts"]["rows"] <= 0:
        raise ValueError(f"Week 2 submission audit failed: {period['counts']}")

    historical = [p for path in DATA_MODULES for p in load_periods(path) if p["id"] not in {"2026-10-11", "2026-10-18"}]
    periods = sorted(historical + [p for path in DATA_MODULES for p in load_periods(path) if p["id"] == "2026-10-11"] + [period], key=lambda p: p["reportDate"])
    expected_districts = {
        (province, district)
        for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items()
        for district in districts
    }
    expected_facilities = {
        (f["province"], f["district"], f["facilityLevel"], f["name"])
        for p in periods for f in p.get("facilities", [])
        if f["district"] != "UNKNOWN" and (
            f["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
            or generator.facility_belongs_to_reporting_district(f["province"], f["district"], f["name"])
        )
    }
    generator.build_reporting_quality(periods, expected_districts, expected_facilities)
    historical_reporting = {}
    for previous in periods:
        if previous["reportDate"] >= period["reportDate"]:
            continue
        for facility in previous.get("facilities", []):
            identity = (
                generator.normalize_province(facility.get("province")),
                generator.normalize_district(facility.get("district")),
                generator.canonical_facility_level(facility.get("facilityLevel")),
                generator.facility_match_key(facility.get("name")),
            )
            historical_reporting.setdefault(identity, []).append(previous["reportDate"])
    blank_block_review = []
    for block in normalize_week2_rows.last_stats["allMetricBlankBlockDetails"]:
        identity = (
            generator.normalize_province(block.get("province")),
            generator.normalize_district(block.get("district")),
            generator.canonical_facility_level(block.get("facilityLevel")),
            generator.facility_match_key(block.get("facility")),
        )
        prior_dates = historical_reporting.get(identity, [])
        blank_block_review.append({
            **block,
            "priorReportingPeriods": len(prior_dates),
            "lastPriorReportDate": prior_dates[-1] if prior_dates else None,
            "status": "historically_expected_nonreport" if prior_dates else "not_expected_by_history",
        })
    period["dataQuality"]["facilityBlockReportingReview"] = {
        "rule": "Ignore blank-name template blocks. Treat a named block with SOH, AMC and MOS all blank as nonreporting only when the same province, district and service unit has prior reporting evidence. Specialty services such as MDR-TB are expected only where local history supports them.",
        "unnamedBlankBlocks": "ignored by source parser",
        "namedBlankBlocks": blank_block_review,
        "historicallyExpectedNonreports": sum(item["status"] == "historically_expected_nonreport" for item in blank_block_review),
        "notExpectedByHistory": sum(item["status"] == "not_expected_by_history" for item in blank_block_review),
    }
    period["dataQuality"]["facilityProvinceValidation"] = {
        "rule": "A named facility or district must match the submitting province. Known facility identities and the national district roster are used to detect template names copied from another province.",
        "flaggedBlocks": province_facility_findings,
        "excludedBlockCount": len(invalid_source_blocks),
        "excludedFromMetrics": True,
    }
    october_periods = [p for p in periods if p["month"] == "2026-10"]
    OUTPUT.write_text(json.dumps({"tracerReportingPeriods": october_periods}, separators=(",", ":")), encoding="utf-8")
    BOOTSTRAP.write_text(
        "// Compact latest-period fallback. Full history is fetched from public/data at runtime.\n"
        + "export const tracerBootstrapPeriod = "
        + json.dumps(compact_bootstrap(period), separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "counts": period["counts"],
        "provinces": sorted(actual_provinces),
        "missingProvinces": sorted(set(generator.VALID_DISTRICTS_BY_PROVINCE) - actual_provinces),
        "dataQualityDistrictRows": len(period["dataQuality"]["districts"]),
        "national": period["national"],
    }, indent=2))

if __name__ == "__main__":
    main()
