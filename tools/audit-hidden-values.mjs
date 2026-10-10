/**
 * Lists every play in the desktop library that holds a value it cannot show
 * (PlayShape.hidden): the coach's fix list, docs/HIDDEN-VALUES-LIST.md.
 * Reads a copy of the live library and checks the live file's hash is
 * unchanged; writes nothing to coach data.
 *
 *   node tools/audit-hidden-values.mjs [out.md]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { PlayShape } from '../js/play-shape.js';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { countedUnit } from '../js/football-rules.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const live = path.join(process.env.APPDATA || '', 'com.gridironiq.app', 'seasons', 'library.db');
const out = process.argv[2] || 'docs/HIDDEN-VALUES-LIST.md';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const before = hash(live);
const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'giq-audit-')), 'library.db');
fs.copyFileSync(live, copy);
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(copy));
const result = db.exec(`SELECT s.name, g.name, p.body_json FROM plays p
  JOIN games g ON g.id = p.game_id JOIN seasons s ON s.id = g.season_id
  WHERE s.is_demo = 0 ORDER BY s.name, g.ord, p.ord`)[0];

const unitLabel = play => {
  const unit = countedUnit(play);
  if (unit !== 'special') return unit === 'defense' ? 'Defense' : 'Offense';
  const st = SpecialTeamsModel.normalize(play.specialTeams);
  const name = st ? (SpecialTeamsModel.unitOptions().find(([key]) => key === st.unit)?.[1] || st.unit) : 'Special Teams (no type)';
  return SpecialTeamsModel.isRunPassTry(play) ? `${name}, Run/Pass` : st?.isFake ? `${name}, Fake` : name;
};
const fieldLabel = field => field.replace(/^players\./, 'Player: ').replace(/^grades\./, 'Grade: ');

const seasons = new Map();
let total = 0, flagged = 0;
for (const [season, game, body] of result?.values || []) {
  total++;
  const play = JSON.parse(body);
  const hidden = PlayShape.hidden(play);
  if (!hidden.length) continue;
  flagged++;
  if (!seasons.has(season)) seasons.set(season, new Map());
  const games = seasons.get(season);
  if (!games.has(game)) games.set(game, []);
  games.get(game).push(`| ${play.id} | ${unitLabel(play)} | ${hidden.map(item => `${fieldLabel(item.field)} = ${item.value}`).join('; ')} |`);
}

const lines = [
  '# Plays holding values they cannot show',
  '',
  'Each play below stores a value its unit or Special Teams type does not show,',
  'so Chart cannot display or change it. Re-chart the play (set the unit or type',
  'it was meant to have, or save it as it is) and saving drops what the play',
  'cannot show. Regenerate with `node tools/audit-hidden-values.mjs`; delete this',
  'file when the list is empty.',
  '',
  `Read ${new Date().toISOString().slice(0, 10)} from a copy of the desktop library: ${flagged} of ${total} plays.`,
  '',
];
for (const [season, games] of seasons) {
  lines.push(`## ${season}`, '');
  for (const [game, rows] of games) lines.push(`### ${game}`, '', '| Play | Unit | Stored but not shown |', '|---|---|---|', ...rows, '');
}
fs.writeFileSync(out, lines.join('\n'));
const unchanged = hash(live) === before;
console.log(`${flagged} of ${total} plays listed in ${out}; live library unchanged: ${unchanged}`);
if (!unchanged) process.exit(1);
