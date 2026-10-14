import {useEffect,useState} from 'react';
import {RefreshCw,Users,Eye,Activity} from 'lucide-react';
import {activityPages} from './viewerActivityPolicy.js';
import './viewerActivity.css';
const timestamp=value=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Lusaka',dateStyle:'medium',timeStyle:'short'}):'-';
export default function ViewerActivity() {
  const [days,setDays]=useState('7'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[automatic,setAutomatic]=useState(true);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},350);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{if(!automatic)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setRevision(r=>r+1);},60000);return()=>clearInterval(timer);},[automatic]);
  useEffect(()=>{
    if(!window.__TRACER_SECURE_DASHBOARD__)return;
    const controller=new AbortController();setLoading(true);setError('');
    fetch(`/api/viewer-activity?${new URLSearchParams({days,page:String(page),search:query})}`,{signal:controller.signal,redirect:'error'})
      .then(async r=>{if(!r.ok)throw new Error(r.status===403?'Administrator access required.':'Viewer activity could not be loaded.');return r.json();})
      .then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[days,page,query,revision]);
  const total=data?.summary?.viewers||0,totalPages=Math.max(1,Math.ceil(total/25));
  return <section className="viewer-activity-section" aria-label="Viewer Activity">
    <div className="viewer-activity-heading"><div><p className="eyebrow dark">Administration</p><h2>Viewer Activity</h2></div><button type="button" onClick={()=>setRevision(r=>r+1)} disabled={loading} title="Refresh viewer activity" aria-label="Refresh viewer activity"><RefreshCw size={18}/></button></div>
    <p>Signed-in dashboard activity. Active recently means a visible tab with recent interaction and a heartbeat within five minutes, not proof of reading. Records are retained for 30 days; no IP addresses, question text or filter values are collected here.</p>
    <div className="viewer-activity-controls"><label>Time range<select value={days} onChange={e=>{setDays(e.target.value);setPage(1);}}><option value="1">Today (Lusaka)</option><option value="7">Last 7 calendar days</option><option value="30">Last 30 calendar days</option></select></label><label>Find a viewer<input type="search" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} placeholder="Name, email or province"/></label><label className="viewer-activity-toggle"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>Auto-refresh</label></div>
    {!window.__TRACER_SECURE_DASHBOARD__?<p role="status">Viewer activity is available on the signed-in secure dashboard. Local previews do not collect activity.</p>:<>
      {error&&<div role="alert">{error} <button onClick={()=>setRevision(r=>r+1)}>Try again</button></div>}
      {loading&&<p role="status">Loading viewer activity...</p>}
      {data&&<><small>Last refreshed: {timestamp(data.asOf)} (Lusaka time){error?' · Previous results; refresh failed':''}</small>
        <div className="viewer-activity-kpis">{[[Activity,'Active recently',data.summary.active],[Users,'Distinct viewers',data.summary.viewers],[Eye,'Page views',data.summary.views]].map(([Icon,label,count])=><div key={label}><span><Icon size={16}/>{label}</span><strong>{Number(count||0).toLocaleString()}</strong></div>)}</div>
        <h3>Recent Viewers</h3><div className="table-scroll"><table><thead><tr><th>Name / email</th><th>Province / organisation</th><th>Role</th><th>Latest page</th><th>Last seen (Lusaka)</th><th>Status</th><th>Views</th></tr></thead><tbody>{data.users.map(u=><tr key={u.email}><td><strong>{u.name||u.email}</strong>{u.name&&<small>{u.email}</small>}</td><td>{u.province||'-'}</td><td>{u.role}</td><td>{activityPages[u.page]||u.page}</td><td>{timestamp(u.last_seen)}</td><td>{Date.parse(data.asOf)-Date.parse(u.last_seen)<=300000?'Active recently':'Not recently active'}</td><td>{u.views}</td></tr>)}</tbody></table></div>
        {!data.users.length&&<p>No matching activity has been recorded. Collection begins after this feature is deployed; earlier visits cannot be reconstructed.</p>}
        <div className="viewer-activity-pagination"><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1||loading}>Previous</button><span>Page {page} of {totalPages} · {total} viewers</span><button onClick={()=>setPage(p=>p+1)} disabled={page>=totalPages||loading}>Next</button></div>
        <h3>Page Usage</h3><div className="table-scroll"><table><thead><tr><th>Dashboard page</th><th>Distinct viewers</th><th>Page views</th></tr></thead><tbody>{data.pages.map(p=><tr key={p.page}><td>{activityPages[p.page]||p.page}</td><td>{p.viewers}</td><td>{p.views}</td></tr>)}</tbody></table></div>
        <small>Page views count recorded page entries, not heartbeat requests. Multiple tabs can be open; latest page is the most recent heartbeat. Totals follow the time range and viewer search.</small>
      </>}
    </>}
  </section>;
}
