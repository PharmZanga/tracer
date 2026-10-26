import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildWordReport, buildPdfReport } from '../src/reportExport.js';
import { reportFileName, tableColumnShares } from '../src/reportExportModel.js';

const model = { metadata: { title: 'Weekly Tracer Availability Report', periodId: '2026-10-25' }, blocks: [
  { type: 'cover', title: 'Weekly Tracer Availability Report', ministry: 'MINISTRY OF HEALTH', description: 'Selected provincial tracer submissions.', period: 'Week 3 - 25 October 2026', details: ['Prepared by: Zanga Musakuzi'], year: '2026' },
  { type: 'heading', text: 'A. National Overview', pageBreak: true },
  { type: 'paragraph', runs: [{ text: 'Availability is ' }, { text: '87.4%', bold: true }, { text: '. Missing records are not zero stock.' }] },
  { type: 'table', rows: [['Province', 'Availability'], ['Central', '92.9%'], ['Western', '92.3%']] },
  { type: 'heading', text: 'B. Availability by Level of Care', pageBreak: true },
  { type: 'image', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', width: 1200, height: 600, alt: 'Commodity Availability by Level of Care' },
] };

test('Word download is a genuine OOXML document with editable text, native tables and embedded charts', async () => {
  const doc = await buildWordReport(model);
  const buffer = await Packer.toBuffer(doc);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /87.4%/); assert.match(xml, /w:tbl/); assert.match(xml, /w:drawing/); assert.match(xml, /w:pageBreakBefore/);
  assert.ok(Object.keys(zip.files).some(path => /^word\/media\/.+\.png$/.test(path)));
  assert.ok(xml.indexOf('A. National Overview') < xml.indexOf('B. Availability by Level of Care'));
  assert.doesNotMatch(xml, /Control Tower logo|Provincial Trends/);
  assert.match(xml, /w:w="11906"/);
});

test('PDF preserves narrative, section ordering, table headers, images and A4 pagination', () => {
  const definition = buildPdfReport(model);
  assert.equal(definition.pageSize, 'A4');
  const heading = definition.content.filter(block => block.headlineLevel === 1);
  assert.deepEqual(heading.map(block => block.text), ['A. National Overview', 'B. Availability by Level of Care']);
  assert.ok(heading.every(block => block.pageBreak === 'before'));
  assert.equal(definition.content.find(block => block.table?.headerRows).table.headerRows, 1);
  assert.equal(definition.content.filter(block => block.image).length, 1);
  assert.equal(definition.footer(1), null);
  assert.equal(definition.footer(2).text, '2');
});

test('filenames and column widths remain bounded for long labels and selected report frequencies', () => {
  assert.equal(reportFileName('Monthly Tracer Availability Report', '2026-09', 'docx'), 'monthly-tracer-availability-report-2026-09.docx');
  assert.equal(reportFileName('Quarterly Tracer Availability Report', '../Q4:2026', 'pdf'), 'quarterly-tracer-availability-report----Q4-2026.pdf');
  const shares = tableColumnShares([['Commodity', 'MOS'], ['A'.repeat(400), '3.2']]);
  assert.equal(shares.reduce((sum, value) => sum + value), 1);
  assert.ok(shares[0] > shares[1]);
});

test('download controls retain administrator gating and export libraries load only on demand', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /isDashboardAdmin && activePage === "reports"/);
  assert.match(app, /Download Word \(\.docx\)/); assert.match(app, /Download PDF/);
  assert.match(app, /await import\('\.\/reportExport\.js'\)/);
  assert.match(app, /summary\.selectedPeriods\.length === summary\.option\.periods\.length/);
  const exporter = readFileSync(new URL('../src/reportExport.js', import.meta.url), 'utf8');
  assert.doesNotMatch(exporter, /fetch\(|window\.print|application\/msword/);
});
