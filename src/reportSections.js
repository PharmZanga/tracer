export const reportSections = [
  ['overview','National Overview'],['care','Availability by Level of Care'],
  ['provinces','Provincial Performance'],['programmes','Programme Performance'],
  ['zammsa','ZAMMSA Central Stock Status'],['reporting','Reporting Completeness'],
  ['stock','National Stock Status'],['commodities','Commodity Priorities'],
  ['provincial-trends','Provincial Trends'],['commodity-trends','Commodity Stock Status Trends'],
  ['predictive','Predictive Analysis'],['profile','Provincial Profile'],
  ['province-availability','Provincial Drug Availability'],['district-availability','District Drug Availability'],
  ['imbalance','Stock Imbalance'],['reporting-rate','Reporting Rate'],
  ['actions','Recommended Actions'],['sources','Methodology and Sources'],
].map(([id,title],index)=>[id,`${String.fromCharCode(65+index)}. ${title}`]);
export function stockImbalanceShares(row) {
  const counts=[row.stockout||0,(row.nearCritical||0)+(row.understocked||0),row.accordingToPlan||0,(row.abovePlan||0)+(row.overstock||0),row.dataGap||0];
  return counts.map(count=>row.rows>0?count/row.rows:null);
}
