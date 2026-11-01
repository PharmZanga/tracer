"""Reconcile restored Western hospital observations to concrete source cells."""

import json
import unittest
from decimal import Decimal

import import_october_week1 as week1
import import_october_week2 as week2
import import_october_week3 as week3


class WesternSourceCoverage(unittest.TestCase):
    def test_each_restored_soh_and_amc_matches_its_labelled_excel_block(self):
        g = week2.load_generator()
        g.openpyxl.reader.excel.find_images = lambda archive, target: ([], [])
        dataset = json.loads(week2.OUTPUT.read_text(encoding='utf-8'))
        sources_by_date = {'2026-10-11': week1, '2026-10-18': week2, '2026-10-25': week3}
        for period in (p for p in dataset['tracerReportingPeriods'] if p['id'] in sources_by_date):
            module = sources_by_date[period['id']]
            path = module.DIRECTORY / module.FILES['WESTERN PROVINCE']
            if not path.exists():
                self.skipTest('Provincial source workbooks are not installed on this host')
            workbook = g.openpyxl.load_workbook(path, data_only=True)
            try:
                sheet = workbook['L-1']
                data = period['commodityFacilityData']
                published = {}
                for row in data['rows']:
                    if data['dictionaries']['provinces'][row[0]] != 'WESTERN PROVINCE' or data['dictionaries']['levels'][row[2]] != 'LEVEL 1 HOSPITAL':
                        continue
                    key = tuple(data['dictionaries'][name][row[index]] for index, name in
                                ((1, 'districts'), (3, 'facilities'), (4, 'items')))
                    self.assertNotIn(key, published)
                    published[key] = row[6:9]
                count = 0
                # The labelled Western L-1 matrix has 12 hospitals, 50 tracer
                # commodities, and an aggregate column that must not be counted.
                for column in range(10, 55, 4):
                    district = str(sheet.cell(3, column).value).strip().upper()
                    facility = str(sheet.cell(3, column + 1).value).strip()
                    for row in range(6, 56):
                        item = ' '.join(str(sheet.cell(row, 2).value).split())
                        raw = sheet.cell(row, column).value
                        quantity = 0 if raw is None or str(raw).strip() in ('', '-') else max(0, int(Decimal(str(raw).replace(',', ''))))
                        amc = float(sheet.cell(row, column + 1).value)
                        actual = published[(district, facility, item)]
                        with self.subTest(period=period['id'], cell=sheet.cell(row, column).coordinate):
                            self.assertEqual(actual[:2], [quantity, amc])
                            if amc > 0:
                                self.assertAlmostEqual(actual[2], quantity / amc)
                            else:
                                self.assertIsNone(actual[2])
                        count += 1
                self.assertEqual(count, 600)
                self.assertEqual(len(published), count)
            finally:
                workbook.close()


if __name__ == '__main__':
    unittest.main()
