/* Charting cutover, Step 1 model contract: Formation / Receiver Alignment, Gap, motion
   path, RPO, QB run and Reverse (GRIDIRON-IQ-PLAN-V2.md, "Approved Break Down
   charting comp - build contract"). Pure model checks; the deck, Film Room and CSV
   have their own harnesses. Run: node tools/e2e-charting-details.mjs */
import { ChartingDetails } from '../js/charting-details.js';
import { TagLibrary } from '../js/tag-library.js';
import { TagProjection } from '../js/tag-projection.js';
import { SeasonFormat } from '../js/season-format.js';
import { StatsEngine } from '../js/stats-engine.js';
import { PlayTagger } from '../js/play-tagger.js';
import { PlayCallModel } from '../js/play-call-model.js';
import { SeasonStore } from '../js/season-store.js';
import { groupPlaysByDrive } from '../js/football-rules.js';

let pass = 0, fail = 0;
const ok = (value, label, extra = '') => { console.log(`${value ? '  PASS' : '  FAIL'}  ${label}${!value && extra ? ` -- ${extra}` : ''}`); value ? pass++ : fail++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
class MemoryStorage { constructor(seed = {}) { this.data = new Map(Object.entries(seed)); } getItem(k) { return this.data.get(k) ?? null; } setItem(k, v) { this.data.set(k, String(v)); } removeItem(k) { this.data.delete(k); } }

console.log('\n== Vocabulary ==');
{
  const kick = (id, quarter, unit = 'kickoffReturn', outcome = {}) => ({ id,
    tags: { unit: 'special', quarter, driveNumber: '' }, specialTeams: { unit, outcome } });
  const snap = (id, quarter, number = '5', unit = 'offense') => ({ id,
    tags: { unit, quarter, driveNumber: number } });
  const ids = g => g.plays.map(p => p.id).join();
  const halftime = [kick(43, 'Q2', 'kickoff'), kick(44, 'Q3'), snap(45, 'Q3')];
  const before = JSON.stringify(halftime);
  const groups = groupPlaysByDrive(halftime);
  ok(groups.length === 2 && groups[0].label === 'End of half' && ids(groups[0]) === '43'
    && groups[1].label === 'Our Drive 5' && ids(groups[1]) === '44,45', 'halftime kickoff stays separate; second-half kick joins only its own drive');
  ok(JSON.stringify(halftime) === before, 'kickoff grouping never writes charted tags');
  const touchdown = kick(1, 'Q1', 'kickoffReturn', { status: 'returned', score: 'touchdown', scoredBy: 'subject' });
  const attempt = { id: 2, tags: { unit: 'special', quarter: 'Q1' }, specialTeams: { unit: 'try', result: 'converted', attemptType: 'extraPoint' } };
  const scoring = groupPlaysByDrive([touchdown, attempt, kick(3, 'Q1', 'kickoff'), snap(4, 'Q1', '1', 'defense')]);
  ok(scoring.length === 2 && scoring[0].label === 'Kick return touchdown' && ids(scoring[0]) === '1,2'
    && scoring[1].label === 'Opponent Drive 1' && ids(scoring[1]) === '3,4', 'return TD and try form one scoring possession, not the next drive');
  const first = kick(1, 'Q1');
  first.penalties = [{ playCounts: false }];
  const rekick = groupPlaysByDrive([first, kick(2, 'Q1'), snap(3, 'Q1')]);
  ok(rekick.length === 1 && ids(rekick[0]) === '1,2,3', 'an explicitly nullified kick and its re-kick stay together');
  const consecutive = groupPlaysByDrive([kick(1, 'Q1'), kick(2, 'Q1'), snap(3, 'Q1')]);
  ok(consecutive.length === 2 && ids(consecutive[0]) === '1' && ids(consecutive[1]) === '2,3', 'unexplained consecutive kicks never borrow each other\'s drive');
  const quarter = groupPlaysByDrive([kick(1, 'Q1'), snap(2, 'Q2')]);
  ok(quarter.length === 1 && ids(quarter[0]) === '1,2', 'ordinary quarter change is not a halftime boundary');
  const assigned = kick(1, 'Q1'); assigned.tags.driveNumber = '8';
  const manual = groupPlaysByDrive([assigned, snap(2, 'Q1', '5')]);
  ok(manual.some(g => g.number === '8' && ids(g) === '1'), 'explicit kickoff drive number is never replaced by the next snap\'s number');
}
{
  const engine = new StatsEngine();
  const sack = { id: 2, tags: { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', result: 'Sack', yardage: '-7', players: { passer: '12' } } };
  const completion = { id: 1, tags: { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '20', players: { passer: '12' } } };
  const stats = engine.compute([completion, sack]);
  ok(stats.passing.attempts === 1 && stats.passing.yards === 20 && stats.passing.average === '20.0', 'sacks never enter passing attempts or yards');
  ok(stats.rushing.attempts === 1 && stats.rushing.yards === -7, 'a sack is a team rushing attempt and lost rushing yards');
  ok(stats.rushing.yards + stats.passing.yards === 13, 'reassigning sack yards preserves total offense');
  const qb = stats.individuals.rushers.find(p => p.num === '12');
  ok(qb?.attempts === 1 && qb.yards === -7, 'the charted passer receives the sack rushing attempt and loss');
  ok(stats.individuals.passers[0].attempts === 1 && stats.individuals.passers[0].yards === 20 && stats.individuals.passers[0].sacks === 1, 'QB passing line excludes sack yards and still records sacks');
  ok(StatsEngine.isPass(sack) && !StatsEngine.isRun(sack), 'a sack retains its called-pass classification');
  const faced = [completion, sack].map(p => ({ ...p, tags: { ...p.tags, unit: 'defense' } }));
  const opponent = engine.opponentProduction(faced, faced);
  ok(opponent.rushing.attempts === 1 && opponent.rushing.yards === -7 && opponent.passing.yards === 20, 'opponent production uses the same sack convention');
  const defense = engine.defenseDashboard(faced).summary;
  ok(defense.runYards === -7 && defense.passYards === 20 && defense.yards === 13, 'Defense board reallocates sack losses without changing total yards');
  const unknown = engine.compute([{ ...sack, tags: { ...sack.tags, players: {} } }]);
  ok(unknown.rushing.attempts === 1 && unknown.individuals.rushers.length === 0, 'an uncharted passer is not guessed; the team still receives the sack loss');
  const nonQb = engine.compute([{ ...sack, tags: { ...sack.tags, players: { passer: '88', ballCarrier: '12' } } }]);
  ok(nonQb.individuals.rushers.length === 1 && nonQb.individuals.rushers[0].num === '88' && nonQb.individuals.rushers[0].yards === -7,
    'sack loss belongs to the passer regardless of position or a different ball carrier');
  const carrierOnly = engine.compute([{ ...sack, tags: { ...sack.tags, players: { ballCarrier: '12' } } }]);
  ok(carrierOnly.rushing.attempts === 1 && carrierOnly.individuals.rushers.length === 0,
    'blank Passer never falls back to Ball Carrier on a sack');
  const overlap = engine.compute([{ ...sack, tags: { ...sack.tags, result: 'Sack + Gain' } }]);
  ok(overlap.passing.attempts === 0 && overlap.passing.yards === 0 && overlap.individuals.passers[0].attempts === 0, 'Sack excludes passing credit even with another result chip');
}
{
  const plays = [
    { id: 1, tags: { unit: 'offense', driveNumber: '2' } },
    { id: 2, tags: { unit: 'offense', driveNumber: '1' } },
    { id: 3, tags: { unit: 'offense', driveNumber: '2' } },
  ];
  const before = JSON.stringify(plays);
  const groups = groupPlaysByDrive(plays);
  ok(same(groups.map(g => [g.number, g.plays.map(p => p.id)]), [['1', [2]], ['2', [1, 3]]]), 'assigned drives collect nonadjacent plays and override play-number order');
  ok(JSON.stringify(plays) === before, 'drive grouping never changes stored plays');
  const tags = { playDir: 'Middle', gap: 'L-A' };
  ChartingDetails.settle(tags, 'gap');
  ok(tags.playDir === 'Middle' && tags.gap === 'L-A' && !ChartingDetails.problems(tags).length, 'Middle and a precise lateral Gap remain independent');
  for (const playDir of ['', 'Left', 'Middle', 'Right']) {
    ok(!SeasonFormat.playProblems({ id: 1, tags: { unit: 'offense', playDir, gap: 'L-A' } }).length,
      `format boundary accepts lateral Gap with Direction ${playDir || '(blank)'}`);
  }
  const passes = [
    { id: 1, tags: { unit: 'offense', runPass: 'Pass', result: 'Gain', yardage: '8' } },
    { id: 1, tags: { unit: 'offense', runPass: 'Pass', result: 'Incomplete', yardage: '0' } },
  ];
  const passing = new StatsEngine().compute(passes).passing;
  ok(passing.attempts === 2, 'different games may reuse a play ID without losing a pass attempt', JSON.stringify(passing));
  ok(passing.completionPct === '50.0' && passing.average === '4.0', 'season completion percentage and yards per attempt use both games');
  ok(new StatsEngine().compute([{ id: 1, tags: { unit: 'offense', runPass: 'Pass', result: 'Incomplete + Interception' } }]).passing.attempts === 1, 'multiple outcomes on one pass still count one attempt');
}
ok(same(ChartingDetails.GAPS, ['L-A', 'L-B', 'L-C', 'L-D', 'R-A', 'R-B', 'R-C', 'R-D', 'Center', 'Other']), 'ten gap choices, L-A through R-D, Center, Other, in one order');
ok(same(ChartingDetails.PATH_POINTS, ['Left', 'Middle', 'Right']), 'motion starts and ends use the offense left / middle / right');
ok(same(ChartingDetails.RPO_READS, ['End', 'Apex', 'Box', 'Other']) && same(ChartingDetails.RPO_DECISIONS, ['Give', 'Keep', 'Throw']), 'RPO read and decision choices');
ok(same(ChartingDetails.QB_RUNS, ['Designed', 'Scramble', 'RPO Keeper']), 'QB run classifications');
ok(['2x2', '3x1', '2x1', '3x2'].every(v => ChartingDetails.RECEIVER_SETS.includes(v)), 'the approved receiver sets are offered');

console.log('\n== Gap and direction ==');
ok(ChartingDetails.gapDirection('L-C') === 'Left' && ChartingDetails.gapDirection('R-A') === 'Right' && ChartingDetails.gapDirection('Center') === 'Middle', 'report-only gap lateral classification remains available');
ok(ChartingDetails.gapDirection('Other') === null && ChartingDetails.gapDirection('') === null, 'Other and blank name no direction');
{
  const t = { playDir: '', gap: 'R-B' };
  ChartingDetails.settle(t, 'gap');
  ok(t.playDir === '' && t.gap === 'R-B', 'charting Gap leaves blank Direction blank');
  const c = { playDir: 'Left', gap: 'Center' };
  ChartingDetails.settle(c, 'gap');
  ok(c.playDir === 'Left', 'charting Center preserves the coach direction');
  const o = { playDir: 'Left', gap: 'Other' };
  ChartingDetails.settle(o, 'gap');
  ok(o.playDir === 'Left' && o.gap === 'Other', 'Other leaves the direction alone');
  const d = { playDir: 'Right', gap: 'L-A' };
  const cleared = ChartingDetails.settle(d, 'playDir');
  ok(d.gap === 'L-A' && cleared.length === 0, 'changing Direction preserves Gap');
  const k = { playDir: 'Left', gap: 'L-A' };
  ChartingDetails.settle(k, 'playDir');
  ok(k.gap === 'L-A', 'the same direction keeps the gap');
  ok(ChartingDetails.problems({ gap: 'L-A', playDir: '' }).length === 0, 'Gap is valid without Direction');
}
{
  const tags = { playDir: 'Left', gap: 'L-B' };
  const change = ChartingDetails.orphans(tags, 'playDir', 'Right');
  ok(change.length === 0, 'changing Direction orphans no Gap');
  const removal = ChartingDetails.orphans(tags, 'playDir', '');
  ok(removal.length === 0, 'removing Direction orphans no Gap');
  ok(ChartingDetails.orphans(tags, 'playDir', 'Left').length === 0, 'an unchanged direction clears nothing');
  ok(ChartingDetails.orphans({ playDir: 'Left', gap: 'Other' }, 'playDir', 'Right').length === 0, 'Other never contradicts a direction');
}

console.log('\n== Details need the field that opens them ==');
{
  const motion = { motion: 'Jet', motionStart: 'Left', motionEnd: 'Right' };
  const gone = ChartingDetails.orphans(motion, 'motion', '');
  ok(gone.map(o => o.key).sort().join() === 'motionEnd,motionStart', 'removing Motion would clear its start and end');
  ok(ChartingDetails.orphans(motion, 'motion', 'Orbit').length === 0, 'changing the motion type keeps its path');
  const rpo = { playType: 'RPO + Short Pass', rpoRead: 'Apex', rpoDefender: '24', rpoDecision: 'Throw' };
  ok(ChartingDetails.orphans(rpo, 'playType', 'Short Pass').length === 3, 'removing RPO would clear read, defender and decision');
  ok(ChartingDetails.orphans(rpo, 'playType', 'RPO').length === 0, 'RPO stays open while the type is present');
  const qb = { playType: 'QB Run + RPO', qbRun: 'RPO Keeper', rpoRead: 'End' };
  ok(ChartingDetails.orphans(qb, 'playType', 'RPO').map(o => o.key).join() === 'qbRun', 'QB Run and RPO coexist; dropping only QB Run clears only its type');
  const t = { motion: '', motionStart: 'Left' };
  ok(same(ChartingDetails.settle(t, 'motion'), ['motionStart']) && t.motionStart === '', 'settle clears a detail whose opener is blank');
  ok(ChartingDetails.problems({ motionStart: 'Left' }).length === 1 && ChartingDetails.problems({ motion: 'Jet', motionStart: 'Left' }).length === 0, 'problems names a detail with no opener');
  ok(ChartingDetails.problems({ playDir: 'Right', gap: 'L-A' }).length === 0, 'different Direction and Gap are valid');
  ok(ChartingDetails.vocabularyProblems({ gap: 'L-Z' }).length === 1 && ChartingDetails.vocabularyProblems({ rpoDefender: 'abc' }).length === 1 && ChartingDetails.vocabularyProblems({ gap: '', rpoDefender: '24', qbRun: 'Designed' }).length === 0, 'a value the app does not offer is a problem; blank is not');
}
ok(ChartingDetails.rpoDecisionRunPass('Give') === 'Run' && ChartingDetails.rpoDecisionRunPass('Keep') === 'Run' && ChartingDetails.rpoDecisionRunPass('Throw') === 'Pass' && ChartingDetails.rpoDecisionRunPass('') === '', 'an RPO decision reads as run or pass');

console.log('\n== Formation library ==');
{
  const storage = new MemoryStorage();
  const library = new TagLibrary({ storage, teamId: 'a' });
  const family = library.group('formationFamily');
  ok(['Power-I', 'Split Back', 'Spread', 'Wing-T', 'Flexbone', 'Single Wing'].every(v => family.values.includes(v)), 'the seeded Family vocabulary includes Power-I and Split Back');
  ok(['Trips','Twins','Bunch','Tight Bunch','Victory','Doubles','Ace'].every(v=>family.values.includes(v)) && !family.values.includes('Unbalanced'), 'coach-named receiver formations are built in; line balance stays separate');
  ok(family.values.includes('Power-I') && library.group('backfield').values.includes('Power'), 'the Power backfield stays separate from the Power-I Family');
  ok(library.group('formation').values.length === 0 && !library.add('formation', 'Trey'), 'there is no Formation library group any more');
  ok(library.add('formationFamily', 'Coach Beast') && library.group('formationFamily').custom.join() === 'Coach Beast', 'a coach adds a custom Family');
  ok(library.setEnabled('formationFamily', 'Wing-T', false) && !library.group('formationFamily').enabled.includes('Wing-T') && library.group('formationFamily').values.includes('Wing-T'), 'a Family can be hidden without being removed');
  const first = library.group('formationFamily').values[0];
  ok(library.move('formationFamily', first, 1) && library.group('formationFamily').values[1] === first, 'Families can be reordered');
  ok(library.remove('formationFamily', 'Coach Beast') && !library.group('formationFamily').values.includes('Coach Beast'), 'a custom Family can be removed');
  ok(!library.remove('formationFamily', 'Power-I'), 'a built-in Family cannot be removed');
  ok(!library.add('formationFamily', 'Shotgun') && library.lastError?.owner === 'QB Alignment', 'an alignment is not a Family');
  ok(!library.add('formationFamily', '3x1') && library.lastError?.owner === 'Receiver Alignment' && !library.add('formationFamily', '2 x 2'), 'a receiver distribution is not a Family');
  ok(!library.add('formationFamily', 'Empty') && library.lastError?.owner === 'Backfield', 'Empty is not a Family');
  ok(library.add('formationFamily', 'Trips Right'), 'a value that only contains a receiver word is allowed');
}

console.log('\n== A saved library learns the new built-ins without a conversion ==');
{
  const saved = { version: 4, groups: {
    playType: { custom: [], enabled: ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Play Action', 'RPO', 'Trick Play', 'Option'],
      order: ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Play Action', 'RPO', 'Trick Play', 'Option'] },
    blitz: { custom: [], enabled: ['A-Gap', 'B-Gap', 'C-Gap', 'Edge', 'DB Blitz'], order: ['A-Gap', 'B-Gap', 'C-Gap', 'Edge', 'DB Blitz', 'Zone Blitz'] },
    formationFamily: { custom: ['Coach Beast'], enabled: ['Coach Beast', ...TagLibrary.DEFINITIONS.formationFamily], order: [...TagLibrary.DEFINITIONS.formationFamily, 'Coach Beast'] },
  }, presets: [] };
  const raw = JSON.stringify(saved);
  const storage = new MemoryStorage({ ffa_tag_libraries_t: raw });
  const library = new TagLibrary({ storage, teamId: 't' });
  const playType = library.group('playType');
  ok(playType.enabled.includes('QB Run') && playType.enabled.includes('Reverse'), 'QB Run and Reverse are visible in a library saved before they existed');
  ok(!library.group('blitz').enabled.includes('Zone Blitz') && library.group('blitz').values.includes('Zone Blitz'), 'a value the coach hid stays hidden');
  ok(storage.getItem('ffa_tag_libraries_t') === raw, 'reading a saved library writes nothing');
  ok(library.group('formationFamily').enabled.length === TagLibrary.DEFINITIONS.formationFamily.length + 1, 'the Formation group retains its built-ins and custom choice');
  ok(library.setEnabled('playType', 'Reverse', false) && !new TagLibrary({ storage, teamId: 't' }).group('playType').enabled.includes('Reverse'), 'a coach can hide a new built-in and it stays hidden after a reload');
  const written = JSON.parse(storage.getItem('ffa_tag_libraries_t'));
  ok(written.groups.formationFamily.custom[0] === 'Coach Beast', 'the current custom Formation survives an unrelated edit');
  ok(library.group('formationFamily').values.includes('Coach Beast'), 'the custom Formation is offered directly');
}

console.log('\n== Projection and format ==');
{
  const tags = { formationFamily: 'Spread', receiverSet: '3x1', qbAlignment: 'Shotgun' };
  const p = TagProjection.project(tags);
  ok(p.formationFamily === 'Spread' && p.receiverSet === '3x1', 'project reads Family and Receiver Alignment as stored');
  ok(TagProjection.project({}).receiverSet === '' && TagProjection.project({}).formationFamily === '', 'a blank play reads blank');
  ok(TagProjection.lookLabel(tags) === 'Shotgun Spread 3x1', 'the look label composes alignment, family and set', TagProjection.lookLabel(tags));
  ok(!('formation' in TagProjection.project({ formationFamily: 'Spread' })), 'projection publishes no formation field');
  ok(StatsEngine.PROJECTED_FIELDS.includes('formationFamily') && StatsEngine.PROJECTED_FIELDS.includes('receiverSet') && !StatsEngine.PROJECTED_FIELDS.includes('formation'), 'the engine reads Family and Set through the one projection');
  const play = { id: 1, timestamp: { start: 0, end: 1 }, tags: { unit: 'offense', formationFamily: 'Spread', receiverSet: '3x1' } };
  ok(SeasonFormat.playProblems(play).length === 0, 'a play with Family and Set is the current format');
  ok(SeasonFormat.playProblems({ ...play, tags: { ...play.tags, formation: '' } }).includes('retired Formation field'), 'a play carrying the retired Formation field is refused, even blank');
  const season = { games: [{ id: 'g', name: 'G', plays: [play] }], playbook: { calls: [{ name: '26 Blast', defaults: { formation: 'Power-I' } }] } };
  ok(SeasonFormat.seasonProblems(season).some(p => p.problem === 'retired Formation default'), 'a play call default naming the retired Formation is refused');
  ok(SeasonFormat.seasonProblems({ ...season, playbook: { calls: [{ name: '26 Blast', defaults: { formationFamily: 'Power-I' } }] } }).length === 0, 'a Family default is current');
  const kept = SeasonFormat.currentTagValues({ formation: 'Trips', formationFamily: 'Spread', motion: 'Jet' });
  ok(!('formation' in kept) && kept.formationFamily === 'Spread' && kept.motion === 'Jet', 'a template saved with the old Formation applies everything else');
}

console.log('\n== Run/Pass stays explicit ==');
ok(PlayTagger.runPassForPlayType('QB Run') === '' && PlayTagger.runPassForPlayType('Reverse') === '' && PlayTagger.runPassForPlayType('QB Run + Reverse') === '', 'QB Run and Reverse never fill Run/Pass');
ok(PlayTagger.runPassForPlayType('Run Outside + Reverse') === 'Run', 'a Reverse beside an explicit run type keeps that classification');
{
  const play = playType => ({ id: 1, tags: { unit: 'offense', playType, runPass: '' } });
  ok(!StatsEngine.isRun(play('QB Run')) && !StatsEngine.isPass(play('QB Run')), 'a QB Run with no Run/Pass is unclassified, not a run');
  ok(!StatsEngine.isRun(play('Reverse')) && !StatsEngine.isPass(play('Reverse')), 'a Reverse with no Run/Pass is unclassified');
  ok(StatsEngine.isRun(play('Run Inside')) && StatsEngine.isPass(play('Short Pass')), 'the established run and pass reads are unchanged');
  ok(StatsEngine.isRun({ id: 1, tags: { unit: 'offense', playType: 'QB Run', runPass: 'Run' } }), 'an explicit Run/Pass is authoritative for a QB Run');
  ok(StatsEngine.isPass({ id: 1, tags: { unit: 'offense', playType: 'Reverse', runPass: 'Pass' } }), 'an explicit Pass is authoritative for a Reverse');
}

console.log('\n== A play call and Special Teams keep the rules ==');
{
  const playbook = { list: () => [{ id: 'c1', name: 'Sweep', concept: '', defaults: { playDir: 'Right' } }], constructor: { DEFAULT_KEYS: ['playDir'] } };
  const play = { tags: { playDir: '', gap: 'L-A', playCallDefaults: {} } };
  PlayCallModel.apply(play, 'Sweep', playbook, () => '');
  ok(play.tags.playDir === 'Right' && play.tags.gap === 'L-A', 'a call direction preserves the charted Gap');
  const kept = { tags: { playDir: '', gap: 'R-A', playCallDefaults: {} } };
  PlayCallModel.apply(kept, 'Sweep', playbook, () => '');
  ok(kept.tags.playDir === 'Right' && kept.tags.gap === 'R-A', 'a call whose default agrees keeps it');
  ok(['formationFamily', 'receiverSet'].every(k => SeasonStore.ST_ALIGNMENT_KEYS.includes(k)) && !SeasonStore.ST_ALIGNMENT_KEYS.includes('formation'), 'a Special Teams play may hold no Family or Receiver Alignment, and no retired Formation');
  const st = { id: 1, tags: { unit: 'special', formationFamily: 'Spread', receiverSet: '3x1' } };
  SeasonStore.stripStAlignment(st);
  ok(st.tags.formationFamily === '' && st.tags.receiverSet === '', 'the strip clears them');
}
console.log('\n== Changing a Play Call says what it would clear ==');
{
  const calls = [
    { id: 'c-left', name: 'Sweep Left', concept: '', defaults: { playDir: 'Left', motion: 'Jet' } },
    { id: 'c-right', name: 'Sweep Right', concept: '', defaults: { playDir: 'Right' } },
    { id: 'c-none', name: 'Plain', concept: '', defaults: {} },
  ];
  const playbook = { list: () => calls, constructor: { DEFAULT_KEYS: ['playDir', 'motion'] } };
  const charted = () => {
    const play = { tags: { playDir: '', motion: '', gap: '', playCallDefaults: {} } };
    PlayCallModel.apply(play, 'Sweep Left', playbook, () => '');
    play.tags.gap = 'L-A'; play.tags.motionStart = 'Left'; play.tags.motionEnd = 'Right';
    return play;
  };
  const play = charted();
  const before = JSON.stringify(play);
  const lost = PlayCallModel.losses(play, 'Sweep Right', playbook, () => '');
  ok(lost.map(item => item.key).sort().join() === 'motionEnd,motionStart',
    'switching a call whose Direction and Motion the new call replaces lists only the Motion path it would clear', JSON.stringify(lost));
  ok(JSON.stringify(play) === before, 'asking changes nothing');
  ok(PlayCallModel.losses(play, 'Sweep Left', playbook, () => '').length === 0, 'the same call clears nothing');
  const plain = { tags: { playDir: 'Left', motion: '', gap: 'L-B', playCallDefaults: {} } };
  ok(PlayCallModel.losses(plain, 'Sweep Left', playbook, () => '').length === 0, 'a call that agrees with what is charted clears nothing');
  ok(PlayCallModel.losses(plain, 'Sweep Right', playbook, () => '').length === 0 && PlayCallModel.apply(plain, 'Sweep Right', playbook, () => '') && plain.tags.playDir === 'Left' && plain.tags.gap === 'L-B', 'a call never replaces a Direction the coach charted, so the Gap stays');
  const free = { tags: { playDir: '', motion: '', gap: 'Other', playCallDefaults: {} } };
  ok(PlayCallModel.losses(free, 'Sweep Right', playbook, () => '').length === 0, 'Other agrees with any direction');
}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
