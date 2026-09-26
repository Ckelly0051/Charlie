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
 * DRY RUN ONLY. Reads a copy of the catalog, writes the converted copy and a
 * report into --out. It never writes the source catalog.
 *
 *   node tools/convert-legacy-once.mjs --out <dir> [--catalog <library.db>]
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const report = await run({ catalogPath: arg('--catalog') || LIVE_CATALOG, outDir: arg('--out') });
  for (const s of report.seasons) {
    console.log(`\n${s.name}`);
    console.log('  ' + JSON.stringify(s.counts));
    console.log('  shapes before ' + JSON.stringify(s.shapesBefore));
    console.log('  shapes after  ' + JSON.stringify(s.shapesReread));
    for (const a of s.analytics) if (a.differences) console.log(`  analytics differ: ${a.game} (${a.differences} values)`);
  }
  console.log(`\nre-chart / check list: ${report.recharts.length} plays`);
  console.log(`stops: ${report.stops.length ? report.stops.join(' | ') : 'none'}`);
  process.exit(report.stops.length ? 1 : 0);
}
