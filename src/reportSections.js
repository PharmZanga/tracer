export const reportSectionDefinitions = [
  ['overview','National Overview'],['care','Availability by Level of Care'],
  ['provinces','Provincial Performance'],['programmes','Programme Performance'],
  ['stock','National Stock Imbalance'],['imbalance','Provincial Stock Imbalance'],
  ['reporting-rate','Reporting Rate'],
  ['zammsa','ZAMMSA Central Stock Status'],['reporting','Reporting Completeness'],
  ['commodities','Commodity Priorities'],
  ['provincial-trends','Provincial Trends'],['commodity-trends','Commodity Stock Status Trends'],
  ['predictive','Predictive Analysis'],['profile','Provincial Profile'],
  ['province-availability','Provincial Drug Availability'],['district-availability','District Drug Availability'],
  ['actions','Recommended Actions'],['sources','Methodology and Sources'],
];
const letterSections = sections => sections.map(([id,title],index)=>[id,`${String.fromCharCode(65+index)}. ${title}`]);
export const reportSections = letterSections(reportSectionDefinitions);
export const defaultReportSectionIds = reportSectionDefinitions.slice(0,7).map(([id])=>id);
export function selectedReportSections(ids) {
  return letterSections(reportSectionDefinitions.filter(([id])=>ids.includes(id)));
}
export function stockImbalanceShares(row) {
  const counts=[row.stockout||0,(row.nearCritical||0)+(row.understocked||0),row.accordingToPlan||0,(row.abovePlan||0)+(row.overstock||0),row.dataGap||0];
  return counts.map(count=>row.rows>0?count/row.rows:null);
}
