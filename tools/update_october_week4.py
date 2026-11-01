"""Replace only the two newly supplied provincial submissions in October Week 4."""

import json
import re

from import_october_week2 import (
    BOOTSTRAP, DATA_MODULES, OUTPUT, audit_province_facility_blocks,
    compact_bootstrap, load_generator, load_periods, normalize_week2_rows,
)
from import_october_week3 import digest, exclude_all_zero_soh_blocks, province_observations, verify_source_samples
from import_october_week4 import DIRECTORY, FILES, ROOT

DATE = "2026-11-01"
UPDATES = {p: FILES[p] for p in ("COPPERBELT PROVINCE", "NORTH-WESTERN PROVINCE")}
AUDIT = ROOT / "outputs/october-week4-province-audit/source-audit.json"


def decoded_source_rows(period, excluded):
    data = period["commodityFacilityData"]
    fields = ("PROVINCE", "DISTRICT", "FACILITY LEVEL", "FACILITY NAME", "DESCRIPTION OF ITEM", "PROGRAM")
    names = ("provinces", "districts", "levels", "facilities", "items", "programmes")
    aggregate = {(f["province"], f["district"], f["facilityLevel"], f["name"]):
        bool(f.get("isAggregate") or re.search(r" Health (?:Centre|Post) facilities$", f["name"], re.I))
        for f in period["facilities"]}
    for row in data["rows"]:
        if data["dictionaries"]["provinces"][row[0]] in excluded:
            continue
        identity = tuple(data["dictionaries"][name][row[index]] for index, name in enumerate(names[:4]))
        yield {**{field: data["dictionaries"][name][row[index]] for index, (field, name) in enumerate(zip(fields, names))},
               "DATE": DATE, "QUANTITY": row[6], "AMC": row[7], "MOS": row[8], "AVAILABILITY": int(row[6] is not None and row[6] > 0),
               "_RAW_AGGREGATE": aggregate[identity]}


def retained(rows, key="province"):
    return [row for row in rows if row.get(key) not in UPDATES]


def main():
    dataset = json.loads(OUTPUT.read_text(encoding="utf-8"))
    previous = next(p for p in dataset["tracerReportingPeriods"] if p["id"] == DATE)
    old_audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    hashes = {path: digest(ROOT / path) for path in old_audit["historicalDatasetHashes"]}
    old_quality = previous["dataQuality"]
    manifests = {s["province"]: s for s in previous["sourceWorkbooks"]}
    revisions = list(previous.get("sourceRevisions", []))
    for province, filename in UPDATES.items():
        path = DIRECTORY / filename
        current = {"province": province, "filename": filename, "sha256": digest(path), "bytes": path.stat().st_size}
        old = manifests.get(province)
        if not old or old["sha256"] != current["sha256"]:
            revisions.append({"province": province, "change": "replaced" if old else "added", "previousWorkbook": old, "currentWorkbook": current})
        manifests[province] = current

    generator = load_generator()
    generator.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
    print("Loading verified facility identities", flush=True)
    generator.RAW_FACILITY_IDENTITIES.clear()
    generator.RAW_FACILITY_IDENTITIES.update(generator.load_raw_facility_identities())
    sources = [{"province": p, "path": DIRECTORY / name, "primaryCareSummaryLayout": True} for p, name in UPDATES.items()]
    print("Auditing and reading the two new provincial workbooks", flush=True)
    findings, invalid = audit_province_facility_blocks(generator, sources)
    incoming = list(normalize_week2_rows(generator, sources, DATE, invalid))
    normalization = normalize_week2_rows.last_stats
    incoming, zero_blocks = exclude_all_zero_soh_blocks(incoming)
    source = "October Week 4: nine provincial submissions received; North-Western resubmission replaces earlier workbook; Muchinga not submitted; SOH normalized to whole units; blank and all-zero SOH blocks excluded"
    period = generator.summarize({"rows": list(decoded_source_rows(previous, UPDATES)) + incoming, "source": source,
        "reportDate": DATE, "label": previous["label"], "month": previous["month"], "week": previous["week"]})
    if {r["name"] for r in period["provinces"]} != set(manifests):
        raise ValueError("Updated provincial coverage does not match the workbook manifest")
    unchanged = sorted(set(manifests) - set(UPDATES))
    for province in unchanged:
        if province_observations(previous, province) != province_observations(period, province):
            raise ValueError(f"Untouched province changed: {province}")
    history = sorted([p for path in DATA_MODULES for p in load_periods(path) if p["id"] < DATE], key=lambda p: p["reportDate"])
    expected_districts = {(p, d) for p, districts in generator.VALID_DISTRICTS_BY_PROVINCE.items() for d in districts}
    expected_facilities = {(f["province"], f["district"], f["facilityLevel"], f["name"]) for p in history + [period]
        for f in p.get("facilities", []) if f["district"] != "UNKNOWN" and (f["facilityLevel"] in {"HEALTH CENTRE", "HEALTH POST", "PRIMARY CARE - NOT SPECIFIED"}
        or generator.facility_belongs_to_reporting_district(f["province"], f["district"], f["name"]))}
    generator.build_reporting_quality(history + [period], expected_districts, expected_facilities)
    quality = period["dataQuality"]
    quality["provincialSubmissionCoverage"] = {"expected": 10, "submitted": 9, "missingProvinces": ["MUCHINGA PROVINCE"], "carriedForward": False}
    quality["districtNameNormalization"] = old_quality["districtNameNormalization"]
    flags = retained(old_quality["facilityProvinceValidation"]["flaggedBlocks"], "submissionProvince") + findings
    quality["facilityProvinceValidation"] = {**old_quality["facilityProvinceValidation"], "flaggedBlocks": flags,
        "excludedBlockCount": sum(bool(r["excludedFromMetrics"]) for r in flags)}
    old_blocks = old_quality["facilityBlockReportingReview"]
    quality["facilityBlockReportingReview"] = {**old_blocks,
        "allMetricBlankBlocks": retained(old_blocks["allMetricBlankBlocks"]) + normalization["allMetricBlankBlockDetails"],
        "allSOHBlankBlocks": retained(old_blocks["allSOHBlankBlocks"]) + normalization["allSOHBlankBlockDetails"],
        "allZeroSOHBlocks": retained(old_blocks["allZeroSOHBlocks"]) + zero_blocks}
    invalid_soh = retained(old_quality["stockCalculationAudit"]["invalidSOHRecords"]) + [
        {"province": r["PROVINCE"], "district": r["DISTRICT"], "facility": r["FACILITY NAME"], "commodity": r["DESCRIPTION OF ITEM"],
         "workbook": r["_RAW_SOURCE_WORKBOOK"], "sheet": r["_RAW_SOURCE_SHEET"], "quantityColumn": r["_RAW_SOH_COLUMN"], "sourceValue": r["_RAW_QUANTITY_INPUT"]}
        for r in incoming if r["QUANTITY"] is None]
    calculations = {p: stats for p, stats in old_quality["stockCalculationAudit"]["provinces"].items() if p not in UPDATES}
    calculations.update(normalization["calculationByProvince"])
    quality["stockCalculationAudit"] = {**old_quality["stockCalculationAudit"], "provinces": calculations, "invalidSOHRecords": invalid_soh}
    samples, coverage = verify_source_samples(generator, incoming, period, directory=DIRECTORY, files=UPDATES)
    quality["primaryCareSourceCoverage"] = retained(old_quality["primaryCareSourceCoverage"]) + coverage
    period["sourceWorkbooks"] = sorted(manifests.values(), key=lambda s: s["province"])
    period["sourceRevisions"] = revisions
    for province, filename in UPDATES.items():
        if digest(DIRECTORY / filename) != manifests[province]["sha256"]:
            raise ValueError("An incoming workbook changed during import")
    if any(digest(ROOT / path) != value for path, value in hashes.items()):
        raise ValueError("Historical data changed during import")
    if len(quality["districts"]) != 116:
        raise ValueError("Expected 116 district reporting obligations")

    audit = {**old_audit, "source": source, "sourceWorkbooks": period["sourceWorkbooks"], "sourceRevisions": revisions,
        "counts": period["counts"], "national": period["national"], "provinces": period["provinces"],
        "invalidSOHRecords": invalid_soh, "allZeroSOHBlocksExcluded": quality["facilityBlockReportingReview"]["allZeroSOHBlocks"],
        "facilityProvinceValidation": quality["facilityProvinceValidation"], "sourceCellSamples": retained(old_audit["sourceCellSamples"]) + samples,
        "primaryCareSourceCoverage": quality["primaryCareSourceCoverage"], "missingProvinces": ["MUCHINGA PROVINCE"],
        "importMode": "province-replacement", "sourceFilesReadThisRevision": list(UPDATES.values()),
        "unchangedSourceProvincesVerified": unchanged,
        "normalization": {"scope": "incoming replacement workbooks only", **normalization}}
    dataset["tracerReportingPeriods"] = [period if p["id"] == DATE else p for p in dataset["tracerReportingPeriods"]]
    OUTPUT.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    BOOTSTRAP.write_text("// Compact latest-period fallback. Full history is fetched from public/data at runtime.\nexport const tracerBootstrapPeriod = "
        + json.dumps(compact_bootstrap(period), separators=(",", ":")) + ";\n", encoding="utf-8")
    AUDIT.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(json.dumps({"counts": period["counts"], "national": period["national"], "newSourceChecks": len(samples), "unchangedProvinces": unchanged}, indent=2), flush=True)


if __name__ == "__main__":
    main()
