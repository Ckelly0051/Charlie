/* CUT-UP PROMPTS USE THE IN-APP DIALOG (Node) ----------------------------------
   Code review 2026-10-06: cut-up export asked to start, and to keep a partial
   video, with the browser's native confirm(), which the app's own notes say
   can be suppressed and silently return false; its messages used alert().
   They now go through PlayTagger's in-app confirm and toast.

   Run:  node tools/e2e-cutup-prompts.mjs */
import { CutupExporter } from '../js/cutup-exporter.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const native = [];
globalThis.window = globalThis.window || {};
globalThis.confirm = msg => { native.push(`confirm: ${msg}`); return true; };
globalThis.alert = msg => { native.push(`alert: ${msg}`); };

const rig = (plays, answer) => {
  const asked = [], toasts = [];
  const tagger = {
    plays,
    async _confirmDialog(message, label) { asked.push({ message, label }); return answer; },
    toast(message) { toasts.push(message); },
  };
  const exporter = new CutupExporter({}, tagger, null, null);
  let recorded = 0;
  exporter._record = async () => { recorded++; };
  return { exporter, asked, toasts, recorded: () => recorded };
};
const play = id => ({ id, timestamp: { start: 0, end: 5 }, tags: {} });

{
  native.length = 0;
  const { exporter, asked, recorded } = rig([play(1), play(2)], false);
  await exporter.export();
  ok(asked.length === 1 && /Export 2 plays/.test(asked[0].message) && !native.length,
    'starting a cut-up asks through the in-app dialog, not the browser', JSON.stringify({ asked, native }));
  ok(recorded() === 0, 'declining does not record');
}
{
  native.length = 0;
  const { exporter, recorded } = rig([play(1)], true);
  await exporter.export();
  ok(recorded() === 1 && !native.length, 'accepting records the cut-up', JSON.stringify(native));
}
{
  native.length = 0;
  const { exporter, toasts, asked } = rig([], true);
  await exporter.export();
  ok(!asked.length && toasts.some(m => /No plays available/.test(m)) && !native.length,
    'with no exportable plays the coach gets an in-app message', JSON.stringify({ toasts, native }));
}
{
  native.length = 0;
  const { exporter, toasts } = rig([play(1)], true);
  exporter._record = async () => { throw new Error('recorder broke'); };
  await exporter.export();
  ok(toasts.some(m => /Cut-up failed: recorder broke/.test(m)) && !native.length,
    'a failed recording is reported in the app', JSON.stringify({ toasts, native }));
}
{
  native.length = 0;
  const { exporter, asked } = rig([play(1)], false);
  ok(typeof exporter._keepPartial === 'function', 'the partial-video question has its own in-app step');
  const keep = await exporter._keepPartial?.();
  ok(keep === false && asked.some(a => /Save partial video/.test(a.message)) && !native.length,
    'a cancelled recording asks in the app whether to keep the partial video', JSON.stringify({ asked, native }));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
