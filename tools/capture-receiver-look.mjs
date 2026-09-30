// Review evidence only: canonical fixture in an isolated browser; illustrative
// receiver selections are made on that copy, never in the coach's catalog.
import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { APP_URL } from './app-entry.mjs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const out = 'artifacts/receiver-look-review';
mkdirSync(out, { recursive: true });
const bytes = readFileSync(CANONICAL_SEASON), season = JSON.parse(bytes);
const hash = b => createHash('sha256').update(b).digest('hex');
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 45000 });
const evidence = [];
try {
  for (const [width, height] of [[1920,1080],[1440,900],[1280,800],[390,844]]) {
  console.log(`capturing ${width}`);
  const page = await browser.newPage(), comp = await browser.newPage();
  await page.setViewport({ width, height }); await comp.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.nativeTagging);
  await page.evaluate(async data => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data)); store.currentSeasonId = data.id;
    store.data.id = data.id; store.data.activeGameId = store.data.games[0].id;
    await app.storage._loadActiveGame();
    const p = app.tagger.plays.find(p => p.tags.unit === 'offense');
    app.tagger.selectPlay(p.id);
    for (const [key, value] of Object.entries({ formationFamily: 'Tight Bunch', receiverSet: '3x1', strength: 'Unbalanced Left' })) app.tagger.setTagValue(key, value);
    await app.workspaceShell.show('breakdown');
  }, season);
  await comp.goto(pathToFileURL(path.resolve('design-comps/breakdown-visual-finish-2026-09-28/index.html')).href + '#formation');
    await page.bringToFront();
    await page.waitForFunction(() => !window.app.history.overlays.snapshot().toasts.length);
    await page.evaluate(() => document.querySelector('[data-native-field="receiverSet"]').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${out}/app-${width}.png` });
    await comp.bringToFront();
    await comp.screenshot({ path: `${out}/comp-${width}.png` });
    const measure = await page.evaluate(() => {
      const fields = ['formationFamily','strength','receiverSet'].map(key => document.querySelector(`[data-native-field="${key}"]`));
      const buttons = fields.flatMap(f => [...f.querySelectorAll('.gi-tag-chips button')]);
      return { overflow: document.documentElement.scrollWidth > innerWidth, height: [...new Set(buttons.map(b => b.getBoundingClientRect().height))], clipped: buttons.some(b => b.scrollWidth > b.clientWidth + 1), labels: fields.map(f => f.querySelector('.gi-tag-field-label').textContent) };
    });
    if (measure.overflow || measure.clipped) throw new Error(`receiver controls overflow at ${width}: ${JSON.stringify(measure)}`);
    evidence.push({ width, ...measure });
    if (width === 1440) {
      await page.bringToFront();
      const group = await page.$('[data-native-field="formationFamily"]');
      const wholeGroup = await group.evaluateHandle(el => el.closest('.gi-tag-group'));
      await wholeGroup.screenshot({ path: `${out}/app-formation-detail.png` });
      const clip = await page.evaluate(() => {
        const first = document.querySelector('[data-native-field="strength"]').getBoundingClientRect();
        const last = document.querySelector('[data-native-field="receiverSet"]').getBoundingClientRect();
        return { x: first.x, y: first.y, width: first.width, height: last.bottom - first.y };
      });
      await page.screenshot({ path: `${out}/app-receiver-detail.png`, clip });
      await comp.bringToFront();
      const compClip = await comp.evaluate(() => {
        const r = document.querySelector('#formation-fields').getBoundingClientRect();
        return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight - Math.max(0, r.y)) };
      });
      await comp.screenshot({ path: `${out}/comp-receiver-detail.png`, clip: compClip });
    }
    await page.close(); await comp.close();
  }
  if (hash(readFileSync(CANONICAL_SEASON)) !== hash(bytes)) throw new Error('canonical fixture changed');
  console.log(JSON.stringify({ source: CANONICAL_SEASON, sourceUnchanged: true, illustrativeSelections: true, evidence, out }, null, 2));
} finally { await browser.close(); }
