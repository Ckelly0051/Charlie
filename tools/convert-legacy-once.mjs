#!/usr/bin/env node
/**
 * ONE-TIME LEGACY CONVERSION (docs/LEGACY-EXCISION-PLAN.md, Pass 2 step 3).
 * Delete this file after the live conversion.
 *
 * Coach's rule (2026-09-25): convert what maps exactly; where charting does not
 * cleanly convert, go back to blank and LOG the play so it can be re-charted.
 *
 *   exact    a play with no unit            -> unit 'offense' (the reading every
 *                                             report already uses)
 *   exact    combined looks ("Under Center + Flexbone")
 *                                          -> TagProjection.commitLook, the same
 *                                             commit a Film Room edit makes
 *   exact    an extra point stored on the Field Goal unit
 *                                          -> the Try unit (good -> converted,
 *                                             no good -> failed)
 *   exact    return yards in the old `returnYards` field beside a structured
 *            return that has none of its own
 *                                          -> that return's own yards
 *   blank    old Special Teams values (stType, kickOutcome, scoreFor,
 *            kickDistance, returnYards, hangTime, kickedTo)
 *                                          -> removed; a play that had no
 *                                             structured event is logged for
 *                                             re-charting with its old values
 *
 * Every play first gets the normalization the app already applies on each load
 * (migratePlayFormation, stripStAlignment, stripLeakedFronts, the Special Teams
 * and penalty normalizers), so "before" and "after" are compared as the app
 * reads them.
 *
 * Dry run (default): reads a copy of the catalog, writes the converted copy and
 * a report into --out. It never writes the source catalog.
 * Live (--apply): see apply() below; only after the coach's yes.
 *
 *   node tools/convert-legacy-once.mjs --out <dir> [--catalog <library.db>]
 *   node tools/convert-legacy-once.mjs --apply --backup <new dir> --approved <impact.json>   (GridIron IQ closed)
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { LIVE_CATALOG, dataShapes } from './audit-legacy.mjs';
import { SqlCatalog } from '../js/sql-catalog.js';
import { SeasonStore } from '../js/season-store.js';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { PenaltyModel } from '../js/penalty-model.js';
import { TagProjection } from '../js/tag-projection.js';
import { StatsEngine } from '../js/stats-engine.js';
import { isPlayTagged } from '../js/football-rules.js';

export const LEGACY_ST_KEYS = ['stType', 'kickOutcome', 'scoreFor', 'kickDistance', 'returnYards', 'hangTime', 'kickedTo'];

const clone = o => JSON.parse(JSON.stringify(o));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const present = v => v !== undefined && v !== null && v !== '';

/** The normalization the app applies to every play on load. */
export function loadNormalize(play) {
  SeasonStore.migratePlayFormation(play);
  SeasonStore.stripStAlignment(play);
  SeasonStore.stripLeakedFronts(play);
  SpecialTeamsModel.normalizePlay(play);
  PenaltyModel.normalizePlay(play);
}

/** Convert one (load-normalized) play in place. Returns what happened. */
export function convertPlay(play) {
  const out = { unit: null, look: false, fgExtraPoint: null, cleared: {}, recharts: false };
  const t = play.tags || (play.tags = {});

  // 1. No unit: the reading every report already uses.
  if (Object.keys(t).length && !present(t.unit)) {
    out.unit = isPlayTagged(play) ? 'charted' : 'blank';
    t.unit = 'offense';
  }

  // 2. Combined looks, through the one look commit.
  out.look = TagProjection.commitLook(play);

  // 3. An extra point on the Field Goal unit -> the Try unit, only when exact.
  const st = play.specialTeams;
  if (st && (st.unit === 'fieldGoal' || st.unit === 'fieldGoalBlock') && st.attemptType === 'extraPoint') {
    const status = st.outcome && st.outcome.status;
    const score = st.outcome && st.outcome.score;
    let result = null;
    if (status === 'good' && (score === 'extraPoint' || !score)) result = 'converted';
    else if (status === 'noGood' && !score) result = 'failed';
    const unit = st.unit === 'fieldGoal' ? 'try' : 'tryDefense';
    play.specialTeams = SpecialTeamsModel.normalize({
      ...st, unit, attemptType: 'extraPoint', result,
      outcome: { ...st.outcome, score: result === 'converted' ? 'extraPoint' : null },
    });
    out.fgExtraPoint = result || 'blank';
    if (!result) out.recharts = true;
  }

  // 4. A return's yards charted in the old field beside a structured return
  //    with none of its own: the same number, moved to the play's own field
  //    (Players already reads it through that fallback).
  const ev = play.specialTeams;
  if (ev && (ev.unit === 'kickoffReturn' || ev.unit === 'puntReturn') && ev.return && ev.return.yards == null && present(t.returnYards)) {
    const n = Number(String(t.returnYards).trim());
    if (Number.isFinite(n)) {
      play.specialTeams = SpecialTeamsModel.normalize({ ...ev, return: { ...ev.return, yards: n } });
      out.returnYardsMoved = n;
    }
  }

  // 5. Old Special Teams values: blank them.
  for (const k of LEGACY_ST_KEYS) {
    if (Object.prototype.hasOwnProperty.call(t, k)) {
      if (present(t[k])) out.cleared[k] = t[k];
      delete t[k];
    }
  }
  if (!play.specialTeams && Object.keys(out.cleared).length) out.recharts = true;
  return out;
}

/** Analytics the proof compares, per game and per season. */
function analytics(plays) {
  const engine = new StatsEngine(null);
  const stats = engine.compute(plays);
  // A play embedded in a result compares by identity: its tags are what changed.
  const asRef = (k, v) => (v && typeof v === 'object' && v.timestamp && v.tags && v.id != null) ? `play:${v.__gid ? v.__gid + '::' : ''}${v.id}` : v;
  const scoring = Object.fromEntries(plays.map(p => [`${p.__gid ? p.__gid + '::' : ''}${p.id}`, `${StatsEngine.scoringSide(p)}|${SpecialTeamsModel.points(p)}`]));
  return JSON.parse(JSON.stringify({ stats, scoring }, asRef));
}

function diffPaths(a, b, prefix = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out.push({ path: prefix, before: a, after: b });
  return out;
}

export async function run({ catalogPath = LIVE_CATALOG, outDir }) {
  if (!outDir) throw new Error('--out <dir> is required');
  mkdirSync(outDir, { recursive: true });
  const src = path.resolve(catalogPath);
  const sourceHash = sha(readFileSync(src));
  const copy = path.join(outDir, 'source-copy.db');
  copyFileSync(src, copy);
  if (sha(readFileSync(copy)) !== sourceHash) throw new Error('copy does not match source');

  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL);
  await cat.open(readFileSync(copy));

  const report = { source: src, sourceHash, seasons: [], recharts: [], stops: [] };
  for (const meta of cat.listSeasons()) {
    const original = cat.loadSeason(meta.id);
    if (!original) { report.stops.push(`season ${meta.id} did not load`); continue; }
    const before = clone(original), after = clone(original);
    const season = { id: meta.id, name: before.seasonName || meta.name, games: [], counts: {
      plays: 0, unitCharted: 0, unitBlank: 0, look: 0, fgXpConverted: 0, fgXpFailed: 0, fgXpBlank: 0,
      clearedLegacyOnly: 0, clearedUnderStructured: 0, recharts: 0,
    }, shapesBefore: null, shapesAfter: null, analytics: [] };
    for (const g of before.games || []) if (Object.prototype.hasOwnProperty.call(g, 'roster')) report.stops.push(`${season.name} / ${g.name}: game node carries a roster`);
    for (const g of before.games || []) for (const p of g.plays || []) loadNormalize(p);
    season.shapesBefore = dataShapes(before);

    (after.games || []).forEach((g, gi) => {
      (g.plays || []).forEach(p => {
        loadNormalize(p);
        const oldTags = clone(p.tags || {}), oldSt = p.specialTeams ? clone(p.specialTeams) : null;
        const r = convertPlay(p);
        const c = season.counts; c.plays++;
        if (r.unit === 'charted') c.unitCharted++;
        if (r.unit === 'blank') c.unitBlank++;
        if (r.look) c.look++;
        if (r.fgExtraPoint === 'converted') c.fgXpConverted++;
        if (r.fgExtraPoint === 'failed') c.fgXpFailed++;
        if (r.fgExtraPoint === 'blank') c.fgXpBlank++;
        if (Object.keys(r.cleared).length) (oldSt ? c.clearedUnderStructured++ : c.clearedLegacyOnly++);
        if (r.returnYardsMoved != null) c.returnYardsMoved = (c.returnYardsMoved || 0) + 1;
        if (r.recharts || r.unit === 'charted') {
          c.recharts += r.recharts ? 1 : 0;
          report.recharts.push({
            season: season.name, game: g.name || '', date: (g.gameInfo && g.gameInfo.date) || '', play: p.id,
            action: r.recharts ? 'Re-chart Special Teams' : 'Check unit (set to Offense)',
            old: r.recharts ? { ...r.cleared, ...(r.fgExtraPoint === 'blank' ? { specialTeams: oldSt } : {}) } : {},
            context: { unit: oldTags.unit ?? '', quarter: oldTags.quarter || '', down: oldTags.down || '', distance: oldTags.distance || '',
              result: oldTags.result || '', yardage: oldTags.yardage ?? '', playType: oldTags.playType || '', players: oldTags.players || {} },
          });
        }
      });
    });
    season.shapesAfter = dataShapes(after);

    // Proof: analytics per game and for the season, before vs after.
    const gamesB = before.games || [], gamesA = after.games || [];
    gamesB.forEach((g, i) => {
      const diffs = diffPaths(analytics(g.plays || []), analytics(gamesA[i].plays || []));
      season.analytics.push({ game: g.name || g.id, differences: diffs.length, diffs });
    });
    const stamp = gs => gs.flatMap(g => (g.plays || []).map(p => ({ ...p, __gid: g.id })));
    const seasonDiffs = diffPaths(analytics(stamp(gamesB)), analytics(stamp(gamesA)));
    season.analytics.push({ game: '(season)', differences: seasonDiffs.length, diffs: seasonDiffs });

    // Play-by-play: identity, film references and ordering never change.
    gamesB.forEach((g, i) => {
      const a = gamesA[i];
      const ids = x => (x.plays || []).map(p => `${p.id}|${JSON.stringify(p.timestamp)}|${p.clipPath || ''}|${JSON.stringify(p.clipRefs || null)}|${p.catalogClipId || ''}`).join('\n');
      if (ids(g) !== ids(a)) report.stops.push(`${season.name} / ${g.name}: play identity or film reference changed`);
    });

    cat.saveSeason(after);
    const reread = cat.loadSeason(meta.id);
    for (const g of reread.games || []) for (const p of g.plays || []) loadNormalize(p);
    season.shapesReread = dataShapes(reread);
    report.seasons.push(season);
  }

  const outDb = path.join(outDir, 'converted.db');
  writeFileSync(outDb, cat.toBytes());
  if (sha(readFileSync(src)) !== sourceHash) report.stops.push('SOURCE CATALOG CHANGED DURING THE RUN');
  report.convertedHash = sha(readFileSync(outDb));
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  return report;
}

/** Every legacy shape this conversion exists to remove, counted over a whole catalog. */
export function legacyRemaining(cat) {
  const out = {};
  for (const m of cat.listSeasons()) {
    const season = cat.loadSeason(m.id);
    const shapes = dataShapes(season);
    let staleKeys = 0, fgUnitXp = 0;
    for (const g of season.games || []) for (const p of g.plays || []) {
      if (LEGACY_ST_KEYS.some(k => p.tags && Object.prototype.hasOwnProperty.call(p.tags, k))) staleKeys++;
      const st = p.specialTeams;
      if (st && (st.unit === 'fieldGoal' || st.unit === 'fieldGoalBlock') && st.attemptType === 'extraPoint') fgUnitXp++;
    }
    const total = shapes.noUnit + shapes.emptyTags + shapes.combinedFormation + shapes.legacyStOnly + shapes.gameNodeRosters + staleKeys + fgUnitXp;
    out[m.name] = { ...shapes, staleKeys, fgUnitXp, total };
  }
  return out;
}
const isClean = remaining => Object.values(remaining).every(s => s.total === 0);

async function openCatalog(bytes) {
  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL);
  await cat.open(bytes);
  return cat;
}

/** What the coach approves: the source it was computed from and its exact effect. */
export function impactOf(report) {
  return {
    sourceHash: report.sourceHash,
    counts: Object.fromEntries(report.seasons.map(s => [s.name, s.counts])),
    recharts: report.recharts.map(r => `${r.season}|${r.game}|${r.play}|${r.action}`),
  };
}

const appRunning = () => execSync('tasklist /fo csv /nh', { encoding: 'utf8' }).split('\n').filter(l => /gridiron/i.test(l));

/**
 * THE LIVE WRITE (coach-approved, run once), bound to an approved impact:
 * `approvedPath` is the impact.json of the dry run the coach said yes to. If the
 * live catalog's hash or the recomputed effect differs from it, nothing is
 * written and a new review is needed.
 *
 * Refuses while GridIron IQ runs. Backs up the catalog folder (film excluded:
 * never written), library.json and the Documents mirror, every copy
 * hash-verified. Converts, validates the converted catalog (zero legacy shapes)
 * BEFORE any replacement, re-checks immediately before the swap that the app is
 * still closed and library.db still has the backed-up bytes, swaps in a staged
 * file from the same folder, then re-reads and asserts the same.
 *
 * There is no lock the installed app honors, so the last re-check narrows the
 * window to the instant between it and the rename; it cannot close it. The coach
 * keeps the app closed until this reports done.
 */
export async function apply({ backupDir, approvedPath, catalogPath = LIVE_CATALOG, mirror = path.join(os.homedir(), 'OneDrive', 'Documents', 'GridIron IQ'), rehearsal = false, onBeforeSwap = null }) {
  if (!backupDir) throw new Error('--backup <dir> is required');
  if (!approvedPath || !existsSync(approvedPath)) throw new Error('--approved <impact.json> from the reviewed dry run is required');
  const approved = JSON.parse(readFileSync(approvedPath, 'utf8'));
  const checkClosed = () => { const r = appRunning(); if (r.length && !rehearsal) throw new Error(`GridIron IQ is running; close it first (${r[0].trim()}). Nothing written.`); };
  checkClosed();
  if (existsSync(backupDir)) throw new Error(`backup folder already exists: ${backupDir}`);
  if (sha(readFileSync(catalogPath)) !== approved.sourceHash) throw new Error('library.db is not the catalog that was reviewed (it changed since the dry run). Run a new dry run and review it. Nothing written.');

  const appSeasons = path.dirname(catalogPath);
  const appRoot = path.dirname(appSeasons);
  const manifest = [];
  const copyVerified = (s, d) => {
    copyFileSync(s, d);
    const h = sha(readFileSync(s));
    if (sha(readFileSync(d)) !== h) throw new Error(`backup copy differs: ${s}`);
    manifest.push({ source: s, backup: d, sha256: h });
  };
  const copyTree = (from, to) => {
    for (const e of readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory() && e.name === 'films') continue;         // film is never written
      const s = path.join(from, e.name), d = path.join(to, e.name);
      if (e.isDirectory()) { mkdirSync(d, { recursive: true }); copyTree(s, d); continue; }
      copyVerified(s, d);
    }
  };
  mkdirSync(path.join(backupDir, 'appdata-seasons'), { recursive: true });
  copyTree(appSeasons, path.join(backupDir, 'appdata-seasons'));
  if (existsSync(path.join(appRoot, 'library.json'))) {
    mkdirSync(path.join(backupDir, 'appdata-root'), { recursive: true });
    copyVerified(path.join(appRoot, 'library.json'), path.join(backupDir, 'appdata-root', 'library.json'));
  }
  if (existsSync(mirror)) { mkdirSync(path.join(backupDir, 'documents-mirror'), { recursive: true }); copyTree(mirror, path.join(backupDir, 'documents-mirror')); }
  writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const backedUpHash = manifest.find(m => m.source === catalogPath)?.sha256;
  if (backedUpHash !== approved.sourceHash) throw new Error('backed-up library.db is not the reviewed catalog. Nothing written.');

  const report = await run({ catalogPath, outDir: path.join(backupDir, 'run') });
  if (report.stops.length) throw new Error(`conversion stopped, nothing written: ${report.stops.join(' | ')}`);
  if (JSON.stringify(impactOf(report)) !== JSON.stringify(approved)) {
    writeFileSync(path.join(backupDir, 'run', 'impact.json'), JSON.stringify(impactOf(report), null, 1));
    throw new Error('the effect differs from the approved impact. Nothing written.');
  }

  // Validate the converted catalog BEFORE anything is replaced.
  const bytes = readFileSync(path.join(backupDir, 'run', 'converted.db'));
  if (sha(bytes) !== report.convertedHash) throw new Error('converted catalog does not match its report. Nothing written.');
  const before = legacyRemaining(await openCatalog(bytes));
  if (!isClean(before)) throw new Error(`converted catalog still holds legacy shapes: ${JSON.stringify(before)}. Nothing written.`);

  const staged = path.join(appSeasons, `library.db.pending-${randomUUID()}`);
  writeFileSync(staged, bytes);
  if (sha(readFileSync(staged)) !== report.convertedHash) { rmSync(staged, { force: true }); throw new Error('staged catalog does not match. Nothing written.'); }
  // The last re-check, as close to the swap as possible. (onBeforeSwap is a
  // rehearsal hook that simulates the app writing in this window.)
  if (rehearsal && onBeforeSwap) onBeforeSwap();
  try {
    checkClosed();
    if (sha(readFileSync(catalogPath)) !== backedUpHash) throw new Error('library.db changed after the backup. Nothing written.');
  } catch (e) { rmSync(staged, { force: true }); throw e; }
  renameSync(staged, catalogPath);

  const liveHash = sha(readFileSync(catalogPath));
  const after = legacyRemaining(await openCatalog(readFileSync(catalogPath)));
  const ok = liveHash === report.convertedHash && isClean(after);
  return { ok, report, after, liveHash, backupFiles: manifest.length, backupDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  if (process.argv.includes('--apply')) {
    const r = await apply({ backupDir: arg('--backup'), approvedPath: arg('--approved') });
    console.log(`backup: ${r.backupFiles} files, each hash-verified against its source -> ${r.backupDir}`);
    console.log(`live catalog equals the converted copy: ${r.liveHash === r.report.convertedHash}`);
    for (const [name, s] of Object.entries(r.after)) console.log(`  ${name}: legacy remaining ${s.total} ${JSON.stringify(s)}`);
    console.log(`re-chart / check list: ${r.report.recharts.length} plays`);
    if (!r.ok) console.log(`FAILED VERIFICATION after the swap. Restore library.db from ${path.join(r.backupDir, 'appdata-seasons', 'library.db')}.`);
    process.exit(r.ok ? 0 : 1);
  }
  const outDir = arg('--out');
  const report = await run({ catalogPath: arg('--catalog') || LIVE_CATALOG, outDir });
  const converted = legacyRemaining(await openCatalog(readFileSync(path.join(outDir, 'converted.db'))));
  writeFileSync(path.join(outDir, 'impact.json'), JSON.stringify(impactOf(report), null, 1));
  for (const s of report.seasons) {
    console.log(`\n${s.name}`);
    console.log('  ' + JSON.stringify(s.counts));
    console.log('  legacy remaining in the converted catalog ' + JSON.stringify(converted[s.name]));
    for (const a of s.analytics) if (a.differences) console.log(`  analytics differ: ${a.game} (${a.differences} values)`);
  }
  console.log(`\nre-chart / check list: ${report.recharts.length} plays`);
  console.log(`impact to approve: ${path.join(outDir, 'impact.json')} (source ${report.sourceHash.slice(0, 12)})`);
  const clean = isClean(converted);
  console.log(`stops: ${report.stops.length ? report.stops.join(' | ') : 'none'}; converted catalog clean: ${clean}`);
  process.exit(report.stops.length || !clean ? 1 : 0);
}
