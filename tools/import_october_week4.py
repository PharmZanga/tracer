"""Import the ten current October Week 4 workbooks, without carrying data forward."""

from pathlib import Path

from import_october_week3 import ROOT, main

DIRECTORY = Path(r"C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\october\week 4")
FILES = {
    "COPPERBELT PROVINCE": "01.11.26 COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx",
    "EASTERN PROVINCE": "01 Nov EASTERN_PROVINCE_2026_TRACER_ (1).xlsx",
    "WESTERN PROVINCE": "01-11-26 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT  (2).xlsx",
    "CENTRAL PROVINCE": "1_11_2026 CENTRAL PROVINCE 2026 TRACER WEEKLY REPORT.xlsx",
    "LUAPULA PROVINCE": "LUAPULA PROVINCE 2026 TRACER WEEKLY REPORT 31 10 26.xlsx",
    "LUSAKA PROVINCE": "LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES 30.10.26.xlsx",
    "NORTHERN PROVINCE": "NORTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-01.11.2026.xlsx",
    "MUCHINGA PROVINCE": "MUCHINGA 25. 30_10_2026.xlsx",
    "NORTH-WESTERN PROVINCE": "01-11-2026 NORTHWESTERN TRACER WEEKLY REPORT PROVINCES.xlsx",
    "SOUTHERN PROVINCE": "SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 30.10.26 (1).xlsx",
}

if __name__ == "__main__":
    main(
        directory=DIRECTORY, files=FILES, report_date="2026-11-01",
        source="October Week 4: all ten provincial submissions received; North-Western resubmission replaces earlier workbook; SOH normalized to whole units; blank and all-zero SOH blocks excluded",
        audit_path=ROOT / "outputs/october-week4-province-audit/source-audit.json",
        label="Week 4 - 1 November 2026", month="2026-10", week="Week 4",
    )
