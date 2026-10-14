export function districtMapKey(name) {
  const key=String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return ({CHIENGI:'CHIENGE',MILENGI:'MILENGE',MUSHINDANO:'MUSHINDAMO',SENGAHILL:'SENGA',CHIKANKANTA:'CHIKANKATA'})[key]||key;
}
export function groupMapFacilities(rows) {
  const groups=new Map();
  for(const row of rows){const key=districtMapKey(row.district);if(!key)continue;
    if(!groups.has(key))groups.set(key,{key,name:row.district,province:row.province,facilities:[],missing:0,stockout:0,low:0,over:0});
    const g=groups.get(key);g.facilities.push(row);
    if(row.reportingStatus==='Facility did not report')g.missing++;
    else {if(row.stockoutItemCount>0)g.stockout++;if(row.lowStockItemCount>0||row.criticalLowStockItemCount>0)g.low++;if(row.overstockItemCount>0)g.over++;}
  }
  for(const g of groups.values())g.color=g.stockout?'#cf322a':g.low?'#c07b08':g.missing?'#822722':g.over?'#2569a5':'#248653';
  return groups;
}
