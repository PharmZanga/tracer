"""Add the verified September Week 2 provincial submissions to the dashboard."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "tracerFacilityDataSep.js"
GENERATOR = ROOT / "tools" / "generate_tracer_facility_data.py"
DATA_MODULES = [
    ROOT / "src" / "tracerFacilityDataJanFeb.js",
    ROOT / "src" / "tracerFacilityDataMarApr.js",
    ROOT / "src" / "tracerFacilityDataMayJun.js",
    ROOT / "src" / "tracerFacilityDataJul.js",
    OUTPUT,
]


def load_generator():
    spec = importlib.util.spec_from_file_location("tracer_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def load_periods(path):
    prefix = "export const tracerReportingPeriods = "
    content = path.read_text(encoding="utf-8").strip()
    if not content.startswith(prefix) or not content.endswith(";"):
        raise ValueError(f"Unexpected data module format: {path}")
    return json.loads(content[len(prefix):-1])


def reporting_expectations(generator, periods):
    expected_districts = {
        (province, district)
        for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items()
        for district in districts
    }
    expected_facilities = {
        (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
        for period in periods
        for facility in period["facilities"]
        if facility["district"] != "UNKNOWN"
        and (
            facility["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
            or generator.facility_belongs_to_reporting_district(
                facility["province"], facility["district"], facility["name"]
            )
        )
    }
    return expected_districts, expected_facilities


def main():
    generator = load_generator()
    week_two = generator.summarize(generator.SEPTEMBER_WEEK2_CONFIG)
    if week_two["counts"]["provinces"] != 10 or week_two["counts"]["districts"] != 116:
        raise ValueError(f"Week 2 geography failed: {week_two['counts']}")

    periods = [period for path in DATA_MODULES for period in load_periods(path) if period["id"] != week_two["id"]]
    periods.append(week_two)
    periods.sort(key=lambda period: period["reportDate"])
    expected_districts, expected_facilities = reporting_expectations(generator, periods)
    generator.build_reporting_quality(periods, expected_districts, expected_facilities)
    september_periods = [period for period in periods if period["month"] >= "2026-09"]
    OUTPUT.write_text(
        "export const tracerReportingPeriods = " + json.dumps(september_periods, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Imported {week_two['label']}: {week_two['counts']}")


if __name__ == "__main__":
    main()
