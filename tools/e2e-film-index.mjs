import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* FILM-INDEX PRESERVATION HARNESS (the shrinking-film root cause) -----------
   The game-level film index (clipNames/clipPaths/clipRefs/isMultiClip) was
   rebuilt in _serialize() from the LIVE playlist only. So opening a multi-clip
   game whose film isn't loaded (clips not in the library -> empty/partial
   playlist) and letting it autosave STRIPPED the index down to what was loaded
   — 79 clips -> 11, 72 -> 6, 83 -> 0 (and isMultiClip flipped to false). The
   plays keep their clipName, so the fix derives the index from the plays UNION
   the playlist, never shrinking below what the plays reference.

   Drives the REAL StorageManager._serialize().

   Run after build:  node tools/e2e-film-index.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const rep = await page.evaluate(() => {
  const out = {};
  const sm = window.app.storage, tagger = window.app.tagger, pl = window.app.playlist;
  // A multi-clip game's plays: distinct clipName + clipPath, film NOT loaded.
  tagger.plays = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, timestamp: { start: 0, end: 10 + i },
    tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', custom: [] },
    annotations: [], notes: '', clipName: `IMG_${100 + i}`, clipPath: `Sorrows/IMG_${100 + i}`, clipId: 500 + i
  }));
  pl.reset();   // film not in library -> empty playlist

  // Case A: NO film loaded — index must reflect all 8 plays, not be wiped.
  const a = sm._serialize();
  out.a_clipRefs = (a.clipRefs || []).length;
  out.a_clipNames = (a.clipNames || []).length;
  out.a_isMulti = a.isMultiClip;
  out.a_pathsMatch = JSON.stringify(a.clipPaths) === JSON.stringify(tagger.plays.map(p => p.clipPath));

  // Case B: PARTIAL film loaded (3 of 8 clips) — index must still cover all 8.
  pl.clips = [0, 1, 2].map(i => ({ id: i + 1, name: `IMG_${100 + i}`, clipPath: `Sorrows/IMG_${100 + i}`, file: null, assetUrl: 'x', duration: 10 + i, playId: i + 1 }));
  const b = sm._serialize();
  out.b_clipRefs = (b.clipRefs || []).length;
  out.b_isMulti = b.isMultiClip;

  // Case C: a genuine single continuous video (plays share no distinct clipName)
  tagger.plays = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, timestamp: { start: i * 10, end: i * 10 + 8 }, tags: { unit: 'offense', custom: [] }, annotations: [], notes: '', clipName: '', clipPath: '', clipId: null }));
  pl.reset();
  const c = sm._serialize();
  out.c_clipRefs = (c.clipRefs || []).length;
  out.c_isMulti = c.isMultiClip;
  return out;
});

console.log('\nFilm-index preservation ---------------------------------------');
ok(rep.a_clipRefs === 8, 'A: film index keeps all 8 clips when film NOT loaded (was 0)', `got ${rep.a_clipRefs}`);
ok(rep.a_clipNames === 8, 'A: clipNames length 8', `got ${rep.a_clipNames}`);
ok(rep.a_isMulti === true, 'A: isMultiClip stays true (not flipped to single-video)', `got ${rep.a_isMulti}`);
ok(rep.a_pathsMatch, 'A: clipPaths match the plays');
ok(rep.b_clipRefs === 8, 'B: partial playlist (3 loaded) still indexes all 8 clips', `got ${rep.b_clipRefs}`);
ok(rep.b_isMulti === true, 'B: isMultiClip true');
ok(rep.c_clipRefs === 0, 'C: true single-video game stays 0 clips', `got ${rep.c_clipRefs}`);
ok(rep.c_isMulti === false, 'C: single-video stays isMultiClip=false', `got ${rep.c_isMulti}`);
ok(pageErrors.length === 0, 'no console/page errors', pageErrors.join(' | '));

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
