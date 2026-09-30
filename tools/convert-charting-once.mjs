#!/usr/bin/env node
/**
 * THROWAWAY: one-time Formation -> Formation Family / Receiver Set conversion tool
 * (see tools/charting-convert.mjs). Delete after the live conversion.
 *
 *   node tools/convert-charting-once.mjs --inventory [--catalog <library.db>] [--mapping <m.json>] [--out <dir>]
 *       Read-only. Counts every affected location and lists the unresolved values.
 *   node tools/convert-charting-once.mjs --rehearse --out <dir> [--catalog <library.db>] --mapping <m.json>
 *       Writes a converted COPY of the catalog and the proof report into <dir>. Never touches the source.
 *   node tools/convert-charting-once.mjs --fixture <season.json> --out <converted.json> [--mapping <m.json>]
 *       Converts a copy of a season file (test fixtures). Unresolved plays are left with a blank family, listed.
 *   node tools/convert-charting-once.mjs --apply --backup <new dir> --approved <impact.json> --mapping <m.json>
 *       THE LIVE WRITE, only after the coach's explicit yes and with GridIron IQ closed. See apply().
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqlCatalog } from '../js/sql-catalog.js';
import { StatsEngine } from '../js/stats-engine.js';
import { SeasonFormat } from '../js/season-format.js';
import { convertSeason, convertPlay, emptyMapping, mappingProblems, otherProblems, tokensOf, OLD_KEY, NEW_KEYS, clone, DETERMINISTIC } from './charting-convert.mjs';

export const LIVE_CATALOG = path.join(process.env.APPDATA || '', 'com.gridironiq.app', 'seasons', 'library.db');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function loadMapping(file) {
  if (!file) return emptyMapping();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const mapping = { tokens: raw.tokens || {}, plays: raw.plays || {} };
  if (raw.combinations) mapping.combinations = raw.combinations;
  const problems = mappingProblems(mapping);
  if (problems.length) throw new Error(`mapping file is not valid: ${problems.join('; ')}`);
  return mapping;
}

async function openCatalog(bytes) {
  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL);
  await cat.open(bytes);
  return cat;
}

/** The plays a game snapshot or season carries, for counting. */
const playsOf = data => Array.isArray(data?.games) ? data.games.flatMap(g => g.plays || []) : (Array.isArray(data?.plays) ? data.plays : []);

/**
 * Convert one stored document (a season body or a game snapshot) on a clone.
 * Returns { status, data, result }:
 *   'current'      carries no retired Formation
 *   'converted'    every Formation value resolved
 *   'left'         holds an unresolved value or an old alignment, or has another
 *                  old-format problem: it stays exactly as stored
 */
function convertDocument(doc, mapping, label) {
  const data = clone(doc);
  const isSeason = Array.isArray(data.games);
  const seasonLike = isSeason ? data : { id: data.id || label, seasonName: data.name || label, games: [{ id: data.id || label, name: data.name || label, plays: data.plays || [] }], playbook: data.playbook };
  const carries = playsOf(data).some(p => p && p.tags && has(p.tags, OLD_KEY))
    || (isSeason && (data.playbook?.calls || []).some(c => c?.defaults && has(c.defaults, OLD_KEY)));
  if (!carries) return { status: 'current', data: doc, result: null };
  const other = otherProblems(data);
  const result = convertSeason(seasonLike, mapping, label);
  if (other.length || result.unresolved.length || result.old.length || result.playbook.unresolved.length) {
    return { status: 'left', data: doc, result, other };
  }
  return { status: 'converted', data: isSeason ? seasonLike : { ...data, plays: seasonLike.games[0].plays }, result };
}

/** Tokens and totals across a set of season results. */
function mergeTokens(results) {
  const tokens = {};
  for (const r of results) for (const [k, n] of Object.entries(r.tokens)) tokens[k] = (tokens[k] || 0) + n;
  return tokens;
}

/**
 * INVENTORY + CONVERSION over a catalog copy. Reads `catalogPath`, writes only into
 * `outDir`. The live seasons convert through SqlCatalog.saveSeason; backups and
 * versions are converted in place in the copy when they resolve fully.
 */
export async function run({ catalogPath = LIVE_CATALOG, outDir, mapping = emptyMapping(), write = true }) {
  if (write && !outDir) throw new Error('--out <dir> is required');
  if (outDir) mkdirSync(outDir, { recursive: true });
  const src = path.resolve(catalogPath);
  const sourceBytes = readFileSync(src);
  const sourceHash = sha(sourceBytes);
  const cat = await openCatalog(sourceBytes);
  const report = { source: src, sourceHash, mappingHash: sha(JSON.stringify(mapping)), stops: [], seasons: [], copies: { backups: {}, versions: {} }, unresolvedTokens: [] };

  // 1. The live seasons.
  const allResults = [];
  for (const meta of cat.listSeasons()) {
    const original = cat.loadSeason(meta.id);
    if (!original) { report.stops.push(`season ${meta.id} did not load`); continue; }
    const before = clone(original), after = clone(original);
    const result = convertSeason(after, mapping, meta.id);
    allResults.push(result);
    const s = { id: meta.id, name: before.seasonName || meta.name, ...result, proof: null };
    if (write) {
      s.proof = proveSeason(before, after);
      cat.saveSeason(after);
      const reread = cat.loadSeason(meta.id);
      s.proof.roundTrip = JSON.stringify(strip(reread)) === JSON.stringify(strip(after));
      s.proof.currentFormat = SeasonFormat.seasonProblems(reread).length;
    }
    report.seasons.push(s);
  }

  // 2. Restore points and game versions in the catalog.
  for (const [table, key, label] of [['backups', 'backups', 'restore point'], ['versions', 'versions', 'game version']]) {
    const rows = cat._all(`SELECT id, season_id, body_json FROM ${table}`);
    const c = { total: rows.length, current: 0, convertible: 0, converted: 0, leftUnresolved: 0, leftOldFormat: 0, leftOtherProblems: 0, plays: 0, playsWithFormation: 0, perSeason: {}, tokens: {} };
    const results = [];
    for (const row of rows) {
      let doc; try { doc = JSON.parse(row.body_json); } catch { c.leftOtherProblems++; continue; }
      const out = convertDocument(doc, mapping, `${table}:${row.id}`);
      const bucket = c.perSeason[row.season_id] || (c.perSeason[row.season_id] = { total: 0, current: 0, converted: 0, left: 0 });
      bucket.total++;
      c.plays += playsOf(doc).length;
      if (out.result) { c.playsWithFormation += out.result.withFormation; results.push(out.result); }
      if (out.status === 'current') { c.current++; bucket.current++; continue; }
      if (out.status === 'converted') {
        c.convertible++; c.converted++; bucket.converted++;
        if (write) cat._run(`UPDATE ${table} SET body_json = ? WHERE id = ?`, [JSON.stringify(out.data), row.id]);
        continue;
      }
      bucket.left++;
      if (out.other && out.other.length) c.leftOtherProblems++;
      else if (out.result.old.length) c.leftOldFormat++;
      else c.leftUnresolved++;
    }
    c.tokens = mergeTokens(results);
    report.copies[key] = c;
  }

  // 3. The list the coach decides from: every unresolved live token, with its plays.
  const byToken = new Map();
  for (const s of report.seasons) {
    for (const u of s.unresolved) for (const reason of u.reasons) {
      const key = reason;
      const e = byToken.get(key) || { reason: key, plays: 0, seasons: {}, examples: [] };
      e.plays++; e.seasons[s.name] = (e.seasons[s.name] || 0) + 1;
      if (e.examples.length < 8) e.examples.push({ game: u.game, play: u.play, value: u.oldValue });
      byToken.set(key, e);
    }
  }
  report.unresolvedTokens = [...byToken.values()].sort((a, b) => b.plays - a.plays);
  report.liveTokens = mergeTokens(allResults);

  if (write) {
    const outDb = path.join(outDir, 'converted.db');
    writeFileSync(outDb, cat.toBytes());
    report.convertedHash = sha(readFileSync(outDb));
    if (sha(readFileSync(src)) !== sourceHash) report.stops.push('SOURCE CATALOG CHANGED DURING THE RUN');
    writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  }
  cat.close();
  return report;
}

const strip = season => JSON.parse(JSON.stringify(season, (k, v) => (k === 'updated' || k === 'lastOpened') ? undefined : v));

/** What must not change: identity, film references, every tag but the Formation ones, every non-tag play field. */
function proveSeason(before, after) {
  const proof = { identity: true, filmRefs: true, unrelatedTags: true, otherPlayFields: true, gameFields: true, analyticsUnexpected: [], analyticsChanged: [], details: [] };
  const relatedTag = k => k === OLD_KEY || NEW_KEYS.includes(k);
  before.games.forEach((g, gi) => {
    const a = after.games[gi];
    const { plays: bp, ...bg } = g, { plays: ap, ...ag } = a;
    if (JSON.stringify(bg) !== JSON.stringify(ag)) { proof.gameFields = false; proof.details.push(`game fields changed: ${g.name}`); }
    if ((bp || []).length !== (ap || []).length) { proof.identity = false; proof.details.push(`play count changed: ${g.name}`); return; }
    (bp || []).forEach((p, i) => {
      const q = ap[i];
      const ident = x => `${x.id}|${JSON.stringify(x.timestamp)}`;
      const film = x => `${x.clipPath || ''}|${JSON.stringify(x.clipRefs || null)}|${x.catalogClipId || ''}|${x.clipName || ''}|${x.clipId ?? ''}`;
      if (ident(p) !== ident(q)) { proof.identity = false; proof.details.push(`identity: ${g.name} #${p.id}`); }
      if (film(p) !== film(q)) { proof.filmRefs = false; proof.details.push(`film: ${g.name} #${p.id}`); }
      const tagsOf = x => Object.fromEntries(Object.entries(x.tags || {}).filter(([k]) => !relatedTag(k)));
      if (JSON.stringify(tagsOf(p)) !== JSON.stringify(tagsOf(q))) { proof.unrelatedTags = false; proof.details.push(`tags: ${g.name} #${p.id}`); }
      const { tags: _t1, ...pr } = p, { tags: _t2, ...qr } = q;
      if (JSON.stringify(pr) !== JSON.stringify(qr)) { proof.otherPlayFields = false; proof.details.push(`fields: ${g.name} #${p.id}`); }
    });
  });
  // Analytics: the current engine over the old plays (it ignores the retired field)
  // against the converted plays. Only the formation-derived values may differ.
  const asRef = (k, v) => (v && typeof v === 'object' && v.timestamp && v.tags && v.id != null) ? `play:${v.__gid ? v.__gid + '::' : ''}${v.id}` : v;
  const stats = (plays, gid) => JSON.parse(JSON.stringify(new StatsEngine(null).compute(plays.map(p => ({ ...p, __gid: gid })) ), asRef));
  const paths = (a, b, prefix = '', out = []) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) paths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
      return out;
    }
    out.push(prefix); return out;
  };
  const changed = new Set();
  before.games.forEach((g, gi) => {
    for (const p of paths(stats(g.plays, g.id), stats(after.games[gi].plays, g.id))) changed.add(p.replace(/\.\d+/g, '[]'));
  });
  proof.analyticsChanged = [...changed].sort();
  proof.analyticsUnexpected = proof.analyticsChanged.filter(p => !/ormation|look|Look|bigCall|calls|Calls|identity|Identity|matchup|Matchup|predict|tells|Tells|scout|Scout|diversity|Diversity/.test(p));
  return proof;
}

/** Convert a copy of a season FILE (a test fixture): unresolved plays keep a blank family and are listed. */
export function convertFixture(inFile, outFile, mapping = emptyMapping()) {
  const season = JSON.parse(readFileSync(inFile, 'utf8'));
  const out = clone(season);
  const result = convertSeason(out, mapping, path.basename(path.dirname(inFile)));
  // A fixture is not the coach's data: what could not be resolved is blank, never guessed.
  for (const game of out.games || []) for (const play of game.plays || []) {
    if (play.tags && has(play.tags, OLD_KEY)) {
      delete play.tags[OLD_KEY];
      if (!has(play.tags, 'formationFamily')) play.tags.formationFamily = '';
      if (!has(play.tags, 'receiverSet')) play.tags.receiverSet = '';
      for (const k of NEW_KEYS) if (!has(play.tags, k)) play.tags[k] = '';
    }
  }
  for (const call of out.playbook?.calls || []) if (call.defaults) delete call.defaults[OLD_KEY];
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out));
  return { result, problems: SeasonFormat.seasonProblems(out) };
}

const appRunning = () => execSync('tasklist /fo csv /nh', { encoding: 'utf8' }).split('\n').filter(l => /gridiron/i.test(l));

/** What the coach approves: the source it was computed from, the mapping it used and its exact effect. */
export function impactOf(report) {
  return {
    sourceHash: report.sourceHash, mappingHash: report.mappingHash,
    seasons: Object.fromEntries(report.seasons.map(s => [s.id, { name: s.name, plays: s.plays, withFormation: s.withFormation, converted: s.converted, unresolved: s.unresolved.length, old: s.old.length, dropped: s.dropped.length }])),
    copies: Object.fromEntries(Object.entries(report.copies).map(([k, c]) => [k, { total: c.total, converted: c.converted, current: c.current, leftUnresolved: c.leftUnresolved, leftOldFormat: c.leftOldFormat, leftOtherProblems: c.leftOtherProblems }])),
  };
}

/**
 * THE LIVE WRITE (coach-approved, run once). `approvedPath` is the impact.json the
 * coach said yes to. If the live catalog's hash or the recomputed effect differs
 * from it, nothing is written and a new review is needed. Refuses while GridIron
 * IQ runs. Backs up the catalog folder (film excluded: never written),
 * library.json and the Documents mirror, every copy hash-verified; converts;
 * validates the converted catalog BEFORE any replacement; re-checks that the app
 * is still closed and the catalog still has the backed-up bytes; swaps in a staged
 * file from the same folder; then reads it back.
 */
export async function apply({ backupDir, approvedPath, mapping, catalogPath = LIVE_CATALOG, mirror = path.join(os.homedir(), 'OneDrive', 'Documents', 'GridIron IQ'), rehearsal = false, onBeforeSwap = null }) {
  if (!backupDir) throw new Error('--backup <dir> is required');
  if (!approvedPath || !existsSync(approvedPath)) throw new Error('--approved <impact.json> from the reviewed rehearsal is required');
  const approved = JSON.parse(readFileSync(approvedPath, 'utf8'));
  const checkClosed = () => { const r = appRunning(); if (r.length && !rehearsal) throw new Error(`GridIron IQ is running; close it first (${r[0].trim()}). Nothing written.`); };
  checkClosed();
  if (existsSync(backupDir)) throw new Error(`backup folder already exists: ${backupDir}`);
  if (sha(readFileSync(catalogPath)) !== approved.sourceHash) throw new Error('library.db is not the catalog that was reviewed (it changed since the rehearsal). Run a new rehearsal and review it. Nothing written.');
  if (sha(JSON.stringify(mapping)) !== approved.mappingHash) throw new Error('the mapping is not the one that was reviewed. Nothing written.');

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

  const report = await run({ catalogPath, outDir: path.join(backupDir, 'run'), mapping });
  if (report.stops.length) throw new Error(`conversion stopped, nothing written: ${report.stops.join(' | ')}`);
  if (JSON.stringify(impactOf(report)) !== JSON.stringify(approved)) {
    writeFileSync(path.join(backupDir, 'run', 'impact.json'), JSON.stringify(impactOf(report), null, 1));
    throw new Error('the effect differs from the approved impact. Nothing written.');
  }
  const bytes = readFileSync(path.join(backupDir, 'run', 'converted.db'));
  if (sha(bytes) !== report.convertedHash) throw new Error('converted catalog does not match its report. Nothing written.');
  const remaining = await liveRemaining(bytes);
  if (remaining.length) throw new Error(`converted catalog still holds the retired Formation in: ${remaining.join(', ')}. Nothing written.`);

  const staged = path.join(appSeasons, `library.db.pending-${randomUUID()}`);
  writeFileSync(staged, bytes);
  if (sha(readFileSync(staged)) !== report.convertedHash) { rmSync(staged, { force: true }); throw new Error('staged catalog does not match. Nothing written.'); }
  if (rehearsal && onBeforeSwap) onBeforeSwap();
  try {
    checkClosed();
    if (sha(readFileSync(catalogPath)) !== backedUpHash) throw new Error('library.db changed after the backup. Nothing written.');
  } catch (e) { rmSync(staged, { force: true }); throw e; }
  renameSync(staged, catalogPath);

  const liveHash = sha(readFileSync(catalogPath));
  const after = await liveRemaining(readFileSync(catalogPath));
  return { ok: liveHash === report.convertedHash && !after.length, report, after, liveHash, backupFiles: manifest.length, backupDir };
}

/** Where the retired Formation still is in a catalog, among the documents the conversion converts. */
export async function liveRemaining(bytes) {
  const cat = await openCatalog(bytes);
  const where = [];
  for (const meta of cat.listSeasons()) {
    const season = cat.loadSeason(meta.id);
    if (playsOf(season).some(p => p?.tags && has(p.tags, OLD_KEY)) || (season.playbook?.calls || []).some(c => c?.defaults && has(c.defaults, OLD_KEY))) where.push(`season ${meta.id}`);
  }
  cat.close();
  return where;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const mapping = loadMapping(arg('--mapping'));
  const show = report => {
    for (const s of report.seasons) {
      console.log(`\n${s.name} (${s.id}): ${s.plays} plays, ${s.withFormation} with a Formation value; converts ${s.converted}, unresolved ${s.unresolved.length}, old alignment ${s.old.length}, coach-blanked ${s.dropped.length}; playbook defaults converted ${s.playbook?.converted}`);
      console.log('  tokens ' + JSON.stringify(s.tokens));
      if (s.proof) console.log('  proof ' + JSON.stringify({ ...s.proof, analyticsChanged: s.proof.analyticsChanged.length, details: s.proof.details.slice(0, 5) }));
    }
    for (const [k, c] of Object.entries(report.copies)) console.log(`\n${k}: ${JSON.stringify({ ...c, perSeason: undefined, tokens: undefined })}`);
    console.log('\nunresolved (live): ' + JSON.stringify(report.unresolvedTokens.map(u => `${u.reason} x${u.plays}`)));
  };
  if (process.argv.includes('--apply')) {
    const r = await apply({ backupDir: arg('--backup'), approvedPath: arg('--approved'), mapping });
    console.log(`backup: ${r.backupFiles} files, each hash-verified -> ${r.backupDir}`);
    console.log(`live catalog equals the converted copy: ${r.liveHash === r.report.convertedHash}; retired Formation remaining: ${r.after.length}`);
    if (!r.ok) console.log(`FAILED VERIFICATION after the swap. Restore library.db from ${path.join(r.backupDir, 'appdata-seasons', 'library.db')}.`);
    process.exit(r.ok ? 0 : 1);
  } else if (process.argv.includes('--fixture')) {
    const out = convertFixture(arg('--fixture'), arg('--out'), mapping);
    console.log(JSON.stringify({ converted: out.result.converted, unresolved: out.result.unresolved.length, old: out.result.old.length, problems: out.problems.length }));
  } else {
    const outDir = arg('--out');
    const write = process.argv.includes('--rehearse');
    const report = await run({ catalogPath: arg('--catalog') || LIVE_CATALOG, outDir, mapping, write });
    show(report);
    if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(path.join(outDir, 'impact.json'), JSON.stringify(impactOf(report), null, 1)); writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify(report, null, 1)); }
    console.log(`\nsource ${report.sourceHash.slice(0, 12)}; stops: ${report.stops.length ? report.stops.join(' | ') : 'none'}`);
  }
}
