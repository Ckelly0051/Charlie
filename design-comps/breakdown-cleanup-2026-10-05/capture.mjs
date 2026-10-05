// Break Down cleanup comp: the real built app with the canonical season, the
// proposed presentation applied in the page, captured as still screens.
// Isolated browser data only; no coach file or film is written.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { APP_URL } from 'file:///C:/Users/charl/Charlie/tools/app-entry.mjs';
import { CANONICAL_SEASON } from 'file:///C:/Users/charl/Charlie/tools/canonical-season.mjs';

const OUT = process.argv[2];
const season = JSON.parse(fs.readFileSync(CANONICAL_SEASON, 'utf8'));
const film = fs.readFileSync('D:/Football/Film/Holy Family/20251011_135753.mp4');
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', r => r.url().endsWith('/__fixture-film.mp4') ? r.respond({ status: 200, contentType: 'video/mp4', body: film }) : r.continue());
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_hint_shown', '1'));

const CSS = `
/* 1. Gold is the primary action and the route underline only. */
.gi-native-form button.is-active,
.gi-breakdown-view button.active {
  background:#e8e8e8 !important; border-color:#e8e8e8 !important; color:#111 !important; box-shadow:none !important;
}
details.gi-tag-group > summary strong {
  background:none !important; clip-path:none !important; color:#d6d6d6 !important; padding:0 !important;
  letter-spacing:.06em !important; font-size:12.5px !important;
}
details.gi-tag-group > summary { border-bottom:1px solid #3a3a3a !important; }
details.gi-tag-group > summary::before, details.gi-tag-group > summary::after,
details.gi-tag-group > summary strong::before, details.gi-tag-group > summary strong::after { display:none !important; }
.gi-chyron-cell.is-call .gi-chyron-v { color:#f2f2f2 !important; }
.gi-theater-chyron { border-top-color:#4a4a4a !important; }
/* 3. One Save & Next, one Delete. */
.gi-tag-nav .is-primary kbd { display:none !important; }
.gi-theater-actions-risk .is-danger { display:none !important; }
.gi-tag-actions .comp-delete { color:#ff8a80 !important; border-color:#8a3a36 !important; opacity:1 !important; }
/* 4. Play strip: full results, a unit name instead of "Down -". */
.gi-play-card { flex:0 0 auto !important; width:auto !important; max-width:none !important; min-width:78px !important; padding-right:12px !important; }
.gi-play-card small { max-width:none !important; }
.gi-play-card small span { overflow:visible !important; text-overflow:clip !important; white-space:nowrap !important; max-width:none !important; }
/* noise from the isolated harness (unlinked film) */
.gi-toast-stack { display:none !important; }
`;

const MENU_CSS = `
.comp-more { position:fixed; right:12px; top:50px; width:300px; background:#1b1b1b; border:1px solid #5a5a5a;
  box-shadow:0 12px 32px rgba(0,0,0,.55); font:13px 'IBM Plex Sans',sans-serif; color:#ededed; z-index:9999; padding:6px 0 4px; }
.comp-more h4 { margin:0; padding:8px 14px 6px; font-size:12.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#a8a8a8; }
.comp-more h4 + .comp-group { border-top:none; }
.comp-group { border-top:1px solid #333; padding:4px 0; }
.comp-group > span { display:block; padding:6px 14px 2px; font-size:12.5px; font-weight:600; color:#8f8f8f; }
.comp-more button { display:flex; justify-content:space-between; width:100%; height:32px; align-items:center; padding:0 14px;
  background:none; border:0; color:#ededed; font:13px 'IBM Plex Sans',sans-serif; text-align:left; }
.comp-more button small { color:#8f8f8f; font-size:12.5px; }
.comp-more button.is-hover { background:#2c2c2c; box-shadow:inset 3px 0 0 #e8e8e8; }
.comp-more .comp-version { color:#7c7c7c; font-size:12.5px; padding:6px 14px 4px; border-top:1px solid #333; }
`;

const setup = async (width, height) => {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell);
  await page.evaluate(async data => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data));
    store.currentSeasonId = store.data.id;
    const game = store.data.games.find(g => /holy family/i.test(g.gameInfo?.opponent || ''));
    store.data.activeGameId = game.id;
    app.storage._loadActiveGame();
    app.roster.players = data.roster || [];
    await app.workspaceShell.show('breakdown');
    app.breakdownWorkspace._setFilmFocus(false);
    app.tagger.selectPlay(39);
    app.vc.loadUrl(new URL('/__fixture-film.mp4', location.href).href, 'Holy Family');
    await document.fonts.ready;
  }, season);
  await page.waitForFunction(() => document.getElementById('videoPlayer').readyState >= 2);
  await page.evaluate(() => { document.getElementById('videoPlayer').currentTime = 2; });
  await new Promise(r => setTimeout(r, 3500));
};

const apply = async () => {
  await page.addStyleTag({ content: CSS });
  await page.evaluate(() => {
    const byText = (root, txt) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === txt);
    // 2. Toolbar: the season decides Program vs Scout; once-a-season actions move to More.
    document.querySelector('.gi-breakdown-context')?.remove();
    const bar = document.querySelector('.gi-breakdown-toolbar');
    byText(bar, 'Customize fields')?.remove();
    byText(bar, 'Game settings')?.remove();
    // Deck row: Same as Last, Templates, Delete. Save Template lives in the Templates menu.
    const row = document.querySelector('.gi-tag-actions');
    byText(row, 'Save Template')?.remove();
    const del = byText(row, 'Delete'); if (del) { del.disabled = false; del.classList.add('comp-delete'); }
    // Play strip: Special Teams snaps name their unit instead of "Down -".
    const UNIT = { kickoff: 'Kickoff', kickoffReturn: 'Kick Return', punt: 'Punt', puntReturn: 'Punt Return',
      fieldGoal: 'Field Goal', fieldGoalBlock: 'FG Block', try: 'Try', tryDefense: 'Def. Try' };
    for (const card of document.querySelectorAll('.gi-play-card')) {
      const play = window.app.tagger.plays.find(p => String(p.id) === card.dataset.nativePlayId);
      const label = card.querySelector('strong');
      if (label && label.textContent.trim() === 'Down -') label.textContent = UNIT[play?.specialTeams?.unit] || (play?.tags?.unit === 'special' ? 'Special Teams' : 'No down');
    }
    const strip = document.querySelector('.gi-drive-scroll');
    const target = document.querySelector('[data-native-play-id="43"]');
    if (strip && target) strip.scrollLeft = target.offsetLeft - strip.clientWidth / 2;
    const film = document.querySelector('[data-ws-film], .ws-film-chip, .ws-film-status');
    if (film) film.textContent = 'Film linked';
  });
  await new Promise(r => setTimeout(r, 300));
};

const openMenu = async () => {
  await page.addStyleTag({ content: MENU_CSS });
  await page.evaluate(() => {
    const group = (name, items) => `<div class="comp-group"><span>${name}</span>${items.map(([t, s, hover]) =>
      `<button class="${hover ? 'is-hover' : ''}"><span>${t}</span>${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`;
    const el = document.createElement('section');
    el.className = 'comp-more';
    el.innerHTML = '<h4>More</h4>'
      + group('This game', [['Game settings'], ['Customize fields', '', true], ['Templates', 'Apply or save'], ['Charting libraries']])
      + group('Season', [['Teams & seasons'], ['Open season file'], ['Import plays', 'CSV'], ['Save season', 'Restore point'], ['Restore points & versions']])
      + group('Export', [['Season report'], ['Current game report'], ['Plays CSV'], ['Cut-up video'], ['Current frame'], ['Call sheet']])
      + group('Tools', [['Drawing tools'], ['Cut-up filters']])
      + '<div class="comp-version">GridIron IQ v1.12.0-110 · Desktop</div>';
    document.body.appendChild(el);
  });
};

await setup(1440, 900);
await page.screenshot({ path: `${OUT}/current-1440x900.png` });
await page.evaluate(() => document.querySelector('#btnNativeMore')?.click());
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/current-more-1440x900.png` });
await setup(1440, 900);
await apply();
await page.screenshot({ path: `${OUT}/proposed-1440x900.png` });
console.log(await page.evaluate(() => {
  const c = document.querySelector('[data-native-play-id="42"]'); const cs = getComputedStyle(c);
  const s = c.querySelector('small'); const ss = getComputedStyle(s);
  return [c.getBoundingClientRect().width, cs.flex, cs.width, cs.maxWidth, cs.overflow, s.getBoundingClientRect().width, ss.width, ss.maxWidth, ss.display, ss.position, ss.gridTemplateColumns].join(' | ');
}));
await openMenu();
await page.screenshot({ path: `${OUT}/proposed-more-1440x900.png` });
await setup(1280, 800);
await apply();
await page.screenshot({ path: `${OUT}/proposed-1280x800.png` });
// Variant: the current-play badge in neutral graphite instead of gold.
await setup(1440, 900);
await apply();
await page.addStyleTag({ content: `.gi-chyron-id { background:#333 !important; color:#f4f4f4 !important; box-shadow:inset 0 0 0 1px #5a5a5a !important; }
  .gi-chyron-id * { color:inherit !important; }` });
await new Promise(r => setTimeout(r, 200));
await page.screenshot({ path: `${OUT}/proposed-badge-neutral-1440x900.png` });
await browser.close();
console.log('ok');
