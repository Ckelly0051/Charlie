/**
 * Breakdown installed-viewport geometry, and the shared context-selector surface.
 *
 * BD-VP  Scrollbar layout parity. Chromium's headless scrollbars are OVERLAY and
 *        consume no layout; installed WebView2 uses classic Windows scrollbars,
 *        which consume ~17px and render arrow BUTTONS with no accessible name.
 *        A Breakdown pane that fits exactly here therefore overflowed there,
 *        producing the horizontal track and the "tiny detached arrows" the coach
 *        reported at ~1420x1000. The route now reserves the gutter in BOTH
 *        environments (so this harness measures the installed layout), forbids a
 *        horizontal track on the vertical panes, and removes the arrow buttons.
 *
 * CTX    One neutral graphite control surface for Program / Season / Game at the
 *        shared context-bar owner. Measured before: bar #0c0c0c against selector
 *        #181818, a 1.25:1 ratio, so the three dropdowns read as labels. The open
 *        state used the rejected blue-gray #17283d.
 *
 * Screenshots are implementation evidence only and confer no design approval.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== '' ? ' -- ' + JSON.stringify(extra) : ''}`); }
};
const SHOTS = process.env.GI_BD_SHOTS || path.join('artifacts', 'breakdown-viewport');
fs.mkdirSync(SHOTS, { recursive: true });

// Relative luminance / contrast, so "visibly distinct" is measured not asserted.
const lum = rgb => {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const parse = s => (String(s).match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const ratio = (a, b) => { const la = lum(parse(a)), lb = lum(parse(b)); return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2)); };
const isBlueish = s => { const [r, g, b] = parse(s); return b - r >= 8 && b - g >= 8; };

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(9000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ffa_breakdown_film_focus'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.breakdownWorkspace && document.querySelector('[data-native-home]'));

// A populated game: enough plays for the rail to fill, across all three units,
// with the long real names the context bar has to hold.
await page.evaluate(async () => {
  await app.storage.createSeason({ name: '2025 St. Joseph Mavericks - JV', team: 'St. Joseph Mavericks', year: '2025' });
  const game = app.storage.seasonStore.activeGame();
  game.gameInfo = { ...(game.gameInfo || {}), opponent: 'St. Peter Lutheran Patriots', week: '5', date: '2025-10-03' };
  game.plays = Array.from({ length: 24 }, (_, i) => {
    const id = i + 1;
    const unit = id % 3 === 0 ? 'special' : id % 2 === 0 ? 'defense' : 'offense';
    return { id, timestamp: { start: id * 6, end: id * 6 + 5 }, notes: '',
      clipName: `IMG_${6600 + id}`, clipPath: `IMG_${6600 + id}`,
      tags: { unit, down: String((id % 4) + 1), distance: '10', quarter: `Q${(id % 4) + 1}`,
        driveNumber: String(Math.ceil(id / 4)), formation: 'I-Form', backfield: 'I',
        runPass: unit === 'offense' ? 'Run' : '', playType: unit === 'offense' ? 'Run Inside' : '',
        defFront: unit === 'defense' ? 'Maverick' : '', coverage: unit === 'defense' ? 'Cover 3' : '',
        stType: unit === 'special' ? 'Punt' : '', result: 'Gain', yardage: '6',
        players: {}, grades: {}, custom: [] } };
  });
  app.tagger.plays = game.plays; app.tagger.nextId = 25;
  app.tagger._updateFormEnabled(); app.tagger._emit('plays-loaded'); app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
});

const VIEWPORTS = [[1920, 1080], [1420, 1000], [1440, 900], [1280, 720]];
const UNITS = ['offense', 'defense', 'special'];
// The approved picture budgets this repair must not spend.
const MEDIA_FLOOR = { 1920: [1150, 645], 1420: [960, 540], 1440: [960, 540], 1280: [740, 416] };

const measure = async (w, h, unit) => {
  await page.setViewport({ width: w, height: h });
  await page.evaluate(u => { app.nativeTagging?.setUnit?.(u); }, unit);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => {
    const doc = document.documentElement;
    const box = s => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
    const name = n => n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    // The play rail IS a horizontal filmstrip: wide content scrolling inside its
    // own container is the contract, not a defect. It is exempt by name, and
    // reported separately so the exemption can never widen silently.
    const RAIL = '.gi-drive-scroll';
    const inHorizontalScrollport = n => !!n.closest(RAIL);
    const hscroll = [...document.querySelectorAll('.ws-breakdown *, .ws-contextbar *, .ws-topbar *')]
      .filter(n => n.scrollWidth - n.clientWidth > 1 && n.clientWidth > 0)
      .map(n => ({ sel: name(n), over: n.scrollWidth - n.clientWidth, rail: n.matches(RAIL) }));
    const outside = [...document.querySelectorAll('.ws-breakdown *, .ws-contextbar *, .ws-topbar *')]
      // A card scrolled out of the filmstrip's viewport is scrolled, not clipped.
      .filter(n => !inHorizontalScrollport(n))
      .filter(n => { const b = n.getBoundingClientRect(); return b.width > 4 && b.height > 4 && (b.right > innerWidth + 1 || b.left < -1); })
      .map(n => ({ sel: name(n), left: Math.round(n.getBoundingClientRect().left), right: Math.round(n.getBoundingClientRect().right) }));
    const railNode = document.querySelector(RAIL);
    const railScroll = railNode ? {
      over: railNode.scrollWidth - railNode.clientWidth,
      // The scrollbar must not be OS chrome with unnamed arrow buttons.
      buttons: getComputedStyle(railNode, '::-webkit-scrollbar-button').display,
      inside: railNode.getBoundingClientRect().right <= innerWidth + 1,
    } : null;
    // Arrow-glyph or empty controls with no accessible name anywhere on screen.
    const anonArrows = [...document.querySelectorAll('button, [role="button"]')]
      .filter(n => n.getBoundingClientRect().width > 0)
      .filter(n => { const t = (n.textContent || '').trim();
        return /^[←-⇿▲-◄‹›<>‹›⌃⌄]+$/.test(t) || (t === '' && !n.querySelector('svg,img,use')); })
      .filter(n => !(n.getAttribute('aria-label') || n.getAttribute('title') || n.getAttribute('aria-labelledby')))
      .map(n => ({ sel: name(n), text: (n.textContent || '').trim() }));
    const media = document.getElementById('videoContainer')?.getBoundingClientRect();
    const pw = media ? Math.min(media.width, media.height * 16 / 9) : 0;
    const cs = s => { const n = document.querySelector(s); return n ? getComputedStyle(n) : null; };
    const ctxNodes = [...document.querySelectorAll('.ws-ctx')];
    return {
      pageOverflow: doc.scrollWidth - doc.clientWidth,
      nav: box('.ws-topbar') || box('.ws-routes'),
      theater: box('[data-breakdown-theater-host]'),
      rail: box('.gi-breakdown-rail-host'),
      deck: box('.gi-breakdown-deck'),
      media: media ? { w: Math.round(pw), h: Math.round(pw * 9 / 16) } : null,
      hscroll, outside, anonArrows, railScroll,
      bar: cs('.ws-contextbar')?.backgroundColor || null,
      ctx: ctxNodes.map(n => { const s = getComputedStyle(n);
        return { id: n.id, bg: s.backgroundColor, border: s.borderTopColor, w: Math.round(n.getBoundingClientRect().width),
          font: parseFloat(s.fontSize), disabled: n.disabled === true }; }),
      chev: cs('.ws-ctx-chev') ? { display: cs('.ws-ctx-chev').display, right: cs('.ws-ctx-chev').right } : null,
    };
  });
};

const shots = [];
for (const [w, h] of VIEWPORTS) {
  for (const unit of UNITS) {
    const s = await measure(w, h, unit);
    const tag = `${w}x${h}`;
    const file = path.join(SHOTS, `breakdown-${tag}-${unit}.png`);
    await page.screenshot({ path: file });
    shots.push(`${file}  (${tag}, ${unit})`);

    ok(s.pageOverflow <= 1, `${tag} ${unit}: no page-level horizontal scrolling`, s.pageOverflow);
    ok(s.hscroll.every(h => h.rail),
      `${tag} ${unit}: the play filmstrip is the ONLY thing that scrolls sideways`, s.hscroll);
    ok(!s.railScroll || s.railScroll.inside,
      `${tag} ${unit}: the filmstrip's own scrollport stays inside the viewport`, s.railScroll);
    ok(!s.railScroll || s.railScroll.buttons === 'none',
      `${tag} ${unit}: the filmstrip scrollbar renders no arrow buttons`, s.railScroll);
    ok(s.outside.length === 0, `${tag} ${unit}: nothing clipped past a viewport edge`, s.outside);
    ok(s.anonArrows.length === 0, `${tag} ${unit}: no anonymous arrow-only control`, s.anonArrows);
    ok(!!s.nav && s.nav.left >= -1 && s.nav.right <= w + 1,
      `${tag} ${unit}: global navigation is wholly inside the viewport`, s.nav);
    for (const [key, part] of [['theater', s.theater], ['deck', s.deck]]) {
      ok(!!part && part.w > 0 && part.left >= -1 && part.right <= w + 1,
        `${tag} ${unit}: the ${key} fits the viewport`, part);
    }
    // The rail is its own grid area at desktop widths; below 1000px it stacks.
    if (w >= 1000) ok(!!s.rail && s.rail.w > 0 && s.rail.h > 0,
      `${tag} ${unit}: the play rail keeps a usable area`, s.rail);
    const floor = MEDIA_FLOOR[w];
    ok(!!s.media && s.media.w >= floor[0] && s.media.h >= floor[1],
      `${tag} ${unit}: the video keeps its useful area (>= ${floor[0]}x${floor[1]})`, s.media);
  }
}

console.log('\n-- CTX the shared selector surface --');
const ctx = await measure(1420, 1000, 'offense');
ok(ctx.ctx.length === 3, 'Three context selectors render', ctx.ctx.map(c => c.id));
for (const c of ctx.ctx) {
  ok(ratio(c.bg, ctx.bar) >= 1.4, `${c.id} is visibly distinct from the bar`, { bg: c.bg, bar: ctx.bar, ratio: ratio(c.bg, ctx.bar) });
  ok(ratio(c.border, ctx.bar) >= 3, `${c.id} draws a 3:1 control boundary`, { border: c.border, ratio: ratio(c.border, ctx.bar) });
  ok(!isBlueish(c.bg) && !isBlueish(c.border), `${c.id} uses no blue-gray`, { bg: c.bg, border: c.border });
}
ok(new Set(ctx.ctx.map(c => c.bg)).size === 1 && new Set(ctx.ctx.map(c => c.border)).size === 1,
  'All three share ONE surface token', ctx.ctx.map(c => [c.bg, c.border]));
ok(ctx.chev && ctx.chev.display !== 'none', 'The caret treatment is preserved', ctx.chev);
ok(ctx.ctx.every(c => c.font >= 11), 'Selector typography is not shrunk', ctx.ctx.map(c => c.font));

// States: hover, focus, open and disabled, each measured on the live element.
const states = await page.evaluate(() => {
  const n = document.querySelector('#wsCtxGame');
  const read = () => { const s = getComputedStyle(n); return { bg: s.backgroundColor, shadow: s.boxShadow }; };
  const rest = read();
  n.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  n.classList.add('is-test-hover');
  const hoverRule = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
    .some(r => r.selectorText && /\.ws-ctx:hover/.test(r.selectorText));
  n.classList.remove('is-test-hover');
  n.focus();
  const focused = read();
  n.setAttribute('aria-expanded', 'true');
  const open = read();
  n.removeAttribute('aria-expanded');
  const wasDisabled = n.disabled;
  n.disabled = true;
  const disabled = { ...read(), opacity: getComputedStyle(n).opacity, cursor: getComputedStyle(n).cursor };
  n.disabled = wasDisabled;
  return { rest, focused, open, disabled, hoverRule };
});
ok(states.hoverRule, 'A hover state is defined for the shared selector');
ok(/rgb|inset|px/.test(states.focused.shadow) && states.focused.shadow !== 'none',
  'Keyboard focus is visible', states.focused.shadow);
ok(states.open.bg !== states.rest.bg && !isBlueish(states.open.bg),
  'The open state is distinct and not blue', { rest: states.rest.bg, open: states.open.bg });
ok(Number(states.disabled.opacity) < 1 && states.disabled.cursor === 'not-allowed',
  'Disabled reads as disabled', states.disabled);

// The surface is the SHARED owner's, so another route gets it too.
const otherRoute = await page.evaluate(async () => {
  await app.workspaceShell.show('study');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const n = document.querySelector('.ws-ctx');
  const bar = document.querySelector('.ws-contextbar');
  return n && bar ? { bg: getComputedStyle(n).backgroundColor, bar: getComputedStyle(bar).backgroundColor,
    border: getComputedStyle(n).borderTopColor } : null;
});
ok(!!otherRoute && ratio(otherRoute.bg, otherRoute.bar) >= 1.4 && ratio(otherRoute.border, otherRoute.bar) >= 3,
  'Another route rendering the context bar gets the same surface', otherRoute);

console.log('\n-- screenshots (implementation evidence only) --');
for (const s of shots) console.log('  ' + s);
ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
