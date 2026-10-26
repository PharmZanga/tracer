import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportNarrative, describeChange, performanceNarrative, formatReportPercent, reportingWeeks, reportAverageMos, imbalanceNarrative, reportingRateNarrative, reportPeriodRange } from '../src/reportNarrative.js';

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
  assert.match(result.stock.join(' '), /Emergency and understocked bands together accounted for 35.0%/);
  assert.match(result.stock.join(' '), /5.0% of observations/);
  assert.match(result.stock.join(' '), /not proof of transferable stock/);
  assert.match(result.reporting[0], /114 of 116.*98.3%/);
  assert.match(result.overview.join(' '), /declined by 2.0 percentage points/);
  assert.match(result.overview.join(' '), /MOS change could not be verified/);
  assert.equal(result.overview.length, 2);
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

test('report prose uses actual care-level labels and limits long lists of names', () => {
  const result = performanceNarrative(Array.from({length: 10}, (_, i) => ({
    name: 'Current selection', label: `Care level ${i + 1}`, rows: 10, availability: .6 + i / 100, mos: 3,
  })), 'Level-of-care').join(' ');
  assert.doesNotMatch(result, /Current selection/);
  assert.match(result, /Care level 1/);
  assert.match(result, /10 reported groups, including Care level 1, Care level 2, Care level 3/);
});

test('reports use singular weeks and identical percentage rounding in prose and charts', () => {
  assert.equal(reportingWeeks(1), '1 reporting week');
  assert.equal(reportingWeeks(4), '4 reporting weeks');
  assert.equal(formatReportPercent(.4145), '41.5%');
  assert.equal(formatReportPercent(null), 'not available');
  const input = summary(); input.period.counts = {provinces: 10};
  const text = buildReportNarrative(input).overview.join(' ');
  assert.match(text, /100 submitted commodity observations from 10 provinces were analysed across 1 reporting week\./);
  assert.doesNotMatch(text, /1 reporting weeks/);
});

test('missing MOS is excluded from report averages rather than coerced to zero', () => {
  assert.equal(reportAverageMos([{mos: null}, {mos: undefined}, {mos: 4}, {mos: 0}]), 2);
  assert.equal(reportAverageMos([{mos: null}, {mos: NaN}]), null);
  assert.equal(reportAverageMos([{mos: 24}, {mos: 4}]), 8);
});

test('report cover shows the reporting-week span including month and year boundaries',()=>{
  assert.equal(reportPeriodRange([{reportDate:'2026-10-18'}]),'12-18 October 2026');
  assert.equal(reportPeriodRange([{reportDate:'2026-10-04'}]),'28 September 2026 to 4 October 2026');
  assert.equal(reportPeriodRange([{reportDate:'2026-01-04'}]),'29 December 2025 to 4 January 2026');
  assert.equal(reportPeriodRange([]),'Reporting dates unavailable');
});

test('imbalance analysis uses provincial observation shares and does not recommend assumed transfers', () => {
  const text = imbalanceNarrative([
    {name: 'A', rows: 100, stockout: 10, nearCritical: 20, understocked: 30, abovePlan: 10},
    {name: 'B', rows: 200, stockout: 20, nearCritical: 20, understocked: 20, abovePlan: 100},
  ]).join(' ');
  assert.match(text, /A had the largest share below two MOS \(60.0%\)/);
  assert.match(text, /B \(50.0%\)/);
  assert.match(text, /not quantities available for transfer/);
  assert.match(imbalanceNarrative([])[0], /No submitted/);
});

test('reporting analysis separates coverage from availability and retains missing denominators', () => {
  const text = reportingRateNarrative([{name: 'A', expected: 10, reported: 8, rate: .8}, {name: 'B', expected: 20, reported: 20, rate: 1}]).join(' ');
  assert.match(text, /28 of 30.*93.3%/);
  assert.match(text, /A \(80.0%\)/);
  assert.match(text, /not drug availability/);
  assert.match(reportingRateNarrative([{expected: 0}])[0], /denominator is unavailable/);
});
