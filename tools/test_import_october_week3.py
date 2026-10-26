import unittest
from types import SimpleNamespace
from unittest.mock import patch

from import_october_week3 import exclude_all_zero_soh_blocks, load_generator


def row(column, quantity, amc=10):
    return {"_RAW_SOURCE_WORKBOOK": "source.xlsx", "_RAW_SOURCE_SHEET": "HC", "_RAW_SOH_COLUMN": column,
            "PROVINCE": "P", "DISTRICT": "D", "FACILITY LEVEL": "HEALTH CENTRE", "FACILITY NAME": "F",
            "QUANTITY": quantity, "AMC": amc}


class ZeroStockBlockRule(unittest.TestCase):
    def test_zero_soh_with_positive_amc_is_not_a_submission(self):
        included, excluded = exclude_all_zero_soh_blocks([row(5, 0), row(5, 0)])
        self.assertEqual(included, [])
        self.assertEqual(excluded[0]["excludedRows"], 2)

    def test_zero_rows_within_a_positive_block_remain(self):
        source = [row(5, 10), row(5, 0), row(5, 0)]
        included, excluded = exclude_all_zero_soh_blocks(source)
        self.assertEqual(included, source)
        self.assertEqual(excluded, [])

    def test_one_submitted_block_does_not_make_another_block_reported(self):
        included, excluded = exclude_all_zero_soh_blocks([row(5, 10), row(9, 0), row(9, 0)])
        self.assertEqual(len(included), 1)
        self.assertEqual(excluded[0]["quantityColumn"], 9)


class PrimaryCareHeaderRule(unittest.TestCase):
    def test_dho_suffix_is_accepted_only_for_a_valid_district_in_its_province(self):
        generator = load_generator()
        self.assertEqual(generator.canonical_district("NORTH-WESTERN PROVINCE", "MUFUMBWE DHO"), "MUFUMBWE")
        self.assertIsNone(generator.canonical_district("LUSAKA PROVINCE", "MUFUMBWE DHO"))
        self.assertIsNone(generator.canonical_district("NORTH-WESTERN PROVINCE", "NAME OF DISTRICT DHO"))

    def test_missing_or_misaligned_description_does_not_hide_the_hc_submission(self):
        generator = load_generator()
        cells = {(1, 1): "HEALTH CENTRE", (1, 2): "DESCRIPTION OF ITEM", (2, 5): "CHAVUMA", (2, 6): 6,
                 (3, 5): "Quantity", (3, 6): "AMC", (3, 7): "MOS",
                 (4, 2): "Medicine A", (4, 5): 12, (4, 6): 3, (4, 7): 4,
                 (5, 2): "Medicine B", (5, 5): 0, (5, 6): 3, (5, 7): 0}
        sheet = SimpleNamespace(title="HC", max_row=5, max_column=7, cell=lambda r, c: SimpleNamespace(value=cells.get((r, c))))
        workbook = SimpleNamespace(worksheets=[sheet], close=lambda: None)
        source = {"province": "NORTH-WESTERN PROVINCE", "path": "source.xlsx", "primaryCareSummaryLayout": True}
        for description in (None, "DESCRIPTION OF ITEM"):
            with self.subTest(description=description):
                cells[(1, 2)] = description
                with patch.object(generator.openpyxl, "load_workbook", return_value=workbook):
                    rows = list(generator.iter_raw_matrix_rows(source, "2026-10-25"))
                self.assertEqual(len(rows), 2)
                self.assertEqual(rows[0]["DISTRICT"], "CHAVUMA")
                self.assertEqual(rows[0]["FACILITY LEVEL"], "HEALTH CENTRE")
                self.assertEqual(rows[0]["QUANTITY"], 12)

    def test_stray_metric_labels_do_not_override_the_full_description_header(self):
        generator = load_generator()
        cells = {(1, 1): "HEALTH POST", (3, 5): "CHAVUMA", (3, 6): 6,
                 (3, 9): "Total Quantity", (3, 10): "AMC", (3, 11): "MOS",
                 (4, 2): "DESCRIPTION OF ITEM", (4, 5): "Quantity", (4, 6): "AMC", (4, 7): "MOS",
                 (5, 2): "Medicine A", (5, 5): 12, (5, 6): 3, (5, 7): 4}
        sheet = SimpleNamespace(title="HP", max_row=5, max_column=11, cell=lambda r, c: SimpleNamespace(value=cells.get((r, c))))
        workbook = SimpleNamespace(worksheets=[sheet], close=lambda: None)
        source = {"province": "NORTH-WESTERN PROVINCE", "path": "source.xlsx", "primaryCareSummaryLayout": True}
        with patch.object(generator.openpyxl, "load_workbook", return_value=workbook):
            rows = list(generator.iter_raw_matrix_rows(source, "2026-10-25"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["FACILITY LEVEL"], "HEALTH POST")
        self.assertEqual(rows[0]["QUANTITY"], 12)


if __name__ == "__main__":
    unittest.main()
