import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reportSections,stockImbalanceShares,defaultReportSectionIds,selectedReportSections} from '../src/reportSections.js';
test('report stylesheet does not override document section order',()=>{
  const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/\.national[^{}]*\{[^{}]*\border\s*:/);
});
test('report section labels continue A through R in declared order',()=>{
  assert.equal(reportSections.length,18);
  reportSections.forEach(([,title],i)=>assert.ok(title.startsWith(`${String.fromCharCode(65+i)}. `)));
  assert.equal(reportSections[4][0],'stock');assert.equal(reportSections[5][0],'imbalance');
});

test('the seven default sections match the supplied A-G reference and renumber when omitted',()=>{
  assert.deepEqual(defaultReportSectionIds,['overview','care','provinces','programmes','stock','imbalance','reporting-rate']);
  assert.deepEqual(selectedReportSections(defaultReportSectionIds).map(([,title])=>title),[
    'A. National Overview','B. Availability by Level of Care','C. Provincial Performance','D. Programme Performance',
    'E. National Stock Imbalance','F. Provincial Stock Imbalance','G. Reporting Rate',
  ]);
  assert.deepEqual(selectedReportSections(['overview','stock','reporting-rate']).map(([,title])=>title),['A. National Overview','B. National Stock Imbalance','C. Reporting Rate']);
});
test('stock imbalance uses all provincial observations including MOS gaps',()=>{
  const shares=stockImbalanceShares({rows:100,stockout:10,nearCritical:15,understocked:5,accordingToPlan:30,abovePlan:20,overstock:10,dataGap:10});
  assert.deepEqual(shares,[.1,.2,.3,.3,.1]);
  assert.deepEqual(stockImbalanceShares({rows:0}),[null,null,null,null,null]);
});
