import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.setDefaultTimeout(8000);
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'team-hub'
  && !!document.querySelector('[data-native-team-hub]'));
await page.waitForFunction(() => window.app?.settingsScreen && window.app?.workspaceShell);

await page.evaluate(() => {
  window.__TAURI__ = { nativeSettingsTest: true };
  const store = window.app.storage.seasonStore;
  const linked = { id:'g-linked', name:'Week 1 vs OL Lakes', filmMode:'linked', filmDir:'OL Lakes 13-13', gameInfo:{ opponent:'OL Lakes' }, plays:[{ id:1, tags:{ unit:'offense', custom:[] } }], clipNames:Array.from({length:82},(_,i)=>`OLL_${i+1}`) };
  const managed = { id:'g-managed', name:'Week 2 vs Refuge', filmMode:'managed', gameInfo:{ opponent:'Refuge' }, plays:[{ id:1, tags:{ unit:'defense', custom:[] } }], clipNames:Array.from({length:12},(_,i)=>`RF_${i+1}`) };
  store.currentSeasonId = 'settings-season';
  store.data = { version:5, type:'season', id:'settings-season', seasonName:'2026 Mavericks', activeGameId:'g-linked', games:[linked, managed] };
  const state = { mode:'linked', root:'D:/Football/Film', opened:[], teamSave:null };
  store.backend = {
    supportsLinkedFilm: () => true,
    supportsFilm: () => true,
    getFilmStorageMode: () => state.mode,
    setFilmStorageMode: mode => { state.mode = mode; return true; },
    getLibraryRoot: () => state.root,
    linkedGameDir: async dir => `${state.root}/${dir}`,
    managedGameDir: async id => `C:/Users/Coach/AppData/GridIron IQ/seasons/settings-season/films/${id}`,
    openLinkedDir: async dir => { state.opened.push(dir); return true; },
  };
  window.app.workspace.filmHealth = async game => game.id === 'g-linked'
    ? { state:'missing', mode:'linked', expected:82, found:65, missing:17 }
    : { state:'managed', mode:'managed', expected:12, found:12, missing:0 };
  window.app.library._teamProfile = () => ({ teamName:'Mavericks', jerseyColor:'blue' });
  window.app.library.saveTeamIdentity = (name, color) => { state.teamSave = { name, color }; return true; };
  window.__nativeSettingsState = state;
  const invoker = document.createElement('button');
  invoker.id = 'settings-test-invoker'; invoker.textContent = 'Open settings';
  document.body.appendChild(invoker); invoker.focus();
  window.__settingsSeasonBefore = JSON.stringify(store.data);
  window.app.settingsScreen.open({ returnFocus: invoker });
});
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.waitForFunction(() => document.querySelectorAll('[data-settings-game]').length === 2);

let r = await page.evaluate(() => ({
  owners: document.querySelectorAll('[data-overlay-id="team-film-settings"] [data-native-settings]').length,
  drawerOpen: document.getElementById('settingsDrawer')?.classList.contains('open'),
  modal: document.querySelector('[data-overlay-id="team-film-settings"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  routeInert: !!document.getElementById('workspaceShell')?.closest('[inert]'),
  rows: [...document.querySelectorAll('[data-settings-game]')].map(row => ({ id:row.dataset.settingsGame, text:row.textContent.replace(/\s+/g,' ').trim(), title:row.querySelector('.gi-settings-game-path')?.title })),
  seasonSame: JSON.stringify(window.app.storage.seasonStore.data) === window.__settingsSeasonBefore,
}));
ok(r.owners === 1 && !r.drawerOpen, 'Team & Film Settings has one native presentation owner', JSON.stringify(r));
ok(r.modal == null && !r.routeInert, 'Desktop Settings is a non-modal working sheet', JSON.stringify(r));
ok(r.rows.length === 2 && r.rows[0].title === 'D:/Football/Film/OL Lakes 13-13' && /Linked.*17 missing.*65 \/ 82/.test(r.rows[0].text),
  'Linked game shows its resolved D: path and honest missing-clip count', JSON.stringify(r.rows[0]));
ok(r.rows[1]?.title?.includes('/g-managed') && /Managed copy.*Ready.*12 \/ 12/.test(r.rows[1].text),
  'Managed game shows its separate app-data path and complete clip count', JSON.stringify(r.rows[1]));
ok(r.seasonSame, 'Opening Settings is a canonical-season no-op');

await page.click('.gi-settings-tabs button:nth-child(2)');
await page.click('.gi-settings-field input');
await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
await page.keyboard.press('Backspace');
await page.type('.gi-settings-field input', 'St. Joseph Mavericks');
await page.click('.gi-settings-swatches [data-color="navy"]');
await page.click('.gi-settings-team .gi-settings-primary');
r = await page.evaluate(() => ({ saved:window.__nativeSettingsState.teamSave, status:document.querySelector('.gi-settings-saved')?.textContent }));
ok(r.saved?.name === 'St. Joseph Mavericks' && r.saved?.color === 'navy' && /saved/i.test(r.status),
  'Team identity saves only the coach-selected name and jersey color', JSON.stringify(r));

await page.click('.gi-settings-tabs button:first-child');
await page.waitForSelector('.gi-settings-mode-actions button:nth-child(2)');
await page.click('.gi-settings-mode-actions button:nth-child(2)');
await page.waitForFunction(() => document.querySelector('.gi-settings-callout.is-success'));
r = await page.evaluate(() => ({
  mode:window.__nativeSettingsState.mode,
  links:window.app.storage.seasonStore.data.games.map(game => ({ id:game.id, mode:game.filmMode, dir:game.filmDir || '' })),
  seasonSame:JSON.stringify(window.app.storage.seasonStore.data) === window.__settingsSeasonBefore,
  notice:document.querySelector('.gi-settings-callout.is-success')?.textContent,
}));
ok(r.mode === 'managed' && r.links[0].mode === 'linked' && r.links[0].dir === 'OL Lakes 13-13' && r.links[1].mode === 'managed',
  'Changing the import default never rewrites existing per-game storage modes', JSON.stringify(r));
ok(r.seasonSame && /Existing linked games were not changed/i.test(r.notice),
  'Storage-default change leaves the canonical season byte-identical and says so', JSON.stringify(r));

// Roster is a real native job, not a bridge back into the retired drawer.
await page.click('[data-settings-tab="roster"]');
await page.type('[aria-label="Jersey number"]', '12');
await page.type('[aria-label="Player name"]', 'Jordan Smith');
await page.type('[aria-label="Position"]', 'QB');
await page.select('[aria-label="Side of ball"]', 'O');
await page.click('[data-settings-panel="roster"] .gi-settings-primary');
r = await page.evaluate(() => ({ player:window.app.roster.players.find(p => p.num === '12'), row:document.querySelector('.gi-roster-row')?.textContent || '', legacy:!!document.getElementById('rosterPanel') }));
ok(r.player?.name === 'Jordan Smith' && r.player?.pos === 'QB' && r.player?.side === 'O' && /Jordan Smith/.test(r.row) && !r.legacy,
  'Native Roster adds a chartable player without reviving the legacy panel', JSON.stringify(r));
await page.click('[data-settings-panel="roster"] details summary');
await page.type('[data-settings-panel="roster"] textarea', '#,Name,Position,Side\n55,Alex Reed,LB,D');
await page.click('[data-settings-panel="roster"] details .gi-settings-primary');
r = await page.evaluate(() => ({ imported:window.app.roster.players.find(p => p.num === '55'), notice:document.querySelector('[data-settings-panel="roster"] [role="status"]')?.textContent }));
ok(r.imported?.name === 'Alex Reed' && r.imported?.side === 'D' && /Imported 1 player/.test(r.notice),
  'Native Roster imports spreadsheet data through the canonical parser', JSON.stringify(r));

// Cut-up filters must select the exact film set the exporter receives.
await page.evaluate(() => {
  const mk=(id,down,formation)=>({id,timestamp:{start:id,end:id+1},tags:{unit:'offense',down,formation,playType:'Run Inside',result:'Gain',custom:[]}});
  window.app.tagger.plays=[mk(1,'3','Wing-T'),mk(2,'1','Wing-T'),mk(3,'3','Trips')];
});
await page.click('[data-settings-tab="cutup"]');
await page.evaluate(() => [...document.querySelectorAll('[data-settings-panel="cutup"] .gi-filter-group')].find(g => g.querySelector('legend')?.textContent === 'Down')?.querySelector('button:nth-child(3)')?.click());
await page.select('[data-settings-panel="cutup"] .gi-filter-selects select', 'Wing-T');
r = await page.evaluate(() => ({ criteria:window.app.filter.snapshot(), ids:window.app.filter.filter(window.app.tagger.plays).map(p=>p.id), active:document.querySelector('[data-settings-panel="cutup"] .gi-settings-status')?.textContent }));
ok(JSON.stringify(r.ids) === '[1]' && r.criteria.downs[0] === '3' && r.criteria.formations[0] === 'Wing-T' && /2 active/.test(r.active),
  'Native Cut-ups passes the exact selected film set to the canonical filter', JSON.stringify(r));

// Drawing configuration persists to the real canvas, then the sheet gets out of the film's way.
await page.click('[data-settings-tab="drawing"]');
await page.click('[data-drawing-color="#ff4444"]');
await page.$eval('[data-settings-panel="drawing"] input[type="range"]', el => { el.value='7'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.click('[data-drawing-tool="arrow"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
r = await page.evaluate(() => ({ tool:window.app.canvas.currentTool, color:window.app.canvas.color, width:window.app.canvas.lineWidth }));
ok(r.tool === 'arrow' && r.color === '#ff4444' && r.width === 7,
  'Native Drawing configures the live canvas and closes so film remains unobstructed', JSON.stringify(r));

// Analysis is optional and contained in Settings rather than prime shell chrome.
await page.evaluate(() => { window.app.settingsScreen.open({ initialTab:'analysis', returnFocus:document.getElementById('settings-test-invoker') }); });
await page.waitForSelector('[data-settings-panel="analysis"]');
await page.type('[data-settings-panel="analysis"] input[type="password"]', 'test-key');
await page.select('[data-settings-panel="analysis"] select', 'claude-sonnet-4-6');
await page.click('[data-settings-panel="analysis"] .gi-settings-primary');
r = await page.evaluate(() => ({ key:localStorage.getItem('ffa_claude_api_key'), model:localStorage.getItem('ffa_claude_model'), saved:document.querySelector('[data-settings-panel="analysis"] [role="status"]')?.textContent }));
ok(r.key === 'test-key' && r.model === 'claude-sonnet-4-6' && /saved/i.test(r.saved),
  'Native Analysis saves optional preferences without entering prime chrome', JSON.stringify(r));

await page.click('[data-overlay-id="team-film-settings"] [data-overlay-action="done"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
await page.waitForFunction(() => document.activeElement?.id === 'settings-test-invoker');
ok(await page.evaluate(() => document.activeElement?.id === 'settings-test-invoker'), 'Closing Settings restores its invoking control');

await page.setViewport({ width:390, height:844 });
await page.evaluate(() => { window.app.settingsScreen.open({ returnFocus:document.getElementById('settings-test-invoker') }); });
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.waitForFunction(() => !!document.getElementById('workspaceShell')?.closest('[inert]'));
r = await page.evaluate(() => ({
  modal:document.querySelector('[data-overlay-id="team-film-settings"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  routeInert:!!document.getElementById('workspaceShell')?.closest('[inert]'),
  pageOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
  tableScrollable:(() => { const el=document.querySelector('.gi-settings-section-body.is-table'); return el && el.scrollWidth > el.clientWidth; })(),
  minButton:Math.min(...[...document.querySelectorAll('[data-native-settings] button')].map(el => el.getBoundingClientRect().height).filter(Boolean)),
}));
ok(r.modal === 'true' && r.routeInert, 'Narrow Settings becomes modal and makes the workspace inert', JSON.stringify(r));
ok(!r.pageOverflow && r.tableScrollable, 'Mobile game table scrolls internally with zero page overflow', JSON.stringify(r));
ok(r.minButton >= 44, 'Mobile Settings controls meet the 44px touch target floor', JSON.stringify(r));

ok(errors.length === 0, 'Native Settings journey produces zero page/console errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
