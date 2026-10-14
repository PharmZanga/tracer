import {useEffect,useMemo,useRef,useState} from 'react';
import {Maximize2} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './facilityAlertsMap.css';
import {districtMapKey,groupMapFacilities} from './facilityMapData.js';
let boundariesPromise;
function loadBoundaries(){if(!boundariesPromise)boundariesPromise=fetch(`${import.meta.env.BASE_URL}data/maps/zambia-districts.geojson`).then(r=>{if(!r.ok)throw new Error('District map could not be loaded.');return r.json();}).catch(e=>{boundariesPromise=null;throw e;});return boundariesPromise;}
export default function FacilityAlertsMap({facilities,onOpen,onReporting}) {
  const container=useRef(null),map=useRef(null),fit=useRef(null);
  const [geo,setGeo]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[selected,setSelected]=useState(''),[page,setPage]=useState(1);
  const groups=useMemo(()=>groupMapFacilities(facilities),[facilities]);
  useEffect(()=>{let active=true;setError('');loadBoundaries().then(d=>{if(active)setGeo(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);
  useEffect(()=>{
    if(!geo)return;let disposed=false,observer;
    import('leaflet').then(({default:L})=>{
      if(disposed)return;
      const m=L.map(container.current,{scrollWheelZoom:false,minZoom:4,maxZoom:12,zoomSnap:.25});map.current=m;
      m.attributionControl.addAttribution('<a href="https://www.geoboundaries.org/">geoBoundaries</a> / GRID3, Office of the Surveyor General · CC BY 4.0');
      const activeBounds=L.latLngBounds([]);
      const layer=L.geoJSON(geo,{style:f=>{const g=groups.get(districtMapKey(f.properties.shapeName));return {color:'#fff',weight:1,fillColor:g?.color||'#c9d5d0',fillOpacity:g?.facilities.length?.8:.35};},onEachFeature:(feature,polygon)=>{
        const key=districtMapKey(feature.properties.shapeName),g=groups.get(key);
        const text=document.createElement('span');text.textContent=`${feature.properties.shapeName}: ${g?`${g.facilities.length} reporting units; ${g.stockout} with stock-outs; ${g.low} low stock; ${g.missing} did not report`:'No units in current filters'}`;polygon.bindTooltip(text,{sticky:true});
        if(g){activeBounds.extend(polygon.getBounds());polygon.on('click',()=>{setSelected(key);setPage(1);});}
      }}).addTo(m);
      const bounds=activeBounds.isValid()?activeBounds:layer.getBounds();fit.current=()=>m.fitBounds(bounds,{padding:[20,20],maxZoom:9,animate:false});fit.current();
      observer=new ResizeObserver(()=>{m.invalidateSize();});observer.observe(container.current);
    }).catch(()=>{if(!disposed)setError('The map library could not be loaded. Please try again.');});
    return()=>{disposed=true;observer?.disconnect();map.current?.remove();map.current=null;fit.current=null;};
  },[geo,groups,retry]);
  const matched=new Set((geo?.features||[]).map(f=>districtMapKey(f.properties.shapeName)));
  const unmatched=[...groups.values()].filter(g=>!matched.has(g.key));
  const chosen=groups.get(selected);
  const list=chosen?.facilities||[];
  return <div className="facility-geographic-map">
    <div className="facility-geo-toolbar"><span>{groups.size} districts · {facilities.length} reporting units</span><button type="button" title="Fit map to selected reporting units" aria-label="Fit map to selected reporting units" onClick={()=>fit.current?.()}><Maximize2 size={16}/></button></div>
    <p className="facility-geo-note">District-level alert map, not exact facility locations. Colour shows the highest-priority status among units in the current filters; grey districts have no matching units.</p>
    <div className="facility-geo-layout"><div className="facility-geographic-canvas" ref={container} role="region" aria-label="Zambia district alert map"/>
      <aside className="facility-geo-details"><label>District<select value={chosen?.key||''} onChange={e=>{setSelected(e.target.value);setPage(1);}}><option value="">Select a district</option>{[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=><option value={g.key} key={g.key}>{g.name} ({g.facilities.length})</option>)}</select></label>
        {chosen?<><h3>{chosen.name}</h3><p>{chosen.province} · {list.length} reporting units</p>{list.slice((page-1)*20,page*20).map((f,i)=><button type="button" className="facility-geo-unit" key={i} onClick={()=>f.reportingStatus==='Facility did not report'?onReporting(f):onOpen(f)}><strong>{f.isAggregate?`All ${f.facilityLevel.toLowerCase()} facilities`:f.name}</strong><span>{f.facilityLevel}</span><small>{f.reportingStatus==='Facility did not report'?'Did not report - stock unknown':`${f.stockoutItemCount||0} stock-outs · ${f.lowStockItemCount||0} low-stock items`}</small></button>)}{list.length>20&&<div className="facility-geo-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page}/{Math.ceil(list.length/20)}</span><button disabled={page*20>=list.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</>:<p>Select a coloured district on the map or choose its name above.</p>}
      </aside></div>
    {!geo&&!error&&<p role="status">Loading Zambia district boundaries...</p>}
    {error&&<div role="alert">{error}<button onClick={()=>setRetry(r=>r+1)}>Try again</button></div>}
    {geo&&unmatched.length>0&&<p role="status">Boundary match unavailable for: {unmatched.map(g=>g.name).join(', ')}. These units remain accessible through the district selector.</p>}
    {!facilities.length&&<p>No reporting units match the selected filters.</p>}
  </div>;
}
