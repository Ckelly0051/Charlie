/* CLIP-MATCH HARNESS (Node) — proves the PURE clip↔play matcher (js/clip-identity.js)
   that the ghost-plays fix (redesign R2/R3) will adopt. The bug it prevents: a clip
   that fails to relink auto-creates a ghost whole-clip play. These cases pin that a
   correct matcher leaves ZERO unmatched clips (no ghosts) for the failure modes the
   current filename match can't handle — Windows `(n)` rename + duplicate basenames —
   while keeping genuinely-distinct clips distinct. Pure module, not wired into the
   app; runs green in the standard gate.

   Run:  node tools/e2e-clip-match.mjs */
import assert from 'node:assert';
import { planClipMatch, stripDupSuffix, normKey } from '../js/clip-identity.js';

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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
