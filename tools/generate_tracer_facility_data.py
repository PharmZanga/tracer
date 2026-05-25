import json
import math
import re
from collections import defaultdict
from pathlib import Path

import openpyxl


WORKBOOK = Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\analysed summery reports\may\16.05.26\tracer summary 17.05.26.xlsx")
OUT = Path(r"C:\Users\Zanga Musakuzi\Desktop\DASH BOARD IDEAS\hospital dash board\src\tracerFacilityData.js")


def clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = " ".join(value.strip().split())
        return text or None
    return value


def norm_text(value):
    value = clean(value) or ""
    value = re.sub(r"[^a-z0-9]+", " ", str(value).lower())
    return " ".join(value.split())


def normalize_province(value):
    text = clean(value) or "Unknown"
    upper = text.upper()
    if upper == "EASTERN":
        return "EASTERN PROVINCE"
    return upper


def num(value):
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(value):
        return None
    return value


def status_from_mos(mos):
    if mos is None:
        return "dataGap"
    if mos <= 0.1:
        return "stockout"
    if mos < 1:
        return "nearCritical"
    if mos > 12:
        return "overstock"
    if mos > 4:
        return "abovePlan"
    if mos >= 2:
        return "accordingToPlan"
    return "understocked"


def make_bucket():
    return {
        "rows": 0,
        "availableRows": 0,
        "availabilitySum": 0.0,
        "availabilityCount": 0,
        "mosSum": 0.0,
        "mosCount": 0,
        "stockout": 0,
        "nearCritical": 0,
        "understocked": 0,
        "accordingToPlan": 0,
        "abovePlan": 0,
        "overstock": 0,
        "dataGap": 0,
        "quantity": 0.0,
        "amc": 0.0,
    }


def add(bucket, row):
    mos = num(row.get("MOS"))
    availability = num(row.get("AVAILABILITY"))
    quantity = num(row.get("QUANTITY")) or 0
    amc = num(row.get("AMC")) or 0
    bucket["rows"] += 1
    bucket["quantity"] += quantity
    bucket["amc"] += amc
    if availability is not None:
        bucket["availabilitySum"] += availability
        bucket["availabilityCount"] += 1
        if availability > 0:
            bucket["availableRows"] += 1
    if mos is not None:
        bucket["mosSum"] += mos
        bucket["mosCount"] += 1
    bucket[status_from_mos(mos)] += 1


def finalize(name, bucket, extra=None):
    rows = bucket["rows"]
    out = {
        "name": name,
        "rows": rows,
        "availability": round(bucket["availabilitySum"] / bucket["availabilityCount"], 4) if bucket["availabilityCount"] else 0,
        "mos": round(bucket["mosSum"] / bucket["mosCount"], 2) if bucket["mosCount"] else None,
        "stockout": bucket["stockout"],
        "nearCritical": bucket["nearCritical"],
        "understocked": bucket["understocked"],
        "accordingToPlan": bucket["accordingToPlan"],
        "abovePlan": bucket["abovePlan"],
        "overstock": bucket["overstock"],
        "dataGap": bucket["dataGap"],
        "quantity": round(bucket["quantity"], 2),
        "amc": round(bucket["amc"], 2),
        "riskRows": bucket["stockout"] + bucket["nearCritical"] + bucket["understocked"],
        "stockoutRate": round(bucket["stockout"] / rows, 4) if rows else 0,
    }
    if extra:
        out.update(extra)
    return out


def main():
    wb = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    headers = [clean(c) or "" for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    national = make_bucket()
    by_province = defaultdict(make_bucket)
    by_district = defaultdict(make_bucket)
    by_facility_level = defaultdict(make_bucket)
    by_facility = defaultdict(make_bucket)
    by_program = defaultdict(make_bucket)
    by_item = defaultdict(make_bucket)
    facility_items = defaultdict(lambda: {"stockout": [], "lowStock": []})
    facility_units = set()
    district_units = set()
    province_names = set()
    item_names = set()
    program_names = set()
    comments = []

    for row_values in ws.iter_rows(min_row=2, values_only=True):
        row = {key: clean(value) for key, value in zip(headers, row_values)}
        province = normalize_province(row.get("PROVINCE"))
        district = clean(row.get("DISTRICT")) or "Unknown district"
        facility = clean(row.get("FACILITY NAME")) or "Unknown facility"
        facility_level = clean(row.get("FACILITY LEVEL")) or "Unknown facility level"
        program = clean(row.get("PROGRAM")) or "Unknown programme"
        item = clean(row.get("DESCRIPTION OF ITEM")) or "Unknown commodity"

        province_names.add(province)
        district_units.add((province, district))
        facility_units.add((province, district, facility_level, facility))
        item_names.add(item)
        program_names.add(program)

        add(national, row)
        add(by_province[province], row)
        add(by_district[(province, district)], row)
        add(by_facility_level[facility_level], row)
        add(by_facility[(province, district, facility_level, facility)], row)
        add(by_program[program], row)
        add(by_item[item], row)
        mos = num(row.get("MOS"))
        quantity = num(row.get("QUANTITY")) or 0
        amc = num(row.get("AMC")) or 0
        alert_item = {
            "item": item,
            "program": program,
            "mos": round(mos, 2) if mos is not None else None,
            "quantity": round(quantity, 2),
            "amc": round(amc, 2),
        }
        if mos is None:
            pass
        elif mos <= 0.1:
            facility_items[(province, district, facility_level, facility)]["stockout"].append(alert_item)
        elif mos < 2:
            facility_items[(province, district, facility_level, facility)]["lowStock"].append(alert_item)

    comments_ws = wb["comments "]
    for row in comments_ws.iter_rows(values_only=True):
        province = clean(row[1]) if len(row) > 1 else None
        note = clean(row[2]) if len(row) > 2 else None
        if province or note:
            comments.append({"province": province, "note": note})

    provinces = [
        finalize(name, bucket)
        for name, bucket in by_province.items()
    ]
    provinces.sort(key=lambda x: (x["availability"], -x["riskRows"]))

    districts = [
        finalize(district, bucket, {"province": province})
        for (province, district), bucket in by_district.items()
    ]
    districts.sort(key=lambda x: (x["availability"], -x["riskRows"]))

    facility_levels = [
        finalize(name, bucket)
        for name, bucket in by_facility_level.items()
    ]
    facility_levels.sort(key=lambda x: (x["availability"], -x["riskRows"]))

    facilities = []
    for (province, district, facility_level, facility), bucket in by_facility.items():
        item_alerts = facility_items[(province, district, facility_level, facility)]
        stockout_items = sorted(item_alerts["stockout"], key=lambda x: (x["program"], x["item"]))[:8]
        low_stock_items = sorted(item_alerts["lowStock"], key=lambda x: (x["mos"] if x["mos"] is not None else 99, x["program"], x["item"]))[:8]
        facilities.append(finalize(facility, bucket, {
            "province": province,
            "district": district,
            "facilityLevel": facility_level,
            "stockoutItems": stockout_items,
            "lowStockItems": low_stock_items,
            "stockoutItemCount": len(item_alerts["stockout"]),
            "lowStockItemCount": len(item_alerts["lowStock"]),
        }))
    facilities.sort(key=lambda x: (-x["stockoutItemCount"], -x["lowStockItemCount"], x["availability"], x["province"], x["district"], x["name"]))

    programs = [
        finalize(name, bucket)
        for name, bucket in by_program.items()
    ]
    programs.sort(key=lambda x: (x["availability"], -x["riskRows"]))

    items = [
        finalize(name, bucket, {"normalized": norm_text(name)})
        for name, bucket in by_item.items()
    ]
    items.sort(key=lambda x: (-x["riskRows"], x["availability"], x["name"]))

    report_date = None
    for row_values in ws.iter_rows(min_row=2, max_row=2, values_only=True):
        row = {key: clean(value) for key, value in zip(headers, row_values)}
        report_date = row.get("DATE")
    if hasattr(report_date, "strftime"):
        report_date = report_date.strftime("%Y-%m-%d")

    payload = {
        "reportDate": report_date,
        "source": "tracer summary 17.05.26.xlsx",
        "counts": {
            "rows": national["rows"],
            "provinces": len(province_names),
            "districts": len(district_units),
            "facilityUnits": len(facility_units),
            "programmes": len(program_names),
            "commodities": len(item_names),
        },
        "national": finalize("Zambia", national),
        "provinces": provinces,
        "districts": districts[:80],
        "facilities": facilities[:120],
        "facilityLevels": facility_levels,
        "programmes": programs,
        "commodities": items[:160],
        "comments": comments,
    }

    OUT.write_text("export const tracerFacilityData = " + json.dumps(payload, indent=2) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
