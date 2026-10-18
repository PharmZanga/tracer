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
}

# Week 2 source normalization parameters. Stock-on-hand values are whole units;
# dash markers and negative quantities mean zero. Availability must be derived
# from the Quantity field (never AMC/MOS) and use the commodity rows in scope.
WEEK2_PARAMETERS = {
    "quantityField": "QUANTITY",
    "dashStockOnHandIsZero": True,
    "negativeStockOnHandIsZero": True,
    "stockOnHandRounding": "floor",
    "mosDerivedFromNormalizedStockOnHand": True,
    "availabilityCountsPositiveStockOnHand": True,
    "availabilityDenominator": "commodity_rows_in_scope",
}

def normalize_week2_rows(generator, sources, report_date):
    """Apply the requested whole-unit SOH rule before any aggregate is built."""
    for source in sources:
        for row in generator.iter_raw_matrix_rows(source, report_date):
            quantity = generator.num(row.get("QUANTITY"))
            raw_quantity = row.get("_RAW_QUANTITY_INPUT")
            row["_SOURCE_QUANTITY"] = quantity
            row["_SOURCE_MOS"] = generator.num(row.get("MOS"))
            # A dash entered in SOH is an explicit zero. True blanks stay
            # missing. Negative values and positive fractions become whole
            # non-negative units; fractions are never rounded upward.
            if isinstance(raw_quantity, str) and raw_quantity.strip() in {"-", "–", "—"}:
                quantity = 0
            if quantity is not None:
                quantity = max(0, int(quantity))
            amc = generator.num(row.get("AMC"))
            row["QUANTITY"] = quantity
            row["MOS"] = quantity / amc if quantity is not None and amc is not None and amc > 0 else None
            # Keep missing SOH in the availability denominator as unavailable,
            # matching the dashboard's established reporting convention.
            row["AVAILABILITY"] = 1 if quantity is not None and quantity > 0 else 0
            yield row

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
    # Provincial templates may embed malformed font metadata in decorative
    # drawings. The facility matrix parser does not use charts or images.
    generator.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
    sources = [
        {"province": province, "path": DIRECTORY / filename, "primaryCareSummaryLayout": True}
        for province, filename in FILES.items()
    ]
    period = generator.summarize({
        "rows": normalize_week2_rows(generator, sources, "2026-10-18"),
        "includeZeroQuantityWithData": True,
        "source": "October Week 2: seven of ten provincial submissions received; SOH normalized to whole units",
        "reportDate": "2026-10-18",
        "label": "Week 2 - 18 October 2026",
        "month": "2026-10",
        "week": "Week 2",
    })
    expected_provinces = set(FILES)
    actual_provinces = {row["name"] for row in period["provinces"]}
    if actual_provinces != expected_provinces:
        raise ValueError(f"Province attribution mismatch: expected {sorted(expected_provinces)}, got {sorted(actual_provinces)}")
    if period["counts"]["provinces"] != 7 or period["counts"]["rows"] <= 0:
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
