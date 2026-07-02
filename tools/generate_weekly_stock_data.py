import json
from pathlib import Path

import openpyxl


WORKBOOK = Path(r"C:\Users\Zanga Musakuzi\Desktop\zammsa folder\weekly inventory emms stock status\june\STOCK POSITION 19 AND 26 JUNE 2026.xlsx")
OUT = Path(__file__).resolve().parents[1] / "src" / "weeklyStockData.js"

SHEETS = [
    {"sheet": "19june", "date": "2026-06-19", "label": "19 June 2026", "stream": "EMMS", "overallCell": "C3", "startRow": 25, "endRow": 560},
    {"sheet": "26June", "date": "2026-06-26", "label": "26 June 2026", "stream": "EMMS", "overallCell": "C3", "startRow": 25, "endRow": 560},
    {"sheet": "LAB 19June", "date": "2026-06-19", "label": "19 June 2026", "stream": "LAB", "overallCell": "C2", "startRow": 18, "endRow": 270},
    {"sheet": "LAB26 June", "date": "2026-06-26", "label": "26 June 2026", "stream": "LAB", "overallCell": "C2", "startRow": 18, "endRow": 270},
]


def clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = " ".join(value.strip().split())
        return value or None
    return value


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def pct(value):
    value = num(value)
    if value is None:
        return 0
    if value > 1:
        value = value / 100
    return max(0, min(value, 1))


def parse_sheet(ws, config):
    categories = []
    items = []
    current_category = None
    blank_streak = 0

    for row in range(config["startRow"], config["endRow"] + 1):
        left_name = clean(ws.cell(row, 2).value)
        left_availability = num(ws.cell(row, 3).value)
        item_index = ws.cell(row, 5).value
        right_name = clean(ws.cell(row, 6).value)
        right_availability = num(ws.cell(row, 7).value)

        has_data = any(value not in (None, "") for value in (left_name, left_availability, item_index, right_name, right_availability))
        blank_streak = 0 if has_data else blank_streak + 1
        if blank_streak > 25:
            break

        if left_name and str(left_name).upper() not in {"PRODUCT CATEGORY", "CATEGORY"} and left_availability is not None:
            categories.append({
                "name": left_name,
                "availability": round(pct(left_availability), 4),
            })

        if right_name and right_availability is not None:
            if item_index is None or not isinstance(item_index, (int, float)):
                current_category = right_name
            else:
                items.append({
                    "category": current_category or "Uncategorised",
                    "name": right_name,
                    "availability": round(pct(right_availability), 4),
                    "status": "Available" if pct(right_availability) > 0 else "Stockout",
                })

    categories.sort(key=lambda item: (item["availability"], item["name"]))
    items.sort(key=lambda item: (item["availability"], item["category"], item["name"]))
    available_items = sum(1 for item in items if item["availability"] > 0)
    return {
        "id": f'{config["stream"].lower()}-{config["date"]}',
        "date": config["date"],
        "label": config["label"],
        "stream": config["stream"],
        "source": WORKBOOK.name,
        "overallAvailability": round(pct(ws[config["overallCell"]].value), 4),
        "counts": {
            "categories": len(categories),
            "items": len(items),
            "availableItems": available_items,
            "stockoutItems": len(items) - available_items,
        },
        "categories": categories,
        "items": items,
    }


def main():
    workbook = openpyxl.load_workbook(WORKBOOK, read_only=False, data_only=True, keep_links=False)
    periods = [parse_sheet(workbook[config["sheet"]], config) for config in SHEETS]
    workbook.close()
    output = (
        "export const weeklyStockPeriods = "
        + json.dumps(periods, indent=2)
        + ";\n\nexport const latestWeeklyStock = weeklyStockPeriods.at(-1);\n"
    )
    OUT.write_text(output, encoding="utf-8")
    print([(period["stream"], period["label"], period["overallAvailability"], period["counts"]) for period in periods])


if __name__ == "__main__":
    main()
