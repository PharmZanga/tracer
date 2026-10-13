import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {canonicalCommodityName,canonicalCommodityRollups} from '../src/commodityNormalization.js';
const root=new URL('../public/data/tracer/',import.meta.url);
const names=new Set(),periods=[];
async function scan(url){for(const entry of await readdir(url,{withFileTypes:true})){const path=new URL(entry.name+(entry.isDirectory()?'/':''),url);if(entry.isDirectory())await scan(path);else if(entry.name.endsWith('.json')){const data=JSON.parse(await readFile(path,'utf8'));for(const p of data.tracerReportingPeriods||[]){periods.push(p);for(const r of p.commodities||[])names.add(r.name);for(const n of p.commodityFacilityData?.dictionaries?.items||[])names.add(n);}}}}
await scan(root);
const groups=new Map();
for(const name of names){const canonical=canonicalCommodityName(name);if(!groups.has(canonical))groups.set(canonical,new Set());groups.get(canonical).add(name);}
const aliases=[...groups].filter(([name,variants])=>variants.size>1||!variants.has(name));
// Loose punctuation matches are review candidates only, never automatic merges.
const candidates=new Map();
for(const name of groups.keys()){const key=name.toLowerCase().replace(/[^a-z0-9]/g,'');if(!candidates.has(key))candidates.set(key,[]);candidates.get(key).push(name);}
const review=[...candidates.values()].filter(g=>g.length>1);
for(const p of periods){const after=canonicalCommodityRollups(p.commodities);for(const field of ['rows','quantity','amc','stockout','nearCritical','understocked','accordingToPlan','abovePlan','overstock','dataGap','riskRows']){const sum=rows=>rows.reduce((n,r)=>n+(Number(r[field])||0),0);if(Math.abs(sum(p.commodities||[])-sum(after))>0.01)throw new Error(`${p.id}: ${field} changed`);}}
const lines=['# Tracer Commodity Name Audit','',`${periods.length} reporting periods; ${names.size} source names; ${groups.size} canonical names.`, '', 'All commodity observation counts, quantities, AMC and stock-band totals reconcile before and after grouping. Source records are not deleted.', '', '## Standardised Names',''];
for(const [name,variants] of aliases)lines.push(`### ${name}`,...[...variants].map(n=>`- ${n}`),'');
lines.push('## Manual Review Candidates','', 'These punctuation-only matches remain separate; clinical equivalence has not been assumed.','');
for(const group of review)lines.push(group.map(n=>`- ${n}`).join('\n'),'');
lines.push('The legacy 0.09% normal-saline label is consolidated by the existing approved dashboard mapping. Original source labels are retained; this audit does not verify physical product strength.','');
const out=new URL('../outputs/commodity-name-audit.md',import.meta.url);await mkdir(new URL('../outputs/',import.meta.url),{recursive:true});await writeFile(out,lines.join('\n'));
console.log(JSON.stringify({periods:periods.length,sourceNames:names.size,canonicalNames:groups.size,standardisedGroups:aliases.length,manualReviewGroups:review.length,review},null,2));
