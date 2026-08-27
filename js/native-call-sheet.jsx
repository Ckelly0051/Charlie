import { useMemo, useState } from 'preact/hooks';
import '../css/native-call-sheet.css';

const SelectField = ({ label, value, onChange, children }) => <label class="gi-call-sheet-field"><span>{label}</span><select value={value} onChange={event => onChange(event.currentTarget.value)}>{children}</select></label>;

export function NativeCallSheet({ builder }) {
  const [config, setConfig] = useState(() => builder.defaultConfig());
  const bucketOptions = useMemo(() => builder.bucketOptions(), [builder]);
  const result = useMemo(() => builder.createDocument(config), [builder, config]);
  const update = (key, value) => setConfig(current => ({ ...current, [key]: value }));
  const updateBucket = (id, patch) => setConfig(current => ({ ...current, buckets: { ...current.buckets, [id]: { ...current.buckets[id], ...patch } } }));
  const selectedBuckets = bucketOptions.filter(bucket => config.buckets[bucket.id]?.enabled).length;
  const placements = result.ok ? result.buckets.reduce((sum, bucket) => sum + bucket.plays.length, 0) : 0;
  return <div class="gi-call-sheet">
    <section class="gi-call-sheet-controls" aria-label="Call sheet settings">
      <div class="gi-call-sheet-intro"><strong>BUILD THE PLAN</strong><p>Choose the situations you want on the sideline. The preview updates as you work.</p></div>
      <label class="gi-call-sheet-field is-title"><span>Title</span><input type="text" value={config.title} placeholder="Friday vs Opponent" onInput={event => update('title', event.currentTarget.value)} /></label>
      <div class="gi-call-sheet-options">
        <SelectField label="Layout" value={config.layout} onChange={value => update('layout', value)}><option value="wristband">Wristband · 3-up</option><option value="callsheet">Full call sheet</option><option value="script">Practice script</option></SelectField>
        <SelectField label="Rank by" value={config.rank} onChange={value => update('rank', value)}><option value="epa">EPA · best first</option><option value="yards">Yards</option><option value="recent">Most recent</option></SelectField>
        <SelectField label="Numbering" value={config.numberStyle} onChange={value => update('numberStyle', value)}><option value="seq">Sequential</option><option value="bucket">Per bucket</option><option value="none">No numbers</option></SelectField>
      </div>
      <div class="gi-call-sheet-bucket-head"><div><strong>Situations</strong><span>{selectedBuckets} selected</span></div><span>Available</span><span>Use</span></div>
      <div class="gi-call-sheet-buckets">{bucketOptions.map(bucket => {
        const setting = config.buckets[bucket.id];
        return <div class={'gi-call-sheet-bucket' + (setting.enabled ? ' is-on' : '')} key={bucket.id}>
          <label><input type="checkbox" checked={setting.enabled} onChange={event => updateBucket(bucket.id, { enabled: event.currentTarget.checked })} /><span>{bucket.label}</span></label>
          <output>{bucket.available}</output>
          <input aria-label={bucket.label + ' plays to include'} type="number" min="0" max="20" value={setting.count} disabled={!setting.enabled} onInput={event => updateBucket(bucket.id, { count: Math.max(0, Math.min(20, Number(event.currentTarget.value) || 0)) })} />
        </div>;
      })}</div>
    </section>
    <section class="gi-call-sheet-output" aria-label="Call sheet preview">
      <header><div><span>Live preview</span><strong>{result.ok ? placements + ' call placements' : 'No matching calls'}</strong></div><button type="button" class="gi-call-sheet-print" disabled={!result.ok} onClick={() => builder.printDocument(result.html)}>Print</button></header>
      {result.ok ? <iframe title="Call sheet print preview" class={'gi-call-sheet-preview is-' + config.layout} srcDoc={result.html} /> : <div class="gi-call-sheet-empty"><strong>Nothing matches yet</strong><span>Enable another situation or chart more offensive plays.</span></div>}
    </section>
  </div>;
}
