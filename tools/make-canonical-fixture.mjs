#!/usr/bin/env node
/**
 * ONE-TIME: the canonical Reports season as a current-format fixture
 * (legacy excision Pass 2, step 7; coach decision 2026-09-26).
 *
 * The Reports real-data harnesses read the coach's registered 2025 JV season.
 * Its Documents-mirror copy predates the 2026-09-26 conversion, and once the
 * old-format readers are deleted nothing can read it. This writes a CONVERTED
 * COPY, by the same rule as the live conversion (convert what maps exactly,
 * blank the rest), to a fixture folder outside Documents. The mirror file is
 * only read and is hash-checked unchanged. The coach will retag its Special
 * Teams plays (all 75 were old format), so its Special Teams reports are empty.
 *
 *   node tools/make-canonical-fixture.mjs
 * Delete with convert-legacy-once.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadNormalize, convertPlay } from './convert-legacy-once.mjs';
import { SeasonStore } from '../js/season-store.js';
import { SeasonFormat } from '../js/season-format.js';
import { CANONICAL_SEASON, CANONICAL_SOURCE_MIRROR } from './canonical-season.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const raw = readFileSync(CANONICAL_SOURCE_MIRROR);
const before = sha(raw);
const season = JSON.parse(raw.toString('utf8'));

// Rosters first, through the app's own validated conversion (game-node copies
// must agree, or nothing is chosen).
const adopted = SeasonStore.adoptLegacyRoster(season);
if (adopted.status === 'conflict') throw new Error(`roster copies disagree: ${JSON.stringify(adopted.conflict)}`);
const data = adopted.data;

const counts = { plays: 0, unit: 0, look: 0, fgXp: 0, blanked: 0, returnYards: 0 };
for (const g of data.games) for (const p of g.plays || []) {
  loadNormalize(p);
  const r = convertPlay(p);
  counts.plays++;
  if (r.unit) counts.unit++;
  if (r.look) counts.look++;
  if (r.fgExtraPoint) counts.fgXp++;
  if (r.recharts) counts.blanked++;
  if (r.returnYardsMoved != null) counts.returnYards++;
}
const problems = SeasonFormat.seasonProblems(data);
if (problems.length) throw new Error(`fixture still has old shapes: ${JSON.stringify(problems.slice(0, 5))}`);

mkdirSync(path.dirname(CANONICAL_SEASON), { recursive: true });
if (existsSync(CANONICAL_SEASON)) throw new Error(`fixture already exists: ${CANONICAL_SEASON}`);
writeFileSync(CANONICAL_SEASON, JSON.stringify(data));
if (sha(readFileSync(CANONICAL_SOURCE_MIRROR)) !== before) throw new Error('THE MIRROR FILE CHANGED');
console.log(JSON.stringify({ fixture: CANONICAL_SEASON, sourceHash: before, fixtureHash: sha(readFileSync(CANONICAL_SEASON)), roster: (data.roster || []).length, counts }, null, 1));
