import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Folder re-add through PlaylistManager: basename fallback, renamed clips,
 * distinct paths and explicit matched/new/cancel choices cannot create ghosts.
 * Synthetic files only; decoder failures from their empty payload are expected. */
import puppeteer from './test-browser.mjs';

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
      tags: { unit: 'offense', formationFamily: `Saved ${i + 1}`, playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', custom: [] },
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

    out.sharedClip = await (async () => {
      const t = window.app.tagger;
      const pl = window.app.playlist;
      pl.reset();
      // Simulate a reopened save: plays exist with clipName + stale clipIds.
      t.plays.length = 0;
      t.plays.push(
        { id: 1, timestamp: { start: 0, end: 12 }, tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', unit: 'offense', custom: [] }, notes: '', clipName: 'clip_01', clipId: 7 },
        { id: 2, timestamp: { start: 0, end: 10 }, tags: { down: '2', distance: '5', playType: '', runPass: '', result: '', yardage: '', unit: '', custom: [] }, notes: '', clipName: 'clip_02', clipId: 8 },
        // Extra play marked inside clip_01 — shares its stale clipId, no clipName.
        { id: 3, timestamp: { start: 4, end: 9 }, tags: { down: '', distance: '', custom: [] }, notes: '', clipId: 7 }
      );
      t.nextId = 4;
      t.currentPlayId = 2;
      const before = t.plays.length;
      const files = [
        new File([new Uint8Array(64)], 'clip_01.mp4', { type: 'video/mp4' }),
        new File([new Uint8Array(64)], 'clip_02.mp4', { type: 'video/mp4' }),
      ];
      await pl.addFiles(files);
      const c1 = pl.clips.find(c => c.name === 'clip_01');
      const c2 = pl.clips.find(c => c.name === 'clip_02');
      return {
        playCount: t.plays.length, before,
        c1Play: c1 && c1.playId, c2Play: c2 && c2.playId,
        p3Follows: t.plays.find(p => p.id === 3).clipId === c1.id,
        tagsKept: t.plays[0].tags.playType === 'Run Inside',
      };
    })();


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
const relink = rep.sharedClip;
ok(relink.playCount === relink.before, 're-upload creates NO duplicate plays', JSON.stringify(relink));
ok(relink.c1Play === 1 && relink.c2Play === 2, 'clips re-linked to saved plays by name', JSON.stringify(relink));
ok(relink.p3Follows === true, 'extra play inside a clip follows the stale clipId');
ok(relink.tagsKept === true, 'tags survive the re-link');
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
