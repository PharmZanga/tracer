import {vaccineStockData} from './vaccineStockData.js';

// Keep new monthly observations outside Vite's application bundle.
const september = typeof window === 'undefined'
  ? JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../public/data/vaccines/2026-09.json',import.meta.url),'utf8'))
  : await fetch(`${import.meta.env.BASE_URL}data/vaccines/2026-09.json`).then(response=>{
    if(!response.ok) throw new Error('September vaccine data could not be loaded.');
    return response.json();
  });
const index=(key,value)=>{
  const values=vaccineStockData.dictionaries[key];
  let position=values.indexOf(value);
  if(position<0){position=values.length;values.push(value);}
  return position;
};
vaccineStockData.periods.push({...september,rows:september.rows.map(row=>[
  index('provinces',row.province),index('districts',row.district),index('vaccines',row.vaccine),
  row.stock,row.amc,row.mos,row.expiryDate,row.vvmStage,
])});
vaccineStockData.coverage='January 2025 to September 2026';
export {vaccineStockData};
