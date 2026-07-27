import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
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

const URL = TEST_APP_URL;
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
    const mkFile = rel => { const f = new File([new Uint8Array(16)], rel.split('/').pop(), { type: 'video/mp4' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; };
    const play = (row, i) => ({
      id: i + 1, timestamp: { start: i, end: i + 10 },
      tags: { unit: 'offense', formation: `Saved ${i + 1}`, playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', custom: [] },
      annotations: [], notes: `tagged-${i + 1}`, clipName: row.name || '', ...(row.path ? { clipPath: row.path } : {}), clipId: row.clipId ?? (900 + i)
    });
    const run = async (saved, files, choice = 'matched') => {
      pl.reset(); tagger.plays = saved.map(play); tagger.nextId = tagger.plays.length + 1; tagger.currentPlayId = tagger.plays[0]?.id || null;
      const dialogs = [], persisted = [];
      tagger._choiceDialog = async (message, options) => { dialogs.push({ message, keys: options.map(option => option.key) }); return choice; };
      pl.onFilmFiles = selected => persisted.push(...selected.map(file => file.webkitRelativePath || file.name));
      const before = JSON.stringify(tagger.plays);
      await pl.addFiles(files.map(mkFile));
      const live = new Set(pl.clips.map(clip => clip.id));
      return {
        before, after: JSON.stringify(tagger.plays), playCount: tagger.plays.length, clipCount: pl.clips.length,
        linked: tagger.plays.filter(savedPlay => savedPlay.id <= saved.length && live.has(savedPlay.clipId)).length,
        tagged: tagger.plays.filter(savedPlay => savedPlay.tags?.result === 'Gain').length,
        paths: tagger.plays.map(savedPlay => savedPlay.clipPath || savedPlay.clipName),
        clipPaths: pl.clips.map(clip => clip.clipPath), dialogs, persisted
      };
    };

    out.intentionalNew = await run(
      ['IMG_6251','IMG_6252','IMG_6253'].map(name => ({ name })),
      ['St Peter/IMG_6251.mp4','St Peter/IMG_6252.mp4','St Peter/IMG_6253.mp4','St Peter/IMG_9999.mp4'],
      'new'
    );
    out.windowsRename = await run([{ name: 'Play 12' }], ['Readd/Play 12 (1).mp4']);
    out.orderFallback = await run([
      { name: 'Old A', path: 'old/alpha', clipId: 900 },
      { name: 'Old A second play', path: 'old/alpha', clipId: 900 },
      { name: 'Old B', path: 'old/bravo', clipId: 901 }
    ], ['new/X.mp4','new/Y.mp4']);
    out.safePartial = await run([{ name: 'IMG_1' }, { name: 'IMG_2' }], ['Folder/IMG_1.mp4','Folder/NEW.mp4'], 'matched');
    out.cancel = await run([{ name: 'IMG_1' }, { name: 'IMG_2' }], ['Folder/IMG_1.mp4','Folder/NEW.mp4'], 'cancel');
    out.distinctFolders = await run([
      { name: '0001', path: 'endzone/0001' }, { name: '0001', path: 'sideline/0001' }
    ], ['endzone/0001.mp4','sideline/0001.mp4']);
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});

console.log('\nSafe folder re-add / ghost-play prevention ---------------------');
if (rep.err) console.log('  IN-PAGE ERROR:', rep.err);
ok(rep.intentionalNew?.playCount === 4 && rep.intentionalNew?.linked === 3 && rep.intentionalNew?.dialogs.length === 1, 'a genuinely new clip creates a play only after explicit Add as new choice', JSON.stringify(rep.intentionalNew));
ok(rep.windowsRename?.playCount === 1 && rep.windowsRename?.linked === 1 && rep.windowsRename?.dialogs.length === 0, 'Windows (n)-renamed film relinks without a ghost or prompt', JSON.stringify(rep.windowsRename));
ok(rep.orderFallback?.playCount === 3 && rep.orderFallback?.linked === 3 && rep.orderFallback?.clipCount === 2 && rep.orderFallback?.dialogs.length === 0, 'equal-count wholesale rename relinks by order, including multiple plays per stale clip', JSON.stringify(rep.orderFallback));
ok(rep.safePartial?.playCount === 2 && rep.safePartial?.clipCount === 1 && rep.safePartial?.linked === 1 && rep.safePartial?.persisted.length === 1 && /IMG_1/.test(rep.safePartial.persisted[0]), 'Use matched only skips unmatched files before copy or play creation', JSON.stringify(rep.safePartial));
ok(rep.cancel?.playCount === 2 && rep.cancel?.clipCount === 0 && rep.cancel?.persisted.length === 0 && rep.cancel?.before === rep.cancel?.after, 'Cancel leaves clips, plays, tags, and persistence untouched', JSON.stringify(rep.cancel));
ok(rep.distinctFolders?.playCount === 2 && rep.distinctFolders?.linked === 2 && rep.distinctFolders?.paths[0] !== rep.distinctFolders?.paths[1], 'duplicate basenames in distinct folders remain distinct', JSON.stringify(rep.distinctFolders));
ok(pageErrors.length === 0, 'no console/page errors', pageErrors.join(' | '));

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
