"""Rebuild published 2026 tracer data using the zero-only reporting-block rule."""

from __future__ import annotations

import gc
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_tracer_facility_data.py"
DATA_DIRECTORY = ROOT / "public" / "data" / "tracer" / "2026"
DATASETS = ["jan-feb.json", "mar-apr.json", "may-jun.json", "jul-aug.json", "sep.json"]
BOOTSTRAP = ROOT / "src" / "tracerBootstrap.js"


def load_generator():
    spec = importlib.util.spec_from_file_location("tracer_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def load_dataset(path):
    return json.loads(path.read_text(encoding="utf-8"))["tracerReportingPeriods"]


def period_rows(period):
    dictionaries = period["commodityFacilityData"]["dictionaries"]
    aggregate_keys = {
        (facility["province"], facility["district"], facility["facilityLevel"], facility["name"]): facility.get("isAggregate", False)
        for facility in period.get("facilities", [])
    }
    rows = []
    for province, district, level, facility, item, programme, quantity, amc, mos in period["commodityFacilityData"]["rows"]:
        province_name = dictionaries["provinces"][province]
        district_name = dictionaries["districts"][district]
        level_name = dictionaries["levels"][level]
        facility_name = dictionaries["facilities"][facility]
        rows.append({
            "DATE": period["reportDate"],
            "PROVINCE": province_name,
            "DISTRICT": district_name,
            "FACILITY LEVEL": level_name,
            "FACILITY NAME": facility_name,
            "PROGRAM": dictionaries["programmes"][programme],
            "DESCRIPTION OF ITEM": dictionaries["items"][item],
            "QUANTITY": quantity,
            "AMC": amc,
            "MOS": mos,
            "AVAILABILITY": 1 if (quantity or 0) > 0 else 0,
            "_RAW_AGGREGATE": aggregate_keys.get((province_name, district_name, level_name, facility_name), False),
        })
    return rows


def compact_bootstrap(period):
    keys = ("id", "reportDate", "label", "month", "week", "source", "counts", "national", "provinces", "districts", "facilityLevels", "programmes", "programmeScopes", "commodities", "missingFacilities")
    return {key: period[key] for key in keys} | {"facilities": [], "dataQuality": {"provinces": [], "districts": [], "facilityTypes": []}}


def main():
    generator = load_generator()
    target_datasets = sys.argv[1:] or DATASETS
    invalid_targets = set(target_datasets) - set(DATASETS)
    if invalid_targets:
        raise ValueError(f"Unknown tracer dataset(s): {sorted(invalid_targets)}")
    expected_districts = {
        (province, district)
        for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items()
        for district in districts
    }
    expected_facilities = set()
    expected_named_facilities = set(generator.EXPECTED_NAMED_REPORTING_UNITS)
    expected_facilities.update(generator.EXPECTED_NAMED_REPORTING_UNITS)

    # Read only reporting metadata first. Commodity rows are deliberately not
    # retained between files, which keeps this corrective rebuild below the
    # deployment memory ceiling.
    for filename in DATASETS:
        periods = load_dataset(DATA_DIRECTORY / filename)
        for period in periods:
            expected_named_facilities.update(
                (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
                for facility in period.get("dataQuality", {}).get("facilities", [])
            )
            expected_facilities.update(
                (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
                for facility in period["facilities"]
                if facility["district"] != "UNKNOWN" and (
                    facility["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
                    or generator.facility_belongs_to_reporting_district(facility["province"], facility["district"], facility["name"])
                )
            )
        del periods
        gc.collect()

    total_periods = 0
    total_rows = 0
    latest = None
    for filename in target_datasets:
        rebuilt_periods = []
        periods = load_dataset(DATA_DIRECTORY / filename)
        for period in periods:
            rebuilt = generator.summarize({
                "rows": period_rows(period),
                "reportDate": period["reportDate"],
                "label": period["label"],
                "month": period["month"],
                "week": period["week"],
                "source": period["source"],
            })
            generator.build_reporting_quality(
                [rebuilt],
                expected_districts,
                expected_facilities,
                expected_named_facilities,
            )
            rebuilt_periods.append(rebuilt)

        (DATA_DIRECTORY / filename).write_text(
            json.dumps({"tracerReportingPeriods": rebuilt_periods}, separators=(",", ":")),
            encoding="utf-8",
        )
        total_periods += len(rebuilt_periods)
        total_rows += sum(period["counts"]["rows"] for period in rebuilt_periods)
        latest = rebuilt_periods[-1]
        del periods
        del rebuilt_periods
        gc.collect()

    assert latest is not None
    if "sep.json" in target_datasets:
        BOOTSTRAP.write_text(
            "// Compact latest-period fallback. Full history is fetched from public/data at runtime.\n"
            + "export const tracerBootstrapPeriod = "
            + json.dumps(compact_bootstrap(latest), separators=(",", ":"))
            + ";\n",
            encoding="utf-8",
        )
    print(f"Rebuilt {total_periods} reporting periods with {total_rows:,} submitted commodity rows.")


if __name__ == "__main__":
    main()
