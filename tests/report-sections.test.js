import test from 'node:test';
import assert from 'node:assert/strict';
import {reportSections,stockImbalanceShares} from '../src/reportSections.js';
test('report section labels continue A through R in declared order',()=>{
  assert.equal(reportSections.length,18);
  reportSections.forEach(([,title],i)=>assert.ok(title.startsWith(`${String.fromCharCode(65+i)}. `)));
  assert.equal(reportSections[4][0],'zammsa');assert.equal(reportSections[8][0],'provincial-trends');
});
test('stock imbalance uses all provincial observations including MOS gaps',()=>{
  const shares=stockImbalanceShares({rows:100,stockout:10,nearCritical:15,understocked:5,accordingToPlan:30,abovePlan:20,overstock:10,dataGap:10});
  assert.deepEqual(shares,[.1,.2,.3,.3,.1]);
  assert.deepEqual(stockImbalanceShares({rows:0}),[null,null,null,null,null]);
});
