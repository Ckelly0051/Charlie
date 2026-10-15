/* Match renamed and duplicate-basename clips without creating unmatched ghost
 * clips or merging distinct identities. Exercises the shared matcher directly. */
import assert from 'node:assert';
import { planClipMatch, stripDupSuffix, normKey } from '../js/clip-identity.js';
import { PlaylistManager } from '../js/playlist-manager.js';
import { GameThumbnailService } from '../js/game-thumbnail.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const play = id => ({ clipPath: id });
const clip = id => ({ path: id });
// A "ghost" would be created for every clip left unmatched.
const ghosts = r => r.unmatchedClips.length;
const tierOf = (r, ci) => (r.matches.find(m => m.clipIndex === ci) || {}).tier;

// ---- unit: dup-suffix stripping --------------------------------------------
ok(stripDupSuffix('Play 12 (1)') === 'Play 12', 'stripDupSuffix removes a trailing " (1)"');
ok(stripDupSuffix('Play 12 (23)') === 'Play 12', 'stripDupSuffix removes multi-digit " (23)"');
ok(stripDupSuffix('Play 12') === 'Play 12', 'stripDupSuffix leaves a clean name alone');
ok(stripDupSuffix('Drive (2024)') === 'Drive', 'stripDupSuffix strips a numeric-paren tail (OS dup marker shape)');
ok(normKey('endzone/PLAY 12 (1).mp4') === 'play 12', 'normKey = basename, dup-stripped, lowercased');

// ---- 1. exact path: same-basename subfolder clips stay DISTINCT -------------
{
  const r = planClipMatch(
    [play('endzone/0001'), play('sideline/0001')],
    [clip('endzone/0001.mp4'), clip('sideline/0001.mp4')]);
  ok(ghosts(r) === 0 && tierOf(r, 0) === 'path' && tierOf(r, 1) === 'path', 'same-basename clips in different subfolders match by full path (no ghost, no cross-link)', JSON.stringify(r));
}

// ---- 2. legacy bare-name game relinks 1:1 by basename ----------------------
{
  const r = planClipMatch(
    [play('0001'), play('0002'), play('0003')],
    [clip('Wk3/0001.mp4'), clip('Wk3/0002.mp4'), clip('Wk3/0003.mp4')]);
  ok(ghosts(r) === 0 && r.matches.every(m => m.tier === 'base'), 'a bare-name saved game relinks 1:1 to a re-added folder by basename (the St. Peter class)', JSON.stringify(r));
}

// ---- 3. THE WINDOWS `(n)` RENAME: re-added copies relink, no ghost ----------
{
  const r = planClipMatch(
    [play('Play 12'), play('Play 13')],
    [clip('Play 12 (1).mp4'), clip('Play 13 (1).mp4')]);
  ok(ghosts(r) === 0 && tierOf(r, 0) === 'norm' && tierOf(r, 1) === 'norm', 'Windows-renamed "Play 12 (1).mp4" relinks to saved "Play 12" via the (n)-normalized tier (NO ghost)', JSON.stringify(r));
}

// ---- 4. genuinely-distinct (1)/(2) clips stay distinct ---------------------
// Saved plays already carry the (n) names → they match EXACTLY at base tier and
// never collapse together.
{
  const r = planClipMatch(
    [play('rep (1)'), play('rep (2)')],
    [clip('rep (1).mp4'), clip('rep (2).mp4')]);
  ok(ghosts(r) === 0 && r.matches.find(m => m.clipIndex === 0).playIndex === 0 && r.matches.find(m => m.clipIndex === 1).playIndex === 1, 'distinct "(1)"/"(2)" clips match their own plays exactly (not merged)', JSON.stringify(r));
}

// ---- 5. duplicate basenames in saved data + renamed copies: paired by order -
// Two plays honestly saved as the same name; Windows renamed the copies. The norm
// tier buckets both plays under one key and pairs them 1:1 with the two clips.
{
  const r = planClipMatch(
    [play('0001'), play('0001')],
    [clip('0001.mp4'), clip('0001 (1).mp4')]);
  ok(ghosts(r) === 0 && r.matches.length === 2, 'two dup-named saved plays absorb a clean + a "(1)" copy with no ghost', JSON.stringify(r));
}

// ---- 6. count-mismatched leftovers do NOT force a wrong order pairing -------
// One extra clip with an unrelatable name must be left unmatched (a real "new"
// clip), never order-forced onto a play — but the resolvable ones still relink.
{
  const r = planClipMatch(
    [play('Play A'), play('Play B')],
    [clip('Play A (1).mp4'), clip('Play B (1).mp4'), clip('BrandNewClip.mp4')]);
  ok(r.matches.length === 2 && r.unmatchedClips.length === 1 && r.unmatchedPlays.length === 0, 'resolvable clips relink; a truly-new extra clip stays unmatched (not order-forced)', JSON.stringify(r));
}

// ---- 7. case-only difference (Windows FS is case-insensitive) ---------------
{
  const r = planClipMatch([play('Kickoff')], [clip('KICKOFF.mp4')]);
  ok(ghosts(r) === 0 && tierOf(r, 0) === 'norm', 'a case-only filename difference relinks (no ghost)', JSON.stringify(r));
}

// ---- 8. order fallback rescues an unrelatable but count-equal rename --------
{
  const r = planClipMatch(
    [play('clip_alpha'), play('clip_bravo')],
    [clip('renamed_1.mp4'), clip('renamed_2.mp4')]);
  ok(ghosts(r) === 0 && r.matches.every(m => m.tier === 'order'), 'wholesale-renamed clips with equal counts pair by folder order (no ghost)', JSON.stringify(r));
}

// ---- 9. partial match never order-pairs an unrelated equal remainder -------
{
  const r = planClipMatch(
    [play('IMG_1'), play('IMG_2')],
    [clip('Folder/IMG_1.mp4'), clip('Folder/NEW.mp4')]);
  ok(r.matches.length === 1 && r.matches[0].tier === 'base' && r.unmatchedPlays.length === 1 && r.unmatchedClips.length === 1,
    'a partial exact match leaves unrelated equal leftovers for coach confirmation', JSON.stringify(r));
}

// ---- 10. durable catalog identity outranks misleading filenames ------------
{
  const r = planClipMatch(
    [
      { catalogClipId: 'clip-a', clipPath: 'old/wrong-name-a' },
      { catalogClipId: 'clip-b', clipPath: 'old/wrong-name-b' },
    ],
    [
      { catalogClipId: 'clip-b', clipPath: 'new/looks-like-a' },
      { catalogClipId: 'clip-a', clipPath: 'new/looks-like-b' },
    ]);
  ok(r.matches.length === 2
    && r.matches.every(m => m.tier === 'catalog')
    && r.matches.find(m => m.playIndex === 0)?.clipIndex === 1,
    'durable catalog identity wins before misleading filename/path fallbacks', JSON.stringify(r));
}

const tick = () => new Promise(resolve => setImmediate(resolve));
for (const change of ['none', 'game', 'reset', 'relink', 'replace', 'retime']) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = { clipId: 1, timestamp: { start: 0, end: 999 } };
  const replacement = { clipId: 1, timestamp: { start: 0, end: 999 } };
  const entry = { id: 1, assetUrl: 'film-a' };
  const tagger = { plays: [original] };
  const playlist = Object.assign(Object.create(PlaylistManager.prototype), {
    tagger, clips: [entry], _probeDuration: () => gate,
  });
  playlist._backfillDurations([entry]);
  if (change === 'game') { tagger.plays = [replacement]; playlist.clips = [{ id: 1 }]; }
  if (change === 'reset') playlist.clips = [];
  if (change === 'relink') entry.assetUrl = 'film-b';
  if (change === 'replace') tagger.plays[0] = replacement;
  if (change === 'retime') original.timestamp.end = 4;
  release(17);
  await tick();
  ok(original.timestamp.end === (change === 'none' ? 17 : change === 'retime' ? 4 : 999)
    && replacement.timestamp.end === 999,
    `duration completion respects ${change} ownership and existing timing`);
  ok(entry.duration === (['none', 'retime'].includes(change) ? 17 : undefined),
    `duration metadata respects ${change} ownership`);
}
{
  const clips = Array.from({ length: 10 }, (_, id) => ({ id, assetUrl: `film-${id}` }));
  let release, probes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const playlist = Object.assign(Object.create(PlaylistManager.prototype), {
    clips, tagger: { plays: [] }, _probeDuration: () => { probes++; return gate; },
  });
  playlist._backfillDurations(clips);
  ok(probes === 8, 'duration pool starts at most eight probes');
  playlist.clips = [];
  release(17);
  await tick();
  ok(probes === 8, 'reset stops unstarted duration probes');
}

{
  const backend = { currentId: 'season-a' };
  const thumbnails = new GameThumbnailService({ storage: { seasonStore: { backend } } }, { maxConcurrent: 1 });
  const captures = [];
  thumbnails._firstFile = async game => ({ key: game.id, url: async () => game.id });
  thumbnails._capture = url => new Promise(resolve => captures.push({ url, resolve }));
  const active = thumbnails.request({ id: 'first' });
  await tick();
  let queued = 'pending';
  const waiting = thumbnails.request({ id: 'queued' }).then(value => { queued = value; });
  await tick();
  ok(captures.length === 1 && thumbnails._queue.length === 1, 'thumbnail concurrency limit queues the second request');
  thumbnails.reset();
  await tick();
  ok(queued === null, 'reset settles queued thumbnail requests with null');
  const fresh = thumbnails.request({ id: 'first' });
  await tick();
  captures[0].resolve('old-frame');
  ok(await active === null, 'reset invalidates an active capture even within the same season');
  await tick();
  const duplicate = thumbnails.request({ id: 'first' });
  await tick();
  ok(captures.length === 2 && captures[1].url === 'first' && thumbnails._pending.size === 1,
    'old completion neither caches stale film nor removes the fresh pending request');
  captures[1].resolve('fresh-frame');
  ok(await fresh === 'fresh-frame' && await duplicate === 'fresh-frame', 'fresh request and its duplicate share the new capture');
  await tick();
  ok(await thumbnails.request({ id: 'first' }) === 'fresh-frame' && captures.length === 2,
    'the fresh thumbnail is cached without decoding a duplicate');
  backend.currentId = 'season-b';
  thumbnails.reset();
  const other = thumbnails.request({ id: 'first' });
  await tick();
  captures.at(-1).resolve('other-season');
  ok(await other === 'other-season', 'another season never reuses the previous season thumbnail');
  let lookup;
  thumbnails._firstFile = () => new Promise(resolve => { lookup = resolve; });
  const duringLookup = thumbnails.request({ id: 'lookup' });
  thumbnails.reset();
  lookup({ key: 'lookup', url: async () => 'lookup' });
  let lookupResult = 'pending';
  duringLookup.then(value => { lookupResult = value; });
  await tick();
  ok(lookupResult === null && captures.length === 3, 'reset during file lookup prevents an obsolete capture from starting');
  // Drain the unfixed implementation too, so failures cannot strand the harness.
  if (captures.length > 3) captures.at(-1).resolve('obsolete');
  await duringLookup;
  if (queued === null) await waiting;
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
