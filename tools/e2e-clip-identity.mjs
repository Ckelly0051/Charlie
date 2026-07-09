/* CLIP-IDENTITY HARNESS (P1a — basename collision) ------------------------
   Two clips named "0001.mp4" that live in different subfolders (endzone/ vs
   sideline/) must stay DISTINCT through import → save → reopen. The old code
   keyed clip identity on the bare basename, so:
     - both plays got clipName "0001" (indistinguishable),
     - on reopen only ONE relinked (the other play orphaned),
     - on desktop the second file overwrote the first on disk (data loss).

   This drives the REAL PlaylistManager in the shipped bundle:
     1. import two same-basename / different-subfolder clips,
     2. assert two clips + two plays with DISTINCT identity,
     3. simulate a reopen (stale clipIds, fresh playlist) + re-add the same
        files, assert BOTH plays relink (none orphaned).

   Run after build:  node tools/e2e-clip-identity.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
const appErrors = () => pageErrors.filter(e => !/Video error|DEMUXER|FFmpegDemuxer|could not be decoded/i.test(e));

await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const rep = await page.evaluate(async () => {
  const out = { steps: {}, err: null };
  try {
    const pl = window.app.playlist, tagger = window.app.tagger;

    // Build two File objects with the SAME basename in DIFFERENT subfolders.
    const mkFile = (relPath) => {
      const base = relPath.split('/').pop();
      const f = new File([new Uint8Array(16)], base, { type: 'video/mp4' });
      Object.defineProperty(f, 'webkitRelativePath', { value: relPath });
      return f;
    };
    const f1 = mkFile('Game5/endzone/0001.mp4');
    const f2 = mkFile('Game5/sideline/0001.mp4');

    // _autoCreatePlays runs async (not awaited by addFiles) — wait for it.
    const settle = async () => { for (let i = 0; i < 40 && tagger.plays.length < pl.clips.length; i++) await new Promise(r => setTimeout(r, 25)); };

    await pl.addFiles([f1, f2]);
    await settle();
    out.steps.clipCount = pl.clips.length;
    const plays = tagger.plays.slice();
    out.steps.playCount = plays.length;

    // Identity of each clip/play (clipPath when present, else basename).
    const idOf = o => (o.path || o.clipPath || o.name || o.clipName || '');
    const clipIds = pl.clips.map(idOf);
    out.steps.distinctClipIds = new Set(clipIds).size;
    const playIds = plays.map(idOf);
    out.steps.distinctPlayIds = new Set(playIds).size;
    out.steps.clipIds = clipIds;

    // --- simulate a reopen: mark clipIds stale + wipe the live playlist ---
    for (const p of plays) p.clipId = 9990 + (p.clipId || 0);   // stale (not in new clips)
    const liveIdsBefore = new Set(); // fresh session: no live clip ids
    pl.reset();

    // Re-add the same two files (as on reopen / folder re-pick).
    await pl.addFiles([mkFile('Game5/endzone/0001.mp4'), mkFile('Game5/sideline/0001.mp4')]);

    // Every original play must now point at a REAL current clip (none orphaned).
    const liveClipIds = new Set(pl.clips.map(c => c.id));
    const relinked = plays.filter(p => liveClipIds.has(p.clipId));
    out.steps.relinkedCount = relinked.length;
    out.steps.clipCountAfter = pl.clips.length;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});

console.log('\nClip-identity (P1a) --------------------------------------------');
if (rep.err) console.log('  IN-PAGE ERROR:', rep.err);
const s = rep.steps;
ok(s.clipCount === 2, 'two clips imported (same basename, diff subfolder)', `got ${s.clipCount}`);
ok(s.playCount === 2, 'two plays created', `got ${s.playCount}`);
ok(s.distinctClipIds === 2, 'clips have DISTINCT identity (not collapsed to basename)', `ids=${JSON.stringify(s.clipIds)}`);
ok(s.distinctPlayIds === 2, 'plays have DISTINCT identity', `distinct=${s.distinctPlayIds}`);
ok(s.clipCountAfter === 2, 'reopen re-imports two clips', `got ${s.clipCountAfter}`);
ok(s.relinkedCount === 2, 'BOTH plays relink on reopen (none orphaned)', `relinked=${s.relinkedCount}`);
ok(appErrors().length === 0, 'no console/page errors', appErrors().join(' | '));

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
