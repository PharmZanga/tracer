import {canAccessDashboardPage} from './dashboardAccess.js';
export const activityPages = {
  executive:'Executive Summary',national:'National Stock Status',stock:'ZAMMSA Control Tower',
  provincial:'Provincial Performance',facilities:'Facility Alerts',commodities:'Commodity Intelligence',
  alerts:'Commodity Alerts',comparison:'Comparison',programmes:'Programme Performance',vaccines:'Vaccine Stock',
  reporting:'Reporting Rate',quality:'Data Quality',gate:'Data Quality Gate',predictive:'Predictive Analysis',
  actions:'Action Tracker',reports:'Generate Report',imports:'Submission Import',viewers:'Viewer Activity',
};
export function validateActivityPage(role,page) {
  return typeof page==='string'&&Object.hasOwn(activityPages,page)&&canAccessDashboardPage(role,page);
}
export function activityQuery(query={}) {
  const days=Math.min(30,Math.max(1,Number.parseInt(query.days,10)||7));
  const page=Math.min(100000,Math.max(1,Number.parseInt(query.page,10)||1));
  return {days,limit:25,offset:(page-1)*25,page,search:String(query.search||'').trim().slice(0,120)};
}
