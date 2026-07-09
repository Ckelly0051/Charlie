/* LEGACY RE-ADD RELINK HARNESS (the St. Peter dup bug) ---------------------
   A game tagged BEFORE folder-path identity existed has plays whose only clip
   identity is a BASENAME (clipName="IMG_6251", clipPath undefined). When the
   coach re-adds the film FOLDER, each file now carries a full relative path
   ("St Peter/IMG_6251.mp4" -> identity "St Peter/IMG_6251"). The re-add path
   (addFiles -> _relinkSavedPlays) matched EXACT identity only, so
   "St Peter/IMG_6251" != "IMG_6251" -> no relink -> _autoCreatePlays made a
   DUPLICATE untagged play for every clip. That is exactly what corrupted the
   St. Peter game (139 plays for 69 clips).

   This drives the REAL PlaylistManager: seed legacy basename-only plays, wipe
   the live playlist (reopen), re-add the folder, and assert the plays RELINK
   1:1 with NO duplicates. A genuinely-new file must still auto-create one play.

   Run after build:  node tools/e2e-relink-legacy.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => { const t = String(e.message || e); if (!/DEMUXER|Video error|media|blob:null/i.test(t)) pageErrors.push(t); });
// Fake 16-byte blobs can't be demuxed — that video error is a test artifact,
// not a fault in the code under test. Everything else is a real error.
const isFakeVideoErr = t => /DEMUXER|Video error|media|blob:null/i.test(t);
page.on('console', m => { if (m.type() === 'error' && !isFakeVideoErr(m.text())) pageErrors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const rep = await page.evaluate(async () => {
  const out = { err: null };
  try {
    const pl = window.app.playlist, tagger = window.app.tagger;
    const mkFile = (rel) => { const f = new File([new Uint8Array(16)], rel.split('/').pop(), { type: 'video/mp4' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; };
    const settle = async () => { for (let i = 0; i < 60 && tagger.plays.length < pl.clips.length; i++) await new Promise(r => setTimeout(r, 25)); };

    // --- seed LEGACY saved plays: basename clipName only, NO clipPath, stale clipId, tagged ---
    pl.reset();
    tagger.plays = ['IMG_6251', 'IMG_6252', 'IMG_6253'].map((base, i) => ({
      id: i + 1, timestamp: { start: 0, end: 10 },
      tags: { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', custom: [] },
      annotations: [], notes: '', clipName: base, clipId: 900 + i   // stale id (not a live clip)
    }));
    tagger.nextId = 4;
    const before = tagger.plays.length;

    // --- coach re-adds the FOLDER (full relative paths) + one genuinely-new clip ---
    await pl.addFiles([mkFile('St Peter/IMG_6251.mp4'), mkFile('St Peter/IMG_6252.mp4'), mkFile('St Peter/IMG_6253.mp4'), mkFile('St Peter/IMG_9999.mp4')]);
    await settle();

    out.before = before;
    out.after = tagger.plays.length;
    out.clips = pl.clips.length;
    const liveClipIds = new Set(pl.clips.map(c => c.id));
    const legacy = tagger.plays.filter(p => [1, 2, 3].includes(p.id));
    out.legacyRelinked = legacy.filter(p => liveClipIds.has(p.clipId)).length;
    out.legacyStillTagged = legacy.filter(p => p.tags && p.tags.result === 'Gain').length;
    // the 3 legacy + exactly 1 new auto-created = 4 total, no dups
    out.taggedTotal = tagger.plays.filter(p => p.tags && p.tags.playType).length;
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});

console.log('\nLegacy folder re-add (St. Peter dup) ---------------------------');
if (rep.err) console.log('  IN-PAGE ERROR:', rep.err);
ok(rep.after === 4, 'no duplicate plays (3 legacy + 1 new = 4)', `before=${rep.before} after=${rep.after}`);
ok(rep.clips === 4, 'four clips in playlist', `got ${rep.clips}`);
ok(rep.legacyRelinked === 3, 'all 3 legacy plays relinked to live clips (basename fallback)', `got ${rep.legacyRelinked}`);
ok(rep.legacyStillTagged === 3, 'legacy tags preserved', `got ${rep.legacyStillTagged}`);
ok(pageErrors.length === 0, 'no console/page errors', pageErrors.join(' | '));

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
