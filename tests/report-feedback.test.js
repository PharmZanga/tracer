import assert from 'node:assert/strict';
import test from 'node:test';
import {buildReportFeedback} from '../src/reportFeedback.js';

const row = (name, availability, mos, stockout = 10, nearCritical = 20, understocked = 20, abovePlan = 25) => ({name, availability, mos, rows: 100,
  stockout, nearCritical, understocked, abovePlan, overstock: 0, dataGap: 5, accordingToPlan: 95 - stockout - nearCritical - understocked - abovePlan});
const base = {label: 'Selected quarter', national: row('National', .81, 2.4),
  programmes: [row('Renal', .4, 1.6), row('Cancer', .5, 3.1), row('ART', .95, 4)],
  provinces: [row('Province A', .8, 2, 15, 25, 20, 25), row('Province B', .85, 4.5, 5, 10, 10, 50)], levels: [],
  reporting: {label: 'Final selected week', districts: {expected: 2, reported: 1, rows: [{province: 'Province A', submitted: true}, {province: 'Province A', submitted: false}]}, units: {expected: 5, reported: 3, missing: 2}}};

test('findings derive stock shares and ranked services from selected data rather than example figures', () => {
  const feedback = buildReportFeedback(base);
  const text = feedback.findings.join(' ');
  assert.match(text, /81.0%/);
  assert.match(text, /50.0% of submitted observations were below planned/);
  assert.match(text, /25.0% exceeded four MOS/);
  assert.match(text, /Renal \(40.0%; 1.6 MOS\); Cancer \(50.0%; 3.1 MOS\)/);
  assert.match(text, /Province A.*60.0%/);
  assert.match(text, /3 of 5 expected reporting units submitted; 2 did not report/);
  assert.doesNotMatch(text, /88.3%|53.5%|59.3%|1 November/);
});

test('interventions name evidence, propose ownership and retain transfer safeguards', () => {
  const feedback = buildReportFeedback(base);
  const text = feedback.interventions.map(item => item.text).join(' ');
  assert.match(text, /Province A had 60.0%/);
  assert.match(text, /Province B \(50.0% of observations\)/);
  assert.match(text, /Province A: 1 of 2 districts complete/);
  assert.match(text, /expiry dates, programme eligibility/);
  assert.match(text, /Cancer.*at least two MOS coexisted with availability below 90%/);
  assert.ok(feedback.interventions.every(item => item.owner && item.timing));
  assert.match(text, /responsible officer, deadline and progress/);
  assert.match(feedback.conclusion.join(' '), /consistent facilities and commodities/);
});

test('changing selected scope changes findings, priorities and conclusion', () => {
  const selected = {...base, label: 'Other month', national: row('National', .73, 1.1), programmes: [row('Mental Health', .3, 1)], provinces: [row('Province C', .6, 1)], reporting: null};
  const text = JSON.stringify(buildReportFeedback(selected));
  assert.match(text, /Other month/);
  assert.match(text, /73.0%/);
  assert.match(text, /Mental Health/);
  assert.doesNotMatch(text, /Renal|Cancer|Province A|Final selected week/);
});

test('comparison separates endpoint change from final-period priorities and reporting', () => {
  const periods = [
    {label: 'Quarter 1', shortLabel: 'Q1', national: row('National', .8, 3.3), programmes: [row('Cancer', .8, 3)], provinces: [], levels: [row('Level 3', .7, 3)]},
    {label: 'Quarter 2', shortLabel: 'Q2', national: row('National', .82, 3.2), programmes: [row('Cancer', .7, 3)], provinces: [], levels: [row('Level 3', .72, 3)]},
    {label: 'Quarter 3', shortLabel: 'Q3', national: row('National', .83, 3.2), programmes: [row('Cancer', .49, 3)], provinces: base.provinces, levels: [row('Level 3', .74, 3)], reporting: base.reporting},
  ];
  const feedback = buildReportFeedback({periods});
  const text = feedback.findings.join(' ');
  assert.match(text, /80.0% in Quarter 1, 82.0% in Quarter 2, 83.0% in Quarter 3/);
  assert.match(text, /increased by 3.0 percentage points/);
  assert.match(text, /Cancer changed from 80.0% to 49.0%/);
  assert.match(text, /Level 3 changed from 70.0% to 74.0%/);
  assert.match(text, /final selected period \(Quarter 3\)/);
  assert.match(feedback.interventions.map(item => item.text).join(' '), /Cancer declined from 80.0% to 49.0%/);
  assert.doesNotMatch(JSON.stringify(feedback), /1 November|88.3%/);
});

test('unknown stock bands and reporting are not converted to zero or fabricated completeness', () => {
  const feedback = buildReportFeedback({label: 'Historical quarter', national: {rows: 10, availability: null, mos: null}});
  const text = JSON.stringify(feedback);
  assert.match(text, /not available/);
  assert.match(text, /stock-band distribution could not be verified/);
  assert.doesNotMatch(text, /0.0%|100.0%|districts complete|did not report/);
});

test('genuinely complete reporting is never described as missing and 100 percent availability is not a shortage', () => {
  const full = row('All stocked', 1, 3, 0, 0, 0, 0);
  full.dataGap = 0; full.accordingToPlan = 100;
  const feedback = buildReportFeedback({label: 'Complete week', national: full, programmes: [full], provinces: [full], reporting: {label: 'Complete week', districts: {expected: 1, reported: 1, rows: [{province: 'A', submitted: true}]}, units: {expected: 2, reported: 2, missing: 0}}});
  assert.ok(!feedback.interventions.some(item => /lowest-availability|replenishment review|Close reporting/.test(item.title)));
});
