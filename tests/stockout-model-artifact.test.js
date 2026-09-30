import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artifact = JSON.parse(fs.readFileSync(new URL("../public/data/predictions/stockout-model.json", import.meta.url), "utf8"));

test("stock-out model artifact preserves leakage-safe outcome and availability rules", () => {
  assert.equal(artifact.version, "stockout-v1");
  assert.match(artifact.outcomeRule, /21-35 days/i);
  assert.ok(["validated", "unavailable"].includes(artifact.predictionStatus));
  assert.ok(artifact.splits.trainDates.length > 0);
  assert.ok(artifact.splits.validationDates.length > 0);
  assert.ok(artifact.splits.testDates.length > 0);
  assert.ok(artifact.candidates.every((candidate) => candidate.test.samples >= 0));
  if (artifact.predictionStatus === "unavailable") assert.ok(artifact.limitation);
});
