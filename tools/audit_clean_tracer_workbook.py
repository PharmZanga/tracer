"""Pre-import audit for the consolidated National Tracer clean workbook.

Run before regenerating dashboard data. The audit validates the reporting
geography after applying the same province and district normalisation used by
the dashboard generator.
"""

from __future__ import annotations

import sys
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree

from lxml import etree

EXPECTED_PROVINCES = 10
EXPECTED_DISTRICTS = 116
SHEET_NAME = "SUMMARY SHEET"
MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def clean(value: str | None) -> str:
    return " ".join((value or "").strip().split())


def normalize_province(value: str | None) -> str:
    text = clean(value).upper()
    return {
        "CENTRAL": "CENTRAL PROVINCE",
        "COPPERBELT": "COPPERBELT PROVINCE",
        "EASTERN": "EASTERN PROVINCE",
        "LUAPULA": "LUAPULA PROVINCE",
        "LUSAKA": "LUSAKA PROVINCE",
        "MUCHINGA": "MUCHINGA PROVINCE",
        "NORTHWESTERN PROVINCE": "NORTH-WESTERN PROVINCE",
        "NORTHERN": "NORTHERN PROVINCE",
        "SOUTHERN": "SOUTHERN PROVINCE",
        "WESTERN": "WESTERN PROVINCE",
    }.get(text, text)


def normalize_district(value: str | None) -> str:
    text = re.sub(r"\s+DISTRICT$", "", clean(value).upper()).strip().replace("`", "'")
    if text.endswith("PROVINCE"):
        return "UNKNOWN"
    return {
        "SINZONGWE": "SINAZONGWE",
        "CHKANKATA": "CHIKANKATA",
        "NAWMALA": "NAMWALA",
        "MWENSE D HOSP": "MWENSE",
        "0": "UNKNOWN",
        "0.0": "UNKNOWN",
        "LOLOMA": "MANYINGA",
        "UNKNOWN DISTRICT": "UNKNOWN",
    }.get(text, text)


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(item.itertext()) for item in root.findall(f"{MAIN_NS}si")]


def worksheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    relationship_id = next(
        sheet.attrib.get(f"{REL_NS}id")
        for sheet in workbook.findall(f".//{MAIN_NS}sheet")
        if sheet.attrib.get("name") == SHEET_NAME
    )
    relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(
        relationship.attrib["Target"]
        for relationship in relationships
        if relationship.attrib.get("Id") == relationship_id
    )
    return f"xl/{target.lstrip('/')}"


def read_cell(cell: ElementTree.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(cell.itertext())
    value = cell.findtext(f"{MAIN_NS}v", default="")
    if cell_type == "s" and value:
        return strings[int(value)]
    return value


def main() -> None:
    path_argument = next((argument for argument in sys.argv[1:] if not argument.startswith("--")), None)
    workbook_path = Path(path_argument) if path_argument else Path(
        r"C:\Users\Zanga Musakuzi\Desktop\tracer dashboard\JANUARY-DECEMBER TRACER 2026 19.07.26.xlsx"
    )
    if not workbook_path.exists():
        raise SystemExit(f"Workbook not found: {workbook_path}")

    rows_read = 0
    blank_geography = []
    districts_by_province = defaultdict(set)
    raw_names_by_normalized_pair = defaultdict(set)
    reporting_dates = set()

    # Geography is held in columns A, C, and D. Restrict the read to A:D so
    # the audit remains lightweight even for the full national commodity file.
    # Stream worksheet XML rather than materialising 550k workbook rows. This
    # makes validation practical before each national dashboard refresh.
    with zipfile.ZipFile(workbook_path) as archive:
        strings = shared_strings(archive)
        path = worksheet_path(archive)
        with archive.open(path) as source:
            for _event, row in etree.iterparse(source, events=("end",), tag=f"{MAIN_NS}row"):
                row_number = int(row.attrib.get("r", 0))
                if row_number < 2:
                    row.clear()
                    continue
                cells = {cell.attrib.get("r", "")[0]: read_cell(cell, strings) for cell in row.findall(f"{MAIN_NS}c")}
                if not cells.get("A"):
                    row.clear()
                    while row.getprevious() is not None:
                        del row.getparent()[0]
                    continue
                rows_read += 1
                if rows_read % 50000 == 0:
                    print(f"Audited {rows_read:,} reporting rows...", flush=True)
                reporting_dates.add(cells["A"])
                raw_province = cells.get("C")
                raw_district = cells.get("D")
                if not raw_province or not raw_district:
                    blank_geography.append(row_number)
                    row.clear()
                    while row.getprevious() is not None:
                        del row.getparent()[0]
                    continue
                province = normalize_province(raw_province)
                district = normalize_district(raw_district)
                if district == "UNKNOWN":
                    row.clear()
                    while row.getprevious() is not None:
                        del row.getparent()[0]
                    continue
                districts_by_province[province].add(district)
                raw_names_by_normalized_pair[(province, district)].add((clean(raw_province), clean(raw_district)))
                row.clear()
                while row.getprevious() is not None:
                    del row.getparent()[0]
    normalized_pairs = {(province, district) for province, districts in districts_by_province.items() for district in districts}
    naming_variants = {
        pair: variants for pair, variants in raw_names_by_normalized_pair.items() if len(variants) > 1
    }

    print(f"Workbook: {workbook_path.name}")
    print(f"Rows read: {rows_read:,}")
    print(f"Reporting dates: {len(reporting_dates)}")
    print(f"Provinces: {len(districts_by_province)} of {EXPECTED_PROVINCES}")
    print(f"Province-district pairs: {len(normalized_pairs)} of {EXPECTED_DISTRICTS}")
    for province in sorted(districts_by_province):
        print(f"  {province}: {len(districts_by_province[province])} districts")
    if "--pairs" in sys.argv:
        print("NORMALISED_PAIRS")
        for province, district in sorted(normalized_pairs):
            print(f"{province}|{district}")

    issues = []
    if blank_geography:
        issues.append(f"{len(blank_geography)} data rows have blank province or district values")
    if len(districts_by_province) != EXPECTED_PROVINCES:
        issues.append(f"Expected {EXPECTED_PROVINCES} provinces, found {len(districts_by_province)}")
    if len(normalized_pairs) != EXPECTED_DISTRICTS:
        issues.append(f"Expected {EXPECTED_DISTRICTS} unique province-district pairs, found {len(normalized_pairs)}")

    if naming_variants:
        print(f"Normalised naming variants: {len(naming_variants)}")
        for (province, district), variants in list(sorted(naming_variants.items()))[:12]:
            print(f"  {province} / {district}: {sorted(variants)}")

    if issues:
        print("\nPRE-IMPORT AUDIT FAILED")
        for issue in issues:
            print(f"- {issue}")
        raise SystemExit(1)

    print("\nPRE-IMPORT AUDIT PASSED: geography reconciles to the national 10-province, 116-district footprint.")


if __name__ == "__main__":
    main()
