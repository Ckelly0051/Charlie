/**
 * BD-UX-1 / BD-UX-2 (2026-10-01): the Break Down visual finish.
 *
 * Selectors: Program / Season / Game render as the shared two-line control
 * (label over value) on Break Down, never the retired single-line 22px band;
 * a real program name is not clipped at 1280; the menus are one titled pattern
 * with a checked current row and gold commands; a narrow viewport keeps all
 * three selectors reachable inside the viewport. Deck: every field label row
 * keeps one rhythm, Gap is a plain field on the deck's inset (it is independent
 * of Play Direction, S107-4), and a stored value the library does not offer is
 * read in full. Geometry here is regression evidence, not visual approval.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.breakdownWorkspace && document.querySelector('[data-native-home]'));
await page.evaluate(async () => {
  localStorage.setItem('ffa_teams', JSON.stringify([{ id: 'sjm', teamName: 'St. Joseph Mavericks' }, { id: 'dev', teamName: 'St. Joseph Academy Mavericks Freshman-Sophomore Development Program' }]));
  localStorage.setItem('ffa_active_team_id', 'sjm');
  localStorage.setItem('ffa_team_profile', JSON.stringify({ teamName: 'St. Joseph Mavericks' }));
  const app = window.app;
  await app.storage.createSeason({ name: '2026 St. Joseph Mavericks Varsity Fall Championship Schedule', team: 'St. Joseph Mavericks', year: '2026' });
  await app.storage.createSeason({ name: '2025 St. Joseph Mavericks - JV', team: 'St. Joseph Mavericks', year: '2025' });
  const store = app.storage.seasonStore, game = store.activeGame();
  game.gameInfo = { ...(game.gameInfo || {}), opponent: 'St. Peter Lutheran Patriots', week: '1', gameType: 'game', perspective: 'offense' };
  const tags = app.tagger.constructor.blankTags({ unit: 'offense' });
  game.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, notes: '', tags: { ...tags, formationFamily: 'Trey Open Wide', playType: 'Run Inside', runPass: 'Run', playDir: 'Left', gap: 'L-B' } }];
  store.setActive(game.id); await store.persist(); await app.storage._loadActiveGame({ renderGames: false });
  app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
});
await sleep(600);

const selectors = () => page.evaluate(() => [...document.querySelectorAll('.ws-ctx')].map(button => {
  const rect = button.getBoundingClientRect(), label = button.querySelector('.ws-ctx-label'), value = button.querySelector('.ws-ctx-value');
  const labelRect = label.getBoundingClientRect(), valueRect = value.getBoundingClientRect();
  return { id: button.id, w: Math.round(rect.width), h: Math.round(rect.height), left: Math.round(rect.left), right: Math.round(rect.right),
    labelShown: getComputedStyle(label).display !== 'none' && labelRect.height > 0, labelAbove: labelRect.bottom <= valueRect.top + 1,
    labelFont: parseFloat(getComputedStyle(label).fontSize), valueFont: parseFloat(getComputedStyle(value).fontSize),
    clipped: value.scrollWidth > value.clientWidth + 1, value: value.textContent,
    barBottom: Math.round(document.querySelector('.ws-contextbar').getBoundingClientRect().bottom), bottom: Math.round(rect.bottom) };
}));

console.log('\n== BD-UX-2: closed selectors ==');
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h }); await sleep(250);
  const s = await selectors();
  ok(s.length === 3 && s.every(c => c.labelShown && c.labelAbove), `${w}: Program, Season and Game each show their label above the value`, s);
  ok(s.every(c => c.labelFont >= 12.5 && c.valueFont >= 13), `${w}: selector type is not shrunk`, s.map(c => [c.labelFont, c.valueFont]));
  ok(s.every(c => c.h >= 34 && c.bottom <= c.barBottom), `${w}: each control is a full two-line target inside its row`, s.map(c => [c.h, c.bottom, c.barBottom]));
  ok(s.every(c => !c.clipped), `${w}: no selector value is clipped`, s.map(c => [c.value, c.clipped]));
}

console.log('\n== BD-UX-2: one menu pattern ==');
await page.setViewport({ width: 1440, height: 900 }); await sleep(200);
const openMenu = async id => {
  await page.click(`#${id}`); await sleep(400);
  return page.evaluate(id => {
    const panel = document.querySelector('.gi-popover-panel');
    const anchor = document.getElementById(id).getBoundingClientRect();
    const items = [...panel.querySelectorAll('[role="menuitem"]')];
    return { context: panel.classList.contains('is-context'), title: panel.querySelector('.gi-popover-title')?.textContent || '',
      left: Math.round(panel.getBoundingClientRect().left), anchorLeft: Math.round(anchor.left),
      current: items.filter(item => item.getAttribute('aria-current') === 'true').map(item => ({ key: item.dataset.popoverItem, check: !!item.querySelector('.gi-popover-check') })),
      checks: panel.querySelectorAll('.gi-popover-check').length,
      commands: items.filter(item => item.classList.contains('is-command')).map(item => item.querySelector('span').textContent),
      focused: document.activeElement?.closest?.('.gi-popover-panel') === panel, expanded: document.getElementById(id).getAttribute('aria-expanded'),
      longName: items.some(item => /Development Program|Fall Championship Schedule/.test(item.textContent) && item.scrollWidth <= item.clientWidth + 1) };
  }, id);
};
const close = async id => { await page.keyboard.press('Escape'); await sleep(250); return page.evaluate(id => ({ focus: document.activeElement?.id, expanded: document.getElementById(id).getAttribute('aria-expanded'), open: !!document.querySelector('.gi-popover-panel') }), id); };
const program = await openMenu('wsCtxProgram');
ok(program.context && program.title === 'Switch program' && program.current.length === 1 && program.current[0].check && program.checks === 1, 'Program menu: titled, the current program checked once', program);
ok(program.commands.join() === '+ New program' && program.longName, 'Program menu: New program is a command and a long program name is shown whole', program);
let closed = await close('wsCtxProgram');
ok(!closed.open && closed.focus === 'wsCtxProgram' && closed.expanded === 'false', 'Escape closes the menu and returns focus to its selector', closed);
const season = await openMenu('wsCtxSeason');
ok(season.context && season.title === 'Switch season' && season.current.length === 1 && season.current[0].check, 'Season menu: titled, the open season checked', season);
ok(season.commands.join() === 'Season Library,+ New season' && season.longName && season.focused && season.expanded === 'true', 'Season menu: Season Library and New season are commands; long names whole; focus inside', season);
ok(Math.abs(season.left - season.anchorLeft) <= 1, 'Season menu opens aligned to its selector', season);
await close('wsCtxSeason');
const game = await openMenu('wsCtxGame');
ok(game.context && game.title === 'Switch game' && game.current.length === 1 && game.current[0].check && game.commands.length === 0, 'Game menu: same pattern, the open game checked', game);
await close('wsCtxGame');
const otherPopover = await page.evaluate(async () => {
  const anchor = document.getElementById('btnNativeMore');
  window.app.workspaceShell._openMore(anchor);
  await new Promise(resolve => setTimeout(resolve, 300));
  const panel = document.querySelector('.gi-popover-panel');
  const result = { context: panel?.classList.contains('is-context'), title: !!panel?.querySelector('.gi-popover-title') };
  window.app.overlays.close?.(window.app.overlays.snapshot().overlays.at(-1)?.id, 'cancel');
  return result;
});
ok(otherPopover.context === false && otherPopover.title === false, 'Other menus keep the general popover; only the three selectors take the context pattern', otherPopover);

console.log('\n== BD-UX-2: narrow ==');
await page.setViewport({ width: 390, height: 844 }); await sleep(400);
const narrow = await selectors();
ok(narrow.length === 3 && narrow.every(c => c.w > 0 && c.left >= -1 && c.right <= 391 && c.h >= 44), '390: all three selectors are reachable inside the viewport at a touch height', narrow);
const narrowMenu = await openMenu('wsCtxSeason');
ok(narrowMenu.context && narrowMenu.left >= 0, '390: the Season menu opens on screen', narrowMenu);
await close('wsCtxSeason');
await page.setViewport({ width: 1440, height: 900 }); await sleep(300);

console.log('\n== BD-UX-1: deck rhythm ==');
const deck = await page.evaluate(() => {
  const root = document.querySelector('[data-native-tagging]');
  const labels = [...root.querySelectorAll('.gi-tag-field > .gi-tag-field-label, .gi-play-call > .gi-tag-field-label')].filter(node => node.getClientRects().length)
    .map(node => ({ field: node.parentElement.dataset.nativeField || 'playCall', h: Math.round(node.getBoundingClientRect().height), left: Math.round(node.getBoundingClientRect().left),
      // Situation pairs (Quarter | Down, Hash | Field position) are deliberate side-by-side columns.
      column: !!node.closest('.gi-tag-situation-row, .gi-tag-grid') }));
  const gap = root.querySelector('[data-native-field="gap"]'), dir = root.querySelector('[data-native-field="playDir"]');
  const off = root.querySelector('[data-native-field="formationFamily"] button.is-off-library');
  const grid = off?.parentElement.getBoundingClientRect();
  return { labels, gapInDetail: !!gap?.closest('.gi-tag-detail'), gapLeft: Math.round(gap?.getBoundingClientRect().left ?? -1), dirLeft: Math.round(dir?.getBoundingClientRect().left ?? -2),
    gapIndent: gap ? parseFloat(getComputedStyle(gap).paddingLeft) + parseFloat(getComputedStyle(gap).borderLeftWidth) : -1,
    off: off ? { text: off.textContent.trim(), active: off.classList.contains('is-active'), full: Math.abs(off.getBoundingClientRect().width - grid.width) <= 1, clipped: off.scrollWidth > off.clientWidth + 1 } : null };
});
const heights = [...new Set(deck.labels.map(label => label.h))];
ok(deck.labels.length >= 8 && heights.length === 1 && heights[0] >= 22, 'Every field label row has one height, with or without an action', { heights, labels: deck.labels });
ok(new Set(deck.labels.filter(label => !label.column).map(label => label.left)).size === 1, 'Every full-width field label starts on the deck inset', deck.labels);
ok(!deck.gapInDetail && deck.gapIndent === 0 && deck.gapLeft === deck.dirLeft, 'Gap is a plain field aligned with Play Direction, not an indented detail', deck);
ok(deck.off && deck.off.text === 'Trey Open Wide' && deck.off.active && deck.off.full && !deck.off.clipped, 'A stored Formation the library does not offer is selected and read in full on its own row', deck.off);

// A stored name longer than the deck is wide wraps inside its full row; it is never cut.
const LONG = 'Doubles Tight Bunch Right Unbalanced Over Wing Slot Trade Motion Formation';
await page.evaluate(long => { const t = window.app.tagger, p = t.getCurrentPlay(); p.tags.formationFamily = long; t._emit('play-updated', p); }, LONG);
for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
  await page.setViewport({ width: w, height: h }); await sleep(350);
  await page.evaluate(() => document.querySelector('[data-native-tagging] [data-native-field="formationFamily"] button.is-off-library')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  if (process.env.GI_BD_SHOTS) await page.screenshot({ path: `${process.env.GI_BD_SHOTS}/long-formation-${w}.png` });
  const long = await page.evaluate(() => {
    const off = document.querySelector('[data-native-tagging] [data-native-field="formationFamily"] button.is-off-library');
    if (!off) return null;
    const grid = off.parentElement.getBoundingClientRect(), rect = off.getBoundingClientRect();
    return { text: off.textContent.trim(), clipped: off.scrollWidth > off.clientWidth + 1 || off.scrollHeight > off.clientHeight + 1,
      inside: rect.left >= grid.left - 1 && rect.right <= grid.right + 1, h: Math.round(rect.height), font: getComputedStyle(off).fontSize };
  });
  ok(long && long.text.length > 60 && !long.clipped && long.inside && long.h >= 27 && long.font === '12.5px',
    `${w}: a long stored Formation wraps in full inside the deck at the chip's type size`, long);
}

ok(errors.length === 0, 'No page errors', errors.slice(0, 3).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
