/* Charting cutover, Step 1 model contract: Formation Family / Receiver Set, Gap, motion
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

let pass = 0, fail = 0;
const ok = (value, label, extra = '') => { console.log(`${value ? '  PASS' : '  FAIL'}  ${label}${!value && extra ? ` -- ${extra}` : ''}`); value ? pass++ : fail++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
class MemoryStorage { constructor(seed = {}) { this.data = new Map(Object.entries(seed)); } getItem(k) { return this.data.get(k) ?? null; } setItem(k, v) { this.data.set(k, String(v)); } removeItem(k) { this.data.delete(k); } }

console.log('\n== Vocabulary ==');
ok(same(ChartingDetails.GAPS, ['L-A', 'L-B', 'L-C', 'L-D', 'R-A', 'R-B', 'R-C', 'R-D', 'Center', 'Other']), 'ten gap choices, L-A through R-D, Center, Other, in one order');
ok(same(ChartingDetails.PATH_POINTS, ['Left', 'Middle', 'Right']), 'motion starts and ends use the offense left / middle / right');
ok(same(ChartingDetails.RPO_READS, ['End', 'Apex', 'Box', 'Other']) && same(ChartingDetails.RPO_DECISIONS, ['Give', 'Keep', 'Throw']), 'RPO read and decision choices');
ok(same(ChartingDetails.QB_RUNS, ['Designed', 'Scramble', 'RPO Keeper']), 'QB run classifications');
ok(['2x2', '3x1', '2x1', '3x2'].every(v => ChartingDetails.RECEIVER_SETS.includes(v)), 'the approved receiver sets are offered');

console.log('\n== Gap and direction ==');
ok(ChartingDetails.gapDirection('L-C') === 'Left' && ChartingDetails.gapDirection('R-A') === 'Right' && ChartingDetails.gapDirection('Center') === 'Middle', 'a sided gap names its direction and Center is Middle');
ok(ChartingDetails.gapDirection('Other') === null && ChartingDetails.gapDirection('') === null, 'Other and blank name no direction');
{
  const t = { playDir: '', gap: 'R-B' };
  ChartingDetails.settle(t, 'gap');
  ok(t.playDir === 'Right' && t.gap === 'R-B', 'charting a sided gap sets its Play Direction');
  const c = { playDir: 'Left', gap: 'Center' };
  ChartingDetails.settle(c, 'gap');
  ok(c.playDir === 'Middle', 'charting Center sets Middle, replacing another direction');
  const o = { playDir: 'Left', gap: 'Other' };
  ChartingDetails.settle(o, 'gap');
  ok(o.playDir === 'Left' && o.gap === 'Other', 'Other leaves the direction alone');
  const d = { playDir: 'Right', gap: 'L-A' };
  const cleared = ChartingDetails.settle(d, 'playDir');
  ok(d.gap === '' && cleared.includes('gap'), 'a direction that contradicts the gap clears it');
  const k = { playDir: 'Left', gap: 'L-A' };
  ChartingDetails.settle(k, 'playDir');
  ok(k.gap === 'L-A', 'the same direction keeps the gap');
  ok(!ChartingDetails.gapAgrees('L-A', ''), 'a sided gap does not agree with a blank direction');
}
{
  const tags = { playDir: 'Left', gap: 'L-B' };
  const change = ChartingDetails.orphans(tags, 'playDir', 'Right');
  ok(change.length === 1 && change[0].key === 'gap' && change[0].coupled === true, 'choosing another direction is the approved clear (coupled)');
  const removal = ChartingDetails.orphans(tags, 'playDir', '');
  ok(removal.length === 1 && removal[0].coupled === false, 'removing the direction is a removal the coach confirms');
  ok(ChartingDetails.orphans(tags, 'playDir', 'Left').length === 0, 'an unchanged direction clears nothing');
  ok(ChartingDetails.orphans({ playDir: 'Left', gap: 'Other' }, 'playDir', 'Right').length === 0, 'Other never contradicts a direction');
}

console.log('\n== Details need the field that opens them ==');
{
  const motion = { motion: 'Jet', motionStart: 'Left', motionEnd: 'Right' };
  const gone = ChartingDetails.orphans(motion, 'motion', '');
  ok(gone.map(o => o.key).sort().join() === 'motionEnd,motionStart' && gone.every(o => !o.coupled), 'removing Motion would clear its start and end');
  ok(ChartingDetails.orphans(motion, 'motion', 'Orbit').length === 0, 'changing the motion type keeps its path');
  const rpo = { playType: 'RPO + Short Pass', rpoRead: 'Apex', rpoDefender: '24', rpoDecision: 'Throw' };
  ok(ChartingDetails.orphans(rpo, 'playType', 'Short Pass').length === 3, 'removing RPO would clear read, defender and decision');
  ok(ChartingDetails.orphans(rpo, 'playType', 'RPO').length === 0, 'RPO stays open while the type is present');
  const qb = { playType: 'QB Run + RPO', qbRun: 'RPO Keeper', rpoRead: 'End' };
  ok(ChartingDetails.orphans(qb, 'playType', 'RPO').map(o => o.key).join() === 'qbRun', 'QB Run and RPO coexist; dropping only QB Run clears only its type');
  const t = { motion: '', motionStart: 'Left' };
  ok(same(ChartingDetails.settle(t, 'motion'), ['motionStart']) && t.motionStart === '', 'settle clears a detail whose opener is blank');
  ok(ChartingDetails.problems({ motionStart: 'Left' }).length === 1 && ChartingDetails.problems({ motion: 'Jet', motionStart: 'Left' }).length === 0, 'problems names a detail with no opener');
  ok(ChartingDetails.problems({ playDir: 'Right', gap: 'L-A' }).length === 1, 'problems names a gap that disagrees with the direction');
  ok(ChartingDetails.vocabularyProblems({ gap: 'L-Z' }).length === 1 && ChartingDetails.vocabularyProblems({ rpoDefender: 'abc' }).length === 1 && ChartingDetails.vocabularyProblems({ gap: '', rpoDefender: '24', qbRun: 'Designed' }).length === 0, 'a value the app does not offer is a problem; blank is not');
}
ok(ChartingDetails.rpoDecisionRunPass('Give') === 'Run' && ChartingDetails.rpoDecisionRunPass('Keep') === 'Run' && ChartingDetails.rpoDecisionRunPass('Throw') === 'Pass' && ChartingDetails.rpoDecisionRunPass('') === '', 'an RPO decision reads as run or pass');

console.log('\n== Formation Family library ==');
{
  const storage = new MemoryStorage();
  const library = new TagLibrary({ storage, teamId: 'a' });
  const family = library.group('formationFamily');
  ok(['Power-I', 'Split Back', 'Spread', 'Wing-T', 'Flexbone', 'Single Wing'].every(v => family.values.includes(v)), 'the seeded Family vocabulary includes Power-I and Split Back');
  ok(!family.values.some(v => ['Trips', 'Twins', 'Bunch', 'Goal Line', 'Victory', 'Doubles', 'Unbalanced', 'Ace'].includes(v)), 'the old package and receiver words are not built in as Families');
  ok(family.values.includes('Power-I') && library.group('backfield').values.includes('Power'), 'the Power backfield stays separate from the Power-I Family');
  ok(library.group('formation').values.length === 0 && !library.add('formation', 'Trey'), 'there is no Formation library group any more');
  ok(library.add('formationFamily', 'Beast') && library.group('formationFamily').custom.join() === 'Beast', 'a coach adds a custom Family');
  ok(library.setEnabled('formationFamily', 'Wing-T', false) && !library.group('formationFamily').enabled.includes('Wing-T') && library.group('formationFamily').values.includes('Wing-T'), 'a Family can be hidden without being removed');
  const first = library.group('formationFamily').values[0];
  ok(library.move('formationFamily', first, 1) && library.group('formationFamily').values[1] === first, 'Families can be reordered');
  ok(library.remove('formationFamily', 'Beast') && !library.group('formationFamily').values.includes('Beast'), 'a custom Family can be removed');
  ok(!library.remove('formationFamily', 'Power-I'), 'a built-in Family cannot be removed');
  ok(!library.add('formationFamily', 'Shotgun') && library.lastError?.owner === 'QB Alignment', 'an alignment is not a Family');
  ok(!library.add('formationFamily', '3x1') && library.lastError?.owner === 'Receiver Set' && !library.add('formationFamily', '2 x 2'), 'a receiver distribution is not a Family');
  ok(!library.add('formationFamily', 'Empty') && library.lastError?.owner === 'Backfield', 'Empty is not a Family');
  ok(library.add('formationFamily', 'Trips Right'), 'a value that only contains a receiver word is allowed');
}

console.log('\n== A saved library learns the new built-ins without a conversion ==');
{
  const saved = { version: 4, groups: {
    playType: { custom: [], enabled: ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Play Action', 'RPO', 'Trick Play', 'Option'],
      order: ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Play Action', 'RPO', 'Trick Play', 'Option'] },
    blitz: { custom: [], enabled: ['A-Gap', 'B-Gap', 'C-Gap', 'Edge', 'DB Blitz'], order: ['A-Gap', 'B-Gap', 'C-Gap', 'Edge', 'DB Blitz', 'Zone Blitz'] },
    formation: { custom: ['Beast'], enabled: ['Beast', 'Trips'], order: ['Trips', 'Beast'] },
  }, presets: [] };
  const raw = JSON.stringify(saved);
  const storage = new MemoryStorage({ ffa_tag_libraries_t: raw });
  const library = new TagLibrary({ storage, teamId: 't' });
  const playType = library.group('playType');
  ok(playType.enabled.includes('QB Run') && playType.enabled.includes('Reverse'), 'QB Run and Reverse are visible in a library saved before they existed');
  ok(!library.group('blitz').enabled.includes('Zone Blitz') && library.group('blitz').values.includes('Zone Blitz'), 'a value the coach hid stays hidden');
  ok(storage.getItem('ffa_tag_libraries_t') === raw, 'reading a saved library writes nothing');
  ok(library.group('formationFamily').enabled.length === TagLibrary.DEFINITIONS.formationFamily.length, 'the new Family group starts fully visible');
  ok(library.setEnabled('playType', 'Reverse', false) && !new TagLibrary({ storage, teamId: 't' }).group('playType').enabled.includes('Reverse'), 'a coach can hide a new built-in and it stays hidden after a reload');
  const written = JSON.parse(storage.getItem('ffa_tag_libraries_t'));
  ok(written.retired?.formation?.custom?.[0] === 'Beast', 'the retired Formation group is kept as stored through an unrelated edit');
  ok(library.group('formation').values.length === 0, 'and is never offered');
}

console.log('\n== Projection and format ==');
{
  const tags = { formationFamily: 'Spread', receiverSet: '3x1', qbAlignment: 'Shotgun' };
  const p = TagProjection.project(tags);
  ok(p.formationFamily === 'Spread' && p.receiverSet === '3x1', 'project reads Family and Receiver Set as stored');
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
  ok(play.tags.playDir === 'Right' && play.tags.gap === '', 'a call whose default direction contradicts a charted Gap clears the Gap');
  const kept = { tags: { playDir: '', gap: 'R-A', playCallDefaults: {} } };
  PlayCallModel.apply(kept, 'Sweep', playbook, () => '');
  ok(kept.tags.playDir === 'Right' && kept.tags.gap === 'R-A', 'a call whose default agrees keeps it');
  ok(['formationFamily', 'receiverSet'].every(k => SeasonStore.ST_ALIGNMENT_KEYS.includes(k)) && !SeasonStore.ST_ALIGNMENT_KEYS.includes('formation'), 'a Special Teams play may hold no Family or Receiver Set, and no retired Formation');
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
  ok(lost.map(item => item.key).sort().join() === 'gap,motionEnd,motionStart' && lost.find(item => item.key === 'gap').value === 'L-A',
    'switching a call whose Direction and Motion the new call replaces lists the Gap and the path it would clear', JSON.stringify(lost));
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
