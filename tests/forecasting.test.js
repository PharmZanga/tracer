import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitForecast, reorderRecommendation } from "../src/forecasting.js";

test("uses Holt linear when fewer than two seasonal cycles exist", () => {
  const result = fitForecast([100, 110, 121, 133, 146, 160], { horizon: 3, seasonalPeriod: 6 });
  assert.equal(result.method, "holt_linear");
  assert.equal(result.forecast.length, 3);
  assert.ok(result.forecast[0] > 0);
});

test("auto-selects Holt-Winters parameters and returns 95% intervals", () => {
  const history = Array.from({ length: 24 }, (_, index) => 400 + 12 * index + [0, 52, 52, 0, -52, -52][index % 6]);
  const result = fitForecast(history, { horizon: 6, seasonalPeriod: 6 });
  assert.equal(result.method, "holt_winters_additive");
  assert.equal(result.seasonalPeriod, 6);
  assert.ok(Number.isFinite(result.params.smoothing_level));
  assert.ok(Number.isFinite(result.params.smoothing_trend));
  assert.ok(Number.isFinite(result.params.smoothing_seasonal));
  assert.ok(result.lower95.every((value, index) => value <= result.forecast[index]));
  assert.ok(result.upper95.every((value, index) => value >= result.forecast[index]));
});

test("turns the demand forecast into a buffered reorder recommendation", () => {
  const forecast = fitForecast([100, 105, 110, 115, 120, 125], { horizon: 3 });
  const recommendation = reorderRecommendation(forecast, 50, 1.5, 1.15);
  assert.ok(recommendation.reorderPoint > recommendation.demandDuringLeadTime);
  assert.equal(recommendation.recommendedOrderQty, Math.max(0, recommendation.reorderPoint - 50));
});

test("makes the active forecasting engine obvious on the tracer landing view", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /FORECAST ENGINE ACTIVE/);
  assert.match(app, /Optimized forecasting is live in Tracer/);
  assert.match(app, /Open forecast warning register/);
  assert.match(app, /setPredictiveTab\("commodities"\)/);
});
