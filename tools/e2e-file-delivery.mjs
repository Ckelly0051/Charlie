import { ffaSaveBlob } from '../js/storage-backend.js';

let pass = 0, fail = 0;
const ok = (value, label, detail) => {
  if (value) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} -- ${JSON.stringify(detail)}`); }
};
const messages = [], other = [], writes = [];
const dialogs = [];
let chosenPath = 'C:/scratch/report.html';
let mode = 'save', anchors = 0;
globalThis.window = {
  app: { history: { _toast: message => other.push(message) } },
  __TAURI__: {
    dialog: { save: async options => {
      dialogs.push(options);
      if (mode === 'cancel') return null;
      // The pinned rfd Windows dialog sets its default extension from the
      // first filter only. Simulate that native boundary, not an app rewrite.
      const basename = chosenPath.split(/[\\/]/).at(-1);
      const extension = options.filters?.[0]?.extensions?.[0];
      return extension && !basename.includes('.') ? `${chosenPath}.${extension}` : chosenPath;
    } },
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
const failed = await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(messages.at(-1) === 'Save failed — try saving into Documents or Downloads.' && other.length === 0,
  'save failure notifies only its injected owner', { messages, other });
ok(failed === false && anchors === 0 && writes.length === 1,
  'a failed native write returns false and never falls back to an ignored anchor download', { failed, anchors, writes });
const originalDialog = window.__TAURI__.dialog;
window.__TAURI__.dialog = { save: async () => { throw new Error('synthetic dialog failure'); } };
const dialogFailed = await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(dialogFailed === false && anchors === 0 && writes.length === 1,
  'a native dialog failure returns false with no anchor or write', { dialogFailed, anchors, writes });
window.__TAURI__.dialog = null;
const unavailable = await ffaSaveBlob(new Blob(['report']), 'report.html', { notify });
ok(unavailable === false && anchors === 0 && writes.length === 1,
  'an incomplete desktop save bridge refuses delivery instead of claiming an anchor save', { unavailable, anchors, writes });
window.__TAURI__.dialog = originalDialog;
mode = 'save';
for (const filename of ['game_report.html', 'defensive_report.html', 'season_report.html', 'dashboard.html']) {
  chosenPath = `C:/scratch/Coach renamed ${filename.replace('.html', '')}`;
  const before = writes.length;
  const html = '<!doctype html><title>Coach report</title>';
  await ffaSaveBlob(new Blob([html], { type: 'text/html' }), filename, { notify });
  ok(dialogs.at(-1).filters?.[0]?.extensions?.includes('html') && writes.length === before + 1
    && writes.at(-1).path === `${chosenPath}.html` && Buffer.from(writes.at(-1).bytes).toString() === html,
    `renaming ${filename} without an extension saves an HTML file with unchanged bytes`, { dialog: dialogs.at(-1), write: writes.at(-1) });
}
chosenPath = 'C:/scratch/Report.custom.HTML';
await ffaSaveBlob(new Blob(['html'], { type: 'text/html' }), 'report.html', { notify });
ok(writes.at(-1).path === chosenPath, 'an explicit renamed HTML path is preserved exactly', writes.at(-1));
const beforeCancel = writes.length;
mode = 'cancel';
await ffaSaveBlob(new Blob(['html'], { type: 'text/html' }), 'report.html', { notify });
ok(writes.length === beforeCancel, 'cancelling a renamed HTML save writes nothing', writes);
mode = 'save';chosenPath = 'C:/scratch/plays.csv';
await ffaSaveBlob(new Blob(['csv'], { type: 'text/csv' }), 'plays.csv', { notify });
ok(!dialogs.at(-1).filters && writes.at(-1).path === chosenPath, 'non-HTML export delivery stays unchanged', dialogs.at(-1));
delete window.__TAURI__;
const beforeBrowser = anchors;
const browserSaved = await ffaSaveBlob(new Blob(['browser']), 'browser.txt', { notify });
ok(browserSaved === true && anchors === beforeBrowser + 1, 'browser exports still use the anchor download', { browserSaved, anchors });
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
