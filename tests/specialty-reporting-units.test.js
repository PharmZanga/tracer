import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods } from "../src/tracerFacilityDataSep.js";

test("Kabwe Adult and Eye Unit submissions remain separate for Normal Saline", () => {
  const period = tracerReportingPeriods.find((entry) => entry.id === "2026-09-06");
  assert.ok(period, "September Week 1 should be available");

  const { dictionaries, rows } = period.commodityFacilityData;
  const submissions = rows
    .map(([province, district, level, facility, item, programme, quantity, amc, mos]) => ({
      province: dictionaries.provinces[province],
      district: dictionaries.districts[district],
      level: dictionaries.levels[level],
      facility: dictionaries.facilities[facility],
      item: dictionaries.items[item],
      quantity,
      amc,
      mos,
    }))
    .filter((row) => (
      row.province === "CENTRAL PROVINCE"
      && row.district === "KABWE"
      && row.item === "Sodium Chloride (Normal Saline) 500ml 0.09% (1)"
      && row.facility.startsWith("Kabwe Central Hospital")
    ));

  assert.deepEqual(submissions, [
    {
      province: "CENTRAL PROVINCE",
      district: "KABWE",
      level: "LEVEL 3 HOSPITAL",
      facility: "Kabwe Central Hospital",
      item: "Sodium Chloride (Normal Saline) 500ml 0.09% (1)",
      quantity: 0,
      amc: 4500,
      mos: 0,
    },
    {
      province: "CENTRAL PROVINCE",
      district: "KABWE",
      level: "EYE/OPHTHALMOLOGY HOSPITAL",
      facility: "Kabwe Central Hospital - Eye Unit",
      item: "Sodium Chloride (Normal Saline) 500ml 0.09% (1)",
      quantity: 0,
      amc: 1300,
      mos: 0,
    },
  ]);
});
