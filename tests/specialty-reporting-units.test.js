import assert from "node:assert/strict";
import test from "node:test";

import { tracerReportingPeriods as marchAprilPeriods } from "../src/tracerFacilityDataMarApr.js";
import { tracerReportingPeriods as mayJunePeriods } from "../src/tracerFacilityDataMayJun.js";
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

test("reprocessed historical weeks keep Kabwe specialised units distinct", () => {
  const reprocessedIds = new Set([
    "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29",
    "2026-04-05", "2026-04-19", "2026-04-26", "2026-05-24",
    "2026-06-14", "2026-06-21", "2026-06-28",
  ]);
  const expectedUnits = new Set([
    "LEVEL 3 HOSPITAL|Kabwe Central Hospital",
    "EYE/OPHTHALMOLOGY HOSPITAL|Kabwe Central Hospital - Eye Unit",
    "MENTAL HEALTH UNITS|Kabwe Central Hospital - Mental Health Unit",
    "RENAL UNITS|Kabwe Central Hospital - Renal Unit",
  ]);

  [...marchAprilPeriods, ...mayJunePeriods]
    .filter((period) => reprocessedIds.has(period.id))
    .forEach((period) => {
      const { dictionaries, rows } = period.commodityFacilityData;
      const kabweRows = rows
        .map(([province, district, level, facility, item]) => ({
          province: dictionaries.provinces[province],
          district: dictionaries.districts[district],
          level: dictionaries.levels[level],
          facility: dictionaries.facilities[facility],
          item: dictionaries.items[item],
        }))
        .filter((row) => row.province === "CENTRAL PROVINCE"
          && row.district === "KABWE"
          && row.facility.startsWith("Kabwe Central Hospital"));

      assert.deepEqual(
        new Set(kabweRows.map((row) => `${row.level}|${row.facility}`)),
        expectedUnits,
        `${period.label} should retain all Kabwe reporting units`,
      );
      const keys = kabweRows.map((row) => `${row.level}|${row.facility}|${row.item}`);
      assert.equal(new Set(keys).size, keys.length, `${period.label} contains a merged Kabwe facility-item record`);
    });
});
