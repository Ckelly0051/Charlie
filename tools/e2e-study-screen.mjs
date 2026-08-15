import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Phase 2 Study UI: real query/compare/view/watch wiring over the built bundle. */
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = process.env.FFA_STUDY_URL || TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
const screenshotDir = process.env.FFA_STUDY_SCREENSHOTS || '';
const capture = async name => {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await new Promise(resolve => setTimeout(resolve, 120));
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: false });
};
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(resolve => setTimeout(resolve, 500));

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const g1 = store.activeGame();
  g1.id = 'g-study-1'; g1.name = 'Week 1 vs Rivals'; g1.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  // Study expansion (2026-08-15): distance is real, tagged data on every play
  // -- AnalyticsMetrics' honest eligibility (`_isSuccessfulPlayEligible`)
  // requires yardage + down + distance to compute successRate/stopRate; an
  // omitted distance is exactly the "insufficient data" case the coaching
  // metrics are built to disclose, not a fixture convenience to skip.
  g1.plays = [
    { id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'offense', formation: 'Trips', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', distance: '10', custom: [] } },
    { id: 2, timestamp: { start: 5, end: 9 }, tags: { unit: 'offense', formation: 'Ace', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', down: '2', distance: '4', custom: [] } },
    { id: 3, timestamp: { start: 10, end: 14 }, tags: { unit: 'defense', defFront: '4-2-5', coverage: 'Cover 3', result: 'Gain', yardage: '3', down: '3', distance: '7', custom: [] } },
  ];
  const g2 = store.addGame({ id: 'g-study-2', name: 'Week 2 vs Tigers', status: 'active', gameInfo: { opponent: 'Tigers', date: '2026-09-08' }, plays: [
    { id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'offense', formation: 'Wing-T', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', custom: [] } },
    { id: 2, timestamp: { start: 5, end: 9 }, tags: { unit: 'offense', formation: 'Wing-T', runPass: 'Run', playType: 'Run Inside', result: 'Touchdown', yardage: '12', down: '2', distance: '2', custom: [] } },
  ] });
  store.data.activeGameId = g1.id;
  app.storage._clearForNewGame();
  app.storage._loadActiveGame();
  await app.workspaceShell.show('study');
});

let r = await page.evaluate(() => ({
  visible: !document.querySelector('#wsStudy')?.hidden,
  summary: document.querySelector('#wsStudySummary')?.textContent,
  groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent),
  reportsHidden: document.querySelector('#wsReports')?.hidden,
  specialTeamsLabel: document.querySelector('#wsStudyUnit option[value="special"]')?.textContent,
}));
ok(r.visible && /2 matching plays/.test(r.summary) && r.groups.includes('Trips') && r.groups.includes('Ace') && !r.groups.includes('Unknown'), 'Study defaults to the active-game cohort', JSON.stringify(r));
ok(r.reportsHidden, 'Study does not silently open the native Reports destination');
ok(r.specialTeamsLabel === 'Special Teams', 'Study unit selector capitalizes Special Teams consistently', JSON.stringify(r));
await capture('study-game-1280x800');
await page.click('[data-study-action="save-plan"]');
r = await page.evaluate(() => ({ open:document.querySelector('.ws-plan-picker')?.open,cohort:!!document.querySelector('#wsStudyPlanCohort'),count:document.querySelector('[data-plan-picker-count]')?.textContent }));
ok(r.open && !r.cohort && /2 linked plays/.test(r.count), 'A non-comparison finding keeps the Save-to-Plan picker simple', JSON.stringify(r));
await page.click('[data-study-action="plan-picker-cancel"]');

await page.select('#wsStudyScope', 'season');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(/4 matching plays/.test(r.summary) && r.groups.includes('Wing-T'), 'Full-season scope includes plays from every game', JSON.stringify(r));

await page.select('#wsStudyScope', 'range');
await page.$eval('#wsStudyDateFrom', (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, '2026-09-08');
await page.$eval('#wsStudyDateTo', (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, '2026-09-08');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent), rangeVisible: !document.querySelector('#wsStudyRange')?.hidden }));
ok(/2 matching plays/.test(r.summary) && r.groups.length === 1 && r.groups[0] === 'Wing-T' && r.rangeVisible, 'Inclusive date range selects only explicitly dated games in range', JSON.stringify(r));
await page.select('#wsStudyScope', 'season');

await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-value="0"]', '1');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, chips: [...document.querySelectorAll('.ws-study-filter-chip')].map(el => el.textContent) }));
ok(/2 matching plays/.test(r.summary) && r.chips.includes('1 ×'), 'A filter narrows the cohort through the registry', JSON.stringify(r));
await page.select('[data-study-filter-value="0"]', '2');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, chips: document.querySelectorAll('.ws-study-filter-chip').length }));
ok(/4 matching plays/.test(r.summary) && r.chips === 2, 'Multiple values within one filter use OR', JSON.stringify(r));
await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-dimension="1"]', 'runPass');
await page.select('[data-study-filter-value="1"]', 'Run');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, filters: document.querySelectorAll('.ws-study-filter-row').length }));
ok(/3 matching plays/.test(r.summary) && r.filters === 2, 'Separate filters combine with AND', JSON.stringify(r));
await capture('study-filters-1280x800');
await page.click('[data-study-action="clear-filters"]');

await page.select('#wsStudyUnit', 'defense');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(/0 matching plays/.test(r.summary) && r.groups.length === 0, 'Unit filter is ANDed into the selected football question', JSON.stringify(r));

// Study expansion (2026-08-15): a coaching metric (offense/defense pair) must
// never guess a framing from a blank unit -- it fails closed with a visible
// prompt instead. This is the non-negotiable itself under test, not a gap.
await page.select('#wsStudyUnit', '');
await page.select('#wsStudyMeasure', 'negative');
r = await page.evaluate(() => ({ promptVisible: !document.querySelector('#wsStudyUnitPrompt')?.hidden, rows: document.querySelectorAll('.ws-study-row').length, watchDisabled: document.querySelector('[data-study-action="watch-all"]')?.disabled }));
ok(r.promptVisible && r.rows === 0 && r.watchDisabled, 'A coaching metric fails closed with a visible unit prompt rather than guessing a framing', JSON.stringify(r));
await page.select('#wsStudyUnit', 'offense');
r = await page.evaluate(() => ({ header: document.querySelector('#wsStudyMetricHead')?.textContent, promptHidden: document.querySelector('#wsStudyUnitPrompt')?.hidden }));
ok(r.header === 'Negative Play Rate' && r.promptHidden, 'Choosing a unit resolves the exact offense-framed metric id and clears the prompt', JSON.stringify(r));
r = await page.evaluate(() => ({ kpis: document.querySelectorAll('.ws-study-kpis>div').length, bars: document.querySelectorAll('.ws-study-bar-row').length, linked: !!document.querySelector('.ws-study-bar-row[data-study-row]'), mix: document.querySelector('.ws-study-kpis>div:nth-child(3) strong')?.textContent, best: document.querySelector('.ws-study-kpis>div:nth-child(2) span')?.textContent, aria: document.querySelector('.ws-study-bar-row')?.getAttribute('aria-label'), decorative: document.querySelector('.ws-study-bar-row i')?.getAttribute('aria-hidden') }));
const mixTotal = (r.mix?.match(/[\d.]+/g) || []).reduce((sum, value) => sum + Number(value), 0);
ok(r.kpis === 3 && r.bars > 0 && r.linked && mixTotal <= 100.01 && /^Best /.test(r.best) && /Watch .* film/.test(r.aria) && r.decorative === 'true', 'Study renders accurate, accessible KPI and film-linked effectiveness visuals for a coaching metric', JSON.stringify(r));
await page.select('#wsStudyCompare', 'season');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, compareRows: document.querySelectorAll('.ws-study-row-compare').length, scopeDisabled: document.querySelector('#wsStudyScope')?.disabled, watch: document.querySelector('[data-study-action="watch-all"]')?.textContent }));
ok(/2 vs 4 plays/.test(r.summary) && r.compareRows >= 3 && r.scopeDisabled && /Watch current game/.test(r.watch), 'Game-versus-season comparison renders aligned groups', JSON.stringify(r));
r = await page.evaluate(() => ({ deltas: document.querySelectorAll('.ws-study-delta-row').length, linked: !!document.querySelector('.ws-study-delta-row[data-study-row]'), accessible: [...document.querySelectorAll('.ws-study-delta-row')].every(row => /Watch .* film/.test(row.getAttribute('aria-label') || '') && row.querySelector('i')?.getAttribute('aria-hidden') === 'true'), zeroNeutral: [...document.querySelectorAll('.ws-study-delta-row')].filter(row => /(^|\s)0(?:\.0)?(?:\s|$)/.test(row.textContent || '')).every(row => !row.classList.contains('is-favorable') && !row.classList.contains('is-unfavorable')) }));
ok(r.deltas > 0 && r.linked && r.accessible && r.zeroNeutral, 'Comparison renders accessible, polarity-aware film-linked delta visuals', JSON.stringify(r));
await page.select('#wsStudyCompare', 'prior');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent }));
ok(/2 vs 2 plays/.test(r.summary) && /Prior games/.test(r.summary), 'Game-versus-prior-games comparison uses the requested cohort', JSON.stringify(r));
await page.select('#wsStudyCompare', 'rangePrior');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, rangeVisible: !document.querySelector('#wsStudyRange')?.hidden, watch: document.querySelector('[data-study-action="watch-all"]')?.textContent }));
ok(/2 vs 2 plays/.test(r.summary) && /2026-09-08/.test(r.summary) && !/through/.test(r.summary) && /Prior dated games/.test(r.summary) && r.rangeVisible && /Watch date range/.test(r.watch), 'One-day comparison range uses a concise label and contrasts earlier dated games', JSON.stringify(r));
await capture('study-compare-1280x800');

await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-value="0"]', '1');
await page.click('[data-study-action="save"]');
r = await page.evaluate(() => ({ saved: document.querySelectorAll('#wsStudySaved option').length, stored: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length, filters: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]')[0]?.state?.filters?.length }));
ok(r.saved === 2 && r.stored === 1 && r.filters === 1, 'Saved views preserve the complete composable query', JSON.stringify(r));
await page.click('[data-study-action="save-plan"]');
r = await page.evaluate(() => ({ open:document.querySelector('.ws-plan-picker')?.open, plans:window.app.storage.seasonStore.plans().length, target:document.querySelector('#wsStudyPlanTarget')?.value, nameVisible:!document.querySelector('.ws-plan-picker-name')?.hidden, cohorts:[...document.querySelectorAll('#wsStudyPlanCohort option')].map(option=>option.value), selected:document.querySelector('#wsStudyPlanCohort')?.value }));
ok(r.open && r.plans === 0 && r.target === '__new__' && r.nameVisible && r.cohorts.join(',') === 'base,against,both' && r.selected === 'base', 'Save to Plan asks for an intentional destination and comparison cohort before mutating data', JSON.stringify(r));
await capture('study-save-plan-picker-1280x800');
await page.click('[data-study-action="plan-picker-cancel"]');
r = await page.evaluate(() => ({ dialog:!!document.querySelector('.ws-plan-picker'), plans:window.app.storage.seasonStore.plans().length }));
ok(!r.dialog && r.plans === 0, 'Cancelling the plan picker is a true no-op', JSON.stringify(r));
await page.click('[data-study-action="save-plan"]');
await page.select('#wsStudyPlanCohort','against');
await page.$eval('#wsStudyPlanName', el => { el.value='Rival Week'; });
await page.click('[data-study-action="plan-picker-save"]');
r = await page.evaluate(() => { const p=window.app.storage.seasonStore.plans()[0],item=p?.items[0],expected=window.app.studyScreen._saveCohorts.find(cohort=>cohort.id==='against')?.refs; return { plans:window.app.storage.seasonStore.plans().length, name:p?.name, items:p?.items.length, refs:item?.refs.length, exact:JSON.stringify(item?.refs)===JSON.stringify(expected), kind:item?.kind, compare:item?.query?.compare,cohort:item?.query?.cohort,active:window.app.planScreen.activeId }; });
ok(r.plans === 1 && r.name === 'Rival Week' && r.items === 1 && r.refs > 0 && r.exact && r.kind === 'finding' && r.compare === 'rangePrior' && r.cohort === 'against' && r.active, 'Study creates the named plan with the explicitly selected comparison cohort', JSON.stringify(r));
r = await page.evaluate(() => {
  const button=document.querySelector('[data-study-action="save-plan"]'),rect=button.getBoundingClientRect();
  const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
  return { reachable:hit===button || button.contains(hit), hit:hit?.className || hit?.tagName };
});
ok(r.reachable, 'Save confirmation never blocks the next Study command', JSON.stringify(r));
await page.click('[data-study-action="save-plan"]');
r = await page.evaluate(() => ({ target:document.querySelector('#wsStudyPlanTarget')?.value, active:window.app.planScreen.activeId, nameHidden:document.querySelector('.ws-plan-picker-name')?.hidden,cohort:document.querySelector('#wsStudyPlanCohort')?.value }));
ok(r.target === r.active && r.nameHidden && r.cohort === 'base', 'The picker defaults visibly to the primary cohort and active existing plan', JSON.stringify(r));
await page.select('#wsStudyPlanCohort','both');
await page.click('[data-study-action="plan-picker-save"]');
r = await page.evaluate(async () => { const store=window.app.storage.seasonStore,p=store.plans()[0],removed=p.items[p.items.length-1],expected=window.app.studyScreen._saveCohorts.find(cohort=>cohort.id==='both')?.refs; const exact=JSON.stringify(removed.refs)===JSON.stringify(expected); store.removePlanItem(p.id,removed.id); await store.persist(); return { items:p.items.length, exact,cohort:removed.query?.cohort }; });
ok(r.items === 1 && r.exact && r.cohort === 'both', 'Both-cohort save targets the existing plan with the exact de-duplicated film union', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('plan'));
r = await page.evaluate(() => ({ visible:!document.querySelector('#wsPlan')?.hidden, items:document.querySelectorAll('.ws-plan-items article').length, placeholder:document.querySelector('#wsPlan')?.textContent }));
ok(r.visible && r.items === 1 && !/No game plan yet/.test(r.placeholder), 'Plan route renders the saved Study finding', JSON.stringify(r));
await page.$eval('#wsPlanName', el => { el.value='Rival Week'; el.dispatchEvent(new Event('change',{bubbles:true})); });
await page.$eval('#wsPlanNotes', el => { el.value='Attack the boundary'; el.dispatchEvent(new Event('change',{bubbles:true})); });
await page.select('#wsPlanAudience','players');
r = await page.evaluate(() => { const p=window.app.storage.seasonStore.plans()[0]; return { name:p.name,notes:p.notes,audience:p.audience }; });
ok(r.name === 'Rival Week' && r.notes === 'Attack the boundary' && r.audience === 'players', 'Plan name, audience, and staff notes persist through the store seam', JSON.stringify(r));
const ordering = await page.evaluate(async () => {
  const app=window.app,store=app.storage.seasonStore,plan=store.plans()[0];
  const b=store.addPlanItem(plan.id,{kind:'note',label:'Boundary alert',refs:[]});
  const c=store.addPlanItem(plan.id,{kind:'note',label:'Red zone alert',refs:[]});
  await store.persist(); app.planScreen.render();
  const labels=()=>store.getPlan(plan.id).items.map(item=>item.label);
  const initial=labels();
  document.querySelectorAll('[data-plan-item]')[2].querySelector('[data-plan-move="-1"]').click();
  const moved=labels();
  const source=[...document.querySelectorAll('[data-plan-item]')].find(row=>row.querySelector('strong')?.textContent==='Boundary alert');
  const target=[...document.querySelectorAll('[data-plan-item]')].find(row=>row.querySelector('strong')?.textContent===initial[0]);
  const transfer=new DataTransfer(),handle=source.querySelector('[data-plan-drag]'),rect=target.getBoundingClientRect();
  handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
  target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top}));
  target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top}));
  const dragged=labels(),dragCleared=app.planScreen._dragId===''&&!document.querySelector('.is-dragging,.is-drop-target');
  return {initial,moved,dragged,dragCleared,added:[b.id,c.id],buttons:[...document.querySelectorAll('[data-plan-move]')].map(el=>({label:el.getAttribute('aria-label'),disabled:el.disabled}))};
});
ok(ordering.initial.length===3 && ordering.moved[1]==='Red zone alert' && ordering.dragged[0]==='Boundary alert' && ordering.dragCleared && ordering.buttons.every(button=>button.label), 'Plan items reorder through accessible buttons and desktop drag without losing items', JSON.stringify(ordering));
const planLayout=await page.evaluate(()=>{const plan=document.querySelector('#wsPlan'),head=plan.querySelector('.ws-plan-head'),rect=plan.getBoundingClientRect(),headRect=head.getBoundingClientRect();return{hidden:plan.hidden,display:getComputedStyle(plan).display,width:rect.width,height:rect.height,headWidth:headRect.width,route:document.body.className};});
ok(!planLayout.hidden&&planLayout.display==='block'&&planLayout.width>900&&planLayout.height>600&&planLayout.headWidth>800,'Plan owns the full active workspace instead of inheriting the centered placeholder layout',JSON.stringify(planLayout));
await capture('plan-ordering-1280x800');
const exported=await page.evaluate(async()=>{
  const oldUrl=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;
  let blob=null,download='';URL.createObjectURL=value=>{blob=value;return'blob:plan-export-test';};HTMLAnchorElement.prototype.click=function(){download=this.download;};
  document.querySelector('[data-plan-action="export"]').click();await new Promise(resolve=>setTimeout(resolve,0));
  const html=await blob.text();URL.createObjectURL=oldUrl;HTMLAnchorElement.prototype.click=oldClick;
  return{download,ordered:html.indexOf('Boundary alert')<html.indexOf('Formation')&&html.indexOf('Formation')<html.indexOf('Red zone alert'),audience:html.includes('Audience: Players')};
});
ok(exported.download==='rival-week.html'&&exported.ordered&&exported.audience,'Plan export downloads the same ordered, audience-aware presentation data',JSON.stringify(exported));
await page.click('[data-plan-action="present"]');
r=await page.evaluate(()=>({dialog:!!document.querySelector('.ws-plan-present'),label:document.querySelector('.ws-plan-present h2')?.textContent,position:document.querySelector('.ws-plan-present>header>div:nth-child(2)')?.textContent,audience:document.querySelector('.ws-plan-present>header span')?.textContent,prevDisabled:document.querySelector('[data-plan-present-action="prev"]')?.disabled}));
ok(r.dialog&&r.label==='Boundary alert'&&/1 of 3/.test(r.position)&&r.audience==='Players'&&r.prevDisabled,'Presentation opens full-screen at the first ordered item with audience context',JSON.stringify(r));
await capture('plan-presentation-1280x800');
await page.keyboard.press('ArrowRight');
r=await page.evaluate(()=>({label:document.querySelector('.ws-plan-present h2')?.textContent,plays:document.querySelectorAll('[data-plan-present-ref]').length}));
ok(/^Formation/.test(r.label)&&r.plays>0,'Presentation advances by keyboard and keeps resolved film links',JSON.stringify(r));
const presentationWatch=await page.evaluate(()=>{const app=window.app;window.__oldPlanWatch=app.filmNavigation.watch;window.__planPresentationCalls=[];app.filmNavigation.watch=(refs,options)=>window.__planPresentationCalls.push({refs,label:options?.label});document.querySelector('[data-plan-present-ref]').click();const result={calls:window.__planPresentationCalls,closed:!document.querySelector('.ws-plan-present')};app.filmNavigation.watch=window.__oldPlanWatch;delete window.__oldPlanWatch;return result;});
ok(presentationWatch.closed&&presentationWatch.calls.length===1&&presentationWatch.calls[0].refs.length===1,'A presented play launches its exact composite film ref and exits teaching mode',JSON.stringify(presentationWatch));
await page.click('[data-plan-action="present"]');await page.keyboard.press('Escape');
r=await page.evaluate(()=>({closed:!document.querySelector('.ws-plan-present'),index:window.app.planScreen.presentationIndex}));
ok(r.closed&&r.index===-1,'Escape exits presentation without changing the plan',JSON.stringify(r));
await page.evaluate(async added=>{const app=window.app,store=app.storage.seasonStore,plan=store.plans()[0];added.forEach(id=>store.removePlanItem(plan.id,id));await store.persist();app.planScreen.render();},ordering.added);
const planWatch = await page.evaluate(async () => { const app=window.app,calls=[]; const old=app.filmNavigation.watch; app.filmNavigation.watch=(refs,options)=>calls.push({refs,label:options?.label}); document.querySelector('[data-plan-watch]')?.click(); document.querySelector('[data-plan-action="watch"]')?.click(); app.filmNavigation.watch=old; return calls; });
ok(planWatch.length === 2 && planWatch[0].refs.length > 0 && planWatch[1].refs.length === planWatch[0].refs.length, 'Plan item and whole-plan Watch use the same composite film refs', JSON.stringify(planWatch));
await page.click('[data-plan-remove]');
r = await page.evaluate(() => ({ items:window.app.storage.seasonStore.plans()[0].items.length, empty:/Save a finding from Study/.test(document.querySelector('#wsPlan')?.textContent||'') }));
ok(r.items === 0 && r.empty, 'Plan items remove intentionally without deleting the plan', JSON.stringify(r));
console.log('\n== S6-3 Plan: grouped sections + bottom presentation strip ==');
const planFixture = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore, plan = store.plans()[0];
  const add = item => store.addPlanItem(plan.id, item);
  add({ kind: 'finding', label: 'Trips — Success Rate', refs: ['g-study-1::1', 'g-study-1::2'], query: { dimension: 'formation', measure: 'successRate', scope: 'season', group: 'Trips' } });
  add({ kind: 'finding', label: 'Wing-T — Success Rate', refs: ['g-study-1::2', 'g-study-2::1'], query: { dimension: 'formation', measure: 'successRate', scope: 'season', group: 'Wing-T' } });
  add({ kind: 'note', label: 'Boundary emphasis', refs: [] });
  add({ kind: 'finding', label: '3rd Down — Yards per Play', refs: ['g-study-1::3'], query: { dimension: 'down', measure: 'yardsPerPlay', scope: 'season', group: '3' } });
  ['A', 'B', 'C', 'D'].forEach((tag, i) => add({ kind: 'film', label: `Install clip ${tag}`, refs: [`g-study-2::${(i % 2) + 1}`] }));
  await store.persist(); app.planScreen.render();
  return { items: store.getPlan(plan.id).items.length, planId: plan.id, formationName: app.analyticsRegistry.getDimension('formation')?.name, downName: app.analyticsRegistry.getDimension('down')?.name };
});
r = await page.evaluate(() => {
  const store = window.app.storage.seasonStore, plan = store.plans()[0];
  // Recompute the expected sections from the STORE, independently of the render:
  // consecutive runs of the same subject, each carrying the de-duplicated union
  // of its items' refs in plan order.
  const expected = [];
  plan.items.forEach(item => {
    const key = item.query?.dimension ? `dim:${item.query.dimension}` : `kind:${item.kind}`;
    const last = expected[expected.length - 1];
    if (last && last.key === key) last.items.push(item); else expected.push({ key, items: [item] });
  });
  const expectedCounts = expected.map(section => new Set(section.items.flatMap(item => item.refs.map(String))).size);
  const rendered = [...document.querySelectorAll('[data-plan-section]')].map(section => ({
    heading: section.querySelector('h3')?.textContent,
    meta: section.querySelector('.ws-plan-section-head span')?.textContent,
    rows: section.querySelectorAll('[data-plan-item]').length,
  }));
  const domOrder = [...document.querySelectorAll('[data-plan-item] strong')].map(el => el.textContent);
  return {
    expectedSections: expected.length, expectedCounts, rendered, domOrder,
    planOrder: plan.items.map(item => item.label),
    renderedCounts: rendered.map(section => Number((section.meta || '').match(/(\d+) linked play/)?.[1])),
    renderedRows: rendered.map(section => section.rows),
    expectedRows: expected.map(section => section.items.length),
  };
});
ok(r.rendered.length === r.expectedSections && JSON.stringify(r.renderedCounts) === JSON.stringify(r.expectedCounts) && JSON.stringify(r.renderedRows) === JSON.stringify(r.expectedRows) && JSON.stringify(r.domOrder) === JSON.stringify(r.planOrder),
  'Plan groups consecutive findings into sections that report their de-duplicated linked-play count', JSON.stringify(r));
ok(r.rendered[0].heading === planFixture.formationName && r.rendered[0].rows === 2 && r.renderedCounts[0] === 3 && r.rendered[3]?.heading === 'Film clips',
  'Section headings name the football subject, and two findings sharing a play count that play once', JSON.stringify({ headings: r.rendered.map(s => s.heading), counts: r.renderedCounts, formationName: planFixture.formationName }));
const sectionWatch = await page.evaluate(() => {
  const app = window.app, calls = [], old = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => calls.push({ refs, label: options?.label });
  document.querySelector('[data-plan-group-watch="0"]').click();
  app.filmNavigation.watch = old;
  const plan = app.storage.seasonStore.plans()[0];
  const expected = [...new Set(plan.items.slice(0, 2).flatMap(item => item.refs.map(String)))];
  return { calls, expected, exact: JSON.stringify(calls[0]?.refs) === JSON.stringify(expected) };
});
ok(sectionWatch.calls.length === 1 && sectionWatch.exact && sectionWatch.calls[0].refs.length === 3 && /Rival Week/.test(sectionWatch.calls[0].label),
  'Section Watch plays the exact de-duplicated composite refs of that section, in plan order', JSON.stringify(sectionWatch));
const regroup = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore, plan = store.plans()[0];
  const before = [...document.querySelectorAll('[data-plan-section]')].length;
  // Move the note up one so it splits the formation run. If grouping re-sorted
  // into fixed buckets instead of honouring plan order, this could not change.
  document.querySelectorAll('[data-plan-item]')[2].querySelector('[data-plan-move="-1"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const after = [...document.querySelectorAll('[data-plan-section]')].map(section => section.querySelector('h3')?.textContent);
  document.querySelectorAll('[data-plan-item]')[1].querySelector('[data-plan-move="1"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const restored = [...document.querySelectorAll('[data-plan-section]')].length;
  return { before, after, restored, labels: store.getPlan(plan.id).items.map(item => item.label) };
});
ok(regroup.before === 4 && regroup.after.length === 5 && regroup.restored === 4 && regroup.labels[1] === 'Wing-T — Success Rate',
  'Reordering an item regroups the plan, proving sections follow the coach order rather than re-sorting it', JSON.stringify(regroup));
await page.click('[data-plan-action="present"]');
const strip = await page.evaluate(() => {
  const plan = window.app.storage.seasonStore.plans()[0];
  const host = document.querySelector('[data-plan-strip]'), track = host?.querySelector('.ws-plan-strip-track');
  const buttons = [...document.querySelectorAll('[data-plan-present-jump]')];
  return {
    labels: buttons.map(button => button.querySelector('strong')?.textContent),
    planOrder: plan.items.map(item => item.label),
    indexes: buttons.map(button => Number(button.dataset.planPresentJump)),
    current: buttons.filter(button => button.getAttribute('aria-current') === 'true').map(button => button.dataset.planPresentJump),
    scrolls: !!host && track.scrollWidth > host.clientWidth + 1 && getComputedStyle(host).overflowX === 'auto',
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    minTarget: Math.min(...buttons.map(button => button.getBoundingClientRect().height)),
    stageLabel: document.querySelector('.ws-plan-present h2')?.textContent,
  };
});
ok(JSON.stringify(strip.labels) === JSON.stringify(strip.planOrder) && JSON.stringify(strip.indexes) === JSON.stringify(strip.planOrder.map((_, i) => i)) && JSON.stringify(strip.current) === JSON.stringify(['0']),
  'The presentation strip lists every plan item in plan order and marks the selected one', JSON.stringify({ labels: strip.labels, current: strip.current }));
ok(strip.scrolls && !strip.pageOverflow && strip.minTarget >= 44,
  'The strip scrolls inside its own container without overflowing the page, at touch-sized targets', JSON.stringify(strip));
await capture('plan-strip-1280x800');
const stripJump = await page.evaluate(async () => {
  const app = window.app, calls = [], old = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => calls.push({ refs, label: options?.label });
  document.querySelector('[data-plan-present-jump="5"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const state = {
    calls, index: app.planScreen.presentationIndex,
    stage: document.querySelector('.ws-plan-present h2')?.textContent,
    position: document.querySelector('.ws-plan-present>header>div:nth-child(2)')?.textContent,
    current: document.querySelector('[data-plan-present-jump].is-current')?.dataset.planPresentJump,
    scrolled: document.querySelector('[data-plan-strip]')?.scrollLeft,
    open: !!document.querySelector('.ws-plan-present'),
  };
  const watchCalls = [];
  app.filmNavigation.watch = (refs, options) => watchCalls.push({ refs, label: options?.label });
  document.querySelector('[data-plan-present-watch]').click();
  app.filmNavigation.watch = old;
  return { ...state, watchCalls };
});
ok(stripJump.calls.length === 0 && stripJump.index === 5 && stripJump.stage === 'Install clip B' && /6 of 8/.test(stripJump.position) && stripJump.current === '5' && stripJump.open && stripJump.scrolled > 0,
  'Selecting a strip entry moves the stage and scrolls the strip without starting film', JSON.stringify(stripJump));
ok(stripJump.watchCalls.length === 1 && stripJump.watchCalls[0].refs.length === 1 && stripJump.watchCalls[0].label === 'Install clip B',
  'Watch stays the explicit action and plays the selected item exact refs', JSON.stringify(stripJump.watchCalls));
await page.keyboard.press('Escape');
await page.evaluate(async () => {
  const store = window.app.storage.seasonStore, plan = store.plans()[0];
  [...plan.items].forEach(item => store.removePlanItem(plan.id, item.id));
  await store.persist(); window.app.planScreen.render();
});
const deleteGuard = await page.evaluate(async () => {
  const app=window.app, store=app.storage.seasonStore, plan=store.createPlan('Delete guard'); app.planScreen.activeId=plan.id; app.planScreen.render();
  app.tagger._confirmDialog=async()=>false; document.querySelector('[data-plan-action="delete"]')?.click(); await new Promise(r=>setTimeout(r,0)); const kept=!!store.getPlan(plan.id);
  app.tagger._confirmDialog=async()=>true; document.querySelector('[data-plan-action="delete"]')?.click(); await new Promise(r=>setTimeout(r,0)); return {kept,removed:!store.getPlan(plan.id)};
});
ok(deleteGuard.kept && deleteGuard.removed, 'Plan deletion requires intentional in-app confirmation', JSON.stringify(deleteGuard));
const noSeasonPlan=await page.evaluate(()=>{const app=window.app,store=app.storage.seasonStore,data=store.data;store.data=null;let result='threw';try{result=app.planScreen.addFindingTo('missing',{kind:'finding',refs:['g::1']});}catch(error){result=error.message;}finally{store.data=data;}return result;});
ok(noSeasonPlan===null,'Exact-target Plan save fails closed when no season is open',String(noSeasonPlan));
await page.evaluate(() => window.app.workspaceShell.show('study'));
const savedId = await page.evaluate(() => JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]')[0]?.id || '');
await page.click('[data-study-action="clear-filters"]');
await page.select('#wsStudyMeasure', 'yards');
await page.select('#wsStudySaved', savedId);
r = await page.evaluate(() => ({ chips: document.querySelectorAll('.ws-study-filter-chip').length, metric: document.querySelector('#wsStudyMeasure')?.value, compare: document.querySelector('#wsStudyCompare')?.value, from: document.querySelector('#wsStudyDateFrom')?.value, to: document.querySelector('#wsStudyDateTo')?.value, deleteEnabled: !document.querySelector('[data-study-action="delete-view"]')?.disabled }));
ok(r.chips === 1 && r.metric === 'negative' && r.compare === 'rangePrior' && r.from === '2026-09-08' && r.to === '2026-09-08' && r.deleteEnabled, 'Loading a saved view restores filters, metric, comparison, and dates', JSON.stringify(r));
await page.click('[data-study-action="delete-view"]');
r = await page.evaluate(() => ({ options: document.querySelectorAll('#wsStudySaved option').length, stored: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length }));
ok(r.options === 1 && r.stored === 0, 'Saved views can be deleted intentionally', JSON.stringify(r));

await page.click('[data-study-action="advanced"]');
await new Promise(r => setTimeout(r, 400));
// Advanced Reports is still one click from Study, but it now lands on the
// REPORTS ROUTE instead of revealing the classic outlet. The dashboard is the
// same canonical element (same numbers, same click-to-film bindings) — it just
// lives in a shell destination now, so the retired classic chrome is never
// exposed to get there.
r = await page.evaluate(() => ({
  stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'),
  // S7 demolition: outlet deleted; absence is the assertion.
  outletHidden: !document.querySelector('#wsClassicOutlet'),
  route: window.app.workspace.currentRoute(),
  dashInReportsRoute: !!document.querySelector('#wsReports #statsDashboard'),
}));
ok(r.stats && r.route === 'reports' && r.dashInReportsRoute,
  'Advanced Reports remains one click away, now as the Reports destination', JSON.stringify(r));
ok(r.outletHidden, 'Reaching Advanced Reports no longer exposes the classic outlet', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyCompare', '');
await page.click('[data-study-action="clear-filters"]');
await page.select('#wsStudyScope', 'season');
const cutupContract = await page.evaluate(async () => {
  const app = window.app;
  const empty = await app.cutupPlayer.start([], 'Empty');
  const pending = app.cutupPlayer.start([1], 'Stopped');
  app.cutupPlayer.stop();
  const stopped = await pending;
  const endedPending = app.cutupPlayer.start([1], 'Ended');
  app.vc.video.dispatchEvent(new Event('ended'));
  const ended = await endedPending;
  const prevPending = app.cutupPlayer.start([1, 2], 'Previous');
  app.cutupPlayer.prev();
  const prevIndex = app.cutupPlayer.index;
  app.cutupPlayer.stop();
  await prevPending;
  return { empty, stopped, ended, prevIndex };
});
ok(cutupContract.empty.reason === 'empty' && !cutupContract.empty.completed
  && cutupContract.stopped.reason === 'stopped' && !cutupContract.stopped.completed
  && cutupContract.ended.reason === 'complete' && cutupContract.ended.completed
  && cutupContract.prevIndex === 0,
  'CutupPlayer settles empty/stopped/ended and clamps Previous at the first play', JSON.stringify(cutupContract));

await page.evaluate(() => {
  const app = window.app;
  window.__studyCutupCalls = [];
  window.__studySwitchCalls = [];
  window.__studyPersistCount = 0;
  const originalSwitch = app.storage.switchToGame.bind(app.storage);
  const originalPersist = app.storage.seasonStore.persist.bind(app.storage.seasonStore);
  app.storage.switchToGame = async (id, options) => {
    window.__studySwitchCalls.push({ id, options: { ...(options || {}) } });
    return originalSwitch(id, options);
  };
  app.storage.seasonStore.persist = (...args) => {
    window.__studyPersistCount++;
    return originalPersist(...args);
  };
  app.workspace.filmHealth = async game => ({ ready: game?.id !== 'g-missing' });
  app.cutupPlayer.start = async (ids, label) => {
    window.__studyCutupCalls.push({ gameId: app.storage.seasonStore.data.activeGameId, ids: ids.map(String), label });
    if (ids.length) app.tagger.selectPlay(ids[0]);
    if (window.__studyCutupMode === 'cancel') return { completed: false, reason: 'stopped' };
    return { completed: true, reason: 'complete' };
  };
});
const watchResult = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Wing-T');
  row?.querySelector('[data-study-row]')?.click();
  return !!row;
});
await new Promise(resolve => setTimeout(resolve, 150));
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), game: window.app.storage.seasonStore.data.activeGameId, calls: window.__studyCutupCalls }));
ok(watchResult && r.route === 'breakdown' && r.calls.at(-1)?.gameId === 'g-study-2' && r.game === 'g-study-1',
  'Watch opens the owning game, then restores the launch game', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyScope', 'season');
const persistBeforeSeason = await page.evaluate(() => window.__studyPersistCount);
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(() => window.__studyCutupCalls?.length >= 3);
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, switches: window.__studySwitchCalls, game: window.app.storage.seasonStore.data.activeGameId, persists: window.__studyPersistCount }));
const seasonCalls = r.calls.slice(-2);
ok(seasonCalls.length === 2 && seasonCalls[0].gameId === 'g-study-1' && seasonCalls[1].gameId === 'g-study-2'
  && /Game 1 of 2/.test(seasonCalls[0].label) && /Game 2 of 2/.test(seasonCalls[1].label)
  && r.game === 'g-study-1' && r.persists === persistBeforeSeason + 1
  && r.switches.some(call => call.id === 'g-study-1' && call.options.reloadActiveFilm === true),
  'Season Watch sequences every matching game with game-aware banner context', JSON.stringify(seasonCalls));

const beforeCancel = r.calls.length;
await page.evaluate(() => {
  window.__studyCutupMode = 'cancel';
  return window.app.workspaceShell.show('study');
});
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(count => window.__studyCutupCalls?.length >= count + 1, {}, beforeCancel);
await new Promise(resolve => setTimeout(resolve, 50));
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, game: window.app.storage.seasonStore.data.activeGameId }));
ok(r.calls.length === beforeCancel + 1 && r.game === 'g-study-1',
  'A cancelled reel stops before the next game and restores the launch game', JSON.stringify(r.calls.slice(beforeCancel)));
await page.evaluate(() => { window.__studyCutupMode = 'complete'; });

const supersession = await page.evaluate(async () => {
  const app = window.app;
  const refs = ['g-study-1::1', 'g-study-2::1'];
  const originalStart = app.cutupPlayer.start;
  const originalStop = app.cutupPlayer.stop;
  const calls = [];
  let releaseFirst = null;
  app.cutupPlayer.start = (ids, label) => {
    calls.push({ game: app.storage.seasonStore.data.activeGameId, label });
    if (label.startsWith('First')) return new Promise(resolve => { releaseFirst = resolve; });
    return Promise.resolve({ completed: true, reason: 'complete' });
  };
  app.cutupPlayer.stop = () => {
    if (releaseFirst) {
      const resolve = releaseFirst;
      releaseFirst = null;
      resolve({ completed: false, reason: 'replaced' });
    }
  };
  const first = app.studyScreen._watch(refs, 'First reel');
  while (!releaseFirst) await new Promise(resolve => setTimeout(resolve, 0));
  const second = app.studyScreen._watch(refs, 'Second reel');
  await Promise.all([first, second]);
  app.cutupPlayer.start = originalStart;
  app.cutupPlayer.stop = originalStop;
  return { calls, game: app.storage.seasonStore.data.activeGameId };
});
ok(supersession.calls.filter(call => call.label.startsWith('First')).length === 1
  && supersession.calls.filter(call => call.label.startsWith('Second')).length === 2
  && supersession.game === 'g-study-1',
  'A second Watch supersedes the first without stale advancement', JSON.stringify(supersession));

const beforeUnavailable = r.calls.length;
await page.evaluate(() => {
  const app = window.app;
  app.vc.video.removeAttribute('src');
  app.workspace.filmHealth = async game => ({ ready: game?.id === 'g-study-1' });
  return app.workspaceShell.show('study');
});
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(count => window.__studyCutupCalls?.length >= count + 1, {}, beforeUnavailable);
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, game: window.app.storage.seasonStore.data.activeGameId }));
const availableCall = r.calls[beforeUnavailable];
ok(r.calls.length === beforeUnavailable + 1 && availableCall.gameId === 'g-study-1' && /2 skipped/.test(availableCall.label),
  'Season Watch skips unavailable game film and reports the skipped play count', JSON.stringify(availableCall));

await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyScope', 'range');
r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, study: !document.querySelector('#wsStudy')?.hidden, tabs: document.querySelector('.bottom-tabs') ? getComputedStyle(document.querySelector('.bottom-tabs')).display : 'absent', cutup: !!document.querySelector('.cutup-banner') }));
ok(!r.overflow && r.study && r.tabs === 'absent' && !r.cutup, 'Mobile Study has no overflow or classic-workflow overlays', JSON.stringify(r));
r = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.ws-study-query>label')];
  const first = labels[0]?.getBoundingClientRect();
  const second = labels[1]?.getBoundingClientRect();
  const query = document.querySelector('.ws-study-query');
  const style = query ? getComputedStyle(query) : null;
  return { sameRow: !!first && !!second && Math.abs(first.top - second.top) <= 1,
    background: style?.backgroundColor, borderLeft: style ? parseFloat(style.borderLeftWidth) : 0 };
});
ok(r.sameRow && r.borderLeft >= 3 && r.background !== 'rgba(0, 0, 0, 0)',
  'Mobile Study keeps a compact two-column query workbench before the answer', JSON.stringify(r));
await page.click('[data-study-action="save-plan"]');
r = await page.evaluate(() => { const dialog=document.querySelector('.ws-plan-picker'),controls=[...dialog.querySelectorAll('select,input,button')].filter(control=>control.getClientRects().length); return { open:dialog.open,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,width:dialog.getBoundingClientRect().width,minControl:Math.min(...controls.map(control=>control.getBoundingClientRect().height)) }; });
ok(r.open && !r.overflow && r.width <= 370 && r.minControl >= 42, 'Mobile Save-to-Plan picker is overflow-free with touch-ready controls', JSON.stringify(r));
await page.click('[data-study-action="plan-picker-cancel"]');
await page.evaluate(() => window.app.workspaceShell.show('plan'));
r = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, plan:!document.querySelector('#wsPlan')?.hidden, tabs:document.querySelector('.bottom-tabs') ? getComputedStyle(document.querySelector('.bottom-tabs')).display : 'absent' }));
ok(!r.overflow && r.plan && r.tabs === 'absent', 'Mobile Plan has no page overflow or classic-workflow overlays', JSON.stringify(r));
const mobilePresentation=await page.evaluate(()=>{const app=window.app,store=app.storage.seasonStore,plan=store.plans()[0];const item=store.addPlanItem(plan.id,{kind:'film',label:'Mobile install',refs:['g-study-1::1']});
// Enough items that the S6-3 strip MUST scroll at 390px — a one-entry strip
// cannot prove the container owns its overflow instead of the page.
const extra=['Mobile install 2','Mobile install 3','Mobile install 4','Mobile install 5'].map(label=>store.addPlanItem(plan.id,{kind:'film',label,refs:['g-study-1::2']}));
app.planScreen.render();document.querySelector('[data-plan-action="present"]').click();const controls=[...document.querySelectorAll('.ws-plan-present>footer .ws-btn')];
const stripHost=document.querySelector('[data-plan-strip]'),stripButtons=[...document.querySelectorAll('[data-plan-present-jump]')];
const result={itemId:item.id,extraIds:extra.map(entry=>entry.id),dialog:!!document.querySelector('.ws-plan-present'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,minControl:Math.min(...controls.map(control=>control.getBoundingClientRect().height)),
  stripEntries:stripButtons.length,stripScrolls:!!stripHost&&stripHost.scrollWidth>stripHost.clientWidth+1,minStripTarget:Math.min(...stripButtons.map(button=>button.getBoundingClientRect().height)),
  stripInViewport:stripHost?stripHost.getBoundingClientRect().right<=document.documentElement.clientWidth+1:false};return result;});
ok(mobilePresentation.dialog&&!mobilePresentation.overflow&&mobilePresentation.minControl>=44,'Mobile presentation is full-screen, overflow-free, and keeps large navigation targets',JSON.stringify(mobilePresentation));
ok(mobilePresentation.stripEntries===5&&mobilePresentation.stripScrolls&&mobilePresentation.stripInViewport&&!mobilePresentation.overflow&&mobilePresentation.minStripTarget>=44,'Mobile strip scrolls within the viewport at touch-sized targets and never widens the page',JSON.stringify(mobilePresentation));
await capture('plan-presentation-390x844');
await page.keyboard.press('Escape');
await page.evaluate(async ids=>{const app=window.app,store=app.storage.seasonStore,plan=store.plans()[0];ids.forEach(id=>store.removePlanItem(plan.id,id));await store.persist();app.planScreen.render();},[mobilePresentation.itemId,...mobilePresentation.extraIds]);
await capture('study-390x844');

// E3b review finding: qbAlignment/coverageFamily were 'ready' in the registry
// and fully proven at the query-engine level, but StudyScreen.DIMENSIONS never
// listed them, so a coach could not select either in the actual product — the
// direct query tests passing said nothing about reachability through the UI
// a coach actually uses. Drive the REAL <select> (fires a real 'change' event
// through _bind(), same as every other selector test in this file) and prove
// the resulting rows are genuine projected data, not just that the <option>
// exists.
await page.setViewport({ width: 1280, height: 800 });
await page.evaluate(() => {
  // g-study-1 is the ACTIVE game — mutate the LIVE tagger.plays, not
  // store.data.games[...] directly. Writing only to store.data was silently
  // undone: any later commitActive() (e.g. inside workspaceShell.show) re-
  // serializes the live tagger array back over the active game's node,
  // discarding a direct store.data edit that never went through the tagger.
  window.app.tagger.plays.find(p => p.id === 1).tags.qbAlignment = 'Shotgun';        // offense play
  window.app.tagger.plays.find(p => p.id === 2).tags.qbAlignment = 'Under Center';   // a SECOND, DIFFERENT qbAlignment group, SAME game —
  window.app.tagger.plays.find(p => p.id === 3).tags.coverageFamily = 'Zone';        // without this, a Watch bug that leaks every row's
  // A second, different-valued coverageFamily group MUST stay in the SAME game as
  // the first: a cross-game leak gets silently absorbed by _watch()'s per-game hop
  // splitting (each hop calls cutupPlayer.start separately), so comparing only the
  // single most-recent call would stay green even with the leak actually present —
  // confirmed by reproducing that exact false-negative before writing this comment.
  window.app.tagger.plays.push({ id: 4, timestamp: { start: 15, end: 19 }, notes: '', tags: { unit: 'defense', coverage: 'Cover 4', coverageFamily: 'Man', down: '2', custom: [] } });
  window.app.storage.commitActive();                                                // refs into one row's click is undetectable (only one group exists)
  return window.app.workspaceShell.show('study');
});
// Reset every filter/scope/unit/measure/compare knob this shared page has
// accumulated from earlier sections in this file — this check must isolate
// the dimension selector itself, not depend on incidentally-clean leftover
// state. Measure resets to a LEGACY flat id specifically: this section tests
// dimension reachability with Unit blank, and a rich coaching-metric measure
// fails closed (no rows at all) with no unit chosen -- that is correct
// product behavior, but it would starve this dimension check of any row.
if (await page.$('[data-study-action="clear-filters"]:not([hidden])')) {
  await page.click('[data-study-action="clear-filters"]');
}
await page.select('#wsStudyUnit', '');
await page.select('#wsStudyMeasure', 'epaPerPlay');
await page.select('#wsStudyCompare', '');
await page.select('#wsStudyScope', 'season');
r = await page.evaluate(() => ({
  options: [...document.querySelectorAll('#wsStudyDimension option')].map(o => ({ value: o.value, text: o.textContent })),
}));
const qbOpt = r.options.find(o => o.value === 'qbAlignment');
const famOpt = r.options.find(o => o.value === 'coverageFamily');
ok(!!qbOpt && qbOpt.text === 'QB Alignment', '"Break down by" lists QB Alignment with the registry-derived label', JSON.stringify(r.options));
ok(!!famOpt && famOpt.text === 'Coverage Family', '"Break down by" lists Coverage Family with the registry-derived label', JSON.stringify(r.options));

await page.select('#wsStudyDimension', 'qbAlignment');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(r.groups.includes('Shotgun') && !r.groups.includes('Unknown'), 'selecting QB Alignment in the real UI renders the projected value from a live play, end to end', JSON.stringify(r));

// Review finding: proving the row RENDERS is not the same as proving Watch
// wires to it correctly. Click the real "Shotgun" row (reuses the SAME
// window.__studyCutupCalls capture installed earlier in this file) and assert
// the exact refs it receives equal an INDEPENDENTLY-computed
// AnalyticsRegistry.matchingRefs — the same registry-set-equality standard
// already proven at the engine level, now proven through the actual click path.
let before = await page.evaluate(() => window.__studyCutupCalls.length);
const qbClicked = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Shotgun');
  row?.querySelector('[data-study-row]')?.click();
  return !!row;
});
await page.waitForFunction(n => window.__studyCutupCalls.length > n, {}, before);
r = await page.evaluate((n) => {
  const call = window.__studyCutupCalls[n];
  const refs = call.ids.map(id => `${call.gameId}::${id}`).sort();
  // StudyScreen stamps __gid onto CLONES of the plays it queries (js/study-screen.js
  // `stamp()`) rather than mutating store.data.games[...].plays in place — mirror
  // that exact stamping here so matchingRefs resolves the same composite refs.
  const plays = window.app.storage.seasonStore.data.games.flatMap(g => (g.plays || []).map(p => ({ ...p, __gid: String(g.id) })));
  const registryRefs = window.app.analyticsRegistry.matchingRefs(plays, 'qbAlignment', 'Shotgun');
  return { refs, registryRefs };
}, before);
ok(qbClicked && JSON.stringify(r.refs) === JSON.stringify(r.registryRefs) && r.registryRefs.length > 0,
  'clicking Watch on the QB Alignment "Shotgun" row passes EXACTLY the registry-matching refs to the cut-up player', JSON.stringify(r));

await page.select('#wsStudyDimension', 'coverageFamily');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(r.groups.includes('Zone') && !r.groups.includes('Unknown'), 'selecting Coverage Family in the real UI renders the projected value from a live play, end to end', JSON.stringify(r));

before = await page.evaluate(() => window.__studyCutupCalls.length);
const famClicked = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Zone');
  row?.querySelector('[data-study-row]')?.click();
  return !!row;
});
await page.waitForFunction(n => window.__studyCutupCalls.length > n, {}, before);
r = await page.evaluate((n) => {
  const call = window.__studyCutupCalls[n];
  const refs = call.ids.map(id => `${call.gameId}::${id}`).sort();
  const plays = window.app.storage.seasonStore.data.games.flatMap(g => (g.plays || []).map(p => ({ ...p, __gid: String(g.id) })));
  const registryRefs = window.app.analyticsRegistry.matchingRefs(plays, 'coverageFamily', 'Zone');
  return { refs, registryRefs };
}, before);
ok(famClicked && JSON.stringify(r.refs) === JSON.stringify(r.registryRefs) && r.registryRefs.length > 0,
  'clicking Watch on the Coverage Family "Zone" row passes EXACTLY the registry-matching refs to the cut-up player', JSON.stringify(r));

await page.select('#wsStudyDimension', 'formation');

console.log('\n== S6-2 Study pivot: any dimension x any dimension, every cell a cut-up ==');
await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyScope', 'season');
await page.select('#wsStudyDimension', 'formation');
await page.select('#wsStudyColumn', 'down');
await new Promise(res => setTimeout(res, 400));

r = await page.evaluate(() => {
  const table = document.querySelector('.ws-pivot');
  const cells = [...document.querySelectorAll('.ws-pivot tbody .ws-pivot-cell')];
  const withButtons = cells.filter(td => td.querySelector('.ws-pivot-btn')).length;
  const lowSample = [...document.querySelectorAll('.ws-pivot-cell.is-small')];
  return {
    hasTable: !!table,
    rowHeads: [...document.querySelectorAll('.ws-pivot tbody th')].map(th => th.textContent),
    colHeads: [...document.querySelectorAll('.ws-pivot thead th')].slice(1).map(th => th.textContent),
    cells: cells.length, withButtons,
    hasTotalColumn: [...document.querySelectorAll('.ws-pivot thead th')].some(th => th.textContent === 'Total'),
    hasTotalRow: !!document.querySelector('.ws-pivot tfoot'),
    lowSampleVisible: lowSample.every(td => td.offsetParent !== null),
    lowSampleLabelled: lowSample.every(td => /low sample/i.test(td.textContent)),
    minTouch: Math.min(...[...document.querySelectorAll('.ws-pivot-btn')].map(b => b.getBoundingClientRect().height)),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
ok(r.hasTable && r.rowHeads.length > 0 && r.colHeads.length > 0 && r.hasTotalColumn && r.hasTotalRow,
  'Study renders a cross-tab with row and column dimensions plus totals', JSON.stringify(r));
ok(r.cells > 0 && r.withButtons > 0 && r.minTouch >= 44 && !r.overflow,
  'Every populated pivot cell is an operable control and the table scrolls inside its own container', JSON.stringify(r));
// Mechanism liveness first: a min-sample high enough that cells MUST fall below
// it, so "they stay visible" cannot pass on an empty set. Without this the
// assertion is vacuous — proven by mutation: hiding low-sample cells passed.
// wsStudyMin is a SELECT — pick its largest real option. Setting an arbitrary
// number silently leaves the value empty, which is how the first version of this
// assertion passed against zero low-sample cells.
const maxMin = await page.evaluate(() => {
  const el = document.getElementById('wsStudyMin');
  const best = [...el.options].map(o => Number(o.value) || 0).sort((a, b) => b - a)[0];
  el.value = String(best); el.dispatchEvent(new Event('change', { bubbles: true }));
  return { chosen: el.value, options: [...el.options].map(o => o.value) };
});
await new Promise(res => setTimeout(res, 400));
ok(Number(maxMin.chosen) > 0, 'Study exposes a real minimum-sample control with usable thresholds', JSON.stringify(maxMin));
r = await page.evaluate(() => {
  // Data cells only. Including the row-total column here would let the class be
  // stripped from every intersection cell while the assertion still passed on
  // the totals — which is exactly what the first version of this did.
  const low = [...document.querySelectorAll('.ws-pivot tbody .ws-pivot-cell.is-small:not(.ws-pivot-total)')];
  const populated = [...document.querySelectorAll('.ws-pivot tbody .ws-pivot-cell:not(.ws-pivot-total)')].filter(td => td.querySelector('.ws-pivot-btn'));
  return {
    lowCount: low.length, populatedCount: populated.length,
    allVisible: low.length > 0 && low.every(td => td.offsetParent !== null && td.getBoundingClientRect().height > 0),
    allLabelled: low.length > 0 && low.every(td => /low sample/i.test(td.textContent)),
    stillWatchable: low.length > 0 && low.every(td => !!td.querySelector('.ws-pivot-btn')),
  };
});
ok(r.lowCount > 0 && r.lowCount === r.populatedCount,
  'A high min-sample marks every populated cell as under-sampled (mechanism is live)', JSON.stringify(r));
ok(r.allVisible && r.allLabelled && r.stillWatchable,
  'Under-sampled cells are labelled low sample and still play their exact film', JSON.stringify(r));
await page.evaluate(() => { const el = document.getElementById('wsStudyMin'); el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await new Promise(res => setTimeout(res, 300));

// The guarantee that matters: a cell must play EXACTLY the plays that carry both
// its row value and its column value — verified against the registry, not against
// the renderer that produced it.
r = await page.evaluate(async () => {
  const app = window.app;
  const captured = [];
  const real = app.filmNavigation.watch.bind(app.filmNavigation);
  app.filmNavigation.watch = async (refs, opts) => { captured.push({ refs: [...refs], label: opts?.label }); return { ok: true }; };
  const btn = document.querySelector('.ws-pivot tbody .ws-pivot-cell:not(.is-none) .ws-pivot-btn');
  const aria = btn?.getAttribute('aria-label') || '';
  btn?.click();
  await new Promise(res => setTimeout(res, 200));
  app.filmNavigation.watch = real;

  // Independent recomputation from the registry over the same season play set.
  const m = aria.match(/^Watch (.+?) (\d+|1st|2nd|3rd|4th), /) || [];
  const rowValue = (captured[0]?.label || '').split(' · ')[0];
  const colValue = (captured[0]?.label || '').split(' · ')[1];
  const games = app.storage.seasonStore.data.games;
  const expected = [];
  games.forEach(game => (game.plays || []).forEach(play => {
    const stamped = { ...play, __gid: String(game.id) };
    const rows = app.analyticsRegistry.values('formation', stamped).map(String);
    const cols = app.analyticsRegistry.values('down', stamped).map(String);
    if (rows.includes(rowValue) && cols.includes(colValue)) expected.push(`${game.id}::${play.id}`);
  }));
  return { label: captured[0]?.label, refs: captured[0]?.refs || [], expected, rowValue, colValue };
});
ok(r.refs.length > 0 && JSON.stringify([...r.refs].sort()) === JSON.stringify([...r.expected].sort()),
  'A pivot cell plays exactly the plays carrying both its row and column value', JSON.stringify({ label: r.label, got: r.refs.length, expected: r.expected.length }));

await page.select('#wsStudyColumn', '');
await new Promise(res => setTimeout(res, 300));
r = await page.evaluate(() => ({ pivot: !!document.querySelector('.ws-pivot'), rows: document.querySelectorAll('.ws-study-row').length }));
ok(!r.pivot && r.rows > 0, 'Clearing the second dimension returns the single-list view unchanged', JSON.stringify(r));

// ===== AX-7: Study asks in lenses and categories, not one flat list ========
const picker = await page.evaluate(() => {
  const StudyScreen = window.app.studyScreen.constructor;
  const read = id => {
    const select = document.querySelector('#' + id);
    return {
      groups: [...select.querySelectorAll('optgroup')].map(group => group.label),
      grouped: select.querySelectorAll('optgroup > option').length,
      ungrouped: [...select.children].filter(node => node.tagName === 'OPTION').map(node => node.value),
      values: [...select.querySelectorAll('option')].map(node => node.value),
    };
  };
  return {
    dimension: read('wsStudyDimension'),
    column: read('wsStudyColumn'),
    measure: read('wsStudyMeasure'),
    dimensionIds: StudyScreen.DIMENSIONS,
    measureIds: StudyScreen.SELECTABLE_METRICS,
    declaredDefault: StudyScreen.DEFAULT_DIMENSION,
    defaultDimension: (() => {
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      const fresh = new StudyScreen(window.app);
      fresh.mount(probe);
      const value = probe.querySelector('#wsStudyDimension')?.value || '';
      probe.remove();
      return value;
    })(),
  };
});
// Grouping reorders options, so "the first option" is no longer a stable
// default — this is a real behaviour change that the harness caught, and the
// default is now stated in code rather than inherited from list position.
ok(picker.defaultDimension === 'formation' && picker.declaredDefault === 'formation',
  'Study still opens on Formation after the pickers were grouped',
  JSON.stringify({ selected: picker.defaultDimension, declared: picker.declaredDefault }));
// Study expansion (2026-08-15): the lens grouping changed shape -- the picker
// now leads with the five offense/defense coaching-metric pairs (the primary
// non-negotiable of this increment) and keeps the registry-only flat measures
// as a distinct "Advanced" group, rather than the four football-question
// lenses this list used before the metric set itself was redesigned.
// Phase 2 (2026-08-15): "Penalties" and "Special Teams" are added AFTER
// those two, their own literal-labeled lenses -- the coaching-metric and
// legacy groups keep their exact prior order and option sets, so this is a
// real addition, not a reshuffle of what already worked.
ok(picker.measure.groups.join(',') === 'Coaching metrics,Advanced,Penalties,Special Teams',
  'The Study metric picker groups coaching metrics ahead of advanced measures, with Penalties/Special Teams as their own lenses', picker.measure.groups.join(','));
ok(picker.dimension.groups.length === 7 && picker.dimension.groups[0] === 'Situation'
  && !picker.dimension.groups.includes('Other'),
  'Study dimensions are grouped by football category with none left unclassified', JSON.stringify(picker.dimension.groups));
// The guarantee that actually matters: grouping is presentation. Every option
// still exists, with the same value, in the same order — so every saved view
// and every query is byte-identical to the flat list it replaced.
ok(picker.dimension.values.length === picker.dimensionIds.length
  && picker.dimensionIds.every(id => picker.dimension.values.includes(id))
  && picker.dimension.grouped === picker.dimensionIds.length,
  'Grouping the dimension picker loses no dimension',
  JSON.stringify({ shown: picker.dimension.values.length, declared: picker.dimensionIds.length, grouped: picker.dimension.grouped }));
ok(picker.measure.values.length === picker.measureIds.length
  && picker.measureIds.every(id => picker.measure.values.includes(id))
  && picker.measure.grouped === picker.measureIds.length,
  'Grouping the metric picker loses no measure',
  JSON.stringify({ shown: picker.measure.values.length, declared: picker.measureIds.length }));
ok(picker.dimension.ungrouped.length === 0 && picker.column.ungrouped.join(',') === '',
  'Only the column picker\'s explicit "no second dimension" option sits outside a group',
  JSON.stringify({ dimension: picker.dimension.ungrouped, column: picker.column.ungrouped }));

console.log('\n== Review repair (bc0f677): eligible-cohort parity, watch-all leak, legacy views, recent/prior windows ==');
await page.setViewport({ width: 1280, height: 800 });
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Recent Windows', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const g1 = store.activeGame();
  g1.id = 'g-recent-1'; g1.name = 'Week 1'; g1.gameInfo = { opponent: 'Foxes', date: '2026-08-01' };
  const play = (id, down, distance, yardage, formation = 'Trips') => ({
    id, timestamp: { start: 0, end: 4 },
    tags: { unit: 'offense', formation, runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage, down, ...(distance != null ? { distance } : {}), custom: [] },
  });
  g1.plays = [play(1, '1', '10', '6')];
  store.addGame({ id: 'g-recent-2', name: 'Week 2', status: 'active', gameInfo: { opponent: 'Week 2', date: '2026-08-08' }, plays: [play(1, '2', '6', '4')] });
  store.addGame({ id: 'g-recent-3', name: 'Week 3', status: 'active', gameInfo: { opponent: 'Week 3', date: '2026-08-15' }, plays: [play(1, '1', '10', '9')] });
  store.addGame({ id: 'g-recent-4', name: 'Week 4', status: 'active', gameInfo: { opponent: 'Week 4', date: '2026-08-22' }, plays: [play(1, '2', '8', '3')] });
  // A DISTINCT formation, appearing only here -- reproduces finding #2 (an
  // against-only group in a "Game vs prior games" comparison must never
  // leak into a "Watch current game" click).
  store.addGame({ id: 'g-recent-5', name: 'Week 5', status: 'active', gameInfo: { opponent: 'Week 5', date: '2026-08-29' }, plays: [play(1, '1', '10', '5', 'Ace')] });
  // The ACTIVE game. Play 2 omits `distance` -- ineligible for successRate/
  // stopRate (reproduces finding #1: a grouped play the metric excludes must
  // not inflate Plays/Run-Pass or leak into Watch while still counting
  // toward the group's raw sample).
  const g6 = store.addGame({ id: 'g-recent-6', name: 'Week 6', status: 'active', gameInfo: { opponent: 'Week 6', date: '2026-09-05' }, plays: [play(1, '1', '10', '7'), play(2, '2', null, '2')] });
  store.data.activeGameId = g6.id;
  app.storage._clearForNewGame();
  app.storage._loadActiveGame();
  await app.workspaceShell.show('study');
  window.__reviewWatchCalls = [];
  app.filmNavigation.watch = async (refs, options) => { window.__reviewWatchCalls.push({ refs: [...refs], label: options?.label }); return { completed: true }; };
});

await page.select('#wsStudyCompare', '');
await page.select('#wsStudyUnit', 'offense');
await page.select('#wsStudyMeasure', 'success');
await page.select('#wsStudyDimension', 'formation');
await page.select('#wsStudyScope', 'game');
r = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Trips');
  const cells = row ? [...row.querySelectorAll('span')].map(el => el.textContent.trim()) : [];
  return { plays: cells[0] || '', metric: cells[1] || '', runPass: cells[2] || '' };
});
ok(r.plays === '1 of 2', 'Finding #1: Plays discloses eligible-of-raw when a grouped play is ineligible for the selected metric', JSON.stringify(r));
ok(r.runPass === '100% / 0%', 'Finding #1: Run/Pass is computed from the metric\'s own eligible cohort, not the group\'s broader raw sample', JSON.stringify(r));
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Trips');
  row?.querySelector('[data-study-row]')?.click();
});
r = await page.evaluate(() => window.__reviewWatchCalls.at(-1));
ok(r.refs.length === 1 && r.refs[0] === 'g-recent-6::1',
  'Finding #1: the row\'s Watch action opens exactly the metric-eligible play, excluding the ineligible sibling counted in Plays', JSON.stringify(r));

await page.select('#wsStudyCompare', 'prior');
r = await page.evaluate(() => [...document.querySelectorAll('.ws-study-row-compare > strong')].map(el => el.textContent));
ok(r.includes('Ace'), 'Finding #2 fixture (rich path): "Game vs prior games" includes an against-only group (Ace)', JSON.stringify(r));
await page.click('[data-study-action="watch-all"]');
r = await page.evaluate(() => window.__reviewWatchCalls.at(-1));
ok(!r.refs.includes('g-recent-5::1') && r.refs.includes('g-recent-6::1') && !r.refs.includes('g-recent-6::2'),
  'Finding #2 (rich path): "Watch current game" never leaks the against-only comparison row, and still excludes the ineligible play', JSON.stringify(r));

await page.select('#wsStudyMeasure', 'epaPerPlay');
r = await page.evaluate(() => [...document.querySelectorAll('.ws-study-row-compare > strong')].map(el => el.textContent));
ok(r.includes('Ace'), 'Finding #2 fixture (legacy flat-measure path): the against-only group exists there too', JSON.stringify(r));
await page.click('[data-study-action="watch-all"]');
r = await page.evaluate(() => window.__reviewWatchCalls.at(-1));
ok(!r.refs.includes('g-recent-5::1') && r.refs.includes('g-recent-6::1') && r.refs.includes('g-recent-6::2'),
  'Finding #2 (legacy path): "Watch current game" never leaks the against-only comparison row on the flat-measure compare path either', JSON.stringify(r));

const legacyViewRaw = await page.evaluate(async () => {
  const key = 'ffa_study_views_v1';
  const before = JSON.parse(localStorage.getItem(key) || '[]');
  const legacyViews = [
    { id: 'legacy-success-rate', name: 'Old formation view', state: { dimension: 'formation', column: '', scope: 'game', unit: 'offense', measure: 'successRate', minSample: 0, compare: '', periodGames: 3, dateFrom: '', dateTo: '', filters: [] } },
    { id: 'legacy-run-share', name: 'Old run share view', state: { dimension: 'formation', column: '', scope: 'season', unit: '', measure: 'runShare', minSample: 0, compare: '', periodGames: 3, dateFrom: '', dateTo: '', filters: [] } },
    { id: 'legacy-pass-share', name: 'Old pass share view', state: { dimension: 'formation', column: '', scope: 'season', unit: '', measure: 'passShare', minSample: 0, compare: '', periodGames: 3, dateFrom: '', dateTo: '', filters: [] } },
  ];
  localStorage.setItem(key, JSON.stringify([...before, ...legacyViews]));
  window.app.studyScreen._loadViews();
  return localStorage.getItem(key);
});
await page.select('#wsStudySaved', 'legacy-success-rate');
r = await page.evaluate(() => ({ measure: document.querySelector('#wsStudyMeasure')?.value, header: document.querySelector('#wsStudyMetricHead')?.textContent, promptHidden: document.querySelector('#wsStudyUnitPrompt')?.hidden }));
ok(r.measure === 'success' && r.header === 'Success Rate' && r.promptHidden,
  'Finding #3: a retired outcome id (successRate) upgrades to its coaching-metric concept, resolved by the view\'s own saved Unit -- not guessed', JSON.stringify(r));
// Re-review (b8a0ab4): runShare/passShare are real, working measures on the
// legacy query path -- upgrading either into Success Rate would answer a
// DIFFERENT coaching question (play-type mix vs. success/failure), not the
// same one better. Both must restore EXACTLY, proven independently.
await page.select('#wsStudySaved', 'legacy-run-share');
r = await page.evaluate(() => ({ measure: document.querySelector('#wsStudyMeasure')?.value, header: document.querySelector('#wsStudyMetricHead')?.textContent, rows: document.querySelectorAll('.ws-study-row').length }));
ok(r.measure === 'runShare' && r.header === 'Run Share' && r.rows > 0,
  'Finding #3 (b8a0ab4): a saved Run Share view restores its EXACT measure and renders real data, never upgraded to a different question', JSON.stringify(r));
await page.select('#wsStudySaved', 'legacy-pass-share');
r = await page.evaluate(() => ({ measure: document.querySelector('#wsStudyMeasure')?.value, header: document.querySelector('#wsStudyMetricHead')?.textContent, rows: document.querySelectorAll('.ws-study-row').length }));
ok(r.measure === 'passShare' && r.header === 'Pass Share' && r.rows > 0,
  'Finding #3 (b8a0ab4): a saved Pass Share view restores its EXACT measure and renders real data, never upgraded to a different question', JSON.stringify(r));
r = await page.evaluate(() => localStorage.getItem('ffa_study_views_v1'));
ok(r === legacyViewRaw, 'Finding #3: opening a legacy saved view never rewrites it in storage', JSON.stringify({ changed: r !== legacyViewRaw }));

// The legacy-view applies above left Unit at whatever each saved view
// stored (blank, for the run-share view) -- reset explicitly rather than
// inherit it, the same way every other section in this file states its
// own control values instead of relying on leftover state.
await page.select('#wsStudyUnit', 'offense');
await page.select('#wsStudyDimension', 'formation');
await page.select('#wsStudyMeasure', 'success');
await page.select('#wsStudyCompare', 'recent');
await page.select('#wsStudyPeriodGames', '2');
await new Promise(resolve => setTimeout(resolve, 100));
r = await page.evaluate(() => ({
  periodVisible: !document.querySelector('#wsStudyPeriodWrap')?.hidden,
  summary: document.querySelector('#wsStudySummary')?.textContent,
}));
ok(r.periodVisible && /Last 2 games/.test(r.summary) && /Prior 2 games/.test(r.summary),
  'Finding #4: the recent/prior period selector is visible and both window labels state their size', JSON.stringify(r));
r = await page.evaluate(() => {
  const cohorts = window.app.studyScreen._saveCohorts;
  const gamesOf = refs => [...new Set(refs.map(ref => ref.split('::')[0]))].sort();
  return {
    base: gamesOf(cohorts.find(c => c.id === 'base')?.refs || []),
    against: gamesOf(cohorts.find(c => c.id === 'against')?.refs || []),
  };
});
ok(JSON.stringify(r.base) === JSON.stringify(['g-recent-5', 'g-recent-6']) && JSON.stringify(r.against) === JSON.stringify(['g-recent-3', 'g-recent-4']),
  'Finding #4: at period=2 the recent and prior windows are the two ADJACENT, non-overlapping 2-game blocks -- games 1-2 excluded from both', JSON.stringify(r));

await page.select('#wsStudyPeriodGames', '5');
await new Promise(resolve => setTimeout(resolve, 100));
r = await page.evaluate(() => {
  const cohorts = window.app.studyScreen._saveCohorts;
  const gamesOf = refs => [...new Set(refs.map(ref => ref.split('::')[0]))].sort();
  const summary = document.querySelector('#wsStudySummary')?.textContent || '';
  return {
    base: gamesOf(cohorts.find(c => c.id === 'base')?.refs || []),
    against: gamesOf(cohorts.find(c => c.id === 'against')?.refs || []),
    singular: /Prior 1 game\b/.test(summary) && !/Prior 1 games/.test(summary),
  };
});
ok(JSON.stringify(r.base) === JSON.stringify(['g-recent-2', 'g-recent-3', 'g-recent-4', 'g-recent-5', 'g-recent-6']) && JSON.stringify(r.against) === JSON.stringify(['g-recent-1']),
  'Finding #4: an undersized season clamps the prior window honestly (1 available game, not a fabricated 5) instead of erroring', JSON.stringify(r));
ok(r.singular, 'Finding #4: the clamped single-game prior window uses honest singular wording ("Prior 1 game")', JSON.stringify(r));

await page.select('#wsStudyPeriodGames', '2');
await new Promise(resolve => setTimeout(resolve, 100));
const storedBeforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length);
// Dispatched directly on the button rather than page.click()'s coordinate hit
// test: the earlier legacy-view-upgrade toasts (finding #3) can still be
// fading over this exact corner of the screen, and a coordinate click lands
// on the toast instead of the button -- a real, reproduced flake (2 of 3
// runs), not a timing guess. A direct `.click()` still bubbles through the
// same delegated `_bind()` listener as a real click.
await page.evaluate(() => document.querySelector('[data-study-action="save"]').click());
await page.select('#wsStudyPeriodGames', '5');
await new Promise(resolve => setTimeout(resolve, 100));
await page.evaluate(() => document.querySelector('[data-study-action="save"]').click());
r = await page.evaluate(() => ({
  stored: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length,
  names: [...document.querySelectorAll('#wsStudySaved option')].map(o => o.textContent),
}));
ok(r.stored === storedBeforeSave + 2, 'Finding #4: a 2-game and a 5-game recent comparison save as two DISTINCT views, not an overwrite', JSON.stringify(r));
ok(r.names.some(n => n.includes('Recent 2 vs prior 2')) && r.names.some(n => n.includes('Recent 5 vs prior 5')),
  'Finding #4: saved-view names distinguish the 2-game and 5-game recent comparisons', JSON.stringify(r.names));

const twoGameOption = await page.evaluate(() => [...document.querySelectorAll('#wsStudySaved option')].find(o => o.textContent.includes('Recent 2 vs prior 2'))?.value);
await page.select('#wsStudySaved', twoGameOption);
r = await page.evaluate(() => ({ period: document.querySelector('#wsStudyPeriodGames')?.value, compare: document.querySelector('#wsStudyCompare')?.value }));
ok(r.period === '2' && r.compare === 'recent', 'Finding #4: restoring a saved recent-comparison view round-trips its exact period size', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
