import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRedistributionCandidates } from "../src/redistribution.js";

const row = (overrides = {}) => ({
  province: "LUSAKA PROVINCE",
  district: "LUSAKA",
  facilityLevel: "Health Centre",
  facility: "Facility",
  item: "Sodium Chloride 0.9% 500ml",
  quantity: 0,
  amc: 2,
  mos: 0,
  ...overrides,
});

test("prioritises overstocked sources and calculates both facilities after transfer", () => {
  const results = buildRedistributionCandidates([
    row({ facility: "Urgent HC", district: "CHONGWE" }),
    row({ facility: "Nearby well-stocked", district: "CHONGWE", quantity: 9, amc: 3, mos: 3 }),
    row({ facility: "Overstock source", province: "CENTRAL PROVINCE", district: "CHIBOMBO", quantity: 10, amc: 2, mos: 5 }),
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].sourceFacility, "Overstock source");
  assert.equal(results[0].sourceStatus, "Overstocked");
  assert.equal(results[0].geographyPriority, "Cross-province");
  assert.equal(results[0].proposedTransferQty, 2);
  assert.equal(results[0].sourceQty, 10);
  assert.equal(results[0].sourceQtyAfter, 8);
  assert.equal(results[0].sourceMosAfter, 4);
  assert.equal(results[0].destinationQtyAfter, 2);
  assert.equal(results[0].destinationMosAfter, 1);
});

test("uses a well-stocked source above two MOS when no overstock is available", () => {
  const results = buildRedistributionCandidates([
    row({ facility: "Urgent HP", district: "KAFUE", facilityLevel: "Health Post" }),
    row({ facility: "Well-stocked HC", district: "KAFUE", quantity: 9, amc: 3, mos: 3 }),
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].sourceStatus, "Well stocked (>2 MOS)");
  assert.equal(results[0].geographyPriority, "Same district");
  assert.ok(results[0].sourceMosAfter >= 1);
});

test("never allocates below the source one-month reserve across recommendations", () => {
  const results = buildRedistributionCandidates([
    row({ facility: "Urgent A", district: "CHONGWE", amc: 4 }),
    row({ facility: "Urgent B", district: "KAFUE", amc: 4 }),
    row({ facility: "Overstock source", quantity: 10, amc: 2, mos: 5 }),
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0].proposedTransferQty + results[1].proposedTransferQty, 8);
  assert.equal(results.at(-1).sourceQtyAfter, 2);
  assert.equal(results.at(-1).sourceMosAfter, 1);
});

test("only matches urgent receivers with zero quantity and zero MOS", () => {
  const results = buildRedistributionCandidates([
    row({ facility: "Has stock", quantity: 1, amc: 2, mos: 0.5 }),
    row({ facility: "Missing AMC", quantity: 0, amc: 0, mos: 0 }),
    row({ facility: "Source", quantity: 20, amc: 2, mos: 10 }),
  ]);

  assert.equal(results.length, 0);
});

test("action tracker offers 10, 50 and 100 row pages", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /useState\(10\)/);
  assert.match(appSource, /<option value="10">10<\/option>/);
  assert.match(appSource, /<option value="50">50<\/option>/);
  assert.match(appSource, /<option value="100">100<\/option>/);
  assert.match(appSource, /visibleActionCommodityCandidates/);
  assert.match(appSource, /Showing \{visibleActionCommodityCandidates\.length\} of \{actionCommodityCandidates\.length\} transfers/);
});
