/**
 * GameContext contract (S7-d1).
 *
 * Perspective, direction and team identity used to travel through six hidden
 * inputs in `#legacyGameContextState` plus a SYNTHETIC `change` event on
 * `#gamePerspective` that three subscribers listened for — an event bus made of
 * markup, inside the `#app` subtree S7-d8 deletes.
 *
 * `direction` was the sharp edge: `_saveGameInfo()` read it as
 * `getElementById('gameDirection')?.value || ''`, so deleting the input would
 * have written '' over the coach's stored value. Silent data loss, not a
 * visible break.
 *
 * This harness COLD-BOOTS the built app with that markup already absent, which
 * is the only proof the consultation accepts — removing nodes after boot proves
 * nothing, because controllers retain detached references.
 *
 * Read-only with respect to coach data: it runs on the demo season.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' -- ' + extra}`);
  cond ? pass++ : fail++;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.gameContext, { timeout: 20000 });

let r;

console.log('\n== 1. The hidden form is gone and the service replaced it ==');
r = await page.evaluate(() => {
  const ctx = window.app.gameContext;
  const api = ['snapshot', 'update', 'subscribe', 'notify', 'isScout'];
  return {
    missing: api.filter(k => typeof ctx[k] !== 'function'),
    // ABSENCE, not hiding. Re-inserting these hidden must red this.
    legacyNodes: ['legacyGameContextState', 'gamePerspective', 'gameDirection',
      'gameTeamName', 'gameJerseyColor', 'gameApiKey', 'gameAiModel']
      .filter(id => !!document.getElementById(id)),
    domInSource: /getElementById|querySelector|classList/.test(
      Object.getOwnPropertyNames(Object.getPrototypeOf(ctx))
        .map(k => String(ctx[k])).join('\n')),
    subscribers: ctx.subscriberCount,
  };
});
ok(r.missing.length === 0, 'GameContext exposes snapshot / update / subscribe / notify', JSON.stringify(r));
ok(r.legacyNodes.length === 0,
  'The hidden game-context inputs are absent, not hidden, so nothing can read them again', JSON.stringify(r));
ok(r.domInSource === false, 'GameContext touches no DOM', JSON.stringify(r));
ok(r.subscribers > 0, 'Live subscribers replaced the synthetic change-event bus', JSON.stringify(r));

console.log('\n== 2. Two games keep their own perspective and direction ==');
r = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.loadDemoSeason();
  const store = app.storage.seasonStore;
  const [a, b] = store.data.games.map(g => g.id);
  await app.storage.switchToGame(a);
  app.gameContext.update({ perspective: 'defense', direction: 'left' });
  app.storage.commitActive();
  await app.storage.switchToGame(b);
  app.gameContext.update({ perspective: 'scout', direction: 'right' });
  app.storage.commitActive();
  const bSnap = app.gameContext.snapshot();
  await app.storage.switchToGame(a);
  const aSnap = app.gameContext.snapshot();
  return { a: { p: aSnap.perspective, d: aSnap.direction }, b: { p: bSnap.perspective, d: bSnap.direction } };
});
ok(r.a.p === 'defense' && r.a.d === 'left' && r.b.p === 'scout' && r.b.d === 'right',
  'Each game keeps its own perspective and direction across switching', JSON.stringify(r));

console.log('\n== 3. Direction survives a commit — the deletion landmine ==');
// _saveGameInfo() used to rebuild gameInfo from the hidden inputs, so with them
// deleted it would have written '' over direction on the next autosave.
r = await page.evaluate(async () => {
  const app = window.app;
  app.gameContext.update({ direction: 'right' });
  const afterSet = app.gameContext.snapshot().direction;
  app._saveGameInfo();
  const afterSave = app.gameContext.snapshot().direction;
  app.storage.commitActive();
  await app.storage.seasonStore.persist();
  const durable = await app.storage.seasonStore.backend.loadSeason(app.storage.seasonStore.currentSeasonId);
  const active = durable.games.find(g => g.id === app.storage.seasonStore.data.activeGameId);
  return { afterSet, afterSave, durable: active?.gameInfo?.direction };
});
ok(r.afterSet === 'right' && r.afterSave === 'right' && r.durable === 'right',
  'Direction survives a commit and a canonical persist with the hidden inputs deleted', JSON.stringify(r));

console.log('\n== 4. Opponent-scout stickiness across unit changes ==');
// Perspective is a property of the FILM. A per-play unit change must never
// silently turn opponent film into one of our own games.
r = await page.evaluate(() => {
  const app = window.app;
  app.gameContext.update({ perspective: 'scout' });
  const derivedWhileScouting = app.nativeTagging._derivePerspective('defense');
  const stillScout = app.gameContext.snapshot().perspective;
  // On one of our own games the derivation DOES fire.
  app.gameContext.update({ perspective: 'offense' });
  const derivedOnOurGame = app.nativeTagging._derivePerspective('defense');
  return { derivedWhileScouting, stillScout, derivedOnOurGame, after: app.gameContext.snapshot().perspective };
});
ok(r.derivedWhileScouting === false && r.stillScout === 'scout',
  'A unit change cannot flip opponent film into one of our own games', JSON.stringify(r));
ok(r.derivedOnOurGame === true && r.after === 'defense',
  'On our own game the charting unit still drives perspective', JSON.stringify(r));

console.log('\n== 5. Subscribers see changes; scout UI follows the context ==');
r = await page.evaluate(() => {
  const app = window.app;
  const seen = [];
  const off = app.gameContext.subscribe(s => seen.push(s.perspective));
  app.gameContext.update({ perspective: 'scout' });
  // Final Engine Independence: .tag-section/#tagForm is deleted -- the coach-
  // visible scout indicator now only exists once NativeTaggingScreen mounts
  // its own presentation into a real host, so mount into a scratch host to
  // prove the UI genuinely reflects context, not a hidden select.
  const scratchHost = document.createElement('div');
  document.body.append(scratchHost);
  app.nativeTagging.mount(scratchHost);
  const scoutClass = !!scratchHost.querySelector('.gi-tag-subject');
  app.nativeTagging.restore();
  scratchHost.remove();
  const defaultUnitScout = app.tagger.defaultUnit;
  app.gameContext.update({ perspective: 'defense' });
  const defaultUnitDefense = app.tagger.defaultUnit;
  const afterUnsub = (() => { off(); app.gameContext.update({ perspective: 'offense' }); return seen.length; })();
  return { seen, scoutClass, defaultUnitScout, defaultUnitDefense, afterUnsub };
});
ok(r.seen.join(',') === 'scout,defense' && r.afterUnsub === 2,
  'Subscribers receive every change and unsubscribe cleanly', JSON.stringify(r));
ok(r.scoutClass === true && r.defaultUnitScout === 'offense' && r.defaultUnitDefense === 'defense',
  'Scout presentation and the sticky charting unit follow the context, not a hidden select', JSON.stringify(r));

console.log('\n== 6. Invalid values are refused, not stored ==');
r = await page.evaluate(() => {
  const app = window.app;
  app.gameContext.update({ perspective: 'offense', direction: '' });
  return {
    badPerspective: app.gameContext.update({ perspective: 'sideline' }),
    badDirection: app.gameContext.update({ direction: 'sideways' }),
    unchanged: app.gameContext.snapshot(),
    noopReturns: app.gameContext.update({ perspective: 'offense' }),
  };
});
ok(r.badPerspective === false && r.badDirection === false
  && r.unchanged.perspective === 'offense' && r.unchanged.direction === '',
  'An invalid perspective or direction is refused rather than stored', JSON.stringify(r));
ok(r.noopReturns === false, 'Setting the same value reports no change', JSON.stringify(r));

console.log('\n== 7. New-game defaults, and report labels read the context ==');
r = await page.evaluate(async () => {
  const app = window.app;
  // Set identity the way a coach does — through the canonical team registry,
  // which is what carries forward. The old carry rode on a hidden input keeping
  // its value across a game load; that is not an owner.
  app.teamRegistry.saveTeamIdentity('Mavericks', 'navy');
  app.gameContext.update({ perspective: 'scout' });
  await app.storage.newGame();
  const fresh = app.gameContext.snapshot();
  // Report labels used to read #gameTeamName. They must follow the context now.
  app.gameContext.update({ teamName: 'Bulldogs' });
  return {
    freshPerspective: fresh.perspective,
    freshDirection: fresh.direction,
    identityCarried: fresh.teamName,
    label: app.stats._subjectName('Our Offense'),
  };
});
ok(r.freshPerspective === 'offense' && r.freshDirection === '',
  'A new game starts from the offense default with no inherited direction', JSON.stringify(r));
ok(r.identityCarried === 'Mavericks',
  'Team identity carries forward to a new game while film context does not', JSON.stringify(r));
ok(r.label === 'Bulldogs',
  'Report labels read the game context instead of the deleted #gameTeamName input', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
