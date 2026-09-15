import test from "node:test";
import assert from "node:assert/strict";

import { weeklyStockPeriods } from "../src/weeklyStockData.js";

test("4 and 11 September weekly ZAMMSA reports reconcile to the source workbook", () => {
  const september = weeklyStockPeriods.filter((period) =>
    ["2026-09-04", "2026-09-11"].includes(period.date),
  );

  assert.equal(september.length, 4);
  const expected = new Map([
    ["2026-09-04|EMMS", [0.4256, 477, 203]],
    ["2026-09-04|LAB", [0.5314, 229, 94]],
    ["2026-09-11|EMMS", [0.4256, 477, 203]],
    ["2026-09-11|LAB", [0.5429, 229, 95]],
  ]);

  for (const period of september) {
    const source = expected.get(`${period.date}|${period.stream}`);
    assert.ok(source, `unexpected September period ${period.date}|${period.stream}`);
    assert.deepEqual(
      [period.overallAvailability, period.counts.items, period.counts.availableItems],
      source,
    );
    assert.equal(period.counts.availableItems + period.counts.stockoutItems, period.counts.items);
  }
});
