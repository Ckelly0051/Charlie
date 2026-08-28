import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
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

const URL = TEST_APP_URL;
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
const appErrors = () => pageErrors.filter(e => !/Video error|DEMUXER|FFmpegDemuxer|could not be decoded|Not allowed to load local resource: blob:linked-/i.test(e));

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

    // Linked-folder setup pushes asset clips directly, then asks the shared
    // auto-create path to build plays. Its visible count must refresh too.
    pl.reset();
    tagger.plays = [];
    tagger.currentPlayId = null;
    pl.clips.push({ id: pl._nextClipId++, name: 'linked-a', clipPath: 'linked-a', assetUrl: 'blob:linked-a', playId: null });
    pl.clips.push({ id: pl._nextClipId++, name: 'linked-b', clipPath: 'linked-b', assetUrl: 'blob:linked-b', playId: null });
    await pl._autoCreatePlays();
    window.app.workspaceShell?.navigate?.('breakdown');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    out.steps.linkedCountText = document.querySelector('.gi-drive-strip > header')?.textContent || null;
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
ok(/2 plays/.test(s.linkedCountText || ''), 'linked auto-create refreshes the native Breakdown play count', `got ${s.linkedCountText}`);
ok(appErrors().length === 0, 'no console/page errors', appErrors().join(' | '));

const repair = await page.evaluate(async () => {
  const out = { err: null };
  try {
    const { storage, tagger, playlist } = window.app;
    const mkFile = (relPath) => {
      const base = relPath.split('/').pop();
      const f = new File([new Uint8Array(16)], base, { type: 'video/mp4' });
      Object.defineProperty(f, 'webkitRelativePath', { value: relPath });
      return f;
    };

    const legacyPlays = [
      {
        id: 101,
        timestamp: { start: 0, end: 5 },
        clipId: 9001,
        clipName: '0001',
        tags: { playType: 'Run Inside', result: 'Gain', yardage: '4', formation: 'Shotgun', custom: [] },
        notes: 'first tag survives'
      },
      {
        id: 102,
        timestamp: { start: 0, end: 6 },
        clipId: 9002,
        clipName: '0001',
        tags: { playType: 'Short Pass', result: 'Incomplete', yardage: '0', formation: 'Trips', custom: [] },
        notes: 'second tag survives'
      }
    ];

    storage.seasonStore.data = {
      id: 'season-repair',
      activeGameId: 'repair-game',
      games: [{
        id: 'repair-game',
        version: 4,
        isMultiClip: true,
        videoFileName: null,
        gameInfo: { opponent: 'Legacy' },
        plays: legacyPlays,
        annotations: [],
        currentPlayId: 101,
        nextId: 103,
        clipNames: ['0001', '0001']
      }]
    };
    storage._loadedGameId = 'repair-game';
    storage.gameInfo = { opponent: 'Legacy' };
    tagger.plays = legacyPlays;
    tagger.nextId = 103;
    tagger.currentPlayId = 101;
    tagger._updateFormEnabled();
    playlist.reset();

    const imported = [];
    const filmUrls = [];
    const snapshots = [];
    storage.seasonStore.backend = {
      supportsFilm: () => true,
      importFilm: async (_gameId, files) => {
        imported.push(...files.map(f => f.webkitRelativePath || f.name));
        return files.map(f => f.webkitRelativePath || f.name);
      },
      filmUrl: async (_gameId, ref) => {
        filmUrls.push(ref);
        return URL.createObjectURL(new Blob([new Uint8Array(16)], { type: 'video/mp4' }));
      }
    };
    storage.seasonStore.snapshot = async (label) => { snapshots.push(label); };
    storage.seasonStore.persist = () => { out.persisted = true; };
    tagger._choiceDialog = async () => 'repair';
    tagger.toast = (msg) => { out.toast = msg; };
    const warnings = [];
    const oldWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(arg => String((arg && arg.stack) || arg)).join(' '));
      oldWarn.apply(console, args);
    };

    const ok = await storage.repairFilm([
      mkFile('Game7/sideline/0001.mp4'),
      mkFile('Game7/endzone/0001.mp4')
    ]);
    console.warn = oldWarn;

    const saved = storage.seasonStore.data.games[0];
    out.ok = ok;
    out.warnings = warnings;
    out.imported = imported;
    out.filmUrls = filmUrls;
    out.snapshots = snapshots;
    out.playCount = tagger.plays.length;
    out.savedPlayCount = saved.plays.length;
    out.clipCount = playlist.clips.length;
    out.assetUrls = playlist.clips.map(c => c.assetUrl || '');
    out.paths = tagger.plays.map(p => p.clipPath);
    out.linked = tagger.plays.every(p => new Set(playlist.clips.map(c => c.id)).has(p.clipId));
    out.tags = tagger.plays.map(p => ({ tags: p.tags, notes: p.notes }));
    out.savedPaths = saved.clipPaths || [];
  } catch (e) {
    out.err = String(e && e.stack || e);
  }
  return out;
});

console.log('\nFilm repair / legacy migration -------------------------------');
if (repair.err) console.log('  IN-PAGE ERROR:', repair.err);
ok(repair.ok === true, 'repair workflow completes after confirmation', `toast=${repair.toast} warnings=${JSON.stringify(repair.warnings)}`);
ok(repair.playCount === 2 && repair.savedPlayCount === 2, 'repair keeps the same two tagged plays', `live=${repair.playCount} saved=${repair.savedPlayCount}`);
ok(repair.clipCount === 2, 'repair builds one live clip per tagged play', `clips=${repair.clipCount}`);
ok(repair.linked === true, 'repaired plays point at current live clips');
ok(repair.assetUrls?.every(Boolean), 'repair switches playlist to library asset URLs', `urls=${JSON.stringify(repair.assetUrls)}`);
ok(JSON.stringify(repair.paths) === JSON.stringify(['Game7/endzone/0001', 'Game7/sideline/0001']), 'legacy duplicate basenames migrate to folder paths by order', `paths=${JSON.stringify(repair.paths)}`);
ok(repair.tags?.[0]?.tags?.formation === 'Shotgun' && repair.tags?.[1]?.tags?.formation === 'Trips', 'repair preserves existing tags and notes');
ok(repair.imported?.length === 2, 'repair imports only the matched clips', `imported=${JSON.stringify(repair.imported)}`);
ok(JSON.stringify(repair.filmUrls) === JSON.stringify(repair.imported), 'repair resolves imported library paths before reporting success', `filmUrls=${JSON.stringify(repair.filmUrls)}`);
ok(repair.snapshots?.includes('Before film repair'), 'repair creates a restore point before saving');

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
