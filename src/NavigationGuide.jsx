import { useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Send, X, ArrowRight, Volume2, Square, Mic, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { createGuideSpeech } from './guideSpeech.js';
import { createAssistantVoiceInput } from './assistantVoiceInput.js';
import { clampGuidePosition } from './navigationGuide.js';
import './navigationGuide.css';
import './tracerAssistant.css';

export default function TracerAssistant({ onQuery, onApply, onFeedback, periodLabel, scopeLabel }) {
  const launcher = useRef(null), end = useRef(null), robot = useRef(null), drag = useRef(null), didDrag = useRef(false), busy = useRef(false), mounted = useRef(true);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(''), [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false), [speechState, setSpeechState] = useState('idle'), [inputState, setInputState] = useState('idle');
  const [position, setPosition] = useState(null), [greeting, setGreeting] = useState(true), [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hi, how can I help you? I can show stock concerns, check reporting, compare weeks and explain the selected data.' }]);
  const [feedback, setFeedback] = useState({});
  const speech = useRef(null), microphone = useRef(null), input = useRef(null), panel = useRef(null);
  if (!speech.current) speech.current = createGuideSpeech(typeof window === 'undefined' ? null : window, setSpeechState);
  if (!microphone.current) microphone.current = createAssistantVoiceInput(typeof window === 'undefined' ? null : window, text => { setDraft(text); input.current?.focus(); }, setInputState);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; speech.current.stop(); microphone.current.stop(); }; }, []);
  useEffect(() => { const resize = () => setPosition(p => p ? clampGuidePosition(p.left, p.top, window.innerWidth, window.innerHeight) : p); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (open) { input.current?.focus(); end.current?.scrollIntoView({ block: 'nearest' }); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (loading) end.current?.scrollIntoView({ block: 'nearest' });
    else panel.current?.querySelector('.assistant-message:last-of-type')?.scrollIntoView({ block: 'start' });
  }, [messages, loading, open]);
  const close = () => { speech.current.stop(); microphone.current.stop(); setOpen(false); launcher.current?.focus(); };
  const beginDrag = e => { if (e.button !== 0) return; const r = robot.current.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; didDrag.current = false; e.currentTarget.setPointerCapture(e.pointerId); };
  const moveDrag = e => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!didDrag.current && Math.hypot(dx, dy) < 6) return; didDrag.current = true; setDragging(true); setPosition(clampGuidePosition(d.left + dx, d.top + dy, window.innerWidth, window.innerHeight)); };
  const stopDrag = () => { drag.current = null; setDragging(false); };
  const moveWithKeys = e => { const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key]; if (!delta) return; e.preventDefault(); const r = robot.current.getBoundingClientRect(); setPosition(clampGuidePosition(r.left + delta[0], r.top + delta[1], window.innerWidth, window.innerHeight)); };
  const ask = async (question = draft, scope) => {
    const text = question.trim().slice(0, 1200); if (!text || busy.current) return;
    busy.current = true; setLoading(true); setDraft(''); microphone.current.stop();
    const conversation = messages.filter(m => !m.error).slice(-6).map(({ role, text }) => ({ role, text }));
    setMessages(previous => [...previous, { role: 'user', text }]);
    try {
      const answer = await onQuery(text, conversation, scope);
      if (!mounted.current) return;
      setMessages(previous => [...previous, { role: 'assistant', ...answer }]);
      if (voiceEnabled) speech.current.speak(answer.text);
    } catch {
      if (mounted.current) setMessages(previous => [...previous, { role: 'assistant', text: 'That request could not be completed. Your existing data has not been changed. Please try again.', error: true, retry: text }]);
    } finally { busy.current = false; if (mounted.current) { setLoading(false); input.current?.focus(); } }
  };
  const apply = async action => {
    if (action.question) return ask(action.question, action.scope);
    if (busy.current) return;
    busy.current = true; setLoading(true);
    try { const result = await onApply(action); if (result?.text) setMessages(previous => [...previous, { role: 'assistant', ...result }]); }
    catch { setMessages(previous => [...previous, { role: 'assistant', text: 'The requested view could not be opened. No data was changed.', error: true }]); }
    finally { busy.current = false; setLoading(false); }
  };
  const rate = async (id, rating) => { try { await onFeedback(id, rating); setFeedback(value => ({ ...value, [id]: rating })); } catch { setMessages(value => [...value, { role: 'assistant', text: 'Feedback could not be saved. Please try again.' }]); } };
  const keyboard = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const nodes = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  return <>
    <div ref={robot} className="navigation-guide-robot tracer-assistant-robot" style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}>
      {greeting && !open && <div className="navigation-guide-greeting"><span>Hi, how can I help you?</span><button type="button" onClick={() => setGreeting(false)} aria-label="Dismiss assistant greeting" title="Dismiss greeting"><X size={14} /></button></div>}
      <button ref={launcher} type="button" className={`navigation-guide-launcher${dragging ? ' dragging' : ''}`} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={moveWithKeys} onClick={() => { if (didDrag.current) { didDrag.current = false; return; } setOpen(true); }} aria-label="Open Tracer Assistant" aria-expanded={open} title="Tracer Assistant. Drag to move, or use arrow keys when focused."><BotMessageSquare size={30} aria-hidden="true" /></button>
    </div>
    {open && <div className="tracer-assistant-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <aside ref={panel} className="tracer-assistant-panel" role="dialog" aria-modal="true" aria-labelledby="tracer-assistant-title" onKeyDown={keyboard}>
        <header><div><span className="assistant-kicker">READ-ONLY ASSISTANT</span><h2 id="tracer-assistant-title"><BotMessageSquare size={22} aria-hidden="true" />Tracer Assistant</h2></div><div className="assistant-header-tools"><button type="button" disabled={loading} onClick={() => setMessages([{ role: 'assistant', text: 'New conversation. Dashboard filters are unchanged.' }])} aria-label="Clear conversation" title="Clear conversation"><RotateCcw size={17} /></button><button type="button" onClick={close} aria-label="Close Tracer Assistant" title="Close"><X size={20} /></button></div></header>
        <div className="assistant-active-scope"><strong>{periodLabel}</strong><span>{scopeLabel}</span></div>
        <div className="assistant-voice-tools"><label><input type="checkbox" checked={voiceEnabled} disabled={!speech.current.supported} onChange={e => { setVoiceEnabled(e.target.checked); if (!e.target.checked) speech.current.stop(); }} />Voice replies</label><button type="button" disabled={!speech.current.supported} onClick={() => speech.current.speak(messages.filter(m => m.role === 'assistant').at(-1)?.text)} title="Read latest answer" aria-label="Read latest answer"><Volume2 size={17} /></button><button type="button" disabled={speechState !== 'speaking'} onClick={() => speech.current.stop()} title="Stop reading" aria-label="Stop reading"><Square size={15} /></button></div>
        <div className="assistant-messages" role="log" aria-live="polite" aria-busy={loading}>
          {messages.map((message, index) => <article className={`assistant-message ${message.role}${message.error ? ' error' : ''}`} key={index}><strong>{message.role === 'user' ? 'You' : 'Tracer Assistant'}</strong><p>{message.text}</p>
            {message.columns && message.rows?.length > 0 && <div className="assistant-result-table"><table><thead><tr>{message.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{message.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table>{message.total > message.rows.length && <small>Showing {message.rows.length} of {message.total} results.</small>}</div>}
            {message.evidence && <details className="assistant-evidence"><summary>Evidence and scope</summary><p>{message.evidence}</p></details>}
            {message.modelEvidence?.limitation && <small>Model limitation: {message.modelEvidence.limitation}</small>}
            {(message.actions?.length > 0 || message.choices?.length > 0) && <div className="assistant-actions">{(message.actions || message.choices).map((action, i) => <button type="button" key={i} disabled={loading} onClick={() => apply(action)}>{action.label}<ArrowRight size={14} aria-hidden="true" /></button>)}</div>}
            {message.retry && <button type="button" disabled={loading} onClick={() => ask(message.retry)}>Try again</button>}
            {Number.isInteger(message.id) && <div className="assistant-feedback"><button type="button" aria-label="Helpful answer" title="Helpful" aria-pressed={feedback[message.id] === 1} onClick={() => rate(message.id, 1)}><ThumbsUp size={14} /></button><button type="button" aria-label="Answer needs correction" title="Needs correction" aria-pressed={feedback[message.id] === -1} onClick={() => rate(message.id, -1)}><ThumbsDown size={14} /></button></div>}
          </article>)}
          {loading && <p className="assistant-working" role="status">Checking the selected data...</p>}<div ref={end} />
        </div>
        <div className="assistant-suggestions">{['Show low-stock medicines', 'Check who reported', 'Compare with last week', 'Which commodities keep appearing?', 'Check unchanged figures', 'Explain this chart'].map(question => <button type="button" key={question} disabled={loading} onClick={() => ask(question)}>{question}</button>)}</div>
        <form className="assistant-compose" onSubmit={e => { e.preventDefault(); ask(); }}><label><span className="sr-only">Ask Tracer Assistant</span><textarea ref={input} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about stock, reporting or a dashboard view" maxLength={1200} rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} /></label><div><button type="button" disabled={!microphone.current.supported || loading} aria-label={inputState === 'listening' ? 'Stop voice input' : 'Start on-device voice input'} title={microphone.current.supported ? 'On-device voice input' : 'On-device voice input is unavailable in this browser'} aria-pressed={inputState === 'listening'} onClick={() => inputState === 'listening' ? microphone.current.stop() : microphone.current.start()}><Mic size={18} /></button><button type="submit" disabled={loading || !draft.trim()} aria-label="Send assistant question" title="Send"><Send size={18} /></button></div></form>
        <small className="assistant-privacy" role="status">{inputState === 'listening' ? 'Listening on this device. Review the text before sending.' : ['denied', 'unavailable'].includes(inputState) ? 'On-device recognition is unavailable or microphone access was denied. Text input remains available.' : 'Microphone is off. Voice input is on-device only where supported. AI explanations use the existing secure Copilot service.'}</small>
      </aside>
    </div>}
  </>;
}
