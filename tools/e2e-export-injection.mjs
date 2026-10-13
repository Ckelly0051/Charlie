import puppeteer from './test-browser.mjs';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label) => { console.log(`${value ? 'PASS' : 'FAIL'} ${label}`); value ? pass++ : fail++; };
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.app?.reportsScreen);
  const result = await page.evaluate(async () => {
    const app = window.app;
    app.workspaceShell.show('reports');
    app.reportsScreen.openDashboards();
    const owners = { storage: app.storage, seasonStore: app.storage.seasonStore,
      season: app.season, plan: app.planScreen, reports: app.reportsScreen,
      dashboards: app.reportsScreen.dashboards, cutup: app.cutup };
    const writes = [], notices = [], otherNotices = [];
    app.history._toast = message => notices.push(message);
    app.overlays.toast = message => otherNotices.push(message);
    window.__TAURI__ = { dialog: { save: async options => `C:/synthetic/${options.defaultPath}` },
      fs: { writeFile: async (path, bytes) => writes.push({ path, text: new TextDecoder().decode(bytes) }) } };
    const out = { globalAbsent: !Object.hasOwn(window, 'ffaSaveBlob'), owners: {} };
    for (const [name, owner] of Object.entries(owners)) {
      const wired = typeof app.saveBlob === 'function' && owner?.saveBlob === app.saveBlob;
      const before = writes.length;
      const saved = wired && await owner.saveBlob(new Blob([`export:${name}`]), `${name}.txt`);
      out.owners[name] = wired && saved === true && writes.length === before + 1
        && writes.at(-1).path === `C:/synthetic/${name}.txt` && writes.at(-1).text === `export:${name}`;
    }
    out.notifiedOwner = notices.length === Object.keys(owners).length && otherNotices.length === 0
      && notices.every(message => message.startsWith('Saved: C:/synthetic/'));
    const store = app.storage.seasonStore;
    store.data = store._normalize({ version: 5, type: 'season', id: 'export-proof',
      seasonName: 'Export proof', activeGameId: 'game-proof', games: [
        { id: 'game-proof', name: 'Proof game', plays: [{ id: 1,
          timestamp: { start: 0, end: 5 }, notes: 'export proof', annotations: [],
          tags: { unit: 'offense', runPass: 'Run', playType: 'Run Inside', result: 'Gain',
            yardage: '3', players: {}, grades: {} } }], annotations: [], nextId: 2,
          currentPlayId: null, clipNames: [], isMultiClip: false } ] });
    store.currentSeasonId = 'export-proof';
    app.tagger.plays = store.data.games[0].plays;
    const beforeJson = writes.length;
    store.downloadFile();
    for (let i = 0; i < 100 && writes.length === beforeJson; i++) await new Promise(resolve => setTimeout(resolve, 10));
    out.seasonJson = writes.length === beforeJson + 1
      && writes.at(-1).path.endsWith('_season.json')
      && JSON.stringify(JSON.parse(writes.at(-1).text)) === JSON.stringify(store.data);
    const beforeCsv = writes.length;
    app.storage.exportCsv();
    for (let i = 0; i < 100 && writes.length === beforeCsv; i++) await new Promise(resolve => setTimeout(resolve, 10));
    out.csv = writes.length === beforeCsv + 1 && writes.at(-1).path.endsWith('_plays.csv')
      && writes.at(-1).text.startsWith('"Play #"') && writes.at(-1).text.includes('"Unit"')
      && writes.at(-1).text.includes('"export proof"') && writes.at(-1).text.split('\n').length === 2;
    return out;
  });
  ok(result.globalAbsent, 'App publishes no global save helper');
  for (const [name, delivered] of Object.entries(result.owners)) ok(delivered, `${name} receives App's bound save function and delivers bytes`);
  ok(result.notifiedOwner, 'all consumer deliveries notify the bound History owner only');
  ok(result.seasonJson, 'season download delivers exact JSON through native file delivery');
  ok(result.csv, 'CSV export delivers its real header through native file delivery');
} finally { await browser.close(); }
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
