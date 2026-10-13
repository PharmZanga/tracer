import test from 'node:test';
import assert from 'node:assert/strict';
import {guideAnswer,navigationTopics,clampGuidePosition} from '../src/navigationGuide.js';
test('robot stays within viewport after dragging and resizing',()=>{
  assert.deepEqual(clampGuidePosition(-100,-100,390,844),{left:8,top:8});
  assert.deepEqual(clampGuidePosition(2000,2000,390,844),{left:162,top:724});
});
test('guide maps medicines and ZAMMSA to distinct workspaces',()=>{
  assert.equal(guideAnswer('where is normal saline','viewer').topic.page,'commodities');
  assert.equal(guideAnswer('ZAMMSA stock navigator','viewer').topic.stock,'navigator');
  assert.equal(guideAnswer('generate PDF','viewer').topic,null);
  assert.equal(guideAnswer('generate PDF','admin').topic.page,'reports');
  assert.equal(guideAnswer('what is the stock quantity','viewer').topic,null);
});
test('every quick topic routes to its own answer',()=>{
  for(const topic of navigationTopics)assert.equal(guideAnswer(topic.label,'admin').topic?.id,topic.id,topic.label);
});
