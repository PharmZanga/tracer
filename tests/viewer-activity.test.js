import test from 'node:test';
import assert from 'node:assert/strict';
import {activityQuery,validateActivityPage} from '../src/viewerActivityPolicy.js';
import {viewerActivityRouter} from '../server/viewer-activity.js';
const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;},sendStatus(code){this.code=code;return this;}});
function handler(router,method){return router.stack.find(l=>l.route?.methods[method]).route.stack[0].handle;}
test('activity limits query range and accepts only allowed pages',()=>{
  assert.equal(validateActivityPage('viewer','viewers'),false);assert.equal(validateActivityPage('admin','viewers'),true);
  assert.equal(validateActivityPage('viewer','https://example.com'),false);
  assert.deepEqual(activityQuery({days:999,page:-1,search:' a '}),{days:30,page:1,limit:25,offset:0,search:'a'});
});
test('non-admin cannot inspect viewer identities or usage',async()=>{
  let queries=0;const router=viewerActivityRouter({query:async()=>{queries++;return {rows:[]};}}),res=response();
  await handler(router,'get')({session:{user:{role:'viewer'}},query:{}},res,e=>{throw e;});
  assert.equal(res.code,403);assert.equal(queries,0);
});
test('recording uses session email, ignores spoofed identity and throttles heartbeats',async()=>{
  const calls=[];const router=viewerActivityRouter({query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}});
  const req={session:{user:{email:'approved@example.com',role:'viewer'}},body:{page:'facilities',view:true,email:'spoof@example.com',question:'Do not retain'}};
  const res=response();await handler(router,'post')(req,res,e=>{throw e;});
  assert.equal(res.code,204);assert.deepEqual(calls.at(-1).args,['approved@example.com','facilities',1]);
  const count=calls.length;await handler(router,'post')(req,response(),e=>{throw e;});assert.equal(calls.length,count);
  assert.ok(!JSON.stringify(calls).includes('Do not retain'));
  req.body.page='viewers';await handler(router,'post')(req,res,e=>{throw e;});assert.equal(res.code,400);
});
test('admin results are paginated and all search values are parameterized',async()=>{
  const calls=[];const router=viewerActivityRouter({query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('AS active')?[{active:0,viewers:0,views:0}]:[]};}}),res=response();
  await handler(router,'get')({session:{user:{role:'admin'}},query:{days:'7',page:'2',search:"x' OR 1=1"}},res,e=>{throw e;});
  assert.equal(res.code,200);assert.equal(res.body.pageSize,25);
  const users=calls.find(c=>c.sql.includes('DISTINCT ON'));assert.deepEqual(users.args,[7,"x' OR 1=1",25,25]);
  assert.ok(!users.sql.includes("x' OR 1=1"));
});
