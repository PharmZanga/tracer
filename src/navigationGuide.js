import {canAccessDashboardPage} from './dashboardAccess.js';
export function clampGuidePosition(left,top,width,height) {
  return {left:Math.max(8,Math.min(left,Math.max(8,width-228))),top:Math.max(8,Math.min(top,Math.max(8,height-120)))};
}
export const navigationTopics = [
  {id:'start',label:'Getting started',terms:/start|new|first|help|guide|use dashboard/i,text:'Start with Executive Summary. Choose the reporting year, month and week, then narrow to a province or district. More filters contains facility level and reporting unit. The scope line shows which data is selected.',page:'executive'},
  {id:'stock',label:'Find ZAMMSA stock',terms:/zammsa|warehouse|central stock|stock navigator/i,text:'Open ZAMMSA Stock Navigator for central warehouse stock. Choose a report date and search the ordering code or item name. Central inventory is separate from facility tracer stock.',page:'stock',stock:'navigator'},
  {id:'commodity',label:'Find a medicine',terms:/medicine|drug|commodity|commodities|saline|product/i,text:'Open Commodity Intelligence and search the medicine name. Select a commodity to review availability, stock and facility records for the selected reporting period.',page:'commodities'},
  {id:'reporting',label:'Check who reported',terms:/reporting|who.*report|not report|missing|submission rate/i,text:'Reporting Rate shows complete and missing district or facility submissions. A complete DHO submission needs Health Centre and Health Post evidence; missing reports are not stock-outs.',page:'reporting'},
  {id:'viewers',label:'View dashboard activity',terms:/viewer|who.*view|dashboard activity|page usage/i,text:'Administrators can open Viewer Activity under Administration to see recent signed-in viewers and page-use totals. Active recently is based on visible-tab activity, not proof that someone is reading.',page:'viewers'},
  {id:'province',label:'View my province',terms:/province|provincial|district/i,text:'Open Provincial Performance and choose a province in the filters. Choose a district to narrow the view further. Changing the reporting period changes the evidence shown.',page:'provincial'},
  {id:'vaccine',label:'View vaccines',terms:/vaccine|immuni|expiry|ami|amc/i,text:'Open Vaccine Stock under Programme Intelligence. Its views include stock on hand, district AMC, provincial AMI, expiry, reporting and stock-outs. Select the month before comparing figures.',page:'vaccines'},
  {id:'comparison',label:'Compare periods',terms:/compar|months|quarter|trend/i,text:'Comparison lets you choose a frequency and two different reporting periods, then compare availability or MOS by programme or geography.',page:'comparison'},
  {id:'alerts',label:'Find facilities needing action',terms:/alert|low stock|stock.?out|shortage|facility|facilities/i,text:'Facility Alerts lists reporting units with stock concerns. Select the reporting period and geography, then open a facility for its commodity evidence.',page:'facilities'},
  {id:'quality',label:'Check data quality',terms:/quality|invalid|blocked|error/i,text:'Data Quality Gate shows records excluded from forecasting and redistribution until their source data is corrected.',page:'gate'},
  {id:'reports',label:'Generate a report',terms:/generat|pdf|print|report document/i,text:'Administrators can open Generate Report, choose weekly, monthly or quarterly coverage, select sections and generate a PDF.',page:'reports'},
  {id:'imports',label:'Import submissions',terms:/import|upload|administration|admin/i,text:'Administrators can validate provincial workbooks and review them before publishing through Submission Import. Access approvals are managed by dashboard administrators.',page:'imports'},
];
export function guideAnswer(question,role) {
  const topic=navigationTopics.find(t=>t.terms.test(String(question)));
  if(!topic)return {text:'I can help you find dashboard pages and filters. Choose a topic below, or ask where to find a medicine, reporting rates, vaccines or ZAMMSA stock. For numerical analysis, use Tracer Copilot.',topic:null};
  if(!canAccessDashboardPage(role,topic.page))return {text:'Administration, report generation and submission import are restricted to administrators. Contact your dashboard administrator for help; your regular dashboard access does not include these pages.',topic:null};
  return {text:topic.text,topic};
}
