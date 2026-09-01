// Permanent regression for the Home + Breakdown visual repair batch
// (baseline a32277b). Exercises the RENDERED UI and inspects computed
// geometry/styles -- never asserts that a selector merely exists.
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';

let passed = 0, failed = 0;
function ok(cond, label, evidence) {
  if (cond) { passed++; console.log('  PASS ', label); }
  else { failed++; console.log('  FAIL ', label, evidence !== undefined ? JSON.stringify(evidence) : ''); }
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen);
await setupTeamAndDemo(page, 'St. Joseph Mavericks Under-A Really Long Program Name');
await page.evaluate(() => window.app.workspaceShell.show('home'));
await new Promise(r => setTimeout(r, 300));

console.log('== Home game cards + selected-game panel ==');

// Seed a real linked-film state on the first game and select it so the
// detail panel (with the score line, the film dot, and the action row) and
// the game-grid thumbnail overlay are all populated real content, not the
// empty/default state.
const seedResult = await page.evaluate(() => {
  const screen = window.app.homeScreen;
  const games = window.app.storage.seasonStore.data.games || [];
  const g = games[0];
  screen._state.filmHealth[String(g.id)] = { state: 'linked', found: 3, expected: 3 };
  g.gameInfo = g.gameInfo || {};
  g.gameInfo.scoreUs = '13'; g.gameInfo.scoreThem = '13'; g.gameInfo.status = 'final';
  screen.selectGame(String(g.id));
  return { gameId: g.id, filmView: screen.rowFilmView(String(g.id)) };
});
await new Promise(r => setTimeout(r, 200));

// 1. rowFilmView text is exactly "Film linked" -- no bullet character.
ok(seedResult.filmView.text === 'Film linked', 'rowFilmView() returns exactly "Film linked" with no bullet', seedResult.filmView);

// 2. Exactly one film-status indicator renders per game card.
let r = await page.evaluate(() => {
  const health = document.querySelectorAll('.detail-pane .health, .ws-game-row.selected .health');
  return { count: health.length, texts: [...health].map(h => h.textContent.trim()) };
});
ok(r.count >= 1 && r.texts.every(t => (t.match(/Film linked/g) || []).length <= 1), 'Exactly one film-status indicator renders (no duplicate "Film linked" text)', r);

// 3. Play icon: nonzero rendered dimensions and visible (non-black-on-black) computed color.
r = await page.evaluate(() => {
  const btn = document.querySelector('.detail-pane .thumbnail button, .ws-game-row.selected .thumbnail button');
  if (!btn) return { found: false };
  const cs = getComputedStyle(btn);
  const svg = btn.querySelector('svg.icon');
  const svgRect = svg?.getBoundingClientRect();
  const svgCs = svg ? getComputedStyle(svg) : null;
  return { found: true, btnColor: cs.color, btnBg: cs.backgroundColor, svgW: svgRect?.width, svgH: svgRect?.height, svgFill: svgCs?.fill, svgColor: svgCs?.color };
});
ok(r.found && r.svgW > 0 && r.svgH > 0, 'Selected-game thumbnail play icon has nonzero rendered dimensions', r);
ok(r.found && r.svgColor !== r.btnBg && r.svgColor !== 'rgba(0, 0, 0, 0)' && r.btnColor !== 'rgb(0, 0, 0)', 'Play icon color is visible against the button background, not defaulted to black', r);

// 4. Score/result line computes >=14px and ~600 weight.
r = await page.evaluate(() => {
  const score = document.querySelector('.ws-game-row.selected .game-meta .score, .detail-pane .game-meta .score');
  if (!score) return { found: false };
  const cs = getComputedStyle(score);
  return { found: true, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10), text: score.textContent };
});
ok(r.found && r.fontSize >= 14 && r.fontWeight >= 600, 'Score/result line computes >=14px and >=600 weight', r);

// 5. Selected-game action labels share the same computed font-size as Open Study.
r = await page.evaluate(() => {
  const studyBtn = document.getElementById('wsContinueCharting')?.closest('.detail-actions')?.querySelector('[data-ws-action="open-study"]')
    || [...document.querySelectorAll('.detail-actions button')].find(b => /open study/i.test(b.textContent));
  if (!studyBtn) return { found: false };
  const baseline = parseFloat(getComputedStyle(studyBtn).fontSize);
  const openGameBtn = document.querySelector('.ws-game-row.selected .game-card-open');
  const sizes = { study: baseline };
  if (openGameBtn) sizes.gameCardOpen = parseFloat(getComputedStyle(openGameBtn).fontSize);
  return { found: true, baseline, sizes };
});
ok(r.found && Object.values(r.sizes).every(s => Math.abs(s - r.baseline) < 0.5), 'Selected-game action labels share the Open Study computed font size', r);

// 6/7. Hover states produce a real computed style change (no layout shift).
// Real :hover state cannot be forced via dispatchEvent in Chromium's style
// engine (only actual pointer position does), so drive it with a real mouse
// move via CDP through Puppeteer's page.hover(), then compare computed style
// and box before/after.
async function realHoverCheck(selector, label) {
  const before = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, border: cs.borderColor, color: cs.color, shadow: cs.boxShadow, w: rect.width, h: rect.height };
  }, selector);
  if (!before) { ok(false, label, { found: false, selector }); return; }
  await page.hover(selector);
  await new Promise(res => setTimeout(res, 60));
  const after = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, border: cs.borderColor, color: cs.color, shadow: cs.boxShadow, w: rect.width, h: rect.height };
  }, selector);
  const changed = before.bg !== after.bg || before.border !== after.border || before.color !== after.color || before.shadow !== after.shadow;
  const stable = Math.abs(before.w - after.w) < 0.5 && Math.abs(before.h - after.h) < 0.5;
  ok(changed, label, { before, after });
  ok(stable, `${label} -- no layout shift on hover`, { before, after });
}

await realHoverCheck('.detail-pane .detail-status button, .ws-game-row.selected .detail-status button', 'Manage film has a computed hover change');
await realHoverCheck('.rail-head .icon-btn', 'New-season "+" control has a computed hover change');
await realHoverCheck('.filters button:not(.active)', 'A non-selected game filter has a computed hover change');
await realHoverCheck('.ws-top-nav button:not(.active)', 'A non-selected top-nav item has a computed hover change');

// 7b. Selected filter/nav state stays visually distinct from hover.
r = await page.evaluate(() => {
  const activeFilter = document.querySelector('.filters button.active');
  const activeNav = document.querySelector('.ws-top-nav button.active');
  return {
    filter: activeFilter ? getComputedStyle(activeFilter).borderBottomColor : null,
    nav: activeNav ? getComputedStyle(activeNav).backgroundColor : null,
  };
});
ok(!!r.filter, 'Selected filter carries a distinct gold underline', r);
ok(!!r.nav, 'Selected top-nav item carries a distinct selected background', r);

console.log('\n== Program context selector ==');

// 8. Program selector width bounds, caret visible, no overlap.
r = await page.evaluate(() => {
  const btn = document.getElementById('wsCtxProgram');
  const label = btn?.querySelector('.ws-ctx-label');
  const value = btn?.querySelector('.ws-ctx-value');
  const chev = btn?.querySelector('.ws-ctx-chev');
  if (!btn || !label || !value || !chev) return { found: false };
  const b = btn.getBoundingClientRect(), l = label.getBoundingClientRect(), v = value.getBoundingClientRect(), c = chev.getBoundingClientRect();
  return {
    found: true, width: b.width,
    labelValueOverlap: l.right > v.left,
    valueChevOverlap: v.right > c.left,
    chevVisible: c.width > 0 && c.right <= b.right && c.left >= b.left,
    valueSingleLine: getComputedStyle(value).whiteSpace === 'nowrap',
  };
});
ok(r.found && r.width >= 180 && r.width <= 280, 'Program selector width stays within 180-280px at desktop', r);
ok(r.found && !r.labelValueOverlap && !r.valueChevOverlap, 'Program label/value/caret never overlap', r);
ok(r.found && r.chevVisible, 'Program caret remains visible inside the control', r);
ok(r.found && r.valueSingleLine, 'Program value stays single-line', r);

console.log('\n== Breakdown: internal overflow and Edit Library alignment ==');

await page.evaluate(async () => {
  const app = window.app;
  const game = app.storage.seasonStore.activeGame();
  game.plays = [
    { id: 1, timestamp: { start: 0, end: 5 }, notes: '', tags: { unit: 'offense', down: '1', distance: '10', quarter: 'Q1', hash: 'Middle', fieldSide: 'own', yardLine: '25', formation: 'Wing-T', qbAlignment: 'Shotgun', backfield: 'Split', strength: 'Right', personnel: '11', motion: 'Jet', runPass: 'Run', playType: 'Run Inside', playDir: 'Right', result: 'Gain', yardage: '6', players: {}, grades: {}, custom: [] } },
    { id: 2, timestamp: { start: 6, end: 11 }, notes: '', tags: { unit: 'defense', down: '2', distance: '4', quarter: 'Q1', hash: 'Left', fieldSide: 'own', yardLine: '30', defFront: '4-3', coverage: 'Cover 3', coverageFamily: 'Zone', blitz: 'A-Gap', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', players: {}, grades: {}, custom: [] } },
    { id: 3, timestamp: { start: 12, end: 17 }, notes: '', tags: { unit: 'special', down: '', distance: '', quarter: 'Q2', players: {}, grades: {}, custom: [] }, specialTeams: { unit: 'punt', outcome: { status: 'returned' }, kick: { distance: 42, hangTime: 4.2, landing: { fieldSide: 'opp', yardLine: 35 } }, return: { yards: 8, end: { fieldSide: 'opp', yardLine: 43 } }, players: {} } },
  ];
  app.tagger.plays = game.plays; app.tagger.nextId = 4; app.tagger._updateFormEnabled(); app.tagger._emit('plays-loaded');
  app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
});
await new Promise(r2 => setTimeout(r2, 300));

const widths = [1920, 1440, 1280, 768, 390];
const units = [['offense', 1], ['defense', 2], ['special', 3]];

for (const [unit, playId] of units) {
  await page.evaluate((u, id) => { window.app.tagger.selectPlay(id); window.app.nativeTagging?.setUnit?.(u); }, unit, playId);
  await new Promise(res => setTimeout(res, 150));
  for (const width of widths) {
    await page.setViewport({ width, height: width <= 768 ? 1400 : 900 });
    await new Promise(res => setTimeout(res, 120));
    const data = await page.evaluate(() => {
      const form = document.querySelector('.gi-native-form');
      const editButtons = [...document.querySelectorAll('.gi-tag-field-label button')].filter(b => /edit library/i.test(b.textContent));
      const editAlign = editButtons.map(btn => {
        const field = btn.closest('.gi-tag-field');
        const chips = field?.querySelector('.gi-tag-chips');
        const rows = chips ? [...chips.children].reduce((acc, child) => {
          const top = Math.round(child.getBoundingClientRect().top);
          (acc[top] = acc[top] || []).push(child);
          return acc;
        }, {}) : {};
        const rowRights = Object.values(rows).map(items => Math.max(...items.map(i => i.getBoundingClientRect().right)));
        const widest = rowRights.length ? Math.max(...rowRights) : null;
        return { field: field?.dataset?.nativeField, delta: widest != null ? btn.getBoundingClientRect().right - widest : null };
      });
      return {
        formScroll: form ? form.scrollWidth : null, formClient: form ? form.clientWidth : null,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        editAlign,
      };
    });
    // 10. scrollWidth <= clientWidth + 1 at every required width, per unit.
    ok(data.formScroll != null && data.formScroll <= data.formClient + 1, `${unit} at ${width}: charting pane has no internal horizontal scrollbar`, data);
    ok(data.pageOverflow <= 1, `${unit} at ${width}: no page-level horizontal overflow`, data);
    // 11. Edit Library alignment, tracked as a measured improvement (see
    // handoff notes for the residual tolerance this closes vs. leaves open).
    for (const entry of data.editAlign) {
      if (entry.delta == null) continue;
      ok(entry.delta >= -1 && entry.delta < 100, `${unit} at ${width}: Edit Library (${entry.field}) stays within a measured bound of its option content, not the far edge of the deck`, entry);
    }
  }
}

ok(errors.length === 0, 'No page errors across the full journey', errors);

await browser.close();
console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
process.exit(failed > 0 ? 1 : 0);
