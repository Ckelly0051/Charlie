// Drive in Situation comp, revision 2: the real built app with the canonical
// season, the Drive box moved into Situation's second row (Hash, Field
// position, Yard line, Drive) and New Drive removed, applied in the page and
// captured as still screens. Isolated browser data only; no coach file or film
// is written.
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
  await page.addStyleTag({ content: '.gi-toast-stack{display:none!important}' });
  await new Promise(r => setTimeout(r, 3000));
};

// The Drive box joins the field row as its fourth column; Distance, Yard line
// and Drive are two-digit boxes on one grid shared by both rows; New Drive is
// removed.
const PROPOSED_CSS = `
.gi-tag-situation-row{grid-template-columns:minmax(0,160px) 100px 54px 40px}
.gi-tag-situation-row .gi-tag-chips button{padding-inline:5px}
.gi-tag-situation-row input{width:100%;min-width:0;appearance:textfield}
.gi-tag-situation-row input::-webkit-inner-spin-button,.gi-tag-situation-row input::-webkit-outer-spin-button{appearance:none;margin:0}
.gi-tag-input-distance,.gi-tag-input-yardLine{width:54px}
.comp-drive{width:40px}
`;
const apply = async () => {
  await page.addStyleTag({ content: PROPOSED_CSS });
  await page.evaluate(() => {
    const row = document.querySelector('.gi-tag-drive-row');
    const drive = row.querySelector('.gi-tag-input, label');
    drive.classList.add('comp-drive');
    document.querySelector('[data-situation-row="field"]').appendChild(drive);
    row.remove();
  });
  await new Promise(r => setTimeout(r, 200));
};

const situation = () => page.evaluate(() => {
  const g = [...document.querySelectorAll('details.gi-tag-group')].find(d => d.querySelector('summary')?.textContent.trim().startsWith('Situation'));
  const r = g.getBoundingClientRect(), deck = document.querySelector('[data-native-tagging]').getBoundingClientRect();
  return { x: Math.floor(deck.x), y: Math.floor(r.y) - 90, width: Math.ceil(deck.width), height: Math.ceil(r.height) + 140 };
});
const geometry = () => page.evaluate(() => {
  const row = document.querySelector('[data-situation-row="field"]');
  const items = [...row.children].map(el => { const r = el.getBoundingClientRect(); return [el.textContent.trim().slice(0, 14), Math.round(r.left), Math.round(r.right), Math.round(r.top)]; });
  return { page: document.documentElement.scrollWidth - innerWidth, row: row.scrollWidth - row.clientWidth, rowRight: Math.round(row.getBoundingClientRect().right), items };
});

for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
  await setup(w, h);
  if (w === 1440) await page.screenshot({ path: `${OUT}/current-situation-1440.png`, clip: await situation() });
  await apply();
  await page.screenshot({ path: `${OUT}/proposed-situation-${w}.png`, clip: await situation() });
  if (w !== 1920) await page.screenshot({ path: `${OUT}/proposed-${w}x${h}.png` });
  console.log(w, JSON.stringify(await geometry()));
}
await browser.close();
console.log('ok');
