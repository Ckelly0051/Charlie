import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { auditSeasonOperation } from './operation-diff.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

const fixture = {
  version: 5,
  type: 'season',
  id: 'p0-operation-diff',
  seasonName: 'P0 Operation Diff',
  activeGameId: 'diff-g1',
  teamProfile: { teamName: 'Mavericks' },
  roster: [],
  games: [
    {
      id: 'diff-g1',
      name: 'vs Alpha',
      version: 4,
      status: 'active',
      videoFileName: null,
      roster: [],
      gameInfo: {
        projectName: 'vs Alpha', week: '', teamName: '', opponent: 'Alpha',
        date: '', homeAway: '', gameType: 'game', scoreUs: '', scoreThem: '',
        jerseyColor: '', perspective: 'offense', direction: '',
      },
      plays: [
        { id: 1, timestamp: { start: 0, end: 5 }, notes: '', tags: { unit: 'offense', formation: 'Ace', custom: [] } },
      ],
      annotations: [], nextId: 2, currentPlayId: 1, clipNames: [], clipPaths: [], clipRefs: [], isMultiClip: false,
    },
    {
      id: 'diff-g2',
      name: 'vs Bravo',
      version: 4,
      status: 'active',
      videoFileName: null,
      roster: [],
      gameInfo: {
        projectName: 'vs Bravo', week: '', teamName: '', opponent: 'Bravo',
        date: '', homeAway: '', gameType: 'game', scoreUs: '', scoreThem: '',
        jerseyColor: '', perspective: 'offense', direction: '',
      },
      plays: [
        { id: 1, timestamp: { start: 10, end: 15 }, notes: 'keep', tags: { unit: 'offense', formation: 'Power-I', custom: [] } },
        { id: 2, timestamp: { start: 16, end: 21 }, notes: 'untouched', tags: { unit: 'defense', coverage: 'Cover 3', custom: [] } },
      ],
      annotations: [], nextId: 3, currentPlayId: 1, clipNames: [], clipPaths: [], clipRefs: [], isMultiClip: false,
    },
  ],
};

await page.evaluate(input => {
  const app = window.app;
  const store = app.storage.seasonStore;
  store.data = store._normalize(structuredClone(input));
  store.currentSeasonId = input.id;
  app.storage._loadActiveGame();
  app.storage.commitActive();
}, fixture);

const snapshot = () => page.evaluate(() => structuredClone(window.app.storage.seasonStore.data));

let before = await snapshot();
await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  await shell.show('study');
  await shell.show('plan');
  await shell.show('home');
  await shell.show('breakdown');
});
let after = await snapshot();
let audit = auditSeasonOperation(before, after, []);
ok(audit.changed.length === 0, 'route navigation changes no season path', JSON.stringify(audit.changed));

before = await snapshot();
await page.evaluate(() => window.app.openGame('diff-g2'));
after = await snapshot();
audit = auditSeasonOperation(before, after, ['activeGameId']);
ok(audit.unexpected.length === 0 && audit.changed.includes('activeGameId'),
  'game selection changes only the active-game pointer', JSON.stringify(audit));
ok(JSON.stringify(before.games.find(game => game.id === 'diff-g1').plays)
    === JSON.stringify(after.games.find(game => game.id === 'diff-g1').plays),
  'game selection leaves every play in the prior game byte-identical');

await page.evaluate(() => {
  const app = window.app;
  app.tagger.selectPlay(1);
  app.storage.commitActive();
});
before = await snapshot();
await page.evaluate(() => {
  const app = window.app;
  app.tagger.tagFields.formation.value = 'Ace';
  app.tagger._saveField('formation');
  app.storage.commitActive();
});
after = await snapshot();
audit = auditSeasonOperation(before, after, ['games.diff-g2.plays.1.tags.formation']);
ok(audit.unexpected.length === 0
    && audit.changed.join('|') === 'games.diff-g2.plays.1.tags.formation',
  'tag edit changes only the declared field on the target play', JSON.stringify(audit));
ok(JSON.stringify(before.games.find(game => game.id === 'diff-g2').plays.find(play => play.id === 2))
    === JSON.stringify(after.games.find(game => game.id === 'diff-g2').plays.find(play => play.id === 2)),
  'tag edit leaves the non-target play byte-identical');

before = await snapshot();
await page.evaluate(() => {
  const opponent = document.getElementById('gameOpponent');
  opponent.value = 'Charlie';
  window.app._saveGameInfo();
  window.app.storage.commitActive();
});
after = await snapshot();
audit = auditSeasonOperation(before, after, [
  'games.diff-g2.gameInfo.opponent',
  'games.diff-g2.gameInfo.projectName',
  'games.diff-g2.name',
]);
ok(audit.unexpected.length === 0
    && audit.changed.includes('games.diff-g2.gameInfo.opponent')
    && audit.changed.includes('games.diff-g2.gameInfo.projectName'),
  'Game Info edit changes only the declared target-game metadata', JSON.stringify(audit));
ok(JSON.stringify(before.games.find(game => game.id === 'diff-g1'))
    === JSON.stringify(after.games.find(game => game.id === 'diff-g1')),
  'Game Info edit leaves the non-target game byte-identical');

const mutation = auditSeasonOperation(before, after, ['games.diff-g2.gameInfo.opponent']);
ok(mutation.unexpected.includes('games.diff-g2.gameInfo.projectName'),
  'allow-list gate rejects an undeclared sibling mutation', JSON.stringify(mutation));

ok(errors.length === 0, 'journeys emit no page errors', errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
