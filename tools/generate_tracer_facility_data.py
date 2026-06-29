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
        "rawSources": [
            {"province": "MUCHINGA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\06.02.26 MUCHINGA 2026 TRACER WEEKLY REPORT.xlsx")},
            {"province": "NORTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\07.02.26 NORTHERN PROVINCE 2024 TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "CENTRAL PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\7_2_2025 CENTRAL PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "EASTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\7TH FEB EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (4).xlsx")},
            {"province": "COPPERBELT PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\08.02.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "NORTH-WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\08-02-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\08-02-2026 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "LUAPULA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\LUAPULA PROVINCE 2025 TRACER WEEKLY REPORT 7 2 26.xlsx")},
            {"province": "LUSAKA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\LUSAKA PROVINCE TRACER WEEKLY REPORT PROVINCES-06.02.2026.xlsx")},
            {"province": "SOUTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 1 feb\SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 06.02.26 -Final.xlsx")},
        ],
        "source": "February Week 1 provincial raw submissions",
        "reportDate": "2026-02-08",
        "label": "Week 1 - 8 February 2026",
        "month": "2026-02",
        "week": "Week 1",
    },
    {
        "rawSources": [
            {"province": "MUCHINGA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\13.02.2026 MUCHINGA 2026 TRACER WEEKLY REPORT (3).xlsx")},
            {"province": "NORTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\13.02.2026 NORTHERN PROVINCE 2024 TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "CENTRAL PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\14_2_2026 CENTRAL PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "EASTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (5).xlsx")},
            {"province": "COPPERBELT PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\14.2.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "NORTH-WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\14-02-2026-NORTHWESTERN TRACER WEEKLY REPORT.xlsx")},
            {"province": "WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\15-02-26 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "LUAPULA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\LUAPULA PROVINCE 2025 TRACER WEEKLY REPORT 14 2 26.xlsx")},
            {"province": "LUSAKA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES 13.02.2026.xlsx")},
            {"province": "SOUTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\weeek 2\SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 13.02.26 -FINAL.xlsx")},
        ],
        "source": "February Week 2 provincial raw submissions",
        "reportDate": "2026-02-15",
        "label": "Week 2 - 15 February 2026",
        "month": "2026-02",
        "week": "Week 2",
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
    if isinstance(value, str) and value.strip() in {"", "-", "N/A", "#N/A"}:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(value) else value


def availability_value(value):
    value = num(value)
    if value is None:
        return None
    if value > 1:
        value = value / 100 if value <= 100 else 1
    return max(0, min(value, 1))


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
    availability = availability_value(row.get("AVAILABILITY"))
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


def raw_facility_level(sheet_name, sheet_title):
    title = f"{sheet_name} {sheet_title or ''}".upper()
    if sheet_name.upper() == "HP" or "HEALTH POST" in title:
        return "HEALTH POST"
    if sheet_name.upper() == "HC" or "HEALTH CENTRE" in title:
        return "HEALTH CENTRE"
    if "L-1" in title or "LEVEL 1" in title:
        return "DISTRICT LEVEL 1 HOSPITALS"
    if "L-2" in title or "LEVEL 2" in title:
        return "LEVEL 2 HOSPITAL"
    if "L-3" in title or "LEVEL 3" in title:
        return sheet_name.upper()
    if "TB" in title:
        return "TB UNITS"
    if "EYE" in title or "OPTH" in title:
        return "OPTHAMOLOGY UNITS"
    if "RENAL" in title:
        return "RENAL UNITS"
    if "CANCER" in title:
        return "CANCER DISEASES UNITS"
    if "MENTAL" in title:
        return "MENTAL HEALTH UNITS"
    return sheet_name.upper()


def iter_raw_matrix_rows(source, report_date):
    workbook_path = source["path"]
    province = normalize_province(source["province"])
    wb = openpyxl.load_workbook(workbook_path, read_only=False, data_only=True)
    skip = {"SITUATION BOARD", "SUMMARY", "COMMENTS", "COMMENT", "RECOMMENDATIONS", "RECOMEDATIONS"}
    for ws in wb.worksheets:
        sheet_name = ws.title.strip()
        if any(token in sheet_name.upper() for token in skip):
            continue
        if ws.max_row < 4 or ws.max_column < 7:
            continue
        item_header = str(ws.cell(3, 2).value or "").upper()
        if "DESCRIPTION" not in item_header and "PRODUCT" not in item_header:
            continue
        facility_level = raw_facility_level(sheet_name, ws.cell(1, 1).value)
        for start_col in range(5, ws.max_column + 1, 4):
            district = clean(ws.cell(2, start_col).value)
            facility = clean(ws.cell(2, start_col + 1).value)
            if not district:
                continue
            district = str(district).replace(" DISTRICT", "").strip().upper()
            if facility_level in {"HEALTH POST", "HEALTH CENTRE"}:
                facility_name = f"{district} {facility_level.title()} facilities"
                is_aggregate = True
            else:
                facility_name = str(facility or district).strip()
                is_aggregate = False
            for row_index in range(4, ws.max_row + 1):
                item = clean(ws.cell(row_index, 2).value)
                if not item:
                    continue
                quantity = num(ws.cell(row_index, start_col).value)
                amc = num(ws.cell(row_index, start_col + 1).value)
                mos = num(ws.cell(row_index, start_col + 2).value)
                if quantity is None and amc is None and mos is None:
                    continue
                yield {
                    "DATE": report_date,
                    "NATION": "ZAMBIA",
                    "PROVINCE": province,
                    "DISTRICT": district,
                    "FACILITY LEVEL": facility_level,
                    "FACILITY NAME": facility_name,
                    "PROGRAM": facility_level,
                    "DESCRIPTION OF ITEM": item,
                    "UNIT": clean(ws.cell(row_index, 3).value),
                    "QUANTITY": quantity,
                    "AMC": amc,
                    "MOS": mos,
                    "AVAILABILITY": 1 if (quantity or 0) > 0 else 0,
                    "_RAW_AGGREGATE": is_aggregate,
                }
    wb.close()


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
    workbook_path = config.get("path")
    if config.get("rawSources"):
        rows_iter = (
            row
            for source in config["rawSources"]
            for row in iter_raw_matrix_rows(source, config["reportDate"])
        )
        source_name = config.get("source", "Provincial raw submissions")
        wb = None
    else:
        wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
        ws = wb[config.get("sheet") or wb.sheetnames[0]]
        headers = [normalize_header(cell) for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
        rows_iter = (
            {key: clean(value) for key, value in zip(headers, row_values)}
            for row_values in ws.iter_rows(min_row=2, values_only=True)
        )
        source_name = workbook_path.name

    national = make_bucket()
    by_province = defaultdict(make_bucket)
    by_district = defaultdict(make_bucket)
    by_facility_level = defaultdict(make_bucket)
    by_facility = defaultdict(make_bucket)
    by_program = defaultdict(make_bucket)
    by_item = defaultdict(make_bucket)
    facility_items = defaultdict(lambda: {"stockout": [], "lowStock": [], "accordingToPlan": [], "overstock": []})
    facility_is_aggregate = {}
    comments = []
    province_names, district_units, facility_units, item_names, program_names = set(), set(), set(), set(), set()
    report_date = None

    for row in rows_iter:
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
        facility_is_aggregate[key] = bool(row.get("_RAW_AGGREGATE")) or facility.upper() == "ALL"
        if mos is not None and mos <= 0.1:
            facility_items[key]["stockout"].append(alert_item)
        elif mos is not None and mos < 2:
            facility_items[key]["lowStock"].append(alert_item)
        elif mos is not None and mos <= 4:
            facility_items[key]["accordingToPlan"].append(alert_item)
        elif mos is not None:
            facility_items[key]["overstock"].append(alert_item)

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
        according_to_plan_items = sorted(
            alerts["accordingToPlan"],
            key=lambda item: (item["mos"] if item["mos"] is not None else 99, str(item["program"]), str(item["item"])),
        )
        overstock_items = sorted(
            alerts["overstock"],
            key=lambda item: (-(item["mos"] if item["mos"] is not None else 0), str(item["program"]), str(item["item"])),
        )
        facilities.append(finalize(facility, bucket, {
            "province": province,
            "district": district,
            "facilityLevel": facility_level,
            "isAggregate": facility_is_aggregate.get(key, facility.upper() == "ALL"),
            "stockoutItems": sorted(alerts["stockout"], key=lambda item: (str(item["program"]), str(item["item"]))),
            "lowStockItems": sorted(alerts["lowStock"], key=lambda item: (item["mos"] if item["mos"] is not None else 99, str(item["program"]), str(item["item"]))),
            "accordingToPlanItems": according_to_plan_items[:5],
            "overstockItems": overstock_items[:5],
            "stockoutItemCount": len(alerts["stockout"]),
            "lowStockItemCount": len(alerts["lowStock"]),
            "accordingToPlanItemCount": len(alerts["accordingToPlan"]),
            "overstockItemCount": len(alerts["overstock"]),
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
        "source": source_name,
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
