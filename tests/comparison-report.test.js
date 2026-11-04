import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {comparisonChanges, comparisonChange, comparisonGroups, defaultComparisonPeriods} from '../src/reportComparison.js';

const server = await createServer({root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true, hmr: false, watch: null, preTransformRequests: false}, logLevel: 'error'});
after(() => server.close());
const {buildComparisonReportPeriods} = await server.ssrLoadModule('/src/App.jsx');
const {ComparisonReportChart, ComparisonReportDocument} = await server.ssrLoadModule('/src/ComparisonReport.jsx');
const data = await server.ssrLoadModule('/src/tracerFacilityData.js');
const {reportCatalogue} = await server.ssrLoadModule('/src/reportCatalogue.js');
const {reportOptions} = await server.ssrLoadModule('/src/reportPeriods.js');
const {comparisonSections} = await server.ssrLoadModule('/src/reportComparison.js');
const options = reportOptions(reportCatalogue, 'quarterly', '2026');
await data.loadHistoricalTracerYear('2026');
const selected = options.slice(0, 3);
const periods = buildComparisonReportPeriods(data.tracerReportingPeriods, selected);

test('default comparison includes Q1 Q2 Q3 and builder sorts chronological selections', () => {
  assert.deepEqual(defaultComparisonPeriods(options), ['2026-Q1', '2026-Q2', '2026-Q3']);
  assert.deepEqual(buildComparisonReportPeriods(data.tracerReportingPeriods, [...selected].reverse()).map(period => period.id), defaultComparisonPeriods(options));
  assert.equal(periods.length, 3);
  assert.ok(periods.every(period => period.weeks > 0 && period.months.length === 3));
});

test('comparison national rates use the existing dashboard weighted care-level aggregates', () => {
  periods.forEach(period => {
    const count = period.levels.reduce((sum, row) => sum + row.rows, 0);
    const availability = period.levels.reduce((sum, row) => sum + row.availability * row.rows, 0) / count;
    const numeric = period.levels.filter(row => Number.isFinite(row.mos));
    const mos = numeric.reduce((sum, row) => sum + row.mos * row.rows, 0) / numeric.reduce((sum, row) => sum + row.rows, 0);
    assert.equal(period.national.rows, count);
    assert.ok(Math.abs(period.national.availability - availability) < 1e-10);
    assert.equal(period.national.mos, Math.round(mos * 100) / 100);
    assert.equal(period.provinces.length, 10);
  });
});

test('changes distinguish percentage points and months, including zero and missing', () => {
  const values = [{availability: .8, mos: 3}, {availability: .9, mos: null}, {availability: .85, mos: 0}];
  assert.deepEqual(comparisonChanges(values, 'availability', 100).map(row => [row.from, row.to]), [[0, 1], [1, 2], [0, 2]]);
  assert.equal(comparisonChange(comparisonChanges(values, 'availability', 100)[0].value), '+10.0 pp');
  assert.equal(comparisonChange(comparisonChanges(values, 'mos').at(-1).value, 'months'), '-3.0 months');
  assert.equal(comparisonChange(null), 'N/R');
  assert.equal(comparisonChange(-.00001), '0.0 pp');
});

test('combined charts keep missing MOS gaps and plot actual zero without negative geometry', () => {
  const groups = [{name: 'Example', values: [{availability: .8, mos: 3}, {availability: null, mos: null}, {availability: .7, mos: 0}]}];
  const html = renderToStaticMarkup(React.createElement(ComparisonReportChart, {periods, groups, title: 'Combined comparison'}));
  assert.equal((html.match(/<polyline /g) || []).length, 2);
  assert.match(html, /fill="#ed7d31"/);
  assert.match(html, /stroke="#2365ad"/);
  assert.match(html, />N\/R</);
  assert.match(html, />0.0<\/text>/);
  assert.doesNotMatch(html, /NaN|Infinity|height="-/);
});

test('report has national provincial level and programme combined charts, coverage and quarter changes', () => {
  const html = renderToStaticMarkup(React.createElement(ComparisonReportDocument, {periods, year: '2026', sections: ['national', 'levels', 'provinces', 'programmes', 'coverage']}));
  for (const label of ['Q1', 'Q2', 'Q3', 'A. National Overview', 'B. Availability by Level of Care', 'C. Provincial Performance', 'D. Programme Performance', 'E. Coverage and Methodology', 'Q1 to Q2', 'Q2 to Q3', 'Q1 to Q3']) assert.ok(html.includes(label), label);
  assert.match(html, /same aggregation functions as the dashboard Comparison view/);
  assert.match(html, /weeks are repeated observations/);
  assert.ok((html.match(/data-comparison-group=/g) || []).length >= 15);
  assert.equal((html.match(/Changes between reporting periods/g) || []).length, 4);
  assert.equal((html.match(/MOS change \(months\)/g) || []).length, 4);
  assert.doesNotMatch(html, /NaN|Infinity|height="-/);
});

test('unchecked sections disappear and remaining headings renumber', () => {
  const html = renderToStaticMarkup(React.createElement(ComparisonReportDocument, {periods, year: '2026', sections: ['provinces', 'coverage']}));
  assert.match(html, /A. Provincial Performance/);
  assert.match(html, /B. Coverage and Methodology/);
  assert.doesNotMatch(html, /data-report-section="national"|data-report-section="levels"|data-report-section="programmes"/);
});

test('comparison reports include the same feedback headings by default and keep them optional', () => {
  const sections = comparisonSections.map(([id]) => id);
  const html = renderToStaticMarkup(React.createElement(ComparisonReportDocument, {periods, year: '2026', sections}));
  for (const heading of ['Key findings', 'E. Proposed interventions', 'F. Conclusion/Way forward', 'G. Coverage and Methodology']) assert.ok(html.includes(heading), heading);
  assert.match(html, /Proposed responsible team/);
  assert.match(html, /final selected period \(2026 Quarter 3\)/);
  assert.doesNotMatch(html, /1 November 2026/);
  const without = renderToStaticMarkup(React.createElement(ComparisonReportDocument, {periods, year: '2026', sections: ['national']}));
  assert.doesNotMatch(without, /Proposed interventions|Conclusion\/Way forward/);
});

test('partial periods retain partial label and incomplete loads cannot generate a comparison', () => {
  const q4 = buildComparisonReportPeriods(data.tracerReportingPeriods, options.slice(-1))[0];
  assert.match(q4.label, /partial/);
  assert.deepEqual(q4.months, ['2026-10']);
  assert.throws(() => buildComparisonReportPeriods([], selected), /Incomplete comparison dataset/);
  const groups = comparisonGroups([{provinces: [{name: 'A', availability: .5, mos: 1}]}, {provinces: [{name: 'B', availability: .6, mos: 2}]}], 'provinces');
  assert.equal(groups[0].values[1].availability, null);
  assert.equal(groups[1].values[0].mos, null);
});
