import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass=0,fail=0;
const ok=(value,label,extra='')=>value?(pass++,console.log(`  PASS  ${label}`)):(fail++,console.log(`  FAIL  ${label}${extra?` -- ${extra}`:''}`));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.setViewport({width:1280,height:800});
await page.evaluateOnNewDocument(()=>localStorage.clear());
await page.goto(APP_URL,{waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.app?.tagLibrarySettings&&window.app?.settingsScreen);
await page.evaluate(()=>{window.app.tagger._confirmDialog=async()=>true;});

// Final Engine Independence: a season + native Break Down route is required
// so the "immediately chartable" assertions can check the REAL coach-visible
// surface (native-tagging.jsx's own chip buttons, sourced from
// customChips.library) instead of the retired .tag-section markup.
//
// A fixed placeholder team id (the old harness's 'settings-test') is no
// longer used: TeamHubScreen.load() -- called when Settings closes -- self-
// heals an active-team pointer that names no real registered team, which
// silently overwrote it with the season's actual team the first time this
// test closed the sheet, and every TagLibrary read after that point was
// scoped to the corrected id instead of the id this file kept asserting
// against. teamId is read back from the app once real team creation has
// settled, and every later isolation check uses that real value.
await page.evaluate(async()=>{
  await window.app.storage.createSeason({name:'Settings library test',team:'Mavericks',year:'2026'});
  const game=window.app.storage.seasonStore.activeGame();
  game.plays=[{id:1,timestamp:{start:0,end:5},notes:'',tags:{unit:'offense',formation:'',backfield:'',defFront:'',players:{},grades:{},custom:[]}}];
  await window.app.storage._loadActiveGame();
  await window.app.workspaceShell.show('breakdown');
  window.app.tagger.selectPlay(1);
});
await page.waitForSelector('[data-native-tagging]');
// The active-team pointer is only reconciled against the real team registry
// the first time Team Hub loads (normally triggered when Settings closes) --
// force that reconciliation up front so every library edit below lands under
// the SAME team id this file later asserts against, instead of the
// pre-reconciliation 'default' fallback.
await page.evaluate(async()=>{ await window.app.teamHubScreen?.load?.(); });
const teamId = await page.evaluate(()=>localStorage.getItem('ffa_active_team_id'));

/** Find a native chip button in the given field group by its exact visible
 *  label -- native-tagging.jsx renders plain <button>{label}</button> chips
 *  with no data-value attribute, so label text is the real lookup key a
 *  coach would use too. */
const nativeChipHandle = async (field, label) => page.evaluateHandle((field, label) => {
  const group = document.querySelector(`[data-native-field="${field}"]`);
  if (!group) return null;
  return [...group.querySelectorAll('.gi-tag-chips button')].find(b => b.textContent.trim() === label) || null;
}, field, label);
// Find-and-click in one atomic in-browser call -- Preact's own republish
// (queued as a microtask by every prior toggleField/setField) can run
// between two separate CDP round-trips, so a handle captured by one call and
// clicked by another risks acting on an already-replaced node.
const clickNativeChip = async (field, label) => page.evaluate((field, label) => {
  const group = document.querySelector(`[data-native-field="${field}"]`);
  const btn = group && [...group.querySelectorAll('.gi-tag-chips button')].find(b => b.textContent.trim() === label);
  if (btn) btn.click();
  return !!btn;
}, field, label);

await page.evaluate(() => { window.app.settingsScreen.open(); });
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.click('[data-settings-tab="charting"]');
await page.waitForSelector('[data-settings-panel="charting"]');
let state=await page.evaluate(()=>({
 owners:document.querySelectorAll('[data-settings-panel="charting"]').length,
 legacy:!!document.getElementById('settingsDrawer')||!!document.getElementById('drawerScrim')||!!document.getElementById('tagLibraryDialog')||!!document.querySelector('.tag-section'),
 tabs:document.querySelectorAll('[data-settings-panel="charting"] [role="tab"]').length,
 rows:document.querySelectorAll('[data-settings-panel="charting"] [data-tag-value]').length,
 expectedRows:window.app.customChips.library.group('formation').values.length,
 values:[...document.querySelectorAll('[data-settings-panel="charting"] [data-tag-value]')].map(row=>row.dataset.tagValue),
 promise:document.querySelector('[data-settings-panel="charting"] .gi-settings-truth')?.textContent||'',
}));
ok(state.owners===1&&!state.legacy&&state.tabs===3&&state.rows===state.expectedRows&&['I-Form','Split Back'].every(value=>state.values.includes(value)),'Native Charting is the one owner of the complete active Formation library, and no legacy chip markup exists',JSON.stringify(state));
ok(/Hiding is not deleting/.test(state.promise)&&/analytics stay unchanged/.test(state.promise),'Charting states the non-destructive visibility contract');

await page.evaluate(()=>{const play=window.app.tagger.getCurrentPlay();play.tags.formation='Wing-T';window.app.tagger._loadTagForm(play);});
await page.click('[data-tag-value="Wing-T"] input');
const wingTChip = await nativeChipHandle('formation', 'Wing-T');
state = {
  enabled: await page.evaluate(() => window.app.customChips.library.group('formation').enabled.includes('Wing-T')),
  hiddenFromChart: await wingTChip.evaluate(el => el === null),
  tag: await page.evaluate(() => window.app.tagger.getCurrentPlay().tags.formation),
};
ok(!state.enabled&&state.hiddenFromChart,'Hiding a default removes it from future charting choices in the native form',JSON.stringify(state));
ok(state.tag==='Wing-T','Hiding a choice never rewrites historical play tags',JSON.stringify(state));

await page.click('[data-chart-group="front"]');
await page.type('[data-tag-add]','Bear');await page.click('.gi-library-add button');
let bearChip = await nativeChipHandle('defFront', 'Bear');
state={
  stored: await page.evaluate(()=>window.app.customChips.library.group('front').custom.includes('Bear')),
  chip: await bearChip.evaluate(el => !!el),
  checked: await page.evaluate(()=>document.querySelector('[data-tag-value="Bear"] input')?.checked),
};
ok(state.stored&&state.chip&&state.checked,'A custom Front is persisted, enabled, and immediately chartable in the native form',JSON.stringify(state));

await page.type('[data-tag-add]','Bear "Zero"');await page.click('.gi-library-add button');
state=await page.evaluate(()=>{const value='Bear "Zero"';const row=[...document.querySelectorAll('[data-tag-value]')].find(el=>el.dataset.tagValue===value);const remove=row?.querySelector('button');return{stored:window.app.customChips.library.group('front').custom.includes(value),row:!!row,aria:remove?.getAttribute('aria-label'),stray:!!row?.getAttribute('zero"')};});
ok(state.stored&&state.row&&state.aria==='Remove Bear "Zero"'&&!state.stray,'Quoted custom names remain exact inert DOM data',JSON.stringify(state));

for(const [group,value] of [['formation','Trey Open'],['backfield','Ace Offset']]){await page.click(`[data-chart-group="${group}"]`);await page.type('[data-tag-add]',value);await page.click('.gi-library-add button');}
await page.click('[data-overlay-action="done"]');await page.waitForFunction(()=>!document.querySelector('[data-overlay-id="team-film-settings"]'));
// Clear the earlier hiding test's leftover Formation value first -- Formation
// is multi-select, so clicking a fresh chip would otherwise ADD to it
// ("Wing-T + Trey Open"), which is correct multi-select behavior but not
// what this assertion means to check.
await page.evaluate(()=>{const play=window.app.tagger.getCurrentPlay();play.tags.formation='';window.app.tagger._loadTagForm(play);});
await clickNativeChip('formation', 'Trey Open');
await clickNativeChip('backfield', 'Ace Offset');
await clickNativeChip('defFront', 'Bear');
state = { tags: await page.evaluate(() => ({ ...window.app.tagger.getCurrentPlay().tags })) };
ok(state.tags.formation==='Trey Open'&&state.tags.backfield==='Ace Offset'&&state.tags.defFront==='Bear','Custom Formation, Backfield, and Front write through PlayTagger from the native form',JSON.stringify(state));

await page.evaluate(()=>window.app.nativeTagging.setUnit('defense'));
bearChip = await nativeChipHandle('defFront', 'Bear');
state = {
  visible: await bearChip.evaluate(el => !!el && el.getClientRects().length > 0),
  value: await page.evaluate(()=>window.app.tagger.getCurrentPlay().tags.defFront),
};
ok(state.visible&&state.value==='Bear','Custom Front remains chartable as Our Defensive Call',JSON.stringify(state));
await page.evaluate(()=>window.app.nativeTagging.setUnit('offense'));
bearChip = await nativeChipHandle('defFront', 'Bear');
state = {
  visible: await bearChip.evaluate(el => !!el && el.getClientRects().length > 0),
  value: await page.evaluate(()=>window.app.tagger.getCurrentPlay().tags.defFront),
};
ok(state.visible&&state.value==='Bear','Custom Front remains chartable in Defense Faced',JSON.stringify(state));

state=await page.evaluate(async(realTeamId)=>{
  localStorage.setItem('ffa_active_team_id','settings-other-team');window.app.customChips.reload();
  const absentValues=['Trey Open','Ace Offset','Bear'];
  const absent=absentValues.every(value=>!window.app.customChips.library.group(value==='Bear'?'front':value==='Ace Offset'?'backfield':'formation').custom.includes(value));
  localStorage.setItem('ffa_active_team_id',realTeamId);window.app.customChips.reload();
  const restored=absentValues.every(value=>window.app.customChips.library.group(value==='Bear'?'front':value==='Ace Offset'?'backfield':'formation').custom.includes(value));
  return{absent,restored};
},teamId);
ok(state.absent&&state.restored,'Switching teams isolates and restores each staff vocabulary',JSON.stringify(state));

await page.evaluate(()=>{ window.app.tagLibrarySettings.open('front'); });
await page.waitForSelector('[data-settings-panel="charting"] [data-chart-group="front"].is-selected');
await page.click('[data-tag-value="Bear"] button');await page.waitForSelector('[data-overlay-action="remove"]');await page.click('[data-overlay-action="remove"]');
await page.waitForFunction(()=>!document.querySelector('[data-tag-value="Bear"]'));
bearChip = await nativeChipHandle('defFront', 'Bear');
state={stored: await page.evaluate(()=>window.app.customChips.library.group('front').custom.includes('Bear')), chip: await bearChip.evaluate(el=>!!el)};
ok(!state.stored&&!state.chip,'Removing a custom choice updates both native Settings and the native charting form',JSON.stringify(state));

await page.click('[data-settings-panel="charting"] .gi-settings-section>header button');await page.waitForSelector('[data-overlay-action="restore"]');await page.click('[data-overlay-action="restore"]');
await page.waitForFunction(()=>window.app.customChips.library.group('formation').enabled.includes('Wing-T'));
state=await page.evaluate(()=>({wingT:window.app.customChips.library.group('formation').enabled.includes('Wing-T'),custom:Object.values(window.app.customChips.library.load().groups).some(group=>group.custom.length)}));
ok(state.wingT&&!state.custom,'Restore defaults reenables built-ins and clears custom choices',JSON.stringify(state));

await page.setViewport({width:390,height:844});
state=await page.evaluate(()=>({pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,panelOverflow:document.querySelector('[data-native-settings]').scrollWidth>document.querySelector('[data-native-settings]').clientWidth,shortest:Math.min(...[...document.querySelectorAll('[data-settings-panel="charting"] [role="tab"], [data-settings-panel="charting"] .gi-library-row')].map(el=>el.getBoundingClientRect().height).filter(Boolean))}));
ok(!state.pageOverflow&&state.shortest>=44,'Mobile Charting has no page-level overflow and keeps touch-sized rows',JSON.stringify(state));
await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[data-overlay-id="team-film-settings"]'));
ok(!await page.$('[data-overlay-id="team-film-settings"]'),'Escape closes native Settings');
ok(errors.length===0,'No page errors',errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);await browser.close();process.exit(fail?1:0);
