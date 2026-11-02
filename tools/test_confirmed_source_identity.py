"""Check the user-confirmed Kamuchanga block without editing a source workbook."""

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from import_october_week2 import OUTPUT, load_generator, normalize_week2_rows
from import_october_week4 import DIRECTORY, FILES


class ConfirmedSourceIdentity(unittest.TestCase):
    def setUp(self):
        self.g = load_generator()
        self.correction = self.g.CONFIRMED_SOURCE_BLOCK_IDENTITIES[0]
        self.cells = {(3, 2): "Product description"}
        self.sheet = SimpleNamespace(title="L-1", max_row=53,
            cell=lambda r, c: SimpleNamespace(value=self.cells.get((r, c))))
        self.corrections = {("L-1", 49, 50): self.correction}

    def test_only_the_confirmed_blank_block_gets_an_identity(self):
        self.assertEqual(self.g.raw_sheet_block_identity(self.sheet, 49, 50), (None, None))
        self.assertEqual(self.g.raw_sheet_block_identity(self.sheet, 49, 50, self.corrections),
                         ("MUFULIRA", "KAMUCHANGA DISTRICT HOSPITAL"))
        self.assertEqual(self.g.raw_sheet_block_identity(self.sheet, 53, 54, self.corrections), (None, None))
        self.sheet.title = "L-2"
        self.assertEqual(self.g.raw_sheet_block_identity(self.sheet, 49, 50, self.corrections), (None, None))

    def test_entered_names_cannot_be_overwritten(self):
        self.cells[(2, 49)] = "MPONGWE"
        self.cells[(2, 50)] = "St Theresa"
        with self.assertRaisesRegex(ValueError, "cannot overwrite"):
            self.g.raw_sheet_block_identity(self.sheet, 49, 50, self.corrections)

    def test_workbook_hash_province_and_week_are_guarded(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / self.correction["workbook"]
            path.write_bytes(b"reviewed source fixture")
            correction = {**self.correction, "workbookSha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            self.g.CONFIRMED_SOURCE_BLOCK_IDENTITIES = [correction]
            source = {"path": path, "province": "COPPERBELT PROVINCE"}
            self.assertIn(("L-1", 49, 50), self.g.confirmed_source_block_corrections(source, "2026-11-01"))
            self.assertEqual(self.g.confirmed_source_block_corrections(source, "2026-10-25"), {})
            with self.assertRaises(ValueError):
                self.g.confirmed_source_block_corrections({**source, "province": "SOUTHERN PROVINCE"}, "2026-11-01")
            path.write_bytes(b"changed source fixture")
            with self.assertRaises(ValueError):
                self.g.confirmed_source_block_corrections(source, "2026-11-01")

    def test_all_fifty_imported_values_match_the_confirmed_excel_column(self):
        path = DIRECTORY / FILES["COPPERBELT PROVINCE"]
        if not path.exists():
            self.skipTest("Provincial source workbook is not installed on this host")
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        self.g.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
        source = {"path": path, "province": "COPPERBELT PROVINCE", "primaryCareSummaryLayout": True}
        rows = [r for r in normalize_week2_rows(self.g, [source], "2026-11-01")
                if r.get("_RAW_IDENTITY_CORRECTION")]
        self.assertEqual(len(rows), 50)
        dataset = json.loads(OUTPUT.read_text(encoding="utf-8"))
        period = next(p for p in dataset["tracerReportingPeriods"] if p["id"] == "2026-11-01")
        data = period["commodityFacilityData"]
        published = {data["dictionaries"]["items"][r[4]]: r[6:9] for r in data["rows"]
            if data["dictionaries"]["provinces"][r[0]] == "COPPERBELT PROVINCE"
            and data["dictionaries"]["districts"][r[1]] == "MUFULIRA"
            and data["dictionaries"]["facilities"][r[3]] == "KAMUCHANGA DISTRICT HOSPITAL"}
        self.assertEqual(len(published), 50)
        workbook = self.g.openpyxl.load_workbook(path, data_only=True)
        try:
            sheet = workbook["L-1"]
            for index, row in enumerate(rows, 4):
                raw = sheet.cell(index, 49).value
                quantity = self.g.num(raw)
                quantity = max(0, int(quantity)) if quantity is not None else 0
                amc = self.g.num(sheet.cell(index, 50).value)
                with self.subTest(cell=sheet.cell(index, 49).coordinate):
                    self.assertEqual(row["QUANTITY"], quantity)
                    self.assertEqual(row["AMC"], amc)
                    self.assertEqual(row["MOS"], quantity / amc if amc is not None and amc > 0 else None)
                    self.assertEqual(row["DISTRICT"], "MUFULIRA")
                    self.assertEqual(row["FACILITY NAME"], "KAMUCHANGA DISTRICT HOSPITAL")
                    self.assertEqual(published[row["DESCRIPTION OF ITEM"]], [row["QUANTITY"], row["AMC"], row["MOS"]])
        finally:
            workbook.close()
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)


if __name__ == "__main__":
    unittest.main()
