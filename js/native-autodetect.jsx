import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import '../css/native-autodetect.css';

export function AutoDetectContent({ screen }) {
  const [state, setState] = useState(() => screen.snapshot());
  const [showSettings, setShowSettings] = useState(false);
  useLayoutEffect(() => screen.subscribe(setState), [screen]);
  const canvasRef = useRef(null);

  useLayoutEffect(() => {
    if (state.status === 'done' && (state.canApply || state.canReview)) {
      screen.drawMotionGraph(canvasRef.current);
    }
  }, [state.status, state.resultText]);

  const s = state.settings;
  const set = (key) => (e) => screen.setSetting(key, e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value);

  return (
    <div class="gi-detect" data-native-autodetect>
      <p class="gi-settings-truth">
        Scans the loaded film for play boundaries using motion + scene-cut detection,
        then tags each play from Claude Vision or the local CV server when available
        (heuristic fallback otherwise). Nothing is added to the game until you review
        or apply the results.
      </p>

      <section class="gi-settings-section">
        <header>
          <div><span class="gi-settings-kicker">SCAN</span><h3>Detection</h3></div>
          <button type="button" onClick={() => setShowSettings((v) => !v)}>{showSettings ? 'Hide settings' : 'Settings'}</button>
        </header>
        <div class="gi-settings-section-body">
          {showSettings && (
            <div class="gi-detect-settings">
              <label class="gi-detect-row">
                <span>Strictness</span>
                <input type="range" min="0.5" max="1.6" step="0.05" value={s.strictness} onInput={set('strictness')}/>
                <b>{state.strictnessLabel}</b>
              </label>
              <label class="gi-detect-toggle">
                <input type="checkbox" checked={s.useAudio} onChange={set('useAudio')}/> Use audio (whistles)
              </label>
              <div class="gi-detect-grid">
                <label><span>Min Play (sec)</span><input type="number" min="1" max="15" step="0.5" value={s.minPlayDuration} onInput={set('minPlayDuration')}/></label>
                <label><span>Max Play (sec)</span><input type="number" min="5" max="60" step="1" value={s.maxPlayDuration} onInput={set('maxPlayDuration')}/></label>
                <label><span>Cooldown (sec)</span><input type="number" min="1" max="15" step="0.5" value={s.cooldownAfterEnd} onInput={set('cooldownAfterEnd')}/></label>
              </div>
              <p class="gi-detect-hint">Tip: "Balanced" works for most broadcast angles. Raise strictness if you're getting false positives from crowd shots or replays.</p>
            </div>
          )}

          <div class="gi-detect-actions">
            <button type="button" class="gi-settings-primary" disabled={state.status === 'scanning'} onClick={() => screen.start()}>
              {state.status === 'scanning' ? 'Scanning…' : 'Scan for Plays'}
            </button>
            {state.canCancel && <button type="button" class="gi-settings-danger" onClick={() => screen.cancel()}>Cancel</button>}
          </div>

          {state.status === 'scanning' && (
            <div class="gi-detect-progress" role="status" aria-live="polite">
              <div class="gi-detect-progress-bar"><div class="gi-detect-progress-fill" style={{ width: `${state.progress}%` }}/></div>
              <span class="gi-detect-progress-label">{state.statusText || `${state.progress}%`}</span>
            </div>
          )}

          {state.status === 'done' && state.resultText && (
            <div class="gi-detect-results">
              <div class="gi-detect-results-head">
                <span>{state.resultText}</span>
                <div class="gi-detect-results-actions">
                  {state.canReview && <button type="button" onClick={() => screen.openReview()}>Review…</button>}
                  {state.canApply && <button type="button" class="gi-settings-primary" onClick={() => screen.applyAll()}>Apply All</button>}
                </div>
              </div>
              {(state.canApply || state.canReview) && (
                <div class="gi-detect-motion"><canvas ref={canvasRef} height="60"/></div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
