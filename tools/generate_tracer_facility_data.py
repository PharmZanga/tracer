import json
import math
import re
from collections import defaultdict
from pathlib import Path

import openpyxl


WORKBOOKS = [
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER SUMMARY REPORTS  JANUARY 2026 (3).xlsx"),
        "sheet": "4-01-2026",
        "reportDate": "2026-01-04",
        "label": "Week 1 - 4 January 2026",
        "month": "2026-01",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER SUMMARY REPORTS  JANUARY 2026 (3).xlsx"),
        "sheet": "11-01-2026",
        "reportDate": "2026-01-11",
        "label": "Week 2 - 11 January 2026",
        "month": "2026-01",
        "week": "Week 2",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER SUMMARY REPORTS  JANUARY 2026 (3).xlsx"),
        "sheet": "18-01-2026",
        "reportDate": "2026-01-18",
        "label": "Week 3 - 18 January 2026",
        "month": "2026-01",
        "week": "Week 3",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER SUMMARY REPORTS  JANUARY 2026 (3).xlsx"),
        "sheet": "25-01-2026",
        "reportDate": "2026-01-25",
        "label": "Week 4 - 25 January 2026",
        "month": "2026-01",
        "week": "Week 4",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER SUMMARY REPORTS  JANUARY 2026 (3).xlsx"),
        "sheet": "31-01-2026",
        "reportDate": "2026-01-31",
        "label": "Week 5 - 31 January 2026",
        "month": "2026-01",
        "week": "Week 5",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\week one 08.02.2026 Summary tracer Reports.xlsx"),
        "label": "Week 1 - 8 February 2026",
        "month": "2026-02",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\TRACER WEEKLY SUMMARY REPORTS 22.02.26.xlsx"),
        "sheet": "CV.2.22.26",
        "label": "Week 3 - 22 February 2026",
        "month": "2026-02",
        "week": "Week 3",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\feb\28.02.2026 SUMMARY REPORTS.xlsx"),
        "sheet": "SUMMARY REPORTS",
        "label": "Week 4 - 28 February 2026",
        "month": "2026-02",
        "week": "Week 4",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\march\provincial_tracer_ 8.3.26.xlsx"),
        "label": "Week 1 - 8 March 2026",
        "month": "2026-03",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\march\TRACER DATED 15-3-26.xlsx"),
        "label": "Week 2 - 15 March 2026",
        "month": "2026-03",
        "week": "Week 2",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\march\22.03.26 SUMMARY REPORTS.xlsx"),
        "label": "Week 3 - 22 March 2026",
        "month": "2026-03",
        "week": "Week 3",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\march\DATED 29.3.26.xlsx"),
        "label": "Week 4 - 29 March 2026",
        "month": "2026-03",
        "week": "Week 4",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\april\TRACER SUMMARY REPORTS 4-5-2026 (1).xlsx"),
        "label": "Week 1 - 5 April 2026",
        "month": "2026-04",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\april\TRACER SUMMARY WEEK  TWO.xlsx"),
        "label": "Week 2 - 12 April 2026",
        "month": "2026-04",
        "week": "Week 2",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\april\TRACER SUMMARY WEEK THREE.xlsx"),
        "label": "Week 3 - 19 April 2026",
        "month": "2026-04",
        "week": "Week 3",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\april\TRACER DATED 26.4.26.xlsx"),
        "label": "Week 4 - 26 April 2026",
        "month": "2026-04",
        "week": "Week 4",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\may\TRACER SUMMARY  WEEK ONE MAY 2026.xlsx"),
        "label": "Week 1 - 3 May 2026",
        "month": "2026-05",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\analysed summery reports\may\16.05.26\tracer summary 17.05.26.xlsx"),
        "label": "Week 3 - 17 May 2026",
        "month": "2026-05",
        "week": "Week 3",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\may\week 3.xlsx"),
        "label": "Week 4 - 24 May 2026",
        "month": "2026-05",
        "week": "Week 4",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\may\WEEK 4 TRACER SUMMARY REPORT.xlsx"),
        "label": "Week 5 - 31 May 2026",
        "month": "2026-05",
        "week": "Week 5",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\june\07.06.2026 SUMMARY TRACE LIST.xlsx"),
        "label": "Week 1 - 7 June 2026",
        "month": "2026-06",
        "week": "Week 1",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\june\week 14.06.2026 tracer.xlsx"),
        "label": "Week 2 - 14 June 2026",
        "month": "2026-06",
        "week": "Week 2",
    },
    {
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\tracer summery report clean data\june\21.06.2026 tracer.xlsx"),
        "label": "Week 3 - 21 June 2026",
        "month": "2026-06",
        "week": "Week 3",
    },
]
OUT = Path(__file__).resolve().parents[1] / "src" / "tracerFacilityData.js"


def clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = " ".join(value.strip().split())
        return text or None
    return value


def normalize_header(value):
    text = (clean(value) or "").upper()
    aliases = {
        "AVERAGE AMC": "AMC",
        "AVG AMC": "AMC",
        " AMC": "AMC",
        " MOS": "MOS",
    }
    return aliases.get(text, text)


def norm_text(value):
    value = clean(value) or ""
    value = re.sub(r"[^a-z0-9]+", " ", str(value).lower())
    return " ".join(value.split())


def normalize_province(value):
    text = (clean(value) or "Unknown").upper()
    aliases = {
        "EASTERN": "EASTERN PROVINCE",
        "NORTHWESTERN PROVINCE": "NORTH-WESTERN PROVINCE",
    }
    return aliases.get(text, text)


def num(value):
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(value) else value


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
        "rows": 0, "availableRows": 0, "availabilitySum": 0.0,
        "availabilityCount": 0, "mosSum": 0.0, "mosCount": 0,
        "stockout": 0, "nearCritical": 0, "understocked": 0,
        "accordingToPlan": 0, "abovePlan": 0, "overstock": 0,
        "dataGap": 0, "quantity": 0.0, "amc": 0.0,
    }


def add(bucket, row):
    mos = num(row.get("MOS"))
    availability = num(row.get("AVAILABILITY"))
    bucket["rows"] += 1
    bucket["quantity"] += num(row.get("QUANTITY")) or 0
    bucket["amc"] += num(row.get("AMC")) or 0
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
    result = {
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
        result.update(extra)
    return result


def summarize(config):
    workbook_path = config["path"]
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    ws = wb[config.get("sheet") or wb.sheetnames[0]]
    headers = [normalize_header(cell) for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    national = make_bucket()
    by_province = defaultdict(make_bucket)
    by_district = defaultdict(make_bucket)
    by_facility_level = defaultdict(make_bucket)
    by_facility = defaultdict(make_bucket)
    by_program = defaultdict(make_bucket)
    by_item = defaultdict(make_bucket)
    facility_items = defaultdict(lambda: {"stockout": [], "lowStock": []})
    comments = []
    province_names, district_units, facility_units, item_names, program_names = set(), set(), set(), set(), set()
    report_date = None

    for row_values in ws.iter_rows(min_row=2, values_only=True):
        row = {key: clean(value) for key, value in zip(headers, row_values)}
        province = normalize_province(row.get("PROVINCE"))
        district = (clean(row.get("DISTRICT")) or "Unknown district").upper()
        facility = clean(row.get("FACILITY NAME")) or "Unknown reporting unit"
        facility_level = (clean(row.get("FACILITY LEVEL")) or "Unknown facility level").upper()
        program = clean(row.get("PROGRAM")) or "Unknown programme"
        item = clean(row.get("DESCRIPTION OF ITEM")) or "Unknown commodity"
        if report_date is None:
            report_date = row.get("DATE")

        province_names.add(province)
        district_units.add((province, district))
        facility_units.add((province, district, facility_level, facility))
        item_names.add(item)
        program_names.add(program)

        for bucket in (
            national, by_province[province], by_district[(province, district)],
            by_facility_level[facility_level],
            by_facility[(province, district, facility_level, facility)],
            by_program[program], by_item[item],
        ):
            add(bucket, row)

        mos = num(row.get("MOS"))
        alert_item = {
            "item": item,
            "program": program,
            "mos": round(mos, 2) if mos is not None else None,
            "quantity": round(num(row.get("QUANTITY")) or 0, 2),
            "amc": round(num(row.get("AMC")) or 0, 2),
        }
        key = (province, district, facility_level, facility)
        if mos is not None and mos <= 0.1:
            facility_items[key]["stockout"].append(alert_item)
        elif mos is not None and mos < 2:
            facility_items[key]["lowStock"].append(alert_item)

        note = clean(row.get("COMMENT"))
        if note and note not in {"#NAME?", "STOCKED ACCORDING TO PLAN", "UNDERSTOCKED", "OVERSTOCKED"}:
            comments.append({"province": province, "note": note})

    provinces = [finalize(name, bucket) for name, bucket in by_province.items()]
    provinces.sort(key=lambda item: (item["availability"], -item["riskRows"]))
    districts = [
        finalize(district, bucket, {"province": province})
        for (province, district), bucket in by_district.items()
    ]
    districts.sort(key=lambda item: (item["availability"], -item["riskRows"]))
    facility_levels = [finalize(name, bucket) for name, bucket in by_facility_level.items()]
    facility_levels.sort(key=lambda item: (item["availability"], -item["riskRows"]))

    facilities = []
    for key, bucket in by_facility.items():
        province, district, facility_level, facility = key
        alerts = facility_items[key]
        facilities.append(finalize(facility, bucket, {
            "province": province,
            "district": district,
            "facilityLevel": facility_level,
            "isAggregate": facility.upper() == "ALL",
            "stockoutItems": sorted(alerts["stockout"], key=lambda item: (str(item["program"]), str(item["item"])))[:12],
            "lowStockItems": sorted(alerts["lowStock"], key=lambda item: (item["mos"] if item["mos"] is not None else 99, str(item["program"]), str(item["item"])))[:12],
            "stockoutItemCount": len(alerts["stockout"]),
            "lowStockItemCount": len(alerts["lowStock"]),
        }))
    facilities.sort(key=lambda item: (-item["stockoutItemCount"], -item["lowStockItemCount"], item["availability"], item["province"], item["district"], item["name"]))

    programs = [finalize(name, bucket) for name, bucket in by_program.items()]
    programs.sort(key=lambda item: (item["availability"], -item["riskRows"]))
    items = [finalize(name, bucket, {"normalized": norm_text(name)}) for name, bucket in by_item.items()]
    items.sort(key=lambda item: (-item["riskRows"], item["availability"], item["name"]))

    if config.get("reportDate"):
        report_date = config["reportDate"]
    elif hasattr(report_date, "strftime"):
        report_date = report_date.strftime("%Y-%m-%d")
    return {
        "id": report_date,
        "reportDate": report_date,
        "label": config["label"],
        "month": config["month"],
        "week": config["week"],
        "source": workbook_path.name,
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
        "districts": districts,
        "facilities": facilities,
        "facilityLevels": facility_levels,
        "programmes": programs,
        "commodities": items,
        "comments": comments[:100],
    }


def main():
    periods = [summarize(config) for config in WORKBOOKS]
    periods.sort(key=lambda item: item["reportDate"])
    output = (
        "export const tracerReportingPeriods = "
        + json.dumps(periods, indent=2)
        + ";\n\nexport const tracerFacilityData = tracerReportingPeriods.at(-1);\n"
    )
    OUT.write_text(output, encoding="utf-8")
    print([(item["label"], item["counts"]) for item in periods])


if __name__ == "__main__":
    main()
