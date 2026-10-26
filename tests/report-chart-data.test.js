import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankedReportRows,reportMosMaximum,reportAvailabilityGap,reportImbalanceRows,reportGroupName,reportChartLabels} from '../src/reportChartData.js';
import {carePerformanceNarrative,provincialPerformanceNarrative,programmePerformanceNarrative} from '../src/reportNarrative.js';

const care=[
  {id:'primary',label:'Health Centre/Health Post',availability:.938,mos:3.2,rows:10},
  {id:'level1',label:'Level 1 Hospital',availability:.803,mos:2.9,rows:10},
  {id:'level2',label:'Level 2 Hospital',availability:.842,mos:2.6,rows:10},
  {id:'level3',label:'Level 3/Specialised Hospital',availability:.718,mos:2.7,rows:10},
];

test('care chart ranks highest first with a calculated percentage-point gap and unchanged source order',()=>{
  assert.deepEqual(rankedReportRows(care,true).map(row=>row.id),['primary','level2','level1','level3']);
  assert.deepEqual(care.map(row=>row.id),['primary','level1','level2','level3']);
  assert.equal(reportAvailabilityGap(care).toFixed(1),'22.0');
  assert.equal(reportAvailabilityGap([{availability:null}]),null);
  const text=carePerformanceNarrative(care).join(' ');
  assert.match(text,/71.8%.*93.8%.*22.0 percentage points/);
  assert.match(text,/exception of Level 2 Hospitals/);
  assert.doesNotMatch(text,/Current selection/);
});

test('MOS axes expand above six without dropping zero values or converting missing to zero',()=>{
  assert.equal(reportMosMaximum([{mos:null},{mos:0},{mos:4.4}]),6);
  assert.equal(reportMosMaximum([{mos:8.2}]),9);
  const sorted=rankedReportRows([{name:'missing',availability:null},{name:'zero',availability:0},{name:'reported',availability:.8}],true);
  assert.deepEqual(sorted.map(row=>row.name),['reported','zero','missing']);
});

test('provincial stack shares retain MOS gaps and never renormalize the four visible stock bands',()=>{
  const [row]=reportImbalanceRows([{name:'A',rows:100,availability:.8,stockout:10,nearCritical:15,understocked:5,accordingToPlan:30,abovePlan:25,dataGap:15}]);
  assert.deepEqual(row.shares,[.1,.2,.3,.25,.15]);
  assert.ok(Math.abs(row.shares.slice(0,4).reduce((a,b)=>a+b,0)-.85)<1e-12);
  assert.deepEqual(reportImbalanceRows([{name:'Missing',rows:0}])[0].shares,[null,null,null,null,null]);
});

test('reference names are readable and provincial and programme paragraphs use observed rankings',()=>{
  assert.equal(reportGroupName({name:'NORTH-WESTERN PROVINCE'}),'North-Western Province');
  assert.deepEqual(reportChartLabels({name:'RENAL UNITS'}),['Renal','Units']);
  const provinces=[{name:'CENTRAL PROVINCE',rows:10,availability:.929,mos:3.6},{name:'NORTH-WESTERN PROVINCE',rows:10,availability:.806,mos:3.8}];
  const text=provincialPerformanceNarrative(provinces).join(' ');
  assert.match(text,/80.6% in North-Western Province to 92.9% in Central Province/);
  assert.match(text,/12.3 percentage points/);
  const programme=programmePerformanceNarrative([{name:'ART',rows:10,availability:.947,mos:3.6},{name:'RENAL UNITS',rows:10,availability:.494,mos:1.8}]).join(' ');
  assert.match(programme,/ART sites recorded the highest/);
  assert.match(programme,/Renal Units.*49.4%.*1.8 MOS/);
  assert.doesNotMatch(programme,/moving.*quickly|caused by|platform.*delay/);
});
