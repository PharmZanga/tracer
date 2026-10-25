import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planAssistantRequest, validAssistantView, assistantSnapshot, assistantComparison, assistantRecurring, assistantReporting, previousAssistantWeek } from '../src/tracerAssistant.js';
import { createAssistantVoiceInput } from '../src/assistantVoiceInput.js';

const scope = { periodId: '2026-10-18', province: 'all', district: 'all', facilityLevel: 'all', facility: 'all', programme: 'all', commodity: 'all', status: 'all' };
const directory = [{ province: 'MUCHINGA PROVINCE', name: 'CHINSALI' }, { province: 'LUSAKA PROVINCE', name: 'LUSAKA' }];
const catalogue = [{ id: '2026-10-11', reportDate: '2026-10-11', month: '2026-10', label: 'Week 1' }, { id: '2026-10-18', reportDate: '2026-10-18', month: '2026-10', label: 'Week 2' }];
const plan = (text, current = scope, extra = {}) => planAssistantRequest(text, { scope: current, directory, catalogue, role: 'viewer', activePage: 'executive', ...extra });
const matchLevel = (level, selected) => selected === 'all' || level === selected;
function period(date, rows) {
  return { id: date, reportDate: date, label: date, source: 'Fixture workbook', dataQuality: { districts: [{ province: 'MUCHINGA PROVINCE', name: 'CHINSALI' }], facilities: [{ province: 'MUCHINGA PROVINCE', district: 'CHINSALI', facilityLevel: 'LEVEL 1 HOSPITAL', name: 'Missing hospital', reported: false }] }, facilities: [{ province: 'MUCHINGA PROVINCE', district: 'CHINSALI', facilityLevel: 'HEALTH POST', name: 'F' }], commodityFacilityData: { dictionaries: { provinces: ['MUCHINGA PROVINCE'], districts: ['CHINSALI'], levels: ['HEALTH POST'], facilities: ['F'], items: ['Paracetamol 500mg Tablet (1000)', 'Normal Saline 500ml', 'Normal Saline 1000ml'], programmes: ['RENAL', 'MALARIA'] }, rows } };
}
const row = (item, qty, amc, mos, programme = 0) => [0, 0, 0, 0, item, programme, qty, amc, mos];

test('conversational stock filters retain province, period and status on follow-ups', () => {
  const first = plan('Show low-stock medicines in Muchinga');
  assert.equal(first.kind, 'query'); assert.equal(first.scope.province, 'MUCHINGA PROVINCE'); assert.equal(first.scope.status, 'low');
  const second = plan('Only renal', first.scope);
  assert.equal(second.scope.programme, 'Renal'); assert.equal(second.scope.province, first.scope.province); assert.equal(second.scope.status, 'low');
  const third = plan('Compare with last week', second.scope);
  assert.equal(third.kind, 'compare'); assert.equal(third.scope.periodId, scope.periodId); assert.equal(third.scope.programme, 'Renal');
  assert.equal(scope.province, 'all');
});
test('district names establish their province and unknown geography never falls back to national', () => {
  assert.equal(plan('Show stock-outs in Chinsali').scope.province, 'MUCHINGA PROVINCE');
  assert.equal(plan('Show stock-outs in Lusaka').scope.district, 'all');
  assert.equal(plan('Show stock-outs in Atlantis').kind, 'notice');
  assert.equal(plan('Show stock-outs in Lusaka province and Chinsali district').kind, 'notice');
});
test('North-Western is not mistaken for a simultaneous Western province request', () => {
  const result = plan('Show stock-outs in North-Western', scope, { directory: [...directory, { name: 'SOLWEZI', province: 'NORTH-WESTERN PROVINCE' }, { name: 'MONGU', province: 'WESTERN PROVINCE' }] });
  assert.equal(result.kind, 'query'); assert.equal(result.scope.province, 'NORTH-WESTERN PROVINCE');
});
test('explicit navigation and chart explanation stay distinct from stock queries', () => {
  assert.equal(plan('Open National Stock Status').page, 'national');
  assert.equal(plan('Where can I find a medicine?').page, 'commodities');
  assert.equal(plan('Explain this chart').kind, 'explain');
});
test('read-only navigation enforces roles and refuses consequential actions', () => {
  assert.equal(plan('Generate a PDF report').kind, 'notice');
  assert.equal(plan('Generate a PDF report', scope, { role: 'admin' }).page, 'reports');
  for (const text of ['Approve this user', 'Publish submissions', 'Send a report', 'Execute transfer']) assert.equal(plan(text).kind, 'notice');
  assert.equal(validAssistantView({ page: 'imports', scope }, 'viewer', directory, catalogue), false);
  assert.equal(validAssistantView({ page: 'reports', scope }, 'admin', directory, catalogue), true);
  assert.equal(validAssistantView({ page: '/admin/delete', scope }, 'admin', directory, catalogue), false);
});
test('ambiguous medicines request strength and pack rather than combining products', () => {
  const result = plan('Find saline', scope, { commodities: ['Normal Saline 500ml', 'Normal Saline 1000ml'] });
  assert.equal(result.kind, 'clarify'); assert.equal(result.choices.length, 2);
  assert.equal(result.choices[0].scope.periodId, scope.periodId);
});
test('period handling requires an exact previous calendar week and offers weeks for a month', () => {
  assert.equal(previousAssistantWeek(catalogue[1], catalogue).id, catalogue[0].id);
  assert.equal(previousAssistantWeek(catalogue[1], [catalogue[1]]), undefined);
  assert.equal(plan('Show last week').scope.periodId, '2026-10-11');
  assert.equal(plan('Show 2026-10-19').kind, 'notice');
  assert.equal(plan('Show October 2026').choices.length, 2);
});
test('stock results use explicit zero quantities and calculated MOS without summing unlike products', () => {
  const p = period('2026-10-18', [row(0, 0, 10, 0), row(1, 10, 10, 0), row(2, null, 10, null)]);
  const result = assistantSnapshot(p, { ...scope, status: 'stockout' }, matchLevel);
  assert.equal(result.facts.stockouts, 1); assert.equal(result.facts.matched, 1); assert.equal(result.facts.low, 1);
  assert.equal(result.facts.availability, 1 / 3); assert.equal(result.facts.observations, 3);
  assert.equal(result.facts.totalSoh, undefined);
  assert.match(result.text, /before Data Quality Gate exclusions/);
  assert.equal(assistantSnapshot(p, { ...scope, programme: 'Malaria' }, matchLevel).facts.observations, 0);
});
test('missing facility reports are distinct from commodity stock-outs and partial districts', () => {
  const result = assistantReporting(period('2026-10-18', [row(0, 0, 10, 0)]), { ...scope, status: 'missing' }, matchLevel);
  assert.match(result.text, /0 of 1 districts/); assert.equal(result.total, 1); assert.equal(result.rows[0][3], 'Did not report');
  assert.equal(assistantReporting(period('2026-10-18', []), { ...scope, programme: 'Renal' }, matchLevel).requiresScopeReset, true);
});
test('comparisons report coverage and only pair unambiguous identities', () => {
  const before = period('2026-10-11', [row(0, 0, 10, 0), row(1, 10, 10, 1)]);
  const now = period('2026-10-18', [row(0, 10, 10, 1), row(1, 10, 10, 1), row(1, 10, 10, 1)]);
  const result = assistantComparison(now, before, scope, matchLevel);
  assert.equal(result.facts.matchedRecords, 1); assert.equal(result.facts.pairedChange, 1);
  assert.match(result.text, /Coverage|coverage/);
  assert.match(assistantComparison(now, before, { ...scope, programme: 'MDR-TB' }, matchLevel).text, /Both weeks need/);
});
test('recurring flags require adjacent reports with explicit observations', () => {
  const before = period('2026-10-11', [row(0, 0, 10, 0)]), now = period('2026-10-18', [row(0, 0, 10, 0)]);
  assert.equal(assistantRecurring([before, now], scope, matchLevel).total, 1);
  assert.equal(assistantRecurring([before, now], scope, matchLevel, true).total, 1);
  assert.match(assistantRecurring([before, period('2026-10-25', [row(0, 0, 10, 0)])], scope, matchLevel).text, /At least two adjacent/);
  assert.match(assistantRecurring([before, period('2026-10-18', [])], scope, matchLevel).text, /At least two adjacent/);
  assert.match(assistantRecurring([before, now], scope, matchLevel, true).text, /not proof/);
});
test('microphone is opt-in and refuses browsers without local-only processing', () => {
  let starts = 0, engine;
  class LocalRecognition { constructor() { engine = this; this.processLocally = false; } start() { starts++; } abort() {} }
  const voice = createAssistantVoiceInput({ SpeechRecognition: LocalRecognition }, () => {});
  assert.equal(starts, 0); assert.equal(engine.processLocally, true); voice.start(); assert.equal(starts, 1);
  class RemoteRecognition { start() { throw Error('Must not start'); } }
  assert.equal(createAssistantVoiceInput({ SpeechRecognition: RemoteRecognition }, () => {}).start(), false);
});
test('only one assistant launcher is mounted and model text cannot execute dashboard commands', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.equal((app.match(/<TracerAssistant /g) || []).length, 1);
  assert.doesNotMatch(app, /className=\{`copilot-launcher/);
  assert.match(app, /validAssistantView\(command, dashboardUser\?\.role/);
  assert.doesNotMatch(app, /applyAssistantView\(data\./);
  const weeklyLoader = app.slice(app.indexOf('if (comparisonPeriodType === "weekly") {'), app.indexOf('} else if (comparisonPeriodType === "monthly")'));
  assert.match(weeklyLoader, /loadTracerMonth/);
  assert.doesNotMatch(weeklyLoader, /loadHistoricalTracerYear/);
});
