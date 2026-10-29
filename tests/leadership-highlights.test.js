import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildLeadershipHighlights, summariseLeadershipCommodities} from '../src/leadershipHighlights.js';
import {commodityRowsFromPeriod} from '../src/tracerRows.js';

const period = JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json', import.meta.url), 'utf8')).tracerReportingPeriods.at(-1);
const rows = commodityRowsFromPeriod(period);
const byId = items => Object.fromEntries(items.map(item => [item.id, item]));

test('national highlights preserve published availability and every submitted MOS band', () => {
  const highlights = byId(buildLeadershipHighlights(period.national, summariseLeadershipCommodities(rows)));
  assert.equal(highlights.availability.value, '87.1%');
  assert.equal(highlights.availability.detail, '23,661 submitted records');
  for (const [id, count] of [['stockout', 3589], ['nearCritical', 5313], ['understocked', 4090],
    ['accordingToPlan', 4359], ['overstock', 5867], ['dataGap', 443]]) {
    assert.equal(highlights[id].detail, `${count.toLocaleString('en')} records`);
    assert.ok(highlights[id].title.includes('23,661 submitted records'));
  }
  assert.equal(highlights['zero-soh'].value, rows.filter(row => row.quantity === 0).length.toLocaleString('en'));
});

test('province highlights contain only the selected province figures and commodity evidence', () => {
  const central = period.provinces.find(row => row.name === 'CENTRAL PROVINCE');
  const selected = rows.filter(row => row.province === central.name);
  const highlights = byId(buildLeadershipHighlights(central, summariseLeadershipCommodities(selected)));
  assert.equal(highlights.availability.value, '92.8%');
  assert.equal(highlights.availability.detail, '2,188 submitted records');
  assert.notEqual(highlights.stockout.detail, '3,589 records');
  for (const item of Object.values(highlights).filter(row => row.id.startsWith('commodity:'))) {
    const evidence = selected.filter(row => row.item === item.label);
    assert.ok(evidence.length);
    assert.equal(item.detail, `${evidence.length.toLocaleString('en')} records / ${evidence.filter(row => row.quantity === 0).length.toLocaleString('en')} zero SOH`);
  }
});

test('district highlights recalculate on the district slice without substituting the province total', () => {
  const district = period.districts.find(row => row.province === 'CENTRAL PROVINCE' && row.name === 'KABWE');
  const selected = rows.filter(row => row.province === district.province && row.district === district.name);
  const items = byId(buildLeadershipHighlights(district, summariseLeadershipCommodities(selected)));
  assert.equal(items.availability.detail, `${district.rows.toLocaleString('en')} submitted records`);
  assert.equal(items['zero-soh'].value, selected.filter(row => row.quantity === 0).length.toLocaleString('en'));
  assert.ok(district.rows < period.provinces.find(row => row.name === district.province).rows);
});

test('zero/near-zero MOS and explicit zero SOH remain distinct; missing SOH never becomes a stockout', () => {
  const detail = summariseLeadershipCommodities([
    {item: 'Medicine 500 mg', quantity: 50, mos: 0},
    {item: 'Medicine 500 mg', quantity: 0, mos: 0},
    {item: 'Medicine 500 mg', quantity: null, mos: null},
  ]);
  assert.equal(detail.zeroQuantity, 1);
  assert.equal(detail.commodities[0].available, 1);
  const items = byId(buildLeadershipHighlights({rows: 3, availability: 1/3, stockout: 2, dataGap: 1}, detail));
  assert.equal(items.stockout.value, '66.7%');
  assert.equal(items['zero-soh'].value, '1');
  assert.equal(items['commodity:Medicine 500 mg'].value, '33.3% availability');
});

test('most-reported highlights preserve strengths, avoid quantity sums and have a deterministic bounded order', () => {
  const data = [
    {item:'Medicine 500 mg', quantity:100}, {item:'Medicine 500 mg', quantity:1},
    {item:'Medicine 250 mg', quantity:0}, {item:'B',quantity:1}, {item:'A',quantity:1}, {item:'C',quantity:1},
  ];
  const before = JSON.stringify(data);
  const detail = summariseLeadershipCommodities(data);
  assert.deepEqual(detail.commodities.map(row => row.name), ['Medicine 500 mg', 'A', 'B']);
  assert.equal(detail.commodities[0].records, 2);
  assert.equal(detail.commodities[0].available, 2);
  assert.equal(JSON.stringify(data), before);
  assert.ok(!('quantity' in detail.commodities[0]));
});

test('empty and summary-only selections do not invent commodity or zero-stock evidence', () => {
  assert.deepEqual(buildLeadershipHighlights({rows: 0}, summariseLeadershipCommodities(rows)), []);
  const items = buildLeadershipHighlights(period.national, summariseLeadershipCommodities([]));
  assert.equal(items.length, 7);
  assert.ok(!items.some(item => item.id === 'zero-soh' || item.id.startsWith('commodity:')));
  assert.ok(items.every(item => !/NaN|Infinity/.test(item.value)));
});

test('the overview replaces only brief prose and wires all geography and unit filters to the strip', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const executive = source.slice(source.indexOf('<section className="executive-brief">'), source.indexOf('<section className="management-kpi-summary">'));
  assert.match(executive, /LeadershipHighlights rollup=\{fieldKpis\} rows=\{filteredCommodityRows\}/);
  assert.match(executive, /fieldData.id, selectedProvince, selectedDistrict, selectedFacilityLevel, selectedFacility/);
  assert.match(executive, /executiveIndicatorCards.map/);
  assert.match(executive, /ExecutiveRepeatedReportsCard/);
  assert.doesNotMatch(executive, /executive-statement|National tracer availability|Leadership Brief/);
});

test('motion is CSS-only, pausable, keyboard-safe and disabled for reduced-motion users', () => {
  const component = readFileSync(new URL('../src/LeadershipHighlights.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/leadershipHighlights.css', import.meta.url), 'utf8');
  assert.match(component, /Pause moving highlights/);
  assert.match(component, /Resume moving highlights/);
  assert.match(component, /aria-hidden=\{copy \|\| undefined\}/);
  assert.match(component, /key=\{scopeKey\}/);
  assert.match(component, /visibilitychange/);
  assert.doesNotMatch(component, /setInterval|requestAnimationFrame/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-play-state: paused/);
  assert.match(css, /:focus-within/);
  assert.match(css, /translateX\(-50%\)/);
});
