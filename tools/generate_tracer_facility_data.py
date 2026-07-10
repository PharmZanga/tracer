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
        "rawSources": [
            {"province": "MUCHINGA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\9.3.26 MUCHINGA 2026 TRACER WEEKLY REPORT (5).xlsx")},
            {"province": "NORTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\06.03.26 NORTHERN PROVINCE 2024 TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "CENTRAL PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\7_3_2026 CENTRAL PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "EASTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\7th Feb EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (8).xlsx")},
            {"province": "COPPERBELT PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\7.3.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "NORTH-WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\08-03-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\08-03-2026 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "LUAPULA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\LUAPULA PROVINCE 2025 TRACER WEEKLY REPORT 7 3 26.xlsx")},
            {"province": "LUSAKA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (1).xlsx")},
            {"province": "SOUTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 1\SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 06.03.26.xlsx")},
        ],
        "source": "March Week 1 provincial raw submissions",
        "reportDate": "2026-03-08",
        "label": "Week 1 - 8 March 2026",
        "month": "2026-03",
        "week": "Week 1",
    },
    {
        "rawSources": [
            {"province": "MUCHINGA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\13.3.26 MUCHINGA 2026 TRACER WEEKLY REPORT.xlsx")},
            {"province": "NORTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\NORTHERN PROVINCE 2024 TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "CENTRAL PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\14_3_2026 CENTRAL PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "EASTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\EASTERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES (9).xlsx")},
            {"province": "COPPERBELT PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\15.3.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "NORTH-WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\15-03-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx")},
            {"province": "WESTERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\15-03-26 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT.xlsx")},
            {"province": "LUAPULA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\LUAPULA PROVINCE 2025 TRACER WEEKLY REPORT  15 3 25.xlsx")},
            {"province": "LUSAKA PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES 13.03.2026.xlsx")},
            {"province": "SOUTHERN PROVINCE", "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\march province submission\week 2\SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 13.03.26 -Final.xlsx")},
        ],
        "source": "March Week 2 provincial raw submissions",
        "reportDate": "2026-03-15",
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
CLEAN_DATA_WORKBOOK = Path(r"C:\Users\Zanga Musakuzi\Desktop\tracer dashboard\JANUARY-DECEMBER TRACER 2026.xlsx")
CLEAN_DATA_SHEET = "SUMMARY SHEET"
RAW_AVAILABILITY_SOURCES = [
    {
        "reportDate": "2026-02-22",
        "province": "LUSAKA PROVINCE",
        "path": Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\February province submission\week 3\LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES.xlsx"),
    },
]


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


def facility_match_key(value):
    text = norm_text(value)
    aliases = {
        "levy mwanawasa uth": "levy mwanawasa university teaching hospital",
    }
    return aliases.get(text, text)


def normalize_province(value):
    text = (clean(value) or "Unknown").upper()
    aliases = {
        "EASTERN": "EASTERN PROVINCE",
        "NORTHWESTERN PROVINCE": "NORTH-WESTERN PROVINCE",
    }
    return aliases.get(text, text)


def normalize_district(value):
    text = (clean(value) or "Unknown district").upper()
    text = text.replace("`", "'")
    text = re.sub(r"\s+DISTRICT$", "", text).strip()
    aliases = {
        "SINZONGWE": "SINAZONGWE",
        "UNKNOWN DISTRICT": "UNKNOWN",
    }
    return aliases.get(text, text)


def normalize_program(value):
    text = (clean(value) or "Unknown programme").upper()
    compact = re.sub(r"[^A-Z0-9]+", "", text)
    aliases = {
        "TB0MDR": "TB-MDR",
        "TBMDR": "TB-MDR",
        "MDRTB": "TB-MDR",
        "TB0DS": "TB-DS",
        "TBDS": "TB-DS",
        "DSTB": "TB-DS",
    }
    return aliases.get(compact, text)


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


def normalize_raw_facility_level(sheet_name, sheet_title):
    level = raw_facility_level(sheet_name, sheet_title)
    if level == "L-1":
        return "DISTRICT LEVEL 1 HOSPITALS"
    if level == "L-2":
        return "LEVEL 2 HOSPITAL"
    if level == "L-3":
        return "LEVEL 3 HOSPITAL"
    if level == "L-3 PAED":
        return "LEVEL 3 PAEDIATRICS HOSPITALS"
    if level == "L-3 ADULT":
        return "LEVEL 3 ADULT HOSPITALS"
    if level == "RENAL UNITS":
        return "RENAL UNITS"
    if level == "CANCER DISEASES UNITS":
        return "CANCER DISEASES UNITS"
    if level == "MENTAL HEALTH UNITS":
        return "MENTAL HEALTH UNITS"
    if level == "OPTHAMOLOGY UNITS":
        return "OPTHAMOLOGY UNITS"
    if level == "TB UNITS":
        return "TB UNITS"
    return level


def load_raw_availability_overrides():
    overrides = {}
    skip = {"SITUATION BOARD", "SUMMARY", "SUMMARY SHEET", "COMMENTS", "COMMENT", "RECOMMENDATIONS", "RECOMEDATIONS", "PROGRAM"}
    for source in RAW_AVAILABILITY_SOURCES:
        if not source["path"].exists():
            continue
        wb = openpyxl.load_workbook(source["path"], read_only=False, data_only=True)
        province = normalize_province(source["province"])
        report_date = source["reportDate"]
        for ws in wb.worksheets:
            sheet_name = ws.title.strip()
            if any(token in sheet_name.upper() for token in skip):
                continue
            footer_row = None
            for row_index in range(1, ws.max_row + 1):
                label = str(ws.cell(row_index, 2).value or "").strip().upper()
                if "PERCENTAGE AVAILABILITY" in label:
                    footer_row = row_index
                    break
            if not footer_row:
                continue
            facility_level = normalize_raw_facility_level(sheet_name, ws.cell(1, 1).value)
            for start_col in range(5, ws.max_column + 1, 4):
                district = clean(ws.cell(2, start_col).value)
                facility = clean(ws.cell(2, start_col + 1).value)
                availability = availability_value(ws.cell(footer_row, start_col).value)
                if not district or not facility or availability is None:
                    continue
                key = (report_date, province, normalize_district(district), facility_level, facility_match_key(facility))
                overrides[key] = availability
        wb.close()
    return overrides


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
            district = normalize_district(district)
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
                    "PROGRAM": normalize_program(facility_level),
                    "DESCRIPTION OF ITEM": item,
                    "UNIT": clean(ws.cell(row_index, 3).value),
                    "QUANTITY": quantity,
                    "AMC": amc,
                    "MOS": mos,
                    "AVAILABILITY": 1 if (quantity or 0) > 0 else 0,
                    "_RAW_AGGREGATE": is_aggregate,
                }
    wb.close()


def date_id(value):
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def week_label(value):
    report_id = date_id(value)
    week_overrides = {
        "2026-02-22": "Week 3",
        "2026-02-28": "Week 4",
    }
    if report_id in week_overrides:
        return week_overrides[report_id]
    if hasattr(value, "strftime"):
        return f"Week {(value.day - 1) // 7 + 1}"
    try:
        day = int(str(value)[8:10])
    except (TypeError, ValueError):
        day = 1
    return f"Week {(day - 1) // 7 + 1}"


def month_id(value):
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def period_label(value):
    if hasattr(value, "strftime"):
        return f"{week_label(value)} - {value.day} {value.strftime('%B %Y')}"
    return f"{week_label(value)} - {date_id(value)}"


def corrected_value(value, fallback):
    text = clean(value)
    if not text or str(text).upper() in {"NOT FOUND IN MASTER LIST", "#N/A", "#REF!"}:
        return clean(fallback)
    return text


def clean_facility_level(level, corrected_level):
    original = (clean(level) or "").upper()
    if "HEALTH CENTER/ HEALTH POST" in original or "HEALTH CENTRE/ HEALTH POST" in original:
        return "PRIMARY FACILITY - LEVEL NOT SPECIFIED"
    if "HEALTH POST" in original:
        return "HEALTH POST"
    if "HEALTH CENTRE" in original or "HEALTH CENTER" in original:
        return "HEALTH CENTRE"
    if "RENAL" in original:
        return "RENAL UNITS"
    if "CANCER" in original:
        return "CANCER DISEASES UNITS"
    if "MENTAL" in original or "PSYCH" in original:
        return "MENTAL HEALTH UNITS"
    if "OPTH" in original or "OPHTH" in original or "EYE" in original:
        return "OPTHAMOLOGY UNITS"
    if "TB" in original or "MDR" in original:
        return "TB UNITS"
    if "HEART" in original:
        return "HEART HOSPITAL"
    if "WOMEN" in original or "NEW BORN" in original or "WNB" in original:
        return "WOMEN AND NEWBORN UNITS"
    value = corrected_value(corrected_level, level) or "Unknown facility level"
    value = str(value).strip().upper()
    if "HEALTH CENTER/ HEALTH POST" in value or "HEALTH CENTRE/ HEALTH POST" in value:
        return "PRIMARY FACILITY - LEVEL NOT SPECIFIED"
    return value


def load_clean_workbook_configs():
    wb = openpyxl.load_workbook(CLEAN_DATA_WORKBOOK, read_only=True, data_only=True)
    ws = wb[CLEAN_DATA_SHEET]
    rows_by_date = defaultdict(list)
    date_values = {}
    source = CLEAN_DATA_WORKBOOK.name

    for values in ws.iter_rows(min_row=2, values_only=True):
        if not any(values):
            continue
        report_date = values[0]
        if not report_date:
            continue
        report_id = date_id(report_date)
        date_values[report_id] = report_date
        province = normalize_province(values[2])
        district = normalize_district(values[3])
        original_level = clean(values[4])
        original_facility = clean(values[5])
        programme = normalize_program(values[6])
        original_item = clean(values[7])
        corrected_facility = corrected_value(values[17] if len(values) > 17 else None, original_facility)
        if str(corrected_facility or "").strip().upper() == "HC/HP" and str(original_facility or "").strip().upper() not in {"", "ALL"}:
            corrected_facility = original_facility
        corrected_item = corrected_value(values[18] if len(values) > 18 else None, original_item)
        facility_level = clean_facility_level(original_level, values[19] if len(values) > 19 else None)
        is_aggregate = (
            str(original_facility or "").strip().upper() == "ALL"
            or str(corrected_facility or "").strip().upper() == "ALL"
            or (
                str(corrected_facility or "").strip().upper() == "HC/HP"
                and facility_level in {"HEALTH POST", "HEALTH CENTRE", "PRIMARY FACILITY - LEVEL NOT SPECIFIED"}
            )
        )
        facility_name = corrected_facility or original_facility or "Unknown reporting unit"
        if is_aggregate and facility_level in {"HEALTH POST", "HEALTH CENTRE"}:
            facility_name = f"{district} {facility_level.title()} facilities"

        quantity = num(values[9] if len(values) > 9 else None)
        rows_by_date[report_id].append({
            "DATE": report_id,
            "NATION": "ZAMBIA",
            "PROVINCE": province,
            "DISTRICT": district,
            "FACILITY LEVEL": facility_level,
            "FACILITY NAME": facility_name,
            "PROGRAM": programme or "Unknown programme",
            "DESCRIPTION OF ITEM": corrected_item or original_item or "Unknown commodity",
            "UNIT": clean(values[8] if len(values) > 8 else None),
            "QUANTITY": quantity,
            "AMC": num(values[10] if len(values) > 10 else None),
            "MOS": num(values[11] if len(values) > 11 else None),
            "AVAILABILITY": 1 if (quantity or 0) > 0 else 0,
            "COMMENT": clean(values[13] if len(values) > 13 else None),
            "_RAW_AGGREGATE": is_aggregate,
        })
    wb.close()

    configs = []
    for report_id, rows in rows_by_date.items():
        raw_date = date_values[report_id]
        configs.append({
            "rows": rows,
            "reportDate": report_id,
            "label": period_label(raw_date),
            "month": month_id(raw_date),
            "week": week_label(raw_date),
            "source": source,
        })
    return configs


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
    availability_overrides = config.get("availabilityOverrides", {})
    if config.get("rows") is not None:
        rows_iter = iter(config["rows"])
        source_name = config.get("source", "Clean tracer dataset")
        wb = None
    elif config.get("rawSources"):
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
    by_program_scope = defaultdict(make_bucket)
    by_item = defaultdict(make_bucket)
    facility_items = defaultdict(lambda: {"stockout": [], "lowStock": [], "accordingToPlan": [], "overstock": []})
    facility_is_aggregate = {}
    comments = []
    province_names, district_units, facility_units, item_names, program_names = set(), set(), set(), set(), set()
    report_date = None

    for row in rows_iter:
        province = normalize_province(row.get("PROVINCE"))
        district = normalize_district(row.get("DISTRICT"))
        facility = clean(row.get("FACILITY NAME")) or "Unknown reporting unit"
        facility_level = (clean(row.get("FACILITY LEVEL")) or "Unknown facility level").upper()
        program = normalize_program(row.get("PROGRAM"))
        item = clean(row.get("DESCRIPTION OF ITEM")) or "Unknown commodity"
        if report_date is None:
            report_date = row.get("DATE")

        province_names.add(province)
        if district != "UNKNOWN":
            district_units.add((province, district))
        facility_units.add((province, district, facility_level, facility))
        item_names.add(item)
        program_names.add(program)

        for bucket in (
            national, by_province[province], by_district[(province, district)],
            by_facility_level[facility_level],
            by_facility[(province, district, facility_level, facility)],
            by_program[program],
            by_program_scope[(province, facility_level, program)],
            by_item[item],
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
        facility_result = finalize(facility, bucket, {
            "province": province,
            "district": district,
            "facilityLevel": facility_level,
            "isAggregate": facility_is_aggregate.get(key, facility.upper() == "ALL"),
            "stockoutItems": sorted(alerts["stockout"], key=lambda item: (str(item["program"]), str(item["item"])))[:60],
            "lowStockItems": sorted(alerts["lowStock"], key=lambda item: (item["mos"] if item["mos"] is not None else 99, str(item["program"]), str(item["item"])))[:60],
            "accordingToPlanItems": according_to_plan_items[:5],
            "overstockItems": overstock_items[:5],
            "stockoutItemCount": len(alerts["stockout"]),
            "lowStockItemCount": len(alerts["lowStock"]),
            "accordingToPlanItemCount": len(alerts["accordingToPlan"]),
            "overstockItemCount": len(alerts["overstock"]),
        })
        override_key = (config.get("reportDate"), province, district, facility_level, facility_match_key(facility))
        if override_key in availability_overrides:
            facility_result["availability"] = round(availability_overrides[override_key], 4)
        facilities.append(facility_result)
    facilities.sort(key=lambda item: (-item["stockoutItemCount"], -item["lowStockItemCount"], item["availability"], item["province"], item["district"], item["name"]))

    programs = [finalize(name, bucket) for name, bucket in by_program.items()]
    programs.sort(key=lambda item: (item["availability"], -item["riskRows"]))
    program_scopes = [
        finalize(program, bucket, {
            "province": province,
            "facilityLevel": facility_level,
        })
        for (province, facility_level, program), bucket in by_program_scope.items()
    ]
    program_scopes.sort(key=lambda item: (item["province"], item["facilityLevel"], item["availability"], item["name"]))
    items = [finalize(name, bucket, {"normalized": norm_text(name)}) for name, bucket in by_item.items()]
    items.sort(key=lambda item: (-item["riskRows"], item["availability"], str(item["name"])))

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
        "programmeScopes": program_scopes,
        "commodities": items,
        "comments": comments[:100],
    }


def reporting_rate(reported, expected):
    return round(reported / expected, 4) if expected else 0


def reporting_facility_type(facility_level):
    text = str(facility_level or "").upper()
    if "HEALTH POST" in text:
        return "Health Posts"
    if "HEALTH CENTRE" in text or "HEALTH CENTER" in text:
        return "Health Centres"
    if "RENAL" in text:
        return "Renal Units"
    if "CANCER" in text:
        return "Cancer Units"
    if "MENTAL" in text:
        return "Mental Health Units"
    if "OPTH" in text or "OPHTH" in text:
        return "Ophthalmology Units"
    if "TB" in text or "DS-TB" in text or "MDR" in text:
        return "TB-DS/MDR Units"
    if "HEART" in text:
        return "Heart Hospital"
    if "WOMEN" in text or "NEW BORN" in text:
        return "Women and Newborn Hospital"
    if "PAEDIATRIC" in text:
        return "Paediatric Hospital"
    if "LEVEL 2" in text or "GENERAL HOSPITAL" in text:
        return "Level 2 Hospitals"
    if "LEVEL 1" in text or "DISTRICT" in text:
        return "Level 1 Hospitals"
    if "LEVEL 3" in text or "TERTIARY" in text or "SPECIAL" in text:
        return "Level 3/Specialised Hospitals"
    if "PRIMARY FACILITY" in text:
        return "Primary - level not specified"
    return "Other reporting units"


def build_reporting_quality(periods, expected_districts, expected_facilities):
    province_names = sorted({province for province, _district in expected_districts})
    district_names = sorted(expected_districts)
    expected_level_reports = {
        (province, district, reporting_facility_type(facility_level))
        for province, district, facility_level, _facility in expected_facilities
    }

    for period in periods:
        present_districts = {(district["province"], district["name"]) for district in period["districts"]}
        present_facilities = {
            (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
            for facility in period["facilities"]
        }
        present_level_reports = {
            (province, district, reporting_facility_type(facility_level))
            for province, district, facility_level, _facility in present_facilities
            if district != "UNKNOWN"
        }
        missing_districts = sorted(expected_districts - present_districts)
        missing_level_reports = sorted(expected_level_reports - present_level_reports)

        province_rows = []
        for province in province_names:
            expected_province_reports = {item for item in expected_level_reports if item[0] == province}
            reported_province_reports = expected_province_reports & present_level_reports
            expected_province_districts = {item for item in expected_districts if item[0] == province}
            reported_province_districts = expected_province_districts & present_districts
            expected = len(expected_province_reports)
            reported = len(reported_province_reports)
            province_rows.append({
                "name": province,
                "districts": len(reported_province_districts),
                "expectedDistricts": len(expected_province_districts),
                "expected": expected,
                "reported": reported,
                "missing": max(expected - reported, 0),
                "rate": reporting_rate(reported, expected),
            })

        district_rows = []
        for province, district in district_names:
            expected_district_reports = {item for item in expected_level_reports if item[0] == province and item[1] == district}
            reported_district_reports = expected_district_reports & present_level_reports
            expected = len(expected_district_reports)
            reported = len(reported_district_reports)
            district_rows.append({
                "province": province,
                "name": district,
                "expected": expected,
                "reported": reported,
                "missing": max(expected - reported, 0),
                "rate": reporting_rate(reported, expected),
            })

        type_rows = []
        for province, district, facility_type in sorted(expected_level_reports):
            reported = 1 if (province, district, facility_type) in present_level_reports else 0
            type_rows.append({
                "province": province,
                "district": district,
                "type": facility_type,
                "expected": 1,
                "reported": reported,
                "missing": 1 - reported,
                "rate": reporting_rate(reported, 1),
            })

        province_rows.sort(key=lambda item: (item["rate"], -item["missing"], item["name"]))
        district_rows.sort(key=lambda item: (item["rate"], -item["missing"], item["province"], item["name"]))
        type_rows.sort(key=lambda item: (item["province"], item["district"], item["type"]))

        period["counts"]["expectedDistricts"] = len(expected_districts)
        period["counts"]["expectedFacilityUnits"] = len(expected_level_reports)
        period["counts"]["expectedLevelReports"] = len(expected_level_reports)
        period["counts"]["missingDistricts"] = len(missing_districts)
        period["counts"]["missingFacilityUnits"] = len(missing_level_reports)
        period["counts"]["missingLevelReports"] = len(missing_level_reports)
        period["missingDistricts"] = [
            {"province": province, "district": district}
            for province, district in missing_districts[:100]
        ]
        period["missingFacilities"] = [
            {"province": province, "district": district, "facilityLevel": facility_type, "name": facility_type}
            for province, district, facility_type in missing_level_reports[:100]
        ]
        period["dataQuality"] = {
            "provinces": province_rows,
            "districts": district_rows,
            "facilityTypes": type_rows,
        }


def main():
    availability_overrides = load_raw_availability_overrides()
    configs = []
    for config in load_clean_workbook_configs():
        config["availabilityOverrides"] = availability_overrides
        configs.append(config)
    periods = [summarize(config) for config in configs]
    periods.sort(key=lambda item: item["reportDate"])
    expected_districts = {(district["province"], district["name"]) for period in periods for district in period["districts"] if district["name"] != "UNKNOWN"}
    expected_facilities = {
        (facility["province"], facility["district"], facility["facilityLevel"], facility["name"])
        for period in periods
        for facility in period["facilities"]
        if facility["district"] != "UNKNOWN"
    }
    build_reporting_quality(periods, expected_districts, expected_facilities)
    output = (
        "export const tracerReportingPeriods = "
        + json.dumps(periods, indent=2)
        + ";\n\nexport const tracerFacilityData = tracerReportingPeriods.at(-1);\n"
    )
    OUT.write_text(output, encoding="utf-8")
    print([(item["label"], item["counts"]) for item in periods])


if __name__ == "__main__":
    main()
