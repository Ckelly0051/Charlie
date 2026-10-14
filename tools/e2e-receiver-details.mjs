import assert from 'node:assert/strict';
import { ReceiverDetails } from '../js/receiver-details.js';
import { PlayShape } from '../js/play-shape.js';
import { SeasonFormat } from '../js/season-format.js';
import { SeasonStore } from '../js/season-store.js';
if (process.argv.includes('--mutate-shape')) ReceiverDetails.holds = () => true;
if (process.argv.includes('--mutate-release')) ReceiverDetails.RELEASES = ['Inside','Outside','Vertical'];
if (process.argv.includes('--mutate-format')) {
  const problems = ReceiverDetails.problems.bind(ReceiverDetails);
  ReceiverDetails.problems = play => play?.receiverDetail && (!ReceiverDetails.holds(play) || !ReceiverDetails.targets(play).includes(play.receiverDetail.receiverNumber))
    ? ['invalid receiver detail'] : problems(play);
}
const play = (receiver='22') => ({ tags:{unit:'offense',runPass:'Pass',players:{receiver}},receiverDetail:{receiverNumber:'22',route:'Slant',releaseDirection:'Inside'} });
let count=0, failures=0;
const check=(label,actual,expected) => { try { assert.deepEqual(actual,expected,label); count++; } catch { console.error(`FAIL ${label}`); failures++; } };
check('single target',ReceiverDetails.targets(play()),['22']);
check('multiple attribution preserved as candidates',ReceiverDetails.targets(play('22, 7')),['22','7']);
check('malformed attribution is not guessed',ReceiverDetails.targets(play('22, unknown')),[]);
check('matched detail',ReceiverDetails.read(play()).route,'Slant');
check('one explicit target among several',ReceiverDetails.read(play('22, 7')).receiverNumber,'22');
check('mismatched receiver is not read',ReceiverDetails.read(play('7')),null);
check('blank is missing',ReceiverDetails.read({tags:{unit:'offense',runPass:'Pass',players:{receiver:'22'}}}),null);
check('no Vertical release',ReceiverDetails.problems({...play(),receiverDetail:{receiverNumber:'22',releaseDirection:'Vertical'}}).length > 0,true);
check('custom route allowed',ReceiverDetails.problems({...play(),receiverDetail:{receiverNumber:'22',route:'Coach Choice'}}),[]);
check('target mismatch is valid record format',SeasonFormat.playProblems(play('7')),[]);
for (const [label, detail] of Object.entries({
  'missing number': { route:'Slant' }, 'numeric number': { receiverNumber:22,route:'Slant' },
  'bad number': { receiverNumber:'abc',route:'Slant' }, 'long number': { receiverNumber:'123',route:'Slant' },
  'empty record': { receiverNumber:'22' }, 'unknown key': { receiverNumber:'22',route:'Slant',other:true },
  'array': [], 'non-string route': { receiverNumber:'22',route:5 },
  'blank route': { receiverNumber:'22',route:' ' }, 'long route': { receiverNumber:'22',route:'x'.repeat(121) },
  'null route': { receiverNumber:'22',route:null,releaseDirection:'Inside' },
  'null release': { receiverNumber:'22',route:'Slant',releaseDirection:null },
})) check(`refuse ${label}`,SeasonFormat.playProblems({...play(),receiverDetail:detail}).includes('invalid receiver detail'),true);
for (const mismatch of ['receiver','runPass']) {
  const source = play(mismatch === 'receiver' ? '7' : '22');
  if (mismatch === 'runPass') source.tags.runPass = 'Run';
  source.id = 1;
  const stored = { id:'receiver-format',seasonName:'Receiver format',roster:[],activeGameId:'game-one',games:[{id:'game-one',name:'Week 1',plays:[source]}] };
  const original = JSON.stringify(stored); let writes=0;
  const store = new SeasonStore({loadSeason:async () => structuredClone(stored),setCurrentSeason:() => {},touchOpened:async () => {},saveSeason:async () => {writes++;} });
  const opened = await store.openSeason(stored.id), loaded = opened?.games[0].plays[0];
  check(`${mismatch} mismatch stored season opens`,!!opened,true);
  check(`${mismatch} mismatch remains recorded until save`,loaded?.receiverDetail,source.receiverDetail);
  check(`${mismatch} mismatch is hidden`,!!loaded && PlayShape.hidden(loaded).some(item => item.field === 'receiverDetail'),true);
  check(`${mismatch} mismatch opening writes no play data`,writes === 0 && JSON.stringify(stored) === original,true);
  if (loaded) PlayShape.settle(loaded);
  check(`${mismatch} mismatch next settle drops detail`,loaded?.receiverDetail,undefined);
}
const run=play(); run.tags.runPass='Run';
check('run cannot hold detail',ReceiverDetails.holds(run),false);
check('settle sees hidden receiver detail',PlayShape.hidden(run).some(field => field.field === 'receiverDetail'),true);
PlayShape.settle(run); check('settle removes hidden record',Object.hasOwn(run,'receiverDetail'),false);
check('settle keeps visible detail',PlayShape.settle(play()).some(field => field.field === 'receiverDetail'),false);
const defense=play(); defense.tags.unit='defense'; check('defense cannot hold offensive target',ReceiverDetails.holds(defense),false);
console.log(`== RESULT: ${count} passed, ${failures} failed ==`);
if (failures) process.exitCode=1;
