"""Add the verified September Week 5 provincial submissions to the dashboard."""

from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "tracer" / "2026" / "sep.json"
BOOTSTRAP = ROOT / "src" / "tracerBootstrap.js"
GENERATOR = ROOT / "tools" / "generate_tracer_facility_data.py"
EASTERN_SOURCE = Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\september\week 5\3rd Oct EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (42).xls")
EASTERN_CONVERTED = ROOT / "tmp" / "eastern-september-week5.xlsx"
DATA_MODULES = [
    ROOT / "public" / "data" / "tracer" / "2026" / "jan-feb.json",
    ROOT / "public" / "data" / "tracer" / "2026" / "mar-apr.json",
    ROOT / "public" / "data" / "tracer" / "2026" / "may-jun.json",
    ROOT / "public" / "data" / "tracer" / "2026" / "jul-aug.json",
    OUTPUT,
]


def load_generator():
    spec = importlib.util.spec_from_file_location("tracer_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def load_periods(path):
    return json.loads(path.read_text(encoding="utf-8"))["tracerReportingPeriods"]


def reporting_expectations(generator, periods):
    expected_districts = {(province, district) for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items() for district in districts}
    expected_facilities = {
        (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
        for period in periods
        for facility in period["facilities"]
        if facility["district"] != "UNKNOWN" and (
            facility["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
            or generator.facility_belongs_to_reporting_district(facility["province"], facility["district"], facility["name"])
        )
    }
    return expected_districts, expected_facilities


def compact_bootstrap(period):
    return {key: period[key] for key in ("id", "reportDate", "label", "month", "week", "source", "counts", "national", "provinces", "districts", "facilityLevels", "programmes", "programmeScopes", "commodities", "missingFacilities")} | {"facilities": [], "dataQuality": {"provinces": [], "districts": [], "facilityTypes": []}}


def main():
    subprocess.run(["node", str(ROOT / "tools" / "convert_xls_workbook.mjs"), str(EASTERN_SOURCE), str(EASTERN_CONVERTED)], check=True)
    generator = load_generator()
    week_five = generator.summarize(generator.SEPTEMBER_WEEK5_CONFIG)
    if week_five["counts"]["provinces"] != 10 or week_five["counts"]["districts"] != 116:
        raise ValueError(f"Week 5 geography failed: {week_five['counts']}")

    periods = [period for path in DATA_MODULES for period in load_periods(path) if period["id"] != week_five["id"]]
    periods.append(week_five)
    periods.sort(key=lambda period: period["reportDate"])
    expected_districts, expected_facilities = reporting_expectations(generator, periods)
    generator.build_reporting_quality(periods, expected_districts, expected_facilities)
    OUTPUT.write_text(json.dumps({"tracerReportingPeriods": [period for period in periods if period["month"] >= "2026-09"]}, separators=(",", ":")), encoding="utf-8")
    BOOTSTRAP.write_text("// Compact latest-period fallback. Full history is fetched from public/data at runtime.\nexport const tracerBootstrapPeriod = " + json.dumps(compact_bootstrap(week_five), separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Imported {week_five['label']}: {week_five['counts']}")


if __name__ == "__main__":
    main()
