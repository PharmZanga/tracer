import argparse
import json
from pathlib import Path


def load_js_export(path, export_name):
    text = path.read_text(encoding="utf-8")
    marker = f"export const {export_name} ="
    start = text.index(marker) + len(marker)
    return json.loads(text[start:].strip().rstrip(";"))


def main():
    parser = argparse.ArgumentParser(description="Build tracer central-stock data from the validated ZAMMSA history export.")
    parser.add_argument("history", type=Path)
    parser.add_argument("--date", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()

    rows = [row for row in load_js_export(args.history, "stockHistory") if row.get("reportDate") == args.date]
    if len(rows) < 650:
        raise ValueError(f"Expected at least 650 rows for {args.date}; found {len(rows)}")
    if len({row["code"] for row in rows}) != len(rows):
        raise ValueError("The selected report contains duplicate ordering codes")

    summary = {
        "listed": len(rows),
        "confirmedStockouts": sum(row.get("stockOnHand") == 0 and row.get("mos") == 0 for row in rows),
        "belowTwoMos": sum(row.get("mos") is not None and row.get("mos") < 2 for row in rows),
        "twoToFourMos": sum(row.get("mos") is not None and 2 <= row.get("mos") <= 4 for row in rows),
        "aboveSixMos": sum(row.get("mos") is not None and row.get("mos") > 6 for row in rows),
        "mosDataGaps": sum(row.get("mos") is None for row in rows),
    }
    categories = {}
    for row in rows:
        current = categories.setdefault(row["category"], {"name": row["category"], "listed": 0, "belowTwoMos": 0, "confirmedStockouts": 0, "mosDataGaps": 0})
        current["listed"] += 1
        current["belowTwoMos"] += row.get("mos") is not None and row.get("mos") < 2
        current["confirmedStockouts"] += row.get("stockOnHand") == 0 and row.get("mos") == 0
        current["mosDataGaps"] += row.get("mos") is None

    report = {
        "date": args.date,
        "label": args.label,
        "source": args.source,
        "summary": summary,
        "categories": sorted(categories.values(), key=lambda row: (-row["belowTwoMos"], row["name"])),
        "rows": rows,
    }
    output = Path(__file__).resolve().parents[1] / "src" / "zammsaCentralStockData.js"
    output.write_text(
        "export const zammsaCentralReports = " + json.dumps([report], indent=2) + ";\n\n"
        "export const latestZammsaCentralReport = zammsaCentralReports.at(-1);\n",
        encoding="utf-8",
    )
    print(json.dumps({"date": args.date, **summary}, indent=2))


if __name__ == "__main__":
    main()
