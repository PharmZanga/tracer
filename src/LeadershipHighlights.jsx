import {useEffect, useMemo, useState} from 'react';
import {Activity, Pause, Play} from 'lucide-react';
import {buildLeadershipHighlights, summariseLeadershipCommodities} from './leadershipHighlights.js';
import './leadershipHighlights.css';

export default function LeadershipHighlights({rollup, rows, scopeLabel, periodLabel, scopeKey}) {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const detail = useMemo(() => summariseLeadershipCommodities(rows), [rows]);
  const items = buildLeadershipHighlights(rollup, detail);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const duration = Math.max(45, items.length * 8);
  return <section className="leadership-highlights" aria-label="Leadership highlights" data-paused={paused || hidden}>
    <div className="leadership-highlights-head">
      <h2><Activity size={17} aria-hidden="true" />Leadership highlights</h2>
      <p className="leadership-highlights-scope" role="status" aria-live="polite" aria-atomic="true">
        {scopeLabel} <span aria-hidden="true">/</span> {periodLabel}
      </p>
      {items.length > 0 && <button type="button" className="leadership-highlights-toggle" onClick={() => setPaused(value => !value)}
        aria-label={paused ? 'Resume moving highlights' : 'Pause moving highlights'} aria-pressed={paused}
        title={paused ? 'Resume moving highlights' : 'Pause moving highlights'}>
        {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
      </button>}
    </div>
    {items.length ? <div className="leadership-highlights-viewport" tabIndex={0} aria-label="Drug availability and stock highlights">
      {/* Remount on filter changes so the next scope starts with its availability. */}
      <div key={scopeKey} className="leadership-highlights-track" style={{'--highlights-duration': `${duration}s`}}>
        {[false, true].map(copy => <ul key={String(copy)} className={`leadership-highlights-group${copy ? ' highlights-copy' : ''}`}
          aria-label={copy ? undefined : 'Selected reporting highlights'} aria-hidden={copy || undefined}>
          {items.map(item => <li key={item.id} className={`highlight-tone-${item.tone}`} data-highlight={item.id}
            title={item.title || `${item.label}: ${item.value}; ${item.detail}`}>
            <span className="highlight-label">{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small>
          </li>)}
        </ul>)}
      </div>
    </div> : <p className="leadership-highlights-empty" role="status">No submitted tracer stock data match the current filters.</p>}
  </section>;
}
