#!/usr/bin/env node
/**
 * THROWAWAY (delete with tools/convert-charting-once.mjs): what the coach needs to
 * decide each unresolved Formation value, from a READ-ONLY copy of the catalog.
 * For every distinct token in the live seasons: how many plays and games carry it,
 * which other tokens ride with it, and the Personnel, Backfield and QB Alignment
 * charted on those plays. It states what the data shows; it maps nothing.
 *
 *   node tools/charting-decision-support.mjs [--catalog <library.db>] [--md <out.md>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqlCatalog } from '../js/sql-catalog.js';
import { LIVE_CATALOG } from './convert-charting-once.mjs';
import { DETERMINISTIC, tokensOf } from './charting-convert.mjs';

const top = (map, n = 4) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k || '(blank)'} ${v}`).join(', ');
const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);

export async function support(catalogPath = LIVE_CATALOG) {
  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL);
  await cat.open(readFileSync(catalogPath));
  const tokens = new Map();
  let combos = new Map();
  for (const meta of cat.listSeasons()) {
    const season = cat.loadSeason(meta.id);
    for (const game of season.games || []) for (const play of game.plays || []) {
      const t = play.tags || {};
      const list = tokensOf(t.formation);
      if (!list.length) continue;
      bump(combos, list.join(' + '));
      for (const token of list) {
        const e = tokens.get(token) || { plays: 0, seasons: new Set(), games: new Set(), with: new Map(), personnel: new Map(), backfield: new Map(), qb: new Map(), alone: 0 };
        e.plays++; e.seasons.add(season.seasonName || meta.name); e.games.add(`${season.seasonName || meta.name} / ${game.name}`);
        if (list.length === 1) e.alone++;
        for (const other of list) if (other !== token) bump(e.with, other);
        bump(e.personnel, t.personnel || ''); bump(e.backfield, t.backfield || ''); bump(e.qb, t.qbAlignment || '');
        tokens.set(token, e);
      }
    }
  }
  cat.close();
  return { tokens, combos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { tokens, combos } = await support(arg('--catalog') || LIVE_CATALOG);
  const rows = [...tokens].sort((a, b) => b[1].plays - a[1].plays);
  const md = [];
  md.push('| Value | Plays | On its own | Games | Rides with | Personnel | Backfield | QB alignment | Proposed |');
  md.push('|---|---:|---:|---:|---|---|---|---|---|');
  for (const [token, e] of rows) {
    const rule = DETERMINISTIC[token];
    md.push(`| ${token} | ${e.plays} | ${e.alone} | ${e.games.size} | ${top(e.with, 3) || '-'} | ${top(e.personnel, 3)} | ${top(e.backfield, 3)} | ${top(e.qb, 3)} | ${rule ? `Family ${rule.formationFamily} (exact name)` : '**needs your decision**'} |`);
  }
  md.push('', '| Stored value (exact) | Plays |', '|---|---:|');
  for (const [value, n] of [...combos].sort((a, b) => b[1] - a[1])) md.push(`| ${value} | ${n} |`);
  const out = md.join('\n');
  if (arg('--md')) writeFileSync(arg('--md'), out + '\n');
  console.log(out);
}
