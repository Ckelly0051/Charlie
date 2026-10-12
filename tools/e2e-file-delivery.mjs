import { ffaSaveBlob } from '../js/storage-backend.js';

let pass = 0, fail = 0;
const ok = (value, label, detail) => {
  if (value) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} -- ${JSON.stringify(detail)}`); }
};
const messages = [], other = [], writes = [];
let mode = 'save', anchors = 0;
globalThis.window = {
  app: { history: { _toast: message => other.push(message) } },
  __TAURI__: {
    dialog: { save: async () => mode === 'cancel' ? null : 'C:/scratch/report.html' },
    fs: { writeFile: async (path, bytes) => {
      if (mode === 'fail') throw new Error('synthetic write failure');
      writes.push({ path, bytes: [...bytes] });
    }, remove: async () => {} },
  },
};
globalThis.document = {
  createElement: () => ({ click() { anchors++; } }),
  body: { appendChild() {}, removeChild() {} },
};
const notify = message => messages.push(message);
const saved = await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(saved === true && writes.length === 1 && Buffer.from(writes[0].bytes).toString() === 'report',
  'desktop save writes the blob bytes through its native file seam', writes);
ok(messages[0] === 'Saved: C:/scratch/report.html' && other.length === 0,
  'save success notifies only its injected owner', { messages, other });
mode = 'cancel';
const cancelled = await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(cancelled === false && writes.length === 1 && messages.length === 1 && anchors === 0,
  'cancel writes nothing and emits no success notice', { cancelled, writes, messages, anchors });
mode = 'fail';
await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(messages.at(-1) === 'Save failed — try saving into Documents or Downloads.' && other.length === 0,
  'save failure notifies only its injected owner', { messages, other });
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
