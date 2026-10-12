import { useEffect, useRef, useState } from 'preact/hooks';

const time = value => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}.${Math.floor((value * 10) % 10)}`;
const labels = { formationFamily: 'Formation', qbAlignment: 'QB', backfield: 'Backfield', playType: 'Type', hash: 'Dir', result: 'Result', yardage: 'Yds' };

export function DetectionReview({ plays, analyses, currentTags, video, close, apply }) {
  const [, refresh] = useState(0);
  const stop = useRef(null);
  const update = () => refresh(value => value + 1);
  const stopPreview = () => {
    if (stop.current) { video?.removeEventListener('timeupdate', stop.current); video?.pause(); stop.current = null; }
  };
  useEffect(() => () => stopPreview(), []);
  const preview = play => {
    if (!video) return;
    stopPreview();
    video.currentTime = play.start;
    video.play().catch(() => {});
    stop.current = () => { if (video.currentTime >= play.end) stopPreview(); };
    video.addEventListener('timeupdate', stop.current);
  };
  const bump = (play, action) => {
    if (action === 's-') play.start = Math.max(0, play.start - 0.5);
    if (action === 's+') play.start = Math.min(play.end - 0.2, play.start + 0.5);
    if (action === 'e-') play.end = Math.max(play.start + 0.2, play.end - 0.5);
    if (action === 'e+') play.end += 0.5;
    update();
  };
  return <div id="detectReviewModal">
    <div class="detect-review-toolbar">
      <button class="btn btn-sm" id="detectReviewAcceptAll" onClick={() => { plays.forEach(play => { play.accepted = true; }); update(); }}>Accept All</button>
      <button class="btn btn-sm" id="detectReviewRejectLow" onClick={() => { plays.forEach(play => { if ((play.confidence || 0) < 0.4) play.accepted = false; }); update(); }}>Reject Low Confidence</button>
      <span class="detect-review-count" id="detectReviewCount">{plays.filter(play => play.accepted).length} / {plays.length} accepted</span>
    </div>
    <div class="detect-review-list" id="detectReviewList">{plays.map(play => {
      const confidence = Math.round((play.confidence || 0) * 100);
      const analysis = analyses[play.idx];
      const tags = Object.entries(currentTags(analysis)).filter(([, value]) => value);
      return <div class={play.accepted ? 'detect-review-row' : 'detect-review-row rejected'} data-idx={play.idx} key={play.idx}>
        <div class="drr-main"><div class="drr-head"><span class="drr-num">#{play.idx + 1}</span><span class="drr-time">{time(play.start)} {'\u2192'} {time(play.end)}</span><span class="drr-dur">{(play.end - play.start).toFixed(1)}s</span><span class={`drr-conf ${confidence >= 70 ? 'hi' : confidence >= 40 ? 'med' : 'lo'}`} title="Detection confidence">{confidence}%</span></div>
          {!!tags.length && <div class="drr-tags">{tags.map(([key, value]) => {
            const c = analysis.confidence?.[key] || 0, label = labels[key] || key;
            const title = analysis.reasons?.[key] ? `${label}: ${value} \u2014 ${analysis.reasons[key]} (${Math.round(c * 100)}%)` : `${label}: ${value}`;
            return <span class={`drr-tag ${c >= 0.6 ? 'hi' : c >= 0.4 ? 'med' : 'lo'}`} title={title}>{label} {'\u00b7'} {value}</span>;
          })}</div>}
          <div class="drr-controls"><button class="btn-xs" data-act="play" onClick={() => preview(play)}>{'\u25b6'} Preview</button><span class="drr-bump">Start: <button class="btn-xs" data-act="s-" onClick={() => bump(play, 's-')}>{'\u2212'}0.5s</button><button class="btn-xs" data-act="s+" onClick={() => bump(play, 's+')}>+0.5s</button></span><span class="drr-bump">End: <button class="btn-xs" data-act="e-" onClick={() => bump(play, 'e-')}>{'\u2212'}0.5s</button><button class="btn-xs" data-act="e+" onClick={() => bump(play, 'e+')}>+0.5s</button></span></div>
        </div><div class="drr-side"><label class="drr-check"><input type="checkbox" checked={play.accepted} onChange={event => { play.accepted = event.currentTarget.checked; update(); }}/><span>Accept</span></label></div>
      </div>;
    })}</div>
    <div class="gi-overlay-actions"><button class="btn btn-sm" id="detectReviewCancel" onClick={close}>Cancel</button><button class="btn btn-sm btn-accent" id="detectReviewApply" onClick={() => apply(plays)}>Apply Selected</button></div>
  </div>;
}
