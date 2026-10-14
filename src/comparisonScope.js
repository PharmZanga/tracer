import {canonicalCommodityName} from './commodityNormalization.js';
export function filterComparisonRows(rows,filters,matchesLevel=()=>true) {
  return rows.filter(r=>(filters.commodity==='all'||canonicalCommodityName(r.item)===canonicalCommodityName(filters.commodity))
    &&(filters.province==='all'||r.province===filters.province)
    &&(filters.district==='all'||r.district===filters.district)
    &&matchesLevel(r.facilityLevel,filters.facilityLevel)
    &&(filters.program==='all'||r.programme===filters.program));
}
export function hasComparisonScope(filters) {
  return ['commodity','province','district','facilityLevel','program'].some(key=>filters[key]!=='all');
}
