/* THROWAWAY with tools/convert-charting-once.mjs: the rehearsal proof of the one-time
   Formation -> Family / Receiver Alignment conversion, on synthetic catalogs in a scratch
   folder. Never touches coach data. Run: node tools/e2e-charting-convert.mjs */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { SqlCatalog } from '../js/sql-catalog.js';
import { SeasonFormat } from '../js/season-format.js';
import { decide, convertPlay, convertPlaybook, mappingProblems, emptyMapping } from './charting-convert.mjs';
import { run, apply, impactOf, liveRemaining, convertFixture, proveSeason } from './convert-charting-once.mjs';

let pass = 0, fail = 0;
const ok = (value, label, extra = '') => { console.log(`${value ? '  PASS' : '  FAIL'}  ${label}${!value && extra ? ` -- ${extra}` : ''}`); value ? pass++ : fail++; };
const sha = b => createHash('sha256').update(b).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n== decide(): what a stored Formation becomes ==');
const M = { tokens: { Trips: { receiverSet: '3x1' }, Ace: { formationFamily: 'Ace' }, Victory: { blank: true } }, plays: {} };
ok(decide('', emptyMapping()).status === 'blank', 'a blank Formation stays blank');
ok(same(decide('Power-I', emptyMapping()), { status: 'convert', formationFamily: 'Power-I', receiverSet: '', dropped: [] }), 'an exact Family name converts with no mapping');
{
  const d = decide('Coach Special', emptyMapping());
  ok(d.status === 'unresolved' && /"Coach Special" has no mapping/.test(d.reasons[0]), 'an unknown coach name is unresolved until mapped', JSON.stringify(d));
}
ok(same(decide('Spread + Trips', M), { status: 'convert', formationFamily: 'Spread', receiverSet: '3x1', dropped: [] }), 'a Family and a coach-mapped receiver word convert together');
ok(decide('Spread + Trips', emptyMapping()).status === 'unresolved', 'the same value is unresolved without the coach mapping');
ok(decide('Spread + Wing-T', M).status === 'unresolved' && /two families/.test(decide('Spread + Wing-T', M).reasons[0]), 'two families in one value are unresolved, never picked between');
ok(decide('Trips + Trips', { tokens: { Trips: { receiverSet: '3x1' } } }).status === 'convert', 'a repeated word is one word');
ok(decide('Spread + Shotgun', M).status === 'old-format' && decide('Empty', M).status === 'old-format', 'an old alignment or Empty in Formation is the old combined look: not converted');
{
  const d = decide('Spread + Victory', M);
  ok(d.status === 'convert' && d.formationFamily === 'Spread' && same(d.dropped, ['Victory']), 'a token the coach blanked is dropped and reported', JSON.stringify(d));
}
ok(same(decide('Ace + Twins', { ...M, plays: { 's|g|1': { formationFamily: 'I-Form', receiverSet: '2x1' } } }, 's|g|1'), { status: 'convert', formationFamily: 'I-Form', receiverSet: '2x1', dropped: [], override: true }), 'a per-play retag overrides the token mapping');
ok(mappingProblems({ tokens: { A: { receiverSet: '9x9' }, B: { formationFamily: 'Shotgun' }, C: {} }, plays: {} }).length === 3, 'a mapping naming an unoffered set, an alignment as a family, or nothing is invalid');

console.log('\n== convertPlay(): identity and unrelated tags stay ==');
{
  const play = { id: 7, timestamp: { start: 1, end: 2 }, clipPath: 'A/x.mp4', notes: 'n', tags: { unit: 'offense', formation: 'Spread + Trips', qbAlignment: 'Shotgun', down: '2', playType: 'Run Inside', players: { ballCarrier: '4' }, custom: ['x'] } };
  const before = JSON.parse(JSON.stringify(play));
  const r = convertPlay(play, M, 's|g|7');
  ok(r.status === 'convert' && !('formation' in play.tags) && play.tags.formationFamily === 'Spread' && play.tags.receiverSet === '3x1', 'the play gains Family and Set and loses formation');
  const strip = p => { const t = { ...p.tags }; for (const k of ['formation', 'formationFamily', 'receiverSet', 'receiverLook', 'gap', 'motionStart', 'motionEnd', 'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun']) delete t[k]; return { ...p, tags: t }; };
  ok(same(strip(play), strip(before)), 'identity, film references, notes and every unrelated tag are byte-equal');
  ok(['gap', 'motionStart', 'motionEnd', 'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun'].every(k => play.tags[k] === ''), 'the new detail keys are added blank, as a new play is born');
  ok(SeasonFormat.playProblems(play).length === 0, 'the converted play is the current format');
  const again = JSON.stringify(play); convertPlay(play, M, 's|g|7');
  ok(JSON.stringify(play) === again, 'converting twice changes nothing');
  const unresolved = { id: 8, tags: { unit: 'offense', formation: 'Coach Special' } }, copy = JSON.stringify(unresolved);
  const u = convertPlay(unresolved, M, 's|g|8');
  ok(u.status === 'unresolved' && JSON.stringify(unresolved) === copy, 'an unresolved play is left exactly as stored');
}
{
  const book = { calls: [{ name: '26 Blast', defaults: { formation: 'Power-I', playType: 'Run Inside' } }, { name: 'Odd', defaults: { formation: 'Coach Special' } }] };
  const r = convertPlaybook(book, emptyMapping(), 'S');
  ok(book.calls[0].defaults.formationFamily === 'Power-I' && !('formation' in book.calls[0].defaults) && r.unresolved.length === 1 && book.calls[1].defaults.formation === 'Coach Special', 'a play call default converts by the same rule; an unresolved one stays');
}

console.log('\n== A catalog rehearsal, the live write and its refusals ==');
const SQL = await (await import('sql.js')).default();
const mkPlay = (id, formation, extra = {}) => ({ id, timestamp: { start: id, end: id + 1 }, clipName: `c${id}.mp4`, clipPath: `Wk/c${id}.mp4`, notes: '', annotations: [],
  tags: { unit: 'offense', down: '1', distance: '10', formation, qbAlignment: 'Shotgun', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', players: {}, grades: {}, custom: [], ...extra } });
const season = id => ({ version: 5, type: 'season', id, seasonName: `Season ${id}`, team: 'T', year: '2025', level: 'JV', roster: [], activeGameId: `${id}-g1`,
  playbook: { version: 1, calls: [{ id: 'call_a', name: 'A', concept: '', favorite: false, defaults: { formation: 'Power-I' } }] }, plans: [],
  games: [{ id: `${id}-g1`, name: 'Wk1', gameInfo: {}, status: 'active', nextId: 6, plays: [mkPlay(1, 'Power-I'), mkPlay(2, 'Spread + Trips'), mkPlay(3, 'Trips'), mkPlay(4, ''), mkPlay(5, 'Ace')] }] });

console.log('\n== Takeaway proof: exact approved Formation, not a blanket exemption ==');
{
  const before = season('takeaways');
  before.games[0].plays = Array.from({ length: 12 }, (_, i) => mkPlay(i + 1, 'Power-I', { yardage: '8' }));
  const after = structuredClone(before);
  for (const play of after.games[0].plays) convertPlay(play, emptyMapping(), `takeaways|takeaways-g1|${play.id}`);
  const good = proveSeason(before, after);
  ok(good.analyticsChanged.includes('takeaways.fix') && good.analyticsChanged.includes('takeaways.working') && good.analyticsUnexpected.length === 0 && good.takeawayProjection === true, 'formation recommendations and top-five ranking match the exact approved projection', JSON.stringify(good));
  for (const play of after.games[0].plays) play.tags.formationFamily = 'Trips';
  const wrongName = proveSeason(before, after);
  ok(wrongName.takeawayProjection === false && wrongName.analyticsUnexpected.some(p => p.startsWith('takeaways.')), 'a different Formation recommendation is refused even though it is formation-derived', JSON.stringify(wrongName));
  for (const play of after.games[0].plays) play.tags.formationFamily = 'Power-I';
  after.games[0].plays.forEach(play => { play.tags.yardage = '-8'; play.tags.result = 'Loss'; });
  const wrongYards = proveSeason(before, after);
  ok(wrongYards.takeawayProjection === false && wrongYards.analyticsUnexpected.some(p => p.startsWith('takeaways.')), 'an unrelated performance change cannot hide inside takeaway ranking', JSON.stringify(wrongYards));
}
async function makeCatalog(dir) {
  const cat = new SqlCatalog(SQL); await cat.open();
  cat.saveSeason(season('a')); cat.saveSeason(season('b'));
  // a restore point and a game version that carry the old field too
  cat.createBackup('a', season('a'), 'test');
  cat.saveVersion('a', 'a-g1', { id: 'v1', t: new Date().toISOString(), label: 'v', manual: true, plays: season('a').games[0].plays, name: 'Wk1' });
  mkdirSync(path.join(dir, 'appdata', 'seasons'), { recursive: true });
  const file = path.join(dir, 'appdata', 'seasons', 'library.db');
  writeFileSync(file, cat.toBytes()); writeFileSync(path.join(dir, 'appdata', 'library.json'), '{}');
  cat.close();
  return file;
}
const tmp = mkdtempSync(path.join(os.tmpdir(), 'charting-convert-'));
try {
  const file = await makeCatalog(tmp);
  const sourceHash = sha(readFileSync(file));
  // 1. rehearsal with no coach mapping: what resolves converts, the rest is listed
  const r0 = await run({ catalogPath: file, outDir: path.join(tmp, 'r0'), mapping: emptyMapping() });
  ok(sha(readFileSync(file)) === sourceHash, 'a rehearsal never writes the source catalog');
  const sa = r0.seasons.find(s => s.id === 'a');
  ok(sa.plays === 5 && sa.withFormation === 4 && sa.converted === 3 && sa.unresolved.length === 1, 'exact named formations convert while a compound remains unresolved', JSON.stringify({ c: sa.converted, u: sa.unresolved.length }));
  ok(r0.seasons.every(s => s.unresolved.length === 1 && s.unresolved[0].oldValue === 'Spread + Trips'), 'the unresolved list names the exact compound');
  ok(sa.proof.identity && sa.proof.filmRefs && sa.proof.unrelatedTags && sa.proof.otherPlayFields && sa.proof.gameFields && sa.proof.roundTrip, 'identity, film references, unrelated tags and the catalog round trip all hold', JSON.stringify(sa.proof));
  ok(sa.proof.analyticsUnexpected.length === 0, 'analytics differ only in formation-derived values', JSON.stringify(sa.proof.analyticsUnexpected));
  const strengthMapping = { combinations: { 'Spread + Trips': { formationFamily: 'Spread', receiverSet: '3x1', strength: 'Unbalanced Left' } }, tokens: {}, plays: {} };
  const rs = await run({ catalogPath: file, outDir: path.join(tmp, 'r-strength'), mapping: strengthMapping });
  ok(rs.seasons.every(s => s.proof.unrelatedTags && s.proof.analyticsUnexpected.length === 0), 'explicit strength mappings pass preservation and analytics proofs', JSON.stringify(rs.seasons.map(s => s.proof)));
  const strengthBefore = season('proof'), strengthAfter = structuredClone(strengthBefore);
  const mappedPlay = strengthAfter.games[0].plays[1];
  convertPlay(mappedPlay, strengthMapping, 'proof|proof-g1|2');
  mappedPlay.tags.strength = 'Unbalanced Right';
  ok(!proveSeason(strengthBefore, strengthAfter, strengthMapping).unrelatedTags, 'a strength different from the explicit mapping fails preservation');
  mappedPlay.tags.strength = 'Unbalanced Left';
  strengthAfter.games[0].plays[0].tags.strength = 'Left';
  ok(!proveSeason(strengthBefore, strengthAfter, strengthMapping).unrelatedTags, 'an unmapped strength change also fails preservation');
  ok(r0.copies.backups.total === 1 && r0.copies.versions.total === 1, 'restore points and game versions are inventoried');
  // 2. the full mapping
  const mapping = { tokens: { Trips: { receiverSet: '3x1' }, Ace: { formationFamily: 'Ace' } }, plays: {} };
  const r1 = await run({ catalogPath: file, outDir: path.join(tmp, 'r1'), mapping });
  ok(r1.seasons.every(s => s.unresolved.length === 0 && s.old.length === 0), 'with every value mapped nothing is unresolved');
  ok(r1.copies.backups.converted === 1 && r1.copies.versions.converted === 1, 'restore points and versions convert by the same mapping');
  const conv = new SqlCatalog(SQL); await conv.open(readFileSync(path.join(tmp, 'r1', 'converted.db')));
  const sb = conv.loadSeason('b');
  ok(SeasonFormat.seasonProblems(sb).length === 0 && sb.playbook.calls[0].defaults.formationFamily === 'Power-I' && sb.games[0].plays[1].tags.formationFamily === 'Spread' && sb.games[0].plays[1].tags.receiverSet === '3x1', 'the converted season is current format, including its playbook', JSON.stringify(SeasonFormat.seasonProblems(sb).slice(0, 2)));
  conv.close();
  ok((await liveRemaining(readFileSync(path.join(tmp, 'r1', 'converted.db')))).length === 0, 'no season keeps the retired Formation');
  const approvedPath = path.join(tmp, 'impact.json'); writeFileSync(approvedPath, JSON.stringify(impactOf(r1)));
  // 3. refusals: nothing is written
  const refuse = async (label, args, re) => {
    let err = null; try { await apply({ rehearsal: true, ...args }); } catch (e) { err = e; }
    ok(err && re.test(err.message) && sha(readFileSync(file)) === sourceHash, label, err ? err.message : 'no error');
  };
  await refuse('an unresolved value stops the write', { backupDir: path.join(tmp, 'b-unres'), approvedPath: (() => { const p = path.join(tmp, 'imp0.json'); writeFileSync(p, JSON.stringify(impactOf(r0))); return p; })(), mapping: emptyMapping(), catalogPath: file, mirror: path.join(tmp, 'none') }, /still holds the retired Formation/);
  await refuse('a mapping other than the reviewed one stops the write', { backupDir: path.join(tmp, 'b-map'), approvedPath, mapping: { tokens: { Trips: { receiverSet: '2x2' }, Ace: { formationFamily: 'Ace' } }, plays: {} }, catalogPath: file, mirror: path.join(tmp, 'none') }, /not the one that was reviewed/);
  await refuse('a catalog that changed since the review stops the write', { backupDir: path.join(tmp, 'b-changed'), approvedPath: (() => { const p = path.join(tmp, 'imp-old.json'); writeFileSync(p, JSON.stringify({ ...impactOf(r1), sourceHash: 'x' })); return p; })(), mapping, catalogPath: file, mirror: path.join(tmp, 'none') }, /changed since the (dry run|rehearsal)|not the catalog that was reviewed/);
  let err = null;
  try { await apply({ rehearsal: true, backupDir: path.join(tmp, 'b-race'), approvedPath, mapping, catalogPath: file, mirror: path.join(tmp, 'none'), onBeforeSwap: () => writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from([0])])) }); } catch (e) { err = e; }
  ok(err && /changed after the backup/.test(err.message) && !readdirSync(path.dirname(file)).some(n => n.includes('pending')), 'a change between the backup and the swap stops it and leaves no staged file', err ? err.message : 'no error');
  writeFileSync(file, readFileSync(path.join(tmp, 'b-race', 'appdata-seasons', 'library.db')));   // put the source back exactly
  ok(sha(readFileSync(file)) === sourceHash, 'the source is byte-identical again after that refusal');
  // 4. the write
  const result = await apply({ rehearsal: true, backupDir: path.join(tmp, 'b-ok'), approvedPath, mapping, catalogPath: file, mirror: path.join(tmp, 'none') });
  ok(result.ok && result.after.length === 0 && result.liveHash === result.report.convertedHash, 'the swap reads back as the converted catalog with no retired Formation');
  const manifest = JSON.parse(readFileSync(path.join(tmp, 'b-ok', 'manifest.json'), 'utf8'));
  ok(manifest.length >= 2 && manifest.some(m => m.source === file && m.sha256 === sourceHash) && sha(readFileSync(path.join(tmp, 'b-ok', 'appdata-seasons', 'library.db'))) === sourceHash, 'the immutable restore point holds the exact pre-write catalog, hash-verified');
  ok(!readdirSync(path.dirname(file)).some(n => n.includes('pending')), 'no staged file is left behind');
  const proofDir = path.join(tmp, 'failed-proof'), proofFile = await makeCatalog(proofDir);
  const proofHash = sha(readFileSync(proofFile));
  const proofReport = await run({ catalogPath: proofFile, outDir: path.join(proofDir, 'run'), mapping });
  const proofApproved = path.join(proofDir, 'impact.json'); writeFileSync(proofApproved, JSON.stringify(impactOf(proofReport)));
  const saveSeason = SqlCatalog.prototype.saveSeason;
  let proofError = null;
  try {
    SqlCatalog.prototype.saveSeason = function(data) {
      const altered = structuredClone(data); altered.games[0].plays[0].notes = 'unexpected durable change';
      return saveSeason.call(this, altered);
    };
    await apply({ rehearsal: true, backupDir: path.join(proofDir, 'backup'), approvedPath: proofApproved, mapping, catalogPath: proofFile, mirror: path.join(tmp, 'none') });
  } catch (e) { proofError = e; } finally { SqlCatalog.prototype.saveSeason = saveSeason; }
  ok(proofError && /proof/.test(proofError.message) && sha(readFileSync(proofFile)) === proofHash && !readdirSync(path.dirname(proofFile)).some(n => n.includes('pending')), 'a failed catalog round-trip proof stops before staging or swapping', proofError?.message || 'write was accepted');
  const invalidDir = path.join(tmp, 'invalid-format');
  const invalidFile = await makeCatalog(invalidDir);
  const invalidCat = new SqlCatalog(SQL); await invalidCat.open(readFileSync(invalidFile));
  const invalidSeason = invalidCat.loadSeason('a');
  invalidSeason.games[0].plays[0].tags.lineBalance = '';
  invalidCat.saveSeason(invalidSeason); writeFileSync(invalidFile, invalidCat.toBytes()); invalidCat.close();
  const invalidHash = sha(readFileSync(invalidFile));
  const invalidReport = await run({ catalogPath: invalidFile, outDir: path.join(invalidDir, 'run'), mapping });
  const invalidApproved = path.join(invalidDir, 'impact.json'); writeFileSync(invalidApproved, JSON.stringify(impactOf(invalidReport)));
  let invalidError = null;
  try { await apply({ rehearsal: true, backupDir: path.join(invalidDir, 'backup'), approvedPath: invalidApproved, mapping, catalogPath: invalidFile, mirror: path.join(tmp, 'none') }); } catch (e) { invalidError = e; }
  ok(invalidReport.seasons.some(s => s.proof.currentFormat > 0) && invalidError && /proof|format/.test(invalidError.message) && sha(readFileSync(invalidFile)) === invalidHash && !readdirSync(path.dirname(invalidFile)).some(n => n.includes('pending')), 'a non-current converted season stops before staging or replacing the catalog', invalidError?.message || 'write was accepted');
  // 5. a fixture
  const fixIn = path.join(tmp, 'fix-in.json'), fixOut = path.join(tmp, 'fix-out.json');
  writeFileSync(fixIn, JSON.stringify(season('f')));
  const fx = convertFixture(fixIn, fixOut, emptyMapping());
  const out = JSON.parse(readFileSync(fixOut, 'utf8'));
  ok(fx.problems.length === 0 && out.games[0].plays[0].tags.formationFamily === 'Power-I' && out.games[0].plays[2].tags.formationFamily === 'Trips' && out.games[0].plays[1].tags.formationFamily === '' && fx.result.unresolved.length > 0 && !('formation' in out.games[0].plays[2].tags), 'a test fixture keeps exact formation names and lists unresolved compounds without guessing');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
