import unittest
from types import SimpleNamespace
from unittest.mock import patch

from import_october_week2 import audit_province_facility_blocks, load_generator


class ReorderedTracerTabs(unittest.TestCase):
    def setUp(self):
        self.generator = load_generator()
        self.cells = {
            (2, 2): 'DISTRICT LEVEL 1 HOSPITALS',
            (2, 10): 'NAME  OF DISTRICT', (2, 11): 'NAME  OF DISTRICT HOSPITAL',
            (3, 10): 'KAOMA', (3, 11): 'MANGANGO HOSPITAL',
            (5, 2): 'Product description', (5, 10): 'Quantity', (5, 11): 'AMC', (5, 12): 'MOS',
            (5, 14): 'Total Quantity', (5, 15): 'Average AMC', (5, 16): 'Average MOS',
            (6, 2): 'Medicine A', (6, 10): 20, (6, 11): 5, (6, 12): 4,
            (7, 2): 'Medicine B', (7, 10): 0, (7, 11): 5, (7, 12): 0,
            (8, 2): 'PERCENTAGE AVAILABILITY', (8, 10): .5,
        }
        self.sheet = SimpleNamespace(title='L-1', max_row=8, max_column=16,
            cell=lambda r, c: SimpleNamespace(value=self.cells.get((r, c))))
        self.blank = SimpleNamespace(title='Sheet1', max_row=1, max_column=1,
            cell=lambda r, c: SimpleNamespace(value=None))

    def test_shifted_hospital_headers_are_read_without_summary_or_footer_rows(self):
        self.assertEqual(self.generator.raw_sheet_block_identity(self.sheet, 10, 11),
                         ('KAOMA', 'MANGANGO HOSPITAL'))
        self.assertEqual(self.generator.raw_sheet_facility_blocks(self.sheet), [(10, 10, 11)])
        source = {'province': 'WESTERN PROVINCE', 'path': 'western.xlsx'}
        for sheets in ([self.blank, self.sheet], [self.sheet, self.blank]):
            with self.subTest(order=[sheet.title for sheet in sheets]):
                workbook = SimpleNamespace(worksheets=sheets, close=lambda: None)
                with patch.object(self.generator.openpyxl, 'load_workbook', return_value=workbook):
                    rows = list(self.generator.iter_raw_matrix_rows(source, '2026-10-25'))
                self.assertEqual(len(rows), 2)
                self.assertEqual({row['FACILITY LEVEL'] for row in rows}, {'LEVEL 1 HOSPITAL'})
                self.assertEqual([row['QUANTITY'] for row in rows], [20, 0])
                self.assertEqual({row['DISTRICT'] for row in rows}, {'KAOMA'})

    def test_province_validation_uses_the_same_shifted_headers(self):
        from pathlib import Path
        workbook = SimpleNamespace(worksheets=[self.sheet], close=lambda: None)
        source = {'province': 'WESTERN PROVINCE', 'path': Path('western.xlsx')}
        with patch.object(self.generator.openpyxl, 'load_workbook', return_value=workbook):
            findings, invalid = audit_province_facility_blocks(self.generator, [source])
        self.assertEqual(findings, [])
        self.assertEqual(invalid, set())


if __name__ == '__main__':
    unittest.main()
