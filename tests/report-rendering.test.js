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
const {ReportPerformanceChart, ReportProvincialStockChart} = await server.ssrLoadModule('/src/ReportCharts.jsx');
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
  assert.match(html, /Commodity Availability by Level of Care/);
  assert.match(html, /Commodity Availability and Months of Stock by Province/);
  assert.match(html, /Commodity Availability and Months of Stock by Programme\/Facility Type/);
  assert.match(html, /Provincial Stock Imbalance/);
  assert.match(html, /COMPLETE \/ EXPECTED DISTRICT-WEEKS|Complete \/ expected district-weeks/);
  assert.ok(!html.includes('data-report-section="provincial-trends"'));
  assert.ok(html.indexOf('data-report-section="stock"') < html.indexOf('data-report-section="imbalance"'));
  assert.ok(html.indexOf('data-report-section="imbalance"') < html.indexOf('data-report-section="reporting-rate"'));
  assert.match(html, /E\. National Stock Imbalance/);
  assert.match(html, /G\. Reporting Rate/);
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

test('dual-axis graphs preserve a missing MOS gap while drawing an explicit zero observation', () => {
  const rows=[{name:'A',availability:.9,mos:3},{name:'B',availability:.8,mos:null},{name:'C',availability:.7,mos:0}];
  const html=renderToStaticMarkup(React.createElement(ReportPerformanceChart,{rows,subject:'Provincial'}));
  assert.equal((html.match(/<polyline /g)||[]).length,2);
  assert.equal((html.match(/class="chart-mos-label"/g)||[]).length,2);
  assert.match(html, />0.0<\/text>/);
  assert.doesNotMatch(html,/NaN|Infinity|height="-/);
});

test('provincial stack SVG includes grey MOS gaps without converting the other bands to 100 percent', () => {
  const rows=[{name:'CENTRAL PROVINCE',rows:100,availability:.8,stockout:10,nearCritical:20,understocked:10,accordingToPlan:20,abovePlan:30,dataGap:10}];
  const html=renderToStaticMarkup(React.createElement(ReportProvincialStockChart,{rows}));
  assert.match(html,/Grey caps show missing MOS/);
  assert.match(html,/Submitted observations/);
  assert.match(html,/10.0%/);
  assert.doesNotMatch(html,/NaN|Infinity|height="-/);
});
