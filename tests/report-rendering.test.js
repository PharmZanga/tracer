import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const server = await createServer({root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true, hmr: false, watch: null, preTransformRequests: false}, logLevel: 'error'});
after(async () => {
  await server.close();
});
const {NationalWeeklyReport, buildNationalReportSummary} = await server.ssrLoadModule('/src/App.jsx');
const data = await server.ssrLoadModule('/src/tracerFacilityData.js');
const {reportCatalogue} = await server.ssrLoadModule('/src/reportCatalogue.js');
const {reportOptions, selectReportPeriods} = await server.ssrLoadModule('/src/reportPeriods.js');
await data.loadLiveTracerData();

function summaryFor(type, id) {
  const options = reportOptions(reportCatalogue, type, '2026');
  const option = options.find(row => row.id === id) || options.at(-1);
  const previous = options[options.indexOf(option) - 1];
  return {options, option, summary: buildNationalReportSummary(selectReportPeriods(data.tracerReportingPeriods, option), selectReportPeriods(data.tracerReportingPeriods, previous), option, type)};
}

function render(type, id) {
  const {options, option, summary} = summaryFor(type, id);
  return renderToStaticMarkup(React.createElement(NationalWeeklyReport, {summary, periods: options, selectedPeriodId: option.id, type, year: '2026'}));
}

test('weekly report renders actual labels, Ministry branding, charts and ordered supporting sections', () => {
  const html = render('weekly', '2026-10-25');
  assert.match(html, /23,661 submitted commodity observations from 10 provinces/);
  assert.match(html, /1 reporting week</);
  assert.doesNotMatch(html, /Current selection|1 reporting weeks|control-tower-logo/);
  assert.match(html, /Weekly availability and average months of stock/);
  assert.match(html, /Provincial reported availability from 0 to 100 percent/);
  assert.match(html, /Programme reported availability from 0 to 100 percent/);
  assert.match(html, /Provincial stock-band distribution/);
  assert.match(html, /Complete primary-care reporting by province/);
  assert.ok(html.indexOf('data-report-section="overview"') < html.indexOf('data-report-section="provincial-trends"'));
  assert.ok(html.indexOf('data-report-section="reporting"') < html.indexOf('data-report-section="stock"'));
});

test('care narrative names agree with care table and previous single-week label is not repeated', () => {
  const {summary} = summaryFor('weekly', '2026-10-25');
  assert.ok(summary.levelRows.every(row => row.name === row.label && row.name !== 'Current selection'));
  assert.equal(summary.previousLabel, 'Week 2 - 18 October 2026');
  assert.ok(summary.weekly[0].levels.every(row => row.availability === null || Number.isFinite(row.availability)));
});

test('monthly and partial-quarter reports use selected observations rather than reference PDF figures', () => {
  for (const type of ['monthly', 'quarterly']) {
    const {summary} = summaryFor(type);
    assert.equal(summary.selectedPeriods.length, 3);
    assert.equal(summary.period.national.rows, 72138);
    const html = render(type);
    assert.match(html, /72,138 submitted commodity observations/);
    assert.match(html, /3 reporting weeks/);
    assert.match(html, type === 'monthly' ? /MONTHLY|Monthly/ : /QUARTERLY|Quarterly/);
    if (type === 'quarterly') assert.match(html, /Partial quarter/);
  }
});
