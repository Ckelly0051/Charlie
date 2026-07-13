/* REGRESSION (P1-5): PlaylistManager.rehydrateFromDisk must relink a game's
   saved plays to a linked folder's clips even when the folder ROOT differs from
   the saved clipPath root (managed import saved 'Game7/endzone/0001'; the linked
   folder lists 'endzone/0001'). Same-basename clips in different subfolders must
   still map 1:1 (by folder order), tags preserved, no duplicate clips, no orphans.

   Run after build:  node tools/e2e-relink-linked.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const res = await page.evaluate(async () => {
  const pl = window.app.tagger.playlist;

  // --- Scenario 1: root mismatch + same basename in two subfolders ---
  const plays1 = [
    { id: 1, timestamp: { start: 0, end: 5 }, clipName: '0001', clipPath: 'Game7/endzone/0001', clipId: 99, tags: { unit: 'offense', formation: 'ENDZONE', custom: [] } },
    { id: 2, timestamp: { start: 0, end: 5 }, clipName: '0001', clipPath: 'Game7/sideline/0001', clipId: 98, tags: { unit: 'offense', formation: 'SIDELINE', custom: [] } },
  ];
  pl.reset();
  await pl.rehydrateFromDisk([
    { name: '0001.mp4', path: 'endzone/0001.mp4', url: 'blob:u-endzone' },
    { name: '0001.mp4', path: 'sideline/0001.mp4', url: 'blob:u-sideline' },
  ], plays1);
  const ez = pl.clips.find(c => c.clipPath === 'endzone/0001');
  const sl = pl.clips.find(c => c.clipPath === 'sideline/0001');
  const s1 = {
    clipCount: pl.clips.length,
    ezPlay: ez && ez.playId, slPlay: sl && sl.playId,
    p1Clip: plays1[0].clipId, p2Clip: plays1[1].clipId,
    p1Form: plays1[0].tags.formation, p2Form: plays1[1].tags.formation,
    p1Path: plays1[0].clipPath, p2Path: plays1[1].clipPath,
  };

  // --- Scenario 2: exact-path match still distinct (Pass 1, roots identical) ---
  const plays2 = [
    { id: 1, timestamp: { start: 0, end: 5 }, clipName: 'a', clipPath: 'endzone/0001', clipId: null, tags: { unit: 'offense', custom: [] } },
    { id: 2, timestamp: { start: 0, end: 5 }, clipName: 'b', clipPath: 'sideline/0001', clipId: null, tags: { unit: 'offense', custom: [] } },
  ];
  pl.reset();
  await pl.rehydrateFromDisk([
    { name: '0001.mp4', path: 'sideline/0001.mp4', url: 'blob:s2' },
    { name: '0001.mp4', path: 'endzone/0001.mp4', url: 'blob:s2b' },
  ], plays2);
  const ez2 = pl.clips.find(c => c.clipPath === 'endzone/0001');
  const sl2 = pl.clips.find(c => c.clipPath === 'sideline/0001');
  const s2 = { ezPlay: ez2 && ez2.playId, slPlay: sl2 && sl2.playId, clipCount: pl.clips.length };

  // --- Scenario 3: Windows renamed copy uses the shared normalized fallback ---
  const plays3 = [
    { id: 1, timestamp: { start: 0, end: 5 }, clipName: 'Play 12', clipId: 77, tags: { unit: 'offense', formation: 'WING-T', custom: [] } },
  ];
  pl.reset();
  await pl.rehydrateFromDisk([
    { name: 'Play 12 (1).mp4', path: 'Week 4/Play 12 (1).mp4', url: 'blob:s3' },
  ], plays3);
  const s3 = { playId: pl.clips[0]?.playId, clipId: plays3[0].clipId, liveId: pl.clips[0]?.id, formation: plays3[0].tags.formation };

  // --- Scenario 4: multiple marked regions in one stale clip follow primary ---
  const plays4 = [
    { id: 1, timestamp: { start: 0, end: 5 }, clipName: 'Drive 1', clipPath: 'old/Drive 1', clipId: 88, tags: { unit: 'offense', custom: [] } },
    { id: 2, timestamp: { start: 8, end: 14 }, clipName: 'Drive 1', clipPath: 'old/Drive 1', clipId: 88, tags: { unit: 'offense', result: 'Touchdown', custom: [] } },
  ];
  pl.reset();
  await pl.rehydrateFromDisk([
    { name: 'Drive 1.mp4', path: 'old/Drive 1.mp4', url: 'blob:s4' },
  ], plays4);
  const s4 = { primary: plays4[0].clipId, marked: plays4[1].clipId, liveId: pl.clips[0]?.id, clipPlay: pl.clips[0]?.playId, result: plays4[1].tags.result };

  // --- Scenario 5: switching managed -> linked replaces the live playlist ---
  const plays5 = [
    { id: 1, timestamp: { start: 0, end: 5 }, clipName: 'Only', clipPath: 'linked/Only', clipId: 55, tags: { unit: 'offense', custom: [] } },
  ];
  pl.reset();
  pl.clips.push({ id: pl._nextClipId++, name: 'old-managed', clipPath: 'managed/old', file: null, assetUrl: 'blob:old', objectUrl: null, duration: 5, playId: null });
  await pl.rehydrateFromDisk([
    { name: 'Only.mp4', path: 'linked/Only.mp4', url: 'blob:s5' },
  ], plays5);
  const s5 = { count: pl.clips.length, paths: pl.clips.map(c => c.clipPath), linked: plays5[0].clipId === pl.clips[0]?.id };

  return { s1, s2, s3, s4, s5 };
});

const { s1, s2, s3, s4, s5 } = res;
ok(s1.clipCount === 2, 'no duplicate clips created on a root-mismatched relink', JSON.stringify(s1));
ok(s1.ezPlay === 1 && s1.slPlay === 2, 'root-mismatched same-basename clips relink 1:1 by folder order (endzone→p1, sideline→p2)', JSON.stringify(s1));
ok(s1.p1Form === 'ENDZONE' && s1.p2Form === 'SIDELINE', 'tags are preserved through the relink', JSON.stringify(s1));
ok(s1.p1Path === 'endzone/0001' && s1.p2Path === 'sideline/0001', 'plays adopt the linked-folder clipPaths', JSON.stringify(s1));
ok(s2.ezPlay === 1 && s2.slPlay === 2 && s2.clipCount === 2, 'exact-path relink keeps same-basename subfolder clips distinct (Pass 1)', JSON.stringify(s2));
ok(s3.playId === 1 && s3.clipId === s3.liveId && s3.formation === 'WING-T', 'linked Windows (n)-renamed copy relinks through the shared normalized matcher', JSON.stringify(s3));
ok(s4.primary === s4.liveId && s4.marked === s4.liveId && s4.clipPlay === 1 && s4.result === 'Touchdown', 'every marked play sharing a stale clip id follows the linked primary', JSON.stringify(s4));
ok(s5.count === 1 && s5.paths[0] === 'linked/Only' && s5.linked, 'linked rehydrate replaces an existing managed playlist instead of appending duplicates', JSON.stringify(s5));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
