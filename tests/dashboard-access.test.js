import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessDashboardPage} from '../src/dashboardAccess.js';
test('only administrators can access Administration pages',()=>{
  for(const role of [undefined,null,'viewer','provincial_pharmacist','district_pharmacist']) {
    for(const page of ['reports','imports']) assert.equal(canAccessDashboardPage(role,page),false);
    for(const page of ['executive','provincial','commodities','vaccines']) assert.equal(canAccessDashboardPage(role,page),true);
  }
  for(const role of ['admin','super_admin']) for(const page of ['reports','imports']) assert.equal(canAccessDashboardPage(role,page),true);
});
