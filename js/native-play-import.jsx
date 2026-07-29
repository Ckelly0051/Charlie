import { useRef, useState } from 'preact/hooks';
import '../css/native-play-import.css';

const FIELD_OPTIONS = [
  ['unit', 'Unit'], ['quarter', 'Quarter'], ['driveNumber', 'Drive'], ['down', 'Down'], ['distance', 'Distance'],
  ['fieldSide', 'Field Side'], ['yardLine', 'Yard Line'], ['formation', 'Formation'], ['qbAlignment', 'QB Alignment'],
  ['backfield', 'Backfield'], ['strength', 'Strength'], ['personnel', 'Personnel'], ['motion', 'Motion'],
  ['runPass', 'Run / Pass'], ['playType', 'Play Type'], ['playDir', 'Play Direction'], ['defFront', 'Defensive Front'],
  ['coverage', 'Coverage Call'], ['coverageFamily', 'Coverage Family'], ['blitz', 'Blitz'], ['result', 'Result'],
  ['yardage', 'Yardage'], ['hash', 'Hash'], ['ballCarrier', 'Ball Carrier'], ['passer', 'Passer'],
  ['receiver', 'Receiver'], ['tackler', 'Tackler'], ['penaltiesJson', 'Structured Penalties'],
  ['resultingSituationJson', 'Resulting Situation'], ['notes', 'Notes'],
];

export function NativePlayImport({ screen }) {
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('No file selected');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');

  const chooseFile = async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
    setParsed(null);
    setError('');
  };
  const parse = () => {
    if (!text.trim()) { setError('Paste or select CSV data first.'); return; }
    const next = screen.parse(text);
    if (next.error) { setError(next.error); setParsed(null); return; }
    setError('');
    setParsed({ ...next, colMap: { ...next.colMap } });
  };
  const map = (index, value) => {
    const colMap = { ...parsed.colMap };
    if (value) colMap[index] = value;
    else delete colMap[index];
    setParsed({ ...parsed, colMap });
  };
  const apply = () => {
    const count = screen.apply(parsed);
    if (!count) setError('No plays were found. Check the column mapping and try again.');
  };
  const mapped = parsed ? Object.entries(parsed.colMap).sort(([a], [b]) => Number(a) - Number(b)) : [];
  const count = parsed ? parsed.lines.filter(cells => !cells.every(cell => !cell)).length : 0;

  return <div class="gi-play-import" data-native-play-import>
    <p class="gi-play-import-intro">Bring in a Hudl, QwikCut, or spreadsheet breakdown. Review the column mapping before anything is added to this game.</p>
    <div class="gi-play-import-source">
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={chooseFile} />
      <button type="button" onClick={() => fileRef.current?.click()}>Choose CSV file</button>
      <span>{filename}</span>
    </div>
    <label class="gi-play-import-field">
      <span>CSV data</span>
      <textarea id="playImportText" rows="7" value={text} onInput={event => { setText(event.currentTarget.value); setParsed(null); setError(''); }} placeholder="Or paste CSV data here…" />
    </label>
    <div class="gi-play-import-parse">
      <button type="button" class="is-primary" disabled={!text.trim()} onClick={parse}>Review columns</button>
      <span>Nothing is imported until you confirm.</span>
    </div>
    {error && <div class="gi-play-import-error" role="alert">{error}</div>}
    {parsed && <>
      <section class="gi-play-import-section">
        <header><div><span>STEP 1</span><h3>Match columns</h3></div><strong>{parsed.headers.length} source columns</strong></header>
        <div class="gi-play-import-mapping">
          {parsed.headers.map((header, index) => <label key={`${header}-${index}`}>
            <span title={header}>{header}</span>
            <select value={parsed.colMap[index] || ''} onChange={event => map(index, event.currentTarget.value)}>
              <option value="">Skip</option>
              {FIELD_OPTIONS.map(([field, label]) => <option value={field} key={field}>{label}</option>)}
            </select>
          </label>)}
        </div>
      </section>
      <section class="gi-play-import-section">
        <header><div><span>STEP 2</span><h3>Preview</h3></div><strong>{count} play{count === 1 ? '' : 's'}</strong></header>
        {!mapped.length ? <p class="gi-play-import-empty">Map at least one column to preview the import.</p> : <div class="gi-play-import-preview">
          <table><thead><tr>{mapped.map(([index, field]) => <th key={index}>{field}</th>)}</tr></thead>
            <tbody>{parsed.lines.slice(0, 5).map((cells, row) => <tr key={row}>{mapped.map(([index]) => <td key={index}>{cells[Number(index)] || ''}</td>)}</tr>)}</tbody></table>
        </div>}
      </section>
    </>}
    <footer class="gi-play-import-actions">
      <button type="button" onClick={() => screen.close('cancel')}>Cancel</button>
      <button type="button" class="is-primary" disabled={!parsed || !mapped.length} onClick={apply}>Import {count || ''} play{count === 1 ? '' : 's'}</button>
    </footer>
  </div>;
}