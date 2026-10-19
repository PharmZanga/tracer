"""Recalculate 2026 historical tracer periods with the current SOH/MOS rules.

The compact JSON rows preserve the stock and AMC values used by the dashboard.
This backfill rebuilds all period summaries and facility action lists from those
rows, from January 2026 through the latest published period.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_tracer_facility_data.py"
DATA_FILES = [
    ROOT / "public/data/tracer/2026/jan-feb.json",
    ROOT / "public/data/tracer/2026/mar-apr.json",
    ROOT / "public/data/tracer/2026/may-jun.json",
    ROOT / "public/data/tracer/2026/jul-aug.json",
    ROOT / "public/data/tracer/2026/sep.json",
    ROOT / "public/data/tracer/2026/oct.json",
]
BOOTSTRAP = ROOT / "src" / "tracerBootstrap.js"

def load_generator():
    spec = importlib.util.spec_from_file_location("tracer_backdate_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    # Historical source files can carry malformed decorations; this pass reads
    # the already extracted compact data and does not need workbook images.
    module.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
    return module

def recalculate_period(generator, period, availability_overrides):
    packed = period["commodityFacilityData"]
    dictionaries = packed["dictionaries"]
    dict_names = ("provinces", "districts", "levels", "facilities", "items", "programmes")
    aggregate_by_identity = {
        (f["province"], f["district"], f["facilityLevel"], f["name"]): bool(f.get("isAggregate"))
        for f in period.get("facilities", [])
    }
    input_rows = []
    fractional = negative = blank_with_amc = missing_amc = changed_mos = 0
    for record in packed["rows"]:
        province, district, level, facility, item, programme = (
            dictionaries[name][record[index]] for index, name in enumerate(dict_names)
        )
        quantity, amc, source_mos = record[6:9]
        has_positive_amc = isinstance(amc, (int, float)) and amc > 0
        if not has_positive_amc:
            missing_amc += 1
        if quantity is None:
            if has_positive_amc:
                quantity = 0
                blank_with_amc += 1
            else:
                quantity = 0
        elif isinstance(quantity, (int, float)):
            fractional += int(not float(quantity).is_integer())
            negative += int(quantity < 0)
            quantity = max(0, math.floor(quantity))

        mos = (
            quantity / amc
            if isinstance(quantity, (int, float))
            and isinstance(amc, (int, float))
            and amc > 0
            else None
        )
        changed_mos += int(
            (source_mos is None) != (mos is None)
            or (source_mos is not None and mos is not None and abs(source_mos - mos) > 1e-9)
        )
        input_rows.append({
            "DATE": period["reportDate"],
            "PROVINCE": province,
            "DISTRICT": district,
            "FACILITY LEVEL": level,
            "FACILITY NAME": facility,
            "DESCRIPTION OF ITEM": item,
            "PROGRAM": programme,
            "QUANTITY": quantity,
            "AMC": amc,
            "MOS": mos,
            "AVAILABILITY": 1 if isinstance(quantity, (int, float)) and quantity > 0 else 0,
            # Mark already-published rows as in-scope for the summary's
            # submitted-block test. This sentinel is never used as MOS.
            "_SOURCE_QUANTITY": record[6],
            "_SOURCE_MOS": 1 if source_mos is None else source_mos,
            "_RAW_AGGREGATE": aggregate_by_identity.get((province, district, level, facility), False),
        })

    rebuilt = generator.summarize({
        "rows": input_rows,
        "includeZeroQuantityWithData": True,
        "reportDate": period["reportDate"],
        "label": period["label"],
        "month": period["month"],
        "week": period["week"],
        "source": period["source"],
        "availabilityOverrides": availability_overrides,
    })
    if rebuilt["counts"]["rows"] != period["counts"]["rows"]:
        raise ValueError(
            f"{period['reportDate']}: row count changed from {period['counts']['rows']} "
            f"to {rebuilt['counts']['rows']} during recalculation"
        )
    # Preserve submission completeness evidence and other metadata that is
    # independent of stock calculations.
    rebuilt["counts"] = {**period.get("counts", {}), **rebuilt["counts"]}
    for key in ("dataQuality", "missingDistricts", "missingFacilities", "comments"):
        if key in period:
            rebuilt[key] = period[key]
    return rebuilt, {
        "period": period["reportDate"],
        "rows": len(input_rows),
        "blankSOHWithPositiveAMC": blank_with_amc,
        "rowsWithoutPositiveAMC": missing_amc,
        "fractionalSOHFloored": fractional,
        "negativeSOHClipped": negative,
        "MOSRecalculatedOrChanged": changed_mos,
        "nationalMOS": rebuilt["national"]["mos"],
        "stockoutRows": rebuilt["national"]["stockout"],
        "dataGapRows": rebuilt["national"]["dataGap"],
    }

def main():
    generator = load_generator()
    generator.RAW_FACILITY_IDENTITIES.clear()
    generator.RAW_FACILITY_IDENTITIES.update(generator.load_raw_facility_identities())
    # The already-published rows retain the approved SOH and AMC values. Any
    # historical MOS override is superseded by the current universal formula.
    generator.AUTHORITATIVE_COMMODITY_OVERRIDES = {}
    overrides = generator.load_raw_availability_overrides()
    overrides.update(generator.AUTHORITATIVE_AVAILABILITY_OVERRIDES)
    report = {"periods": [], "files": []}
    pending_writes = []
    for path in DATA_FILES:
        dataset = json.loads(path.read_text(encoding="utf-8"))
        revised = []
        for period in dataset["tracerReportingPeriods"]:
            if period["reportDate"] < "2026-01-01":
                revised.append(period)
                continue
            updated, stats = recalculate_period(generator, period, overrides)
            revised.append(updated)
            report["periods"].append(stats)
        pending_writes.append((path, revised))
        report["files"].append({"file": path.name, "periods": len(revised)})

    # Rebuild reporting expectations chronologically for every historical
    # period. A facility/service is expected only after local reporting history
    # establishes it; blank template blocks and services never reported locally
    # must not inflate missing-report counts.
    all_periods = sorted(
        (period for _path, revised in pending_writes for period in revised),
        key=lambda period: period["reportDate"],
    )
    expected_districts = {
        (province, district)
        for province, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items()
        for district in districts
    }
    expected_facilities = {
        (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
        for period in all_periods
        for facility in period.get("facilities", [])
        if facility["district"] != "UNKNOWN" and (
            facility["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
            or generator.facility_belongs_to_reporting_district(
                facility["province"], facility["district"], facility["name"]
            )
        )
    }
    expected_facilities.update(generator.EXPECTED_NAMED_REPORTING_UNITS)
    generator.build_reporting_quality(all_periods, expected_districts, expected_facilities)

    total = {
        key: sum(period[key] for period in report["periods"])
        for key in (
            "rows", "blankSOHWithPositiveAMC", "rowsWithoutPositiveAMC",
            "fractionalSOHFloored", "negativeSOHClipped", "MOSRecalculatedOrChanged",
        )
    }
    report["totals"] = total
    report["reportingRosterRule"] = (
        "Facility/service expectations are province-, district- and service-specific; "
        "they begin with first observed local reporting. Blank-name template blocks "
        "and services without local history are not counted as missing reports."
    )
    # Validate every target period before replacing any dataset file.
    for path, revised in pending_writes:
        path.write_text(
            json.dumps({"tracerReportingPeriods": revised}, separators=(",", ":")),
            encoding="utf-8",
        )
    latest = max(
        (period for _path, revised in pending_writes for period in revised),
        key=lambda period: period["reportDate"],
    )
    compact_keys = (
        "id", "reportDate", "label", "month", "week", "source", "counts", "national",
        "provinces", "districts", "facilityLevels", "programmes", "programmeScopes",
        "commodities", "missingFacilities",
    )
    compact = {key: latest[key] for key in compact_keys}
    compact["facilities"] = []
    compact["dataQuality"] = {"provinces": [], "districts": [], "facilityTypes": []}
    BOOTSTRAP.write_text(
        "// Compact latest-period fallback. Full history is fetched from public/data at runtime.\n"
        + "export const tracerBootstrapPeriod = "
        + json.dumps(compact, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    (ROOT / "outputs" / "tracer-2026-backdate-summary.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps({"files": report["files"], "totals": total}, indent=2))

if __name__ == "__main__":
    main()
