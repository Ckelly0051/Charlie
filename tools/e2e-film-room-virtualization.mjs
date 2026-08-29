/**
 * V2-H large-game Film Room performance: proves the windowed row renderer in
 * native-film-room.jsx is functionally identical to rendering every row --
 * scrolling, keyboard navigation far beyond the rendered window, inline
 * editing, and select-all all still operate on the TRUE full play set even
 * though only a subset is ever a real <tr> at once. This is a permanent
 * regression for the V2-H checkpoint that added row windowing after
 * measuring a real, demonstrated bottleneck (a large game's Chart<->Film
 * Room switch cost scaling with total play count): see the checkpoint
 * handoff in CLAUDE.md / GRIDIRON-IQ-PLAN-V2.md for the measured numbers.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

const N = 300;
console.log('\n== 1. A large game windows its rendered rows without losing any play ==');
await page.evaluate(async (n) => {
  await app.storage.createSeason({ name: 'Virtualization', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const plays = [];
  for (let i = 1; i <= n; i++) {
    plays.push({
      id: i, timestamp: { start: i * 3, end: i * 3 + 4 }, notes: '',
      tags: { unit: 'offense', down: '1', distance: '10', formation: 'Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', custom: [], players: {}, grades: {} },
      annotations: [],
    });
  }
  g.plays = plays; g.nextId = n + 1;
  app.tagger.plays = g.plays; app.tagger.nextId = n + 1; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
  document.querySelector('[data-bd-view="film-room"]').click();
}, N);
await settle(page);
await page.evaluate(() => new Promise(r => setTimeout(r, 60)));
await settle(page);

let r = await page.evaluate(() => {
  const domRows = document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length;
  const snapshot = window.app.playGrid.nativeSnapshot();
  return { domRows, total: snapshot.total, visible: snapshot.visible };
});
ok(r.total === N && r.visible === N, 'the model reports every play regardless of rendering', JSON.stringify(r));
ok(r.domRows > 0 && r.domRows < N, 'the DOM renders a genuinely smaller, nonempty window of rows', JSON.stringify(r));

console.log('\n== 2. Scrolling brings any play into the DOM on demand ==');
r = await page.evaluate(async (n) => {
  const wrap = document.querySelector('.gi-film-table-wrap');
  wrap.scrollTop = wrap.scrollHeight;
  wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { lastFound: !!document.querySelector(`[data-cell="${n}:sit"]`) };
}, N);
ok(r.lastFound, 'scrolling to the bottom brings the final play into the DOM', JSON.stringify(r));

console.log('\n== 3. Keyboard navigation and editing work far outside the initial window ==');
r = await page.evaluate(async () => {
  const wrap = document.querySelector('.gi-film-table-wrap');
  wrap.scrollTop = 0;
  wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelector('[data-cell="1:sit"]').click();
  await new Promise(res => requestAnimationFrame(res));
  const walk = [];
  for (let i = 0; i < 60; i++) {
    wrap.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await new Promise(res => requestAnimationFrame(res));
    walk.push(document.activeElement?.dataset?.cell || null);
  }
  const active = document.activeElement;
  const playId = Number(active.dataset.cell.split(':')[0]);
  active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(res => requestAnimationFrame(res));
  const downBtn = [...document.querySelectorAll('.gi-film-cell-editor .gi-film-option-chips button')].find(b => b.textContent.trim() === '3');
  downBtn?.click();
  await new Promise(res => requestAnimationFrame(res));
  const distanceInput = document.querySelector('.gi-film-cell-editor input[type="number"]');
  if (distanceInput) { distanceInput.value = '8'; distanceInput.dispatchEvent(new Event('input', { bubbles: true })); }
  await new Promise(res => requestAnimationFrame(res));
  const doneBtn = [...document.querySelectorAll('.gi-film-cell-editor footer button')].find(b => /done/i.test(b.textContent));
  doneBtn?.click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = window.app.tagger.plays.find(p => p.id === playId);
  return { walk, playId, down: play?.tags?.down, distance: play?.tags?.distance };
});
const expectedWalk = Array.from({ length: 60 }, (_, i) => `${i + 2}:sit`);
ok(r.walk.every((cell, i) => cell === expectedWalk[i]), 'arrow-key navigation reaches every row across 60 steps beyond the rendered window', JSON.stringify({ playId: r.playId, tail: r.walk.slice(-3) }));
ok(r.down === '3' && r.distance === '8', 'editing a cell reached only via keyboard nav (far outside the initial window) commits correctly', JSON.stringify(r));

console.log('\n== 4. Select-all operates on the true full set, not the rendered window ==');
r = await page.evaluate(() => {
  document.querySelector('[data-native-film-room] thead input[type="checkbox"]').click();
  return { selectedCount: window.app.playGrid.selected.size };
});
ok(r.selectedCount === N, 'select-all selects every play, not just the windowed rows', JSON.stringify(r));
await page.evaluate(() => document.querySelector('[data-native-film-room] thead input[type="checkbox"]').click());

console.log('\n== 5. A wholesale game switch never strands the window past the end of a shorter list ==');
r = await page.evaluate(async () => {
  const mk = id => ({ id, timestamp: { start: id * 3, end: id * 3 + 4 }, notes: '', tags: { unit: 'offense', down: '1', distance: '10', formation: 'Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', custom: [], players: {}, grades: {} }, annotations: [] });
  const wrap = document.querySelector('.gi-film-table-wrap');
  wrap.scrollTop = wrap.scrollHeight * 0.8;
  wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  await window.app.storage.newGame();
  const g2 = window.app.storage.seasonStore.activeGame();
  g2.plays = Array.from({ length: 12 }, (_, i) => mk(i + 1));
  g2.nextId = 13;
  window.app.tagger.plays = g2.plays; window.app.tagger.nextId = 13; window.app.tagger._emit('plays-loaded');
  await window.app.storage.commitActive();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 60))));
  const domRows = document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length;
  const snapshot = window.app.playGrid.nativeSnapshot();
  return { domRows, total: snapshot.total };
});
ok(r.total === 12 && r.domRows === 12, 'switching to a much shorter game while deeply scrolled renders every one of its rows', JSON.stringify(r));

// Re-seed the original 300-play fixture -- section 5 replaced it with a
// 12-play game.
await page.evaluate(async (n) => {
  await app.storage.createSeason({ name: 'Virtualization 2', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const plays = [];
  for (let i = 1; i <= n; i++) {
    plays.push({
      id: i, timestamp: { start: i * 3, end: i * 3 + 4 }, notes: '',
      tags: { unit: 'offense', down: '1', distance: '10', formation: 'Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', custom: [], players: {}, grades: {} },
      annotations: [],
    });
  }
  g.plays = plays; g.nextId = n + 1;
  app.tagger.plays = g.plays; app.tagger.nextId = n + 1; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
}, N);
await settle(page);

console.log('\n== 6. A far-away active row stays PINNED, not spanned -- the DOM stays bounded ==');
// Codex review (P1): the active row used to be pinned by EXPANDING the
// scroll window to cover it, so a coach parked on row 1 who scrolled near
// the bottom of a 300-play game rendered a window spanning nearly the
// entire table -- exactly defeating the point of windowing. This proves the
// disjoint-segment repair: both the active row and the scrolled-to rows
// render, everything strictly between them does not, and the total DOM row
// count stays a small, bounded number regardless of how far apart they are.
r = await page.evaluate(async (n) => {
  const wrap = document.querySelector('.gi-film-table-wrap');
  wrap.scrollTop = 0; wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelector('[data-cell="1:sit"]').click(); // play 1 becomes the active/focused cell
  await new Promise(res => requestAnimationFrame(res));
  wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight; // scroll to the very bottom, far from play 1
  wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  return {
    domRows: document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length,
    activeRowPresent: !!document.querySelector('[data-cell="1:sit"]'),
    nearBottomPresent: !!document.querySelector(`[data-cell="${n}:sit"]`),
    midRowAbsent: !document.querySelector(`[data-cell="${Math.round(n / 2)}:sit"]`),
  };
}, N);
ok(r.domRows < 100, 'the rendered row count stays bounded, not one span covering the gap to the active row', JSON.stringify(r));
ok(r.activeRowPresent, 'the far-away active row is still individually pinned in the DOM', JSON.stringify(r));
ok(r.nearBottomPresent, 'the rows actually scrolled to are rendered', JSON.stringify(r));
ok(r.midRowAbsent, 'rows strictly between the active row and the scroll position are NOT rendered', JSON.stringify(r));

console.log('\n== 7. Several scroll events inside one animation frame resolve to the LATEST position ==');
// Codex review (P2): the scroll handler used to capture scrollTop once and
// discard it if a frame was already queued, so a fast scrollbar drag could
// leave the rendered window stuck at whichever position happened to be
// current for the FIRST event in the batch. These three scrollTop changes
// are dispatched synchronously, in the same script turn -- strictly before
// the animation frame queued by the first one can possibly run -- exactly
// reproducing "several scroll events land before the frame fires".
r = await page.evaluate(async (n) => {
  const wrap = document.querySelector('.gi-film-table-wrap');
  document.activeElement?.blur?.();
  wrap.scrollTop = 0; wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  wrap.scrollTop = 40; wrap.dispatchEvent(new Event('scroll'));
  wrap.scrollTop = Math.round(wrap.scrollHeight / 2); wrap.dispatchEvent(new Event('scroll'));
  wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight; wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  return {
    domRows: document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length,
    nearBottomPresent: !!document.querySelector(`[data-cell="${n}:sit"]`),
    nearTopPresent: !!document.querySelector('[data-cell="2:sit"]'),
  };
}, N);
ok(r.nearBottomPresent, 'the final (third, same-frame) scroll position wins -- rows near the bottom render', JSON.stringify(r));
ok(!r.nearTopPresent, 'an earlier, superseded same-frame scroll position is not what gets rendered', JSON.stringify(r));
ok(r.domRows < 100, 'the resolved window is still a bounded slice, not the stale first position plus drift', JSON.stringify(r));

console.log('\nPage errors:', errors.length, errors.slice(0, 5).join(' | '));
ok(errors.length === 0, 'Film Room virtualization journey has zero page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
