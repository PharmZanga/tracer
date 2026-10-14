import {useEffect,useRef} from 'react';
import {validateActivityPage} from './viewerActivityPolicy.js';
export default function useViewerActivity(user,page) {
  const lastInteraction=useRef(Date.now());
  const sending=useRef(false),lastRecordedPage=useRef('');
  useEffect(()=>{
    if(!window.__TRACER_SECURE_DASHBOARD__||!user||!validateActivityPage(user.role,page))return;
    const interact=()=>{lastInteraction.current=Date.now();};
    const send=async()=>{
      if(sending.current||document.visibilityState!=='visible'||Date.now()-lastInteraction.current>300000)return;
      sending.current=true;
      try{const r=await fetch('/api/viewer-activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,view:lastRecordedPage.current!==page}),redirect:'error'});if(r.ok)lastRecordedPage.current=page;}catch{/* Activity must not interrupt dashboard use. */}finally{sending.current=false;}
    };
    const visible=()=>{if(document.visibilityState==='visible'){interact();send();}};
    window.addEventListener('pointerdown',interact,{passive:true});window.addEventListener('keydown',interact);window.addEventListener('scroll',interact,{passive:true});document.addEventListener('visibilitychange',visible);
    send();const timer=setInterval(send,60000);
    return()=>{clearInterval(timer);window.removeEventListener('pointerdown',interact);window.removeEventListener('keydown',interact);window.removeEventListener('scroll',interact);document.removeEventListener('visibilitychange',visible);};
  },[user?.email,user?.role,page]);
}
