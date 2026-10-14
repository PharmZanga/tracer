import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportNarrative, describeChange, performanceNarrative } from '../src/reportNarrative.js';

const summary = () => ({
  period: { label: 'Selected week', national: { availability: .87, mos: 3.2, rows: 100 } },
  type: 'weekly', previousLabel: 'Previous week', availabilityChange: -.02, mosChange: null,
  weekly: [{ period: { national: { availability: .87 } } }],
  districtReporting: { reported: 114, expected: 116 },
  stockStatus: [10, 15, 20, 30, 20, 5].map(count => ({ count })),
});

test('change wording distinguishes unchanged, missing and directional movements', () => {
  assert.match(describeChange(0), /unchanged/);
  assert.match(describeChange(-.01), /unchanged/);
  assert.equal(describeChange(-2), 'declined by 2.0 percentage points');
  assert.match(describeChange(null), /could not be verified/);
});
test('report analysis explains imbalance and keeps missing MOS separate from zero stock', () => {
  const result = buildReportNarrative(summary());
  assert.match(result.stock.join(' '), /35.0% in emergency or understocked/);
  assert.match(result.stock.join(' '), /5.0% of observations/);
  assert.match(result.stock.join(' '), /not proof of transferable stock/);
  assert.match(result.reporting[0], /114 of 116.*98.3%/);
  assert.match(result.overview.join(' '), /declined by 2.0 percentage points/);
  assert.match(result.overview.join(' '), /MOS change could not be verified/);
  assert.match(result.overview.join(' '), /trend cannot be established/);
  assert.doesNotMatch(result.overview.join(' '), /MOS remained unchanged/);
});
test('group comparisons use actual ranks and explain masked shortages without assigning causes', () => {
  const result = performanceNarrative([
    { name: 'High', availability: .95, mos: 3, rows: 10 },
    { name: 'Low', availability: .6, mos: 4, rows: 10 },
    { name: 'No data', availability: null, rows: 0 },
  ], 'Provincial').join(' ');
  assert.match(result, /60.0% in Low to 95.0% in High, a gap of 35.0/);
  assert.match(result, /adequate average can coexist with unavailable tracer items/);
  assert.doesNotMatch(result, /No data/);
});
test('empty groups and tied availability do not invent a ranking', () => {
  assert.match(performanceNarrative([], 'Programme')[0], /No verified/);
  assert.match(performanceNarrative([{ name: 'Only', availability: 0, mos: 0 }], 'Programme')[0], /0.0%.*0.0 MOS/);
  const tied = performanceNarrative([{ name: 'A', availability: .8 }, { name: 'B', availability: .8 }], 'Provincial')[0];
  assert.match(tied, /uniform at 80.0%/);
  assert.doesNotMatch(tied, /highest|lowest/);
});
test('multiple observations describe endpoints without claiming sustained improvement', () => {
  const input = summary();
  input.weekly.unshift({ period: { national: { availability: .8 } } });
  assert.match(buildReportNarrative(input).overview.join(' '), /increased by 7.0 percentage points/);
  assert.match(buildReportNarrative(input).overview.join(' '), /not evidence of a sustained trend/);
});
