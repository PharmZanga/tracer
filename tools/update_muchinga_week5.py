"""Replace Muchinga only with its revised September Week 5 source workbook."""
import json
import sys
from pathlib import Path

from rebuild_tracer_reporting_evidence import (
    BOOTSTRAP, DATA_DIRECTORY, DATASETS, compact_bootstrap,
    load_dataset, load_generator, period_rows,
)


def main():
    generator = load_generator()
    periods = load_dataset(DATA_DIRECTORY / "sep.json")
    index = next(i for i, p in enumerate(periods) if p["id"] == "2026-10-04")
    original = periods[index]
    retained = [r for r in period_rows(original) if r["PROVINCE"] != "MUCHINGA PROVINCE"]
    revised = list(generator.iter_raw_matrix_rows({
        "province": "MUCHINGA PROVINCE", "path": Path(sys.argv[1]),
        "primaryCareSummaryLayout": True,
    }, original["reportDate"]))
    replacement = generator.summarize({
        **{key: original[key] for key in ("reportDate", "label", "month", "week", "source")},
        "rows": retained + revised,
    })
    expected_districts = {(p, d) for p, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items() for d in districts}
    expected_facilities = set(generator.EXPECTED_NAMED_REPORTING_UNITS)
    expected_named = set(generator.EXPECTED_NAMED_REPORTING_UNITS)
    for filename in DATASETS:
        for period in load_dataset(DATA_DIRECTORY / filename):
            expected_named.update((f["province"], f["district"], f["facilityLevel"], f["name"]) for f in period.get("dataQuality", {}).get("facilities", []))
            expected_facilities.update((f["province"], f["district"], f["facilityLevel"], f["name"]) for f in period["facilities"] if f["district"] != "UNKNOWN" and (f["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"} or generator.facility_belongs_to_reporting_district(f["province"], f["district"], f["name"])))
    generator.build_reporting_quality([replacement], expected_districts, expected_facilities, expected_named)
    actual_retained = [r for r in period_rows(replacement) if r["PROVINCE"] != "MUCHINGA PROVINCE"]
    normalize = lambda rows: sorted(json.dumps(r, sort_keys=True) for r in rows)
    assert normalize(retained) == normalize(actual_retained), "Other provinces changed"
    periods[index] = replacement
    (DATA_DIRECTORY / "sep.json").write_text(json.dumps({"tracerReportingPeriods": periods}, separators=(",", ":")), encoding="utf-8")
    BOOTSTRAP.write_text("// Compact latest-period fallback. Full history is fetched from public/data at runtime.\nexport const tracerBootstrapPeriod = " + json.dumps(compact_bootstrap(periods[-1]), separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps(replacement["counts"]))


if __name__ == "__main__":
    main()
