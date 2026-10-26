"""Import October Week 3 without rewriting any previously published period."""

from collections import defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path

from import_october_week2 import (
    BOOTSTRAP, DATA_MODULES, OUTPUT, ROOT, audit_province_facility_blocks,
    compact_bootstrap, load_generator, load_periods, normalize_week2_rows,
)

DIRECTORY = Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\october\week 3")
REPORT_DATE = "2026-10-25"
SOURCE = "October Week 3: all ten provincial submissions received; SOH normalized to whole units; blank and all-zero SOH blocks excluded"
AUDIT = ROOT / "outputs/october-week3-province-audit/source-audit.json"
FILES = {
    "LUSAKA PROVINCE": "23.10.2026-LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES.xlsx",
    "WESTERN PROVINCE": "24-10-26 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT  (2).xlsx",
    "COPPERBELT PROVINCE": "25.10.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx",
    "LUAPULA PROVINCE": "25.10.26_LUAPULA PROVINCE 2026 TRACER WEEKLY REPORT.xlsx",
    "NORTHERN PROVINCE": "25.10.2026-NORTHERN PROVINCE 2024 TRACER WEEKLY REPORT PROVINCES.xlsx",
    "CENTRAL PROVINCE": "25_10_2026 CENTRAL PROVINCE 2026 TRACER WEEKLY REPORT.xlsx",
    "NORTH-WESTERN PROVINCE": "25-10-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES (2).xlsx",
    "EASTERN PROVINCE": "25th Oct EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (46).xlsx",
    "MUCHINGA PROVINCE": "MUCHINGA 23_10_2026.xlsx",
    "SOUTHERN PROVINCE": "SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 23.10.26 (1).xlsx",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def block_key(row):
    return tuple(row.get(key) for key in ("_RAW_SOURCE_WORKBOOK", "_RAW_SOURCE_SHEET", "_RAW_SOH_COLUMN"))


def exclude_all_zero_soh_blocks(rows):
    """Positive AMC alone does not turn a zero-SOH template into a submission."""
    blocks = defaultdict(list)
    for row in rows:
        blocks[block_key(row)].append(row)
    included, excluded = [], []
    for block_rows in blocks.values():
        if any((row.get("QUANTITY") or 0) > 0 for row in block_rows):
            included.extend(block_rows)
            continue
        first = block_rows[0]
        excluded.append({
            "province": first["PROVINCE"], "district": first["DISTRICT"],
            "facilityLevel": first["FACILITY LEVEL"], "facility": first["FACILITY NAME"],
            "workbook": Path(first["_RAW_SOURCE_WORKBOOK"]).name,
            "sheet": first["_RAW_SOURCE_SHEET"], "quantityColumn": first["_RAW_SOH_COLUMN"],
            "excludedRows": len(block_rows), "reason": "No positive SOH in the entire reporting block",
        })
    return included, excluded


def source_number(value):
    if value is None or str(value).strip() in {"", "-", "\u2013", "\u2014"}:
        return None
    try:
        return float(Decimal(str(value).strip().replace(",", "")))
    except InvalidOperation:
        return None


def verify_source_samples(generator, normalized, period):
    """Re-open Excel and verify saved numeric values at concrete source cells."""
    data = period["commodityFacilityData"]
    names = ("provinces", "districts", "levels", "facilities", "items")
    published = defaultdict(list)
    for row in data["rows"]:
        identity = tuple(data["dictionaries"][name][row[index]] for index, name in enumerate(names))
        published[identity].append(row[6:9])
    samples, coverage = [], []
    for province, filename in FILES.items():
        available = [row for row in normalized if row["PROVINCE"] == province and tuple(row.get(key) for key in ("PROVINCE", "DISTRICT", "FACILITY LEVEL", "FACILITY NAME", "DESCRIPTION OF ITEM")) in published]
        chosen = []
        for predicate in (
            lambda row: "ringer" in row["DESCRIPTION OF ITEM"].lower(),
            lambda row: "sodium chloride" in row["DESCRIPTION OF ITEM"].lower() or "saline" in row["DESCRIPTION OF ITEM"].lower(),
            lambda row: (row.get("QUANTITY") or 0) > 0,
            lambda row: row.get("QUANTITY") == 0,
            lambda row: isinstance(row.get("_RAW_QUANTITY_INPUT"), str),
            lambda row: row.get("_SOURCE_QUANTITY") is not None and row["_SOURCE_QUANTITY"] != row.get("QUANTITY"),
        ):
            found = next((row for row in available if predicate(row) and row not in chosen), None)
            if found:
                chosen.append(found)
        chosen.extend(row for row in available if row.get("QUANTITY") is None and row not in chosen)
        if not chosen:
            raise ValueError(f"No source-verifiable sample for {province}")
        workbook = generator.openpyxl.load_workbook(DIRECTORY / filename, data_only=True, read_only=False)
        for sheet in workbook.worksheets:
            if sheet.title.strip().upper() not in {"HC", "HP"}:
                continue
            headers = [(r, c) for r in range(1, 7) for c in range(4, sheet.max_column - 1)
                       if "AMC" in str(sheet.cell(r, c + 1).value or "").upper()
                       and "MOS" in str(sheet.cell(r, c + 2).value or "").upper()]
            positives = sum(1 for header, column in headers for index in range(header + 1, sheet.max_row + 1)
                            if sheet.cell(index, 2).value
                            and not any(token in str(sheet.cell(index, 2).value).upper() for token in ("PERCENTAGE AVAILABILITY", "AVERAGE MONTH"))
                            and (source_number(sheet.cell(index, column).value) or 0) > 0)
            parsed = sum(1 for row in normalized if row["PROVINCE"] == province and row["_RAW_SOURCE_SHEET"] == sheet.title.strip())
            if positives and not parsed:
                raise ValueError(f"Primary-care sheet contains positive SOH but was not imported: {filename}/{sheet.title}")
            coverage.append({"province": province, "workbook": filename, "sheet": sheet.title,
                             "positiveSourceSOHCells": positives, "normalizedRecords": parsed})
        for row in chosen:
            sheet = workbook[row["_RAW_SOURCE_SHEET"]]
            column = row["_RAW_SOH_COLUMN"]
            source_row = next((index for index in range(4, sheet.max_row + 1)
                               if str(generator.clean(sheet.cell(index, 2).value)) == row["DESCRIPTION OF ITEM"]
                               and sheet.cell(index, column).value == row["_RAW_QUANTITY_INPUT"]), None)
            if source_row is None:
                raise ValueError(f"Source cell not found: {province}/{sheet.title}/{row['DESCRIPTION OF ITEM']}")
            quantity_cell = sheet.cell(source_row, column)
            amc_cell = sheet.cell(source_row, column + 1)
            raw_quantity = source_number(quantity_cell.value)
            blank_or_dash = quantity_cell.value is None or str(quantity_cell.value).strip() in {"", "-", "\u2013", "\u2014"}
            quantity = max(0, int(raw_quantity)) if raw_quantity is not None else 0 if blank_or_dash else None
            amc = source_number(amc_cell.value)
            mos = quantity / amc if quantity is not None and amc is not None and amc > 0 else None
            identity = tuple(row.get(key) for key in ("PROVINCE", "DISTRICT", "FACILITY LEVEL", "FACILITY NAME", "DESCRIPTION OF ITEM"))
            if [quantity, amc, mos] not in published[identity]:
                raise ValueError(f"Published values differ from Excel: {filename}/{sheet.title}/{quantity_cell.coordinate}")
            samples.append({
                "province": province, "workbook": filename, "sheet": sheet.title,
                "quantityCell": quantity_cell.coordinate, "amcCell": amc_cell.coordinate,
                "commodity": row["DESCRIPTION OF ITEM"], "facility": row["FACILITY NAME"],
                "district": row["DISTRICT"], "sourceQuantity": quantity_cell.value,
                "sourceAMC": amc_cell.value, "publishedSOH": quantity, "publishedAMC": amc,
                "publishedMOS": mos, "matched": True,
            })
        workbook.close()
        print(f"Verified {len(chosen)} Excel source-cell samples: {province}", flush=True)
    return samples, coverage


def main():
    for name in FILES.values():
        if not (DIRECTORY / name).is_file():
            raise FileNotFoundError(DIRECTORY / name)
    manifests = [{"province": province, "filename": filename, "sha256": digest(DIRECTORY / filename), "bytes": (DIRECTORY / filename).stat().st_size} for province, filename in FILES.items()]
    historical_hashes = {str(path.relative_to(ROOT)).replace("\\", "/"): digest(path) for path in DATA_MODULES if path != OUTPUT}
    october = json.loads(OUTPUT.read_text(encoding="utf-8"))
    prior_october = [p for p in october["tracerReportingPeriods"] if p["id"] != REPORT_DATE]
    generator = load_generator()
    generator.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
    print("Loading verified facility identities", flush=True)
    generator.RAW_FACILITY_IDENTITIES.clear()
    generator.RAW_FACILITY_IDENTITIES.update(generator.load_raw_facility_identities())
    sources = [{"province": province, "path": DIRECTORY / filename, "primaryCareSummaryLayout": True} for province, filename in FILES.items()]
    print("Auditing provincial facility headers", flush=True)
    findings, invalid_blocks = audit_province_facility_blocks(generator, sources)
    print("Reading and normalizing Week 3 stock matrices", flush=True)
    normalized = list(normalize_week2_rows(generator, sources, REPORT_DATE, invalid_blocks))
    normalization = normalize_week2_rows.last_stats
    normalized, zero_blocks = exclude_all_zero_soh_blocks(normalized)
    period = generator.summarize({"rows": normalized, "source": SOURCE, "reportDate": REPORT_DATE, "label": "Week 3 - 25 October 2026", "month": "2026-10", "week": "Week 3"})
    if {row["name"] for row in period["provinces"]} != set(FILES):
        raise ValueError("All ten provinces must have source-supported observations")
    history = sorted([p for path in DATA_MODULES for p in load_periods(path) if p["id"] < REPORT_DATE], key=lambda p: p["reportDate"])
    expected_districts = {(province, district) for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items() for district in districts}
    expected_facilities = {(f["province"], f["district"], f["facilityLevel"], f["name"]) for p in history + [period] for f in p.get("facilities", []) if f["district"] != "UNKNOWN" and (f["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"} or generator.facility_belongs_to_reporting_district(f["province"], f["district"], f["name"]))}
    generator.build_reporting_quality(history + [period], expected_districts, expected_facilities)
    if len(period["dataQuality"]["districts"]) != 116:
        raise ValueError("The district roster must contain exactly 116 districts")
    period["sourceWorkbooks"] = manifests
    period["dataQuality"]["districtNameNormalization"] = "DISTRICT and DHO suffixes are removed only before matching the submitting province's official district roster."
    period["dataQuality"]["facilityProvinceValidation"] = {"rule": "Facility and district identities must belong to the submitting province", "flaggedBlocks": findings, "excludedBlockCount": len(invalid_blocks), "excludedFromMetrics": True}
    period["dataQuality"]["facilityBlockReportingReview"] = {
        "rule": "Blank SOH blocks and blocks with no positive normalized SOH are not submissions, even if AMC is present. District reporting requires both HC and HP, or valid combined evidence.",
        "allMetricBlankBlocks": normalization["allMetricBlankBlockDetails"],
        "allSOHBlankBlocks": normalization["allSOHBlankBlockDetails"],
        "allZeroSOHBlocks": zero_blocks,
        "allZeroSOHBlocksExcludedFromStockMetrics": True,
    }
    invalid_soh = [{"province": row["PROVINCE"], "district": row["DISTRICT"], "facility": row["FACILITY NAME"], "commodity": row["DESCRIPTION OF ITEM"], "workbook": Path(row["_RAW_SOURCE_WORKBOOK"]).name, "sheet": row["_RAW_SOURCE_SHEET"], "quantityColumn": row["_RAW_SOH_COLUMN"], "sourceValue": row["_RAW_QUANTITY_INPUT"]} for row in normalized if row.get("QUANTITY") is None]
    period["dataQuality"]["stockCalculationAudit"] = {"rule": "SOH floored to whole units; within a reported block blank, dash and negative SOH become zero; unreadable nonblank SOH remains missing; MOS recalculated as SOH / positive AMC", "provinces": normalization.get("calculationByProvince", {}), "invalidSOHRecords": invalid_soh}
    samples, coverage = verify_source_samples(generator, normalized, period)
    period["dataQuality"]["primaryCareSourceCoverage"] = coverage
    for manifest in manifests:
        if digest(DIRECTORY / manifest["filename"]) != manifest["sha256"]:
            raise ValueError("A source workbook changed during import")
    audit = {"reportDate": REPORT_DATE, "source": SOURCE, "sourceWorkbooks": manifests, "counts": period["counts"], "national": period["national"], "provinces": period["provinces"], "normalization": normalization, "invalidSOHRecords": invalid_soh, "allZeroSOHBlocksExcluded": zero_blocks, "facilityProvinceValidation": period["dataQuality"]["facilityProvinceValidation"], "sourceCellSamples": samples, "primaryCareSourceCoverage": coverage, "historicalDatasetHashes": historical_hashes, "preservedOctoberPeriods": [p["id"] for p in prior_october], "sourceWorkbooksUnchanged": True}
    october["tracerReportingPeriods"] = sorted(prior_october + [period], key=lambda p: p["reportDate"])
    OUTPUT.write_text(json.dumps(october, separators=(",", ":")), encoding="utf-8")
    BOOTSTRAP.write_text("// Compact latest-period fallback. Full history is fetched from public/data at runtime.\nexport const tracerBootstrapPeriod = " + json.dumps(compact_bootstrap(period), separators=(",", ":")) + ";\n", encoding="utf-8")
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    if any(digest(ROOT / path) != value for path, value in historical_hashes.items()):
        raise ValueError("A historical dataset was unexpectedly modified")
    print(json.dumps({"reportDate": REPORT_DATE, "counts": period["counts"], "national": period["national"], "sourceSamplesVerified": len(samples), "zeroSOHBlocksExcluded": len(zero_blocks), "provinceBlocksExcluded": len(invalid_blocks), "audit": str(AUDIT)}, indent=2), flush=True)


if __name__ == "__main__":
    main()
