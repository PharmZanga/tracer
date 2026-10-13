import {useEffect,useRef,useState} from 'react';
import {BotMessageSquare,Send,X,ArrowRight,Volume2,Square} from 'lucide-react';
import {createGuideSpeech} from './guideSpeech.js';
import {navigationTopics,guideAnswer,clampGuidePosition} from './navigationGuide.js';
import {canAccessDashboardPage} from './dashboardAccess.js';
import './navigationGuide.css';
export default function NavigationGuide({role,onNavigate}) {
  const dialog=useRef(null),launcher=useRef(null),end=useRef(null);
  const [open,setOpen]=useState(false),[draft,setDraft]=useState('');
  const [voiceEnabled,setVoiceEnabled]=useState(false),[speechState,setSpeechState]=useState('idle');
  const speech=useRef(null);
  if(!speech.current)speech.current=createGuideSpeech(typeof window==='undefined'?null:window,setSpeechState);
  useEffect(()=>{const stop=()=>speech.current.stop();window.addEventListener('pagehide',stop);return()=>{window.removeEventListener('pagehide',stop);speech.current.stop();};},[]);
  const [position,setPosition]=useState(null),[greeting,setGreeting]=useState(true),[dragging,setDragging]=useState(false);
  const robot=useRef(null),drag=useRef(null),didDrag=useRef(false);
  const [messages,setMessages]=useState([{text:'Hi, how can I help you? I can guide you to the right dashboard page without changing your selected filters.',bot:true}]);
  useEffect(()=>{const resize=()=>setPosition(p=>p?clampGuidePosition(p.left,p.top,window.innerWidth,window.innerHeight):p);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const beginDrag=e=>{if(e.button!==0)return;const r=robot.current.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:r.left,top:r.top};didDrag.current=false;e.currentTarget.setPointerCapture(e.pointerId);};
  const moveDrag=e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!didDrag.current&&Math.hypot(dx,dy)<6)return;didDrag.current=true;setDragging(true);setPosition(clampGuidePosition(d.left+dx,d.top+dy,window.innerWidth,window.innerHeight));};
  const stopDrag=()=>{drag.current=null;setDragging(false);};
  const moveWithKeys=e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!delta)return;e.preventDefault();const r=robot.current.getBoundingClientRect();setPosition(clampGuidePosition(r.left+delta[0],r.top+delta[1],window.innerWidth,window.innerHeight));};
  useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();else if(!open&&dialog.current.open)dialog.current.close();},[open]);
  useEffect(()=>{if(open)end.current?.scrollIntoView({block:'nearest'});},[messages,open]);
  const ask=text=>{const q=text.trim().slice(0,400);if(!q)return;const answer=guideAnswer(q,role);setMessages(m=>[...m,{text:q,bot:false},{...answer,bot:true}]);setDraft('');if(voiceEnabled)speech.current.speak(answer.text);};
  const close=()=>{speech.current.stop();setOpen(false);launcher.current?.focus();};
  return <><div ref={robot} className="navigation-guide-robot" style={position?{left:position.left,top:position.top,right:'auto',bottom:'auto'}:undefined}>
    {greeting&&!open&&<div className="navigation-guide-greeting"><span>Hi, how can I help you?</span><button type="button" onClick={()=>setGreeting(false)} aria-label="Dismiss robot greeting" title="Dismiss greeting"><X size={14}/></button></div>}
    <button ref={launcher} className={`navigation-guide-launcher${dragging?' dragging':''}`} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={moveWithKeys} onClick={()=>{if(didDrag.current){didDrag.current=false;return;}setOpen(true);}} title="Dashboard guide. Drag to move, or use arrow keys when focused. Click to chat." aria-label="Open dashboard navigation guide"><BotMessageSquare size={30} aria-hidden="true"/></button>
    </div>
    <dialog ref={dialog} className="navigation-guide" aria-labelledby="navigation-guide-title" onCancel={close} onClose={()=>setOpen(false)}>
      <header><div><h2 id="navigation-guide-title">Dashboard guide</h2><p>Navigation help · no data analysis</p></div><button onClick={close} aria-label="Close navigation guide" title="Close"><X size={20}/></button></header>
      <div className="navigation-guide-voice">
        <label><input type="checkbox" checked={voiceEnabled} disabled={!speech.current.supported} onChange={e=>{setVoiceEnabled(e.target.checked);if(e.target.checked)speech.current.speak(messages.filter(m=>m.bot).at(-1).text);else speech.current.stop();}}/>Voice replies</label>
        <button type="button" disabled={!speech.current.supported} title="Read the latest guide reply aloud" onClick={()=>speech.current.speak(messages.filter(m=>m.bot).at(-1).text)}><Volume2 size={16}/>Read aloud</button>
        <button type="button" disabled={!speech.current.supported} title="Stop reading aloud" onClick={()=>speech.current.stop()}><Square size={14}/>Stop</button>
        <small role="status">{!speech.current.supported?'Voice is unavailable in this browser.':speechState==='error'?'Playback unavailable. Try Read aloud again.':speechState==='speaking'?'Speaking...':voiceEnabled?'Voice replies on':'Voice off by default'}</small>
      </div>
      <div className="navigation-guide-messages" role="log" aria-live="polite">{messages.map((m,i)=><div className={`navigation-guide-message ${m.bot?'guide':'user'}`} key={i}><strong>{m.bot?'Dashboard guide':'You'}</strong><p>{m.text}</p>{m.topic&&canAccessDashboardPage(role,m.topic.page)&&<button onClick={()=>{onNavigate(m.topic);close();}}>Open {m.topic.label.toLowerCase()}<ArrowRight size={16}/></button>}</div>)}<div ref={end}/></div>
      <div className="navigation-guide-topics" aria-label="Navigation topics">{navigationTopics.filter(t=>canAccessDashboardPage(role,t.page)).map(t=><button key={t.id} onClick={()=>ask(t.label)}>{t.label}</button>)}</div>
      <form onSubmit={e=>{e.preventDefault();ask(draft);}}><label className="navigation-guide-input"><span>What would you like to find?</span><input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={400} placeholder="Where can I find a medicine?"/></label><button type="submit" disabled={!draft.trim()} aria-label="Send navigation question" title="Send"><Send size={18}/></button></form>
    </dialog></>;
}
