/**
 * FILM ROOM LAYOUT (coach direction, 2026-09-23). Video first: the editable
 * breakdown table docks below the film by default; the coach can move it beside
 * the film, drag or key the split within its limits, reset it, and keep it
 * across reloads. The table itself must not notice: selection, inline editing
 * and large-game row windowing keep working in both docks and at every split,
 * because the windowing re-measures its own scroller when the split moves.
 * Run:  node tools/e2e-film-room-layout.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40)))));

const N = 300;
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error' && !/Film Room layout could not be saved/.test(message.text())) errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });
await page.evaluate(() => localStorage.removeItem('ffa_film_room_layout'));

async function seed() {
  await page.evaluate(async (n) => {
    const app = window.app;
    if (!app.storage.seasonStore.data) await app.storage.createSeason({ name: 'Film Room Layout', team: 'Mavs', year: '2026' });
    const g = app.storage.seasonStore.activeGame();
    const plays = [];
    for (let i = 1; i <= n; i++) {
      plays.push({ id: i, timestamp: { start: i * 3, end: i * 3 + 4 }, notes: '', annotations: [],
        tags: { unit: 'offense', down: '1', distance: '10', formation: 'Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', custom: [], players: {}, grades: {} } });
    }
    g.plays = plays; g.nextId = n + 1;
    app.tagger.plays = g.plays; app.tagger.nextId = n + 1; app.tagger._emit('plays-loaded');
    await app.storage.commitActive();
    await app.workspaceShell.show('breakdown');
    document.querySelector('[data-bd-view="film-room"]').click();
  }, N);
  await settle(page);
}

const measure = () => page.evaluate(() => {
  const box = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const route = document.querySelector('[data-native-breakdown-route]');
  const splitter = document.querySelector('[data-fr-splitter]');
  const tools = document.querySelector('.gi-breakdown-tools');
  return {
    dock: route?.dataset.frDock, video: route?.style.getPropertyValue('--fr-video'),
    theater: box('[data-breakdown-theater-host]'), deck: box('.gi-breakdown-deck'), splitter: box('[data-fr-splitter]'),
    table: box('.gi-film-table-wrap'), group: box('.gi-breakdown-layout'), controls: box('[data-film-controls]'),
    aria: splitter && { role: splitter.getAttribute('role'), orient: splitter.getAttribute('aria-orientation'), now: Number(splitter.getAttribute('aria-valuenow')), min: Number(splitter.getAttribute('aria-valuemin')), max: Number(splitter.getAttribute('aria-valuemax')), tab: splitter.tabIndex },
    pressed: [...document.querySelectorAll('button[data-fr-dock]')].map(b => `${b.dataset.frDock}:${b.getAttribute('aria-pressed')}`).join(','),
    stored: localStorage.getItem('ffa_film_room_layout'),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    toolsOverflow: tools ? tools.scrollWidth - tools.clientWidth : null,
    domRows: document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length,
  };
});

console.log('\n== 1. Default: film first, table below ==');
await seed();
let m = await measure();
ok(m.dock === 'bottom' && m.video === '62%', 'the default dock is below the film at a 62% film share', JSON.stringify({ dock: m.dock, video: m.video }));
ok(m.theater && m.deck && m.theater.b <= m.splitter.y + 1 && m.splitter.b <= m.deck.y + 1, 'film, separator and table stack top to bottom', JSON.stringify({ t: m.theater, s: m.splitter, d: m.deck }));
// Approved 2026-09-24: the film band is the film plus the table's controls card;
// together they span the table's width, and the band is the larger share.
ok(m.controls && Math.abs(m.theater.x - m.deck.x) < 2 && Math.abs(m.controls.r - m.deck.r) < 2 && m.theater.h > m.deck.h, 'the film band (film + controls card) spans the table width and takes the larger share', JSON.stringify({ t: m.theater, c: m.controls, d: m.deck }));
ok(m.aria?.role === 'separator' && m.aria.orient === 'horizontal' && m.aria.now === 62 && m.aria.min === 40 && m.aria.max === 75 && m.aria.tab === 0,
  'the splitter is a focusable separator stating its orientation, value and limits', JSON.stringify(m.aria));
ok(m.pressed === 'bottom:true,side:false', 'the Below control reads pressed', m.pressed);
// The route carries data-fr-dock as its state; it is not one of the buttons.
const routeState = await page.evaluate(() => { const r = document.querySelector('[data-native-breakdown-route]'); return { pressed: r.getAttribute('aria-pressed'), active: r.classList.contains('active') }; });
ok(routeState.pressed === null && !routeState.active, 'the route is never treated as a dock button', JSON.stringify(routeState));
ok(m.stored === null, 'nothing is stored until the coach changes the layout', String(m.stored));
ok(m.domRows > 0 && m.domRows < N, 'a large game still windows its rows below the film', String(m.domRows));

console.log('\n== 2. Chart view carries no Film Room layout chrome ==');
await page.click('[data-bd-view="chart"]'); await settle(page);
m = await measure();
ok(!m.group && !m.splitter, 'the layout controls and the splitter are absent from Chart', JSON.stringify({ g: m.group, s: m.splitter }));
await page.click('[data-bd-view="film-room"]'); await settle(page);

console.log('\n== 3. Dragging the split: clamped, and saved on release ==');
const drag = async (fromX, fromY, toX, toY) => {
  await page.mouse.move(fromX, fromY); await page.mouse.down();
  await page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 4 });
  await page.mouse.move(toX, toY, { steps: 4 }); await page.mouse.up(); await settle(page);
};
m = await measure();
const rowsBefore = m.domRows;
let cx = m.splitter.x + m.splitter.w / 2, cy = m.splitter.y + m.splitter.h / 2;
await drag(cx, cy, cx, m.theater.y + 0.5 * (m.deck.b - m.theater.y));
m = await measure();
ok(m.aria.now >= 48 && m.aria.now <= 52 && m.video === `${m.aria.now}%`, 'dragging to mid-height sets the film share near 50%', JSON.stringify({ now: m.aria.now, video: m.video }));
ok(JSON.parse(m.stored || '{}').bottom === m.aria.now, 'the dragged split is stored on release', String(m.stored));
ok(m.domRows > rowsBefore, 'a taller table renders more windowed rows (the virtualizer re-measured)', JSON.stringify({ before: rowsBefore, after: m.domRows }));
cx = m.splitter.x + m.splitter.w / 2; cy = m.splitter.y + m.splitter.h / 2;
await drag(cx, cy, cx, 60);
m = await measure();
ok(m.aria.now === 40 && m.theater.h >= 239, 'dragging past the top stops at the 40% film floor', JSON.stringify({ now: m.aria.now, h: m.theater.h }));
cx = m.splitter.x + m.splitter.w / 2; cy = m.splitter.y + m.splitter.h / 2;
await drag(cx, cy, cx, 895);
m = await measure();
ok(m.aria.now === 75 && m.deck.h >= 179, 'dragging past the bottom stops at 75%, leaving the table its floor', JSON.stringify({ now: m.aria.now, h: m.deck.h }));

console.log('\n== 4. Keyboard resizing ==');
await page.focus('[data-fr-splitter]');
await page.keyboard.press('Home'); await settle(page);
let k = (await measure()).aria.now;
await page.keyboard.press('ArrowDown'); await settle(page);
const k2 = (await measure()).aria.now;
await page.keyboard.press('PageDown'); await settle(page);
const k3 = (await measure()).aria.now;
await page.keyboard.press('End'); await settle(page);
const k4 = (await measure()).aria.now;
ok(k === 40 && k2 === 42 && k3 === 52 && k4 === 75, 'Home, ArrowDown, PageDown and End move the split by its steps and limits', JSON.stringify([k, k2, k3, k4]));

console.log('\n== 5. Table beside the film ==');
await page.click('button[data-fr-dock="side"]'); await settle(page);
m = await measure();
ok(m.dock === 'side' && m.theater.r <= m.splitter.x + 1 && m.splitter.r <= m.deck.x + 1, 'Beside puts film, separator and table left to right', JSON.stringify({ t: m.theater, s: m.splitter, d: m.deck }));
ok(m.aria.orient === 'vertical' && m.aria.now === 45 && m.aria.min === 30 && m.aria.max === 65, 'the side split has its own value and limits', JSON.stringify(m.aria));
ok(m.pressed === 'bottom:false,side:true' && JSON.parse(m.stored).dock === 'side', 'Beside reads pressed and is stored', `${m.pressed} ${m.stored}`);
ok(JSON.parse(m.stored).bottom === 75, 'each dock keeps its own split', String(m.stored));
await page.focus('[data-fr-splitter]');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await settle(page);
m = await measure();
ok(m.aria.now === 49, 'ArrowRight widens the film beside the table', String(m.aria.now));
cx = m.splitter.x + m.splitter.w / 2; cy = m.splitter.y + m.splitter.h / 2;
await drag(cx, cy, 5, cy);
m = await measure();
ok(m.aria.now === 30 && m.theater.w >= 359, 'dragging past the left edge stops at the 30% film floor', JSON.stringify({ now: m.aria.now, w: m.theater.w }));
ok(m.pageOverflow <= 0 && m.toolsOverflow === 0, 'no page or toolbar overflow beside the film at 1440', JSON.stringify({ p: m.pageOverflow, t: m.toolsOverflow }));

console.log('\n== 6. The table still works beside the film ==');
let r = await page.evaluate(async (n) => {
  const app = window.app;
  const cell = document.querySelector('[data-cell="3:sit"]');
  cell?.click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const selected = app.tagger.currentPlayId;
  const wrap = document.querySelector('.gi-film-table-wrap');
  wrap.scrollTop = wrap.scrollHeight; wrap.dispatchEvent(new Event('scroll'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const last = !!document.querySelector(`[data-cell="${n}:sit"]`);
  return { selected, last, hasCell: !!cell };
}, N);
ok(r.hasCell && r.selected === 3, 'clicking a row cell selects its play', JSON.stringify(r));
ok(r.last, 'scrolling the side table reaches the last of 300 plays', JSON.stringify(r));
r = await page.evaluate(async (n) => {
  document.querySelector(`[data-cell="${n}:sit"]`).click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  // The click re-renders the selected row; open the editor from the live cell.
  const cell = document.querySelector(`[data-cell="${n}:sit"]`);
  cell.focus();
  cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(res => requestAnimationFrame(res));
  [...document.querySelectorAll('.gi-film-cell-editor .gi-film-option-chips button')].find(b => b.textContent.trim() === '3')?.click();
  await new Promise(res => requestAnimationFrame(res));
  const distance = document.querySelector('.gi-film-cell-editor input[type="number"]');
  if (distance) { distance.value = '8'; distance.dispatchEvent(new Event('input', { bubbles: true })); }
  await new Promise(res => requestAnimationFrame(res));
  [...document.querySelectorAll('.gi-film-cell-editor footer button')].find(b => /done/i.test(b.textContent))?.click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = window.app.tagger.plays.find(p => p.id === n);
  return { down: play.tags.down, distance: play.tags.distance };
}, N);
ok(r.down === '3' && r.distance === '8', 'an inline edit on the last play commits beside the film', JSON.stringify(r));

console.log('\n== 7. Persistence and bad stored values ==');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });
r = await page.evaluate(() => window.app.breakdownWorkspace.filmLayout);
ok(r.dock === 'side' && r.side === 30 && r.bottom === 75, 'the layout survives a reload', JSON.stringify(r));
r = await page.evaluate(() => {
  const W = window.app.breakdownWorkspace.constructor;
  const mem = v => ({ getItem: () => v });
  return {
    junk: W.readLayout(mem('{not json')),
    wild: W.readLayout(mem(JSON.stringify({ dock: 'left', bottom: 5, side: 999 }))),
    text: W.readLayout(mem(JSON.stringify({ dock: 'side', bottom: 'tall', side: null }))),
  };
});
ok(JSON.stringify(r.junk) === JSON.stringify({ dock: 'bottom', bottom: 62, side: 45 }), 'an unreadable stored layout falls back to the default', JSON.stringify(r.junk));
ok(r.wild.dock === 'bottom' && r.wild.bottom === 40 && r.wild.side === 65, 'an unknown dock and out-of-range splits are clamped', JSON.stringify(r.wild));
ok(r.text.dock === 'side' && r.text.bottom === 62 && r.text.side === 45, 'non-numeric splits take the default', JSON.stringify(r.text));

console.log('\n== 8. Reset ==');
await seed();
await page.click('[data-fr-reset]'); await settle(page);
m = await measure();
ok(m.dock === 'bottom' && m.aria.now === 62 && m.stored === null, 'Reset restores the default and clears the stored layout', JSON.stringify({ dock: m.dock, now: m.aria.now, stored: m.stored }));
await page.focus('[data-fr-splitter]'); await page.keyboard.press('Home'); await settle(page);
m = await measure();
cx = m.splitter.x + m.splitter.w / 2; cy = m.splitter.y + m.splitter.h / 2;
await page.mouse.click(cx, cy, { count: 2 }); await settle(page);
m = await measure();
ok(m.aria.now === 62, 'double-clicking the splitter restores the default split', String(m.aria.now));

console.log('\n== 9. A storage write failure never breaks the layout ==');
r = await page.evaluate(async () => {
  const ws = window.app.breakdownWorkspace;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) { if (key === 'ffa_film_room_layout') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, key, value); };
  let threw = false;
  try { ws.setFilmLayout({ dock: 'side' }); } catch (e) { threw = true; }
  Storage.prototype.setItem = orig;
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { threw, dock: document.querySelector('[data-native-breakdown-route]').dataset.frDock };
});
ok(!r.threw && r.dock === 'side', 'a failed layout write still applies the layout on screen', JSON.stringify(r));
await page.evaluate(() => window.app.breakdownWorkspace.resetFilmLayout());

console.log('\n== 9b. Approved composition (coach, 2026-09-24): cards beside the film ==');
// Table below: the play card is a full-height column against the table's
// controls card, both the height of the top band, and the table starts at its
// column headers. Every play detail shows; a long card scrolls inside itself.
const comp = () => page.evaluate(() => {
  const box = e => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
  const card = document.querySelector('.gi-theater-selected-play');
  const controls = document.querySelector('[data-film-controls]');
  const cs = card && getComputedStyle(card);
  return {
    theater: box(document.querySelector('[data-breakdown-theater-host]')),
    stage: box(document.querySelector('.gi-theater-stage')),
    card: box(card), controls: box(controls),
    table: box(document.querySelector('.gi-film-table-wrap')), deck: box(document.querySelector('.gi-breakdown-deck')),
    controlsInTable: !!document.querySelector('[data-native-film-room] [data-film-controls]'),
    cardInStage: !!document.querySelector('.gi-theater-stage .gi-theater-selected-play'),
    details: card ? card.querySelectorAll('details').length : null,
    cardText: card?.textContent || '',
    rule: cs && `${cs.borderTopWidth} ${cs.borderTopStyle}`, ruleColor: cs?.borderTopColor,
    gold: getComputedStyle(document.documentElement).getPropertyValue('--gi-bd-gold').trim(),
    cardScroll: card && { overflow: cs.overflowY, sh: card.scrollHeight, ch: card.clientHeight },
    controlsScroll: controls && getComputedStyle(controls).overflowY,
  };
});
await page.setViewport({ width: 1280, height: 800 });
await page.evaluate(() => { window.app.breakdownWorkspace.resetFilmLayout(); window.app.tagger.selectPlay(5); });
await settle(page);
let c = await comp();
ok(c.controls && !c.controlsInTable && c.controls.l >= c.theater.r - 1 && Math.abs(c.controls.t - c.theater.t) <= 1 && Math.abs(c.controls.b - c.theater.b) <= 1,
  'table below: the table controls are their own card, right of the film, the full height of the band', JSON.stringify(c));
ok(c.card && !c.cardInStage && c.card.r <= c.controls.l && c.controls.l - c.card.r <= 8 && Math.abs(c.card.t - c.theater.t) <= 1 && Math.abs(c.card.b - c.theater.b) <= 1,
  'table below: the play card is a full-height column against the controls card', JSON.stringify({ card: c.card, controls: c.controls, theater: c.theater }));
ok(c.stage && c.stage.r <= c.card.l, 'the film stage ends where the play card begins (nothing overlaps the film)', JSON.stringify({ stage: c.stage, card: c.card }));
ok(c.table && c.table.t - c.deck.t <= 60, 'the table starts at its column headers, with no title or filter rows above them', JSON.stringify({ table: c.table, deck: c.deck }));
ok(c.details === 0 && /Play 5/.test(c.cardText), 'the play card shows every detail with no disclosure', JSON.stringify({ details: c.details, text: c.cardText.slice(0, 80) }));
ok(c.rule === '2px solid' && c.cardScroll.overflow === 'auto' && c.controlsScroll === 'auto',
  'the play card carries its gold top rule, and both cards scroll inside themselves', JSON.stringify({ rule: c.rule, color: c.ruleColor, scroll: c.cardScroll, controls: c.controlsScroll }));
// A play whose notes run long scrolls inside the card; the card never grows.
const before = c.card;
await page.evaluate(() => { const t = window.app.tagger, p = t.getPlay(5); p.notes = Array.from({ length: 60 }, (_, i) => `Note line ${i + 1}: backside tackle blocks down, guard pulls.`).join('\n'); t._emit('play-updated', p); t.selectPlay(5); });
await settle(page);
c = await comp();
ok(c.cardScroll.sh > c.cardScroll.ch && c.card.t === before.t && c.card.b === before.b,
  'long play notes scroll inside the play card without changing its size', JSON.stringify({ scroll: c.cardScroll, before, after: c.card }));
await page.evaluate(() => { const t = window.app.tagger, p = t.getPlay(5); p.notes = ''; t._emit('play-updated', p); });
// Table beside: the controls are a bar over the table, the play card sits in the film column.
await page.evaluate(() => window.app.breakdownWorkspace.setFilmLayout({ dock: 'side' }, { persist: false }));
await settle(page);
c = await comp();
ok(c.controls && Math.abs(c.controls.l - c.deck.l) <= 1 && c.controls.b <= c.table.t + 1 && c.card.r <= c.theater.r,
  'table beside: the controls are a bar over the table and the play card stays in the film column', JSON.stringify(c));
await page.evaluate(() => window.app.breakdownWorkspace.resetFilmLayout());
await page.setViewport({ width: 1440, height: 900 }); await settle(page);

console.log('\n== 10. Film focus and narrow widths ==');
await page.evaluate(() => window.app.breakdownWorkspace._setFilmFocus(true)); await settle(page);
m = await measure();
const focusControls = await page.evaluate(() => { const e = document.querySelector('[data-film-controls]'); return !!(e && e.getClientRects().length); });
ok(!m.splitter && !m.deck && !focusControls, 'Film focus hides the table, its controls and its splitter', JSON.stringify({ s: m.splitter, d: m.deck, focusControls }));
await page.evaluate(() => window.app.breakdownWorkspace._setFilmFocus(false)); await settle(page);
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  await page.setViewport({ width: w, height: h }); await settle(page);
  m = await measure();
  ok(m.pageOverflow <= 0 && m.toolsOverflow === 0 && m.theater.b <= m.deck.y + 11, `${w}: film above table with no page or toolbar overflow`, JSON.stringify({ p: m.pageOverflow, t: m.toolsOverflow }));
  // The save label is widest while a write is pending ("Saving...").
  const pending = await page.evaluate(() => { const ws = window.app.breakdownWorkspace; ws.setSaveState('pending'); const t = document.querySelector('.gi-breakdown-tools'); const over = t.scrollWidth - t.clientWidth; ws.setSaveState('saved'); return over; });
  ok(pending === 0, `${w}: no toolbar overflow while the save label reads Saving...`, String(pending));
}
await page.setViewport({ width: 900, height: 1024 }); await settle(page);
m = await measure();
ok(!m.splitter && !m.group && m.pageOverflow <= 0, 'below 1001px the stacked mobile layout carries no splitter or layout controls', JSON.stringify({ s: m.splitter, g: m.group, p: m.pageOverflow }));

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
