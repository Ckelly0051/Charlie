import { useState } from 'preact/hooks';
import '../css/native-custom-fields.css';

/* The custom tag field editor, shown in an overlay sheet (GRIDIRON-IQ-OVERLAY-SPEC).
   Edits a draft; nothing is written until Save. */
export function NativeCustomFields({ manager, onClose }) {
  const [draft, setDraft] = useState(() => manager.defs.map(d => ({ id: d.id, name: d.name, options: (d.options || []).join(', ') })));
  const update = (index, key, value) => setDraft(rows => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const remove = index => setDraft(rows => rows.filter((_, i) => i !== index));
  const add = () => setDraft(rows => [...rows, { id: manager.newId(), name: '', options: '' }]);
  const [error, setError] = useState('');
  // A failed write keeps the sheet and the draft; nothing is claimed.
  const save = () => { if (manager.saveDefs(draft)) onClose('saved'); else setError('Custom fields could not be saved. Storage is full or unavailable; the draft is kept.'); };
  return <div class="gi-custom-fields" data-custom-fields>
    <p class="gi-custom-fields-intro">A field with options charts as chips; a field without options charts as text.</p>
    {draft.length
      ? <div class="gi-custom-fields-list">
          {draft.map((row, index) => <div class="gi-custom-fields-row" key={row.id} data-custom-field-row>
            <label><span>Field name</span><input value={row.name} onInput={e => update(index, 'name', e.currentTarget.value)} data-custom-field-name/></label>
            <label><span>Options, comma-separated</span><input value={row.options} placeholder="None: text field" onInput={e => update(index, 'options', e.currentTarget.value)} data-custom-field-options/></label>
            <button type="button" class="gi-custom-fields-remove" aria-label={`Remove ${row.name || 'field'}`} onClick={() => remove(index)} data-custom-field-remove>Remove</button>
          </div>)}
        </div>
      : <p class="gi-custom-fields-empty">No custom fields.</p>}
    {error && <p class="gi-custom-fields-error" role="alert" data-custom-fields-error>{error}</p>}
    <div class="gi-custom-fields-actions">
      <button type="button" onClick={add} data-custom-field-add>Add field</button>
      <span />
      <button type="button" onClick={() => onClose('cancel')} data-custom-fields-cancel>Cancel</button>
      <button type="button" class="is-primary" onClick={save} data-custom-fields-save>Save</button>
    </div>
  </div>;
}
