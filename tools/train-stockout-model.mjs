/*
 * Reproducible, date-grouped stock-out modelling pipeline.
 * Run: node tools/train-stockout-model.mjs
 * The tracer source has SOH and AMC/MOS only. It does not contain receipts,
 * delivery dates, or confirmed events between reports, so those are never inferred.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputs = ["2024.json", "2025.json", "2026/jan-feb.json", "2026/mar-apr.json", "2026/may-jun.json", "2026/jul-aug.json", "2026/sep.json"]
  .map((name) => path.join(root, "public", "data", "tracer", name));
const output = path.join(root, "public", "data", "predictions", "stockout-model.json");
const DAY = 86_400_000;
const MAX_SAMPLES_PER_DATE = 1_200;

const sigmoid = (value) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
const daysBetween = (left, right) => (new Date(right) - new Date(left)) / DAY;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function decodeRows(period) {
  const data = period.commodityFacilityData || {};
  const dictionary = data.dictionaries || {};
  return (data.rows || []).map(([province, district, level, facility, item, programme, quantity, amc, mos]) => ({
    date: period.reportDate,
    province: dictionary.provinces?.[province], district: dictionary.districts?.[district], level: dictionary.levels?.[level],
    facility: dictionary.facilities?.[facility], commodity: dictionary.items?.[item], programme: dictionary.programmes?.[programme],
    quantity: Number(quantity), amc: Number(amc), mos: Number(mos),
  })).filter((row) => row.facility && row.commodity && Number.isFinite(row.quantity));
}

function feature(row, history) {
  const previous = history.at(-1);
  return [
    Math.min(Math.max(Number.isFinite(row.mos) ? row.mos : 12, 0), 12) / 12,
    Math.min(Math.max(row.quantity / Math.max(row.amc || 1, 1), 0), 12) / 12,
    previous && previous.quantity === 0 ? 1 : 0,
    previous && Number.isFinite(previous.mos) && Number.isFinite(row.mos) ? Math.max(-1, Math.min(1, row.mos - previous.mos)) : 0,
    new Date(row.date).getUTCMonth() / 11,
  ];
}

function metrics(rows, probability) {
  if (!rows.length) return { samples: 0, precision: null, recall: null, falseAlertRate: null, brier: null };
  const predicted = rows.map((row) => probability(row) >= 0.5);
  const tp = rows.filter((row, index) => predicted[index] && row.target).length;
  const fp = rows.filter((row, index) => predicted[index] && !row.target).length;
  const fn = rows.filter((row, index) => !predicted[index] && row.target).length;
  return { samples: rows.length, positives: rows.filter((row) => row.target).length, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0, falseAlertRate: fp / rows.length, brier: average(rows.map((row) => (probability(row) - Number(row.target)) ** 2)) };
}

function fitLogistic(rows) {
  const weights = Array(6).fill(0);
  for (let epoch = 0; epoch < 35; epoch += 1) for (const row of rows) {
    const vector = [1, ...row.features]; const p = sigmoid(vector.reduce((sum, value, index) => sum + value * weights[index], 0));
    vector.forEach((value, index) => { weights[index] -= 0.06 * (p - Number(row.target)) * value; });
  }
  return { type: "logistic", weights, probability: (row) => sigmoid([1, ...row.features].reduce((sum, value, index) => sum + value * weights[index], 0)) };
}

function fitTree(rows) {
  // A shallow CART-style tree is intentionally bounded for transparent review.
  let best = { score: Infinity, index: 0, threshold: 0.5, low: 0, high: 0 };
  for (let index = 0; index < 5; index += 1) for (const threshold of [0.05, 0.1, 0.17, 0.25, 0.34, 0.5, 0.67, 0.83]) {
    const low = rows.filter((row) => row.features[index] <= threshold), high = rows.filter((row) => row.features[index] > threshold);
    if (!low.length || !high.length) continue;
    const lowRate = average(low.map((row) => Number(row.target))), highRate = average(high.map((row) => Number(row.target)));
    const score = low.reduce((sum, row) => sum + (Number(row.target) - lowRate) ** 2, 0) + high.reduce((sum, row) => sum + (Number(row.target) - highRate) ** 2, 0);
    if (score < best.score) best = { score, index, threshold, low: lowRate, high: highRate };
  }
  return { type: "tree", ...best, probability: (row) => row.features[best.index] <= best.threshold ? best.low : best.high };
}

const periods = (await Promise.all(inputs.map(async (file) => JSON.parse(await fs.readFile(file, "utf8")).tracerReportingPeriods || []))).flat()
  .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
const rowsByDate = new Map(periods.map((period) => [period.reportDate, decodeRows(period)]));
const dates = [...rowsByDate.keys()].sort();
const histories = new Map(), samples = [];
for (const date of dates) {
  const nextDate = dates.find((candidate) => daysBetween(date, candidate) >= 21 && daysBetween(date, candidate) <= 35);
  const future = new Map((rowsByDate.get(nextDate) || []).map((row) => [`${row.province}|${row.district}|${row.level}|${row.facility}|${row.commodity}`, row]));
  let sampled = 0;
  for (const row of rowsByDate.get(date)) {
    const key = `${row.province}|${row.district}|${row.level}|${row.facility}|${row.commodity}`;
    const history = histories.get(key) || []; const observed = future.get(key);
    if (observed && sampled < MAX_SAMPLES_PER_DATE) {
      samples.push({ ...row, key, features: feature(row, history), target: observed.quantity === 0, outcomeDate: nextDate });
      sampled += 1;
    }
    histories.set(key, [...history.slice(-3), row]);
  }
}
const usableDates = [...new Set(samples.map((row) => row.date))];
const cutOne = Math.floor(usableDates.length * 0.6), cutTwo = Math.floor(usableDates.length * 0.8);
const trainDates = new Set(usableDates.slice(0, cutOne)), validationDates = new Set(usableDates.slice(cutOne, cutTwo)), testDates = new Set(usableDates.slice(cutTwo));
const train = samples.filter((row) => trainDates.has(row.date)), validation = samples.filter((row) => validationDates.has(row.date)), test = samples.filter((row) => testDates.has(row.date));
const baseline = { type: "mos", probability: (row) => row.mos <= 0 ? 0.95 : row.mos < 1 ? 0.7 : row.mos < 2 ? 0.35 : 0.05 };
const logistic = fitLogistic(train), tree = fitTree(train);
const candidates = [baseline, logistic, tree].map((model) => ({ model, validation: metrics(validation, model.probability), test: metrics(test, model.probability) }));
const selected = candidates.sort((left, right) => (right.validation.recall - right.validation.falseAlertRate) - (left.validation.recall - left.validation.falseAlertRate))[0];
const reliable = Boolean(selected && selected.validation.samples >= 200 && selected.test.samples >= 200 && selected.test.positives >= 20 && selected.test.precision >= 0.25);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  version: "stockout-v1", generatedAt: new Date().toISOString(), horizon: "21-35 days after an origin report", coverage: { first: dates[0], last: dates.at(-1), reportingPeriods: dates.length },
  features: ["SOH", "AMC/MOS", "prior reported stock-out", "MOS change", "month-of-year"],
  unavailableFields: ["receipts", "delivery delays", "confirmed intra-period stock-outs", "unit conversion metadata"],
  outcomeRule: "Known only when the same facility-commodity has an observation 21-35 days later; all other outcomes are excluded, never treated as non-stock-outs.",
  splits: { trainDates: [...trainDates], validationDates: [...validationDates], testDates: [...testDates] },
  candidates: candidates.map(({ model, validation, test }) => ({ type: model.type, validation, test })),
  selectedModel: reliable ? selected.model.type : null, predictionStatus: reliable ? "validated" : "unavailable", limitation: reliable ? null : "The chronological validation period has too few known four-week outcomes for trustworthy model selection; individual predictions remain unavailable.",
}, null, 2));
console.log(JSON.stringify({ train: train.length, validation: validation.length, test: test.length, selected: reliable ? selected.model.type : null, predictionStatus: reliable ? "validated" : "unavailable", evaluation: selected.test }, null, 2));
