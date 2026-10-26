import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {facilityReportingSummary, primaryCareDistrictSummary} from '../src/reportingQuality.js';

const period=JSON.parse(readFileSync(new URL('../public/data/tracer/2026/oct.json',import.meta.url),'utf8')).tracerReportingPeriods.at(-1);

test('executive district counts use the selected province and district rather than national missing totals',()=>{
  assert.equal(primaryCareDistrictSummary(period).missing,6);
  const central=primaryCareDistrictSummary(period,{province:'CENTRAL PROVINCE'});
  assert.equal(central.expected,11); assert.equal(central.reported,11); assert.equal(central.missing,0);
  const lusaka=primaryCareDistrictSummary(period,{province:'LUSAKA PROVINCE'});
  assert.equal(lusaka.expected,6); assert.equal(lusaka.reported,5); assert.equal(lusaka.missing,1);
  assert.equal(primaryCareDistrictSummary(period,{province:'LUSAKA PROVINCE',district:'RUFUNSA'}).missing,1);
  assert.equal(primaryCareDistrictSummary(period,{province:'LUSAKA PROVINCE',district:'KAFUE'}).missing,0);
  assert.equal(primaryCareDistrictSummary(period,{province:'CENTRAL PROVINCE',district:'RUFUNSA'}).expected,0);
});

test('missing facility reporting units are counted separately from incomplete DHO districts',()=>{
  assert.equal(facilityReportingSummary(period).missing,6);
  assert.equal(facilityReportingSummary(period,{province:'CENTRAL PROVINCE'}).missing,1);
  const lusaka=facilityReportingSummary(period,{province:'LUSAKA PROVINCE'});
  assert.equal(lusaka.expected,32); assert.equal(lusaka.reported,30); assert.equal(lusaka.missing,2);
  assert.ok(lusaka.missingRows.every(row=>row.province==='LUSAKA PROVINCE'&&row.district==='LUSAKA'));
  assert.equal(primaryCareDistrictSummary(period,{province:'MUCHINGA PROVINCE'}).missing,1);
  assert.equal(facilityReportingSummary(period,{province:'MUCHINGA PROVINCE'}).missing,0);
});

test('facility card and detail rows intersect geography, care level and exact reporting unit',()=>{
  const scope={province:'LUSAKA PROVINCE',district:'LUSAKA',matchesFacility:row=>row.facilityLevel==='LEVEL 3 HOSPITAL'};
  const result=facilityReportingSummary(period,scope);
  assert.equal(result.missing,1);
  const missing=result.missingRows[0];
  const facility=[missing.province,missing.district,missing.facilityLevel,missing.name].join('|');
  const single=facilityReportingSummary(period,{...scope,facility});
  assert.equal(single.expected,1); assert.equal(single.reported,0); assert.equal(single.missing,1);
  assert.equal(facilityReportingSummary(period,{...scope,district:'KAFUE',facility}).expected,0);
  assert.equal(facilityReportingSummary(period,{province:'Not a province'}).rate,null);
});

test('province totals reconcile to national counts without counting duplicate reporting units',()=>{
  const total=facilityReportingSummary(period);
  assert.equal(total.detailedReported,388);
  assert.ok(total.reported>=total.detailedReported);
  const provinces=[...new Set(total.rows.map(row=>row.province))];
  const scopes=provinces.map(province=>facilityReportingSummary(period,{province}));
  assert.equal(scopes.reduce((sum,row)=>sum+row.expected,0),total.expected);
  assert.equal(scopes.reduce((sum,row)=>sum+row.reported,0),total.reported);
  assert.equal(scopes.reduce((sum,row)=>sum+row.missing,0),total.missing);
  for(const row of scopes) assert.equal(row.reported+row.missing,row.expected);
});

test('executive click-through retains the card scope and missing-facility action',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const click=source.slice(source.indexOf('function openExecutiveReportingDetail('),source.indexOf('function openExecutiveCommodityDetail('));
  assert.match(click,/setReportDistrict\(selectedDistrict\)/);
  assert.match(click,/setReportPeriodId\(fieldData.id\)/);
  assert.match(click,/setReportProvince\(selectedProvince\)/);
  assert.match(click,/facilityDetail \? selectedFacilityLevel/);
  assert.match(source,/label: "Facilities not reported".*openExecutiveReportingDetail\("facility-missing"\)/);
  assert.match(source,/Back to overview/);
  assert.match(source,/isNationalUnfilteredScope \? fieldData.national : makeEmptyRollup\(\)/);
  assert.match(source,/fieldKpis.rows \? formatPercent\(fieldKpis.availability\) : 'Not reported'/);
});
