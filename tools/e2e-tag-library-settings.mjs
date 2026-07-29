import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass=0,fail=0;
const ok=(value,label,extra='')=>value?(pass++,console.log(`  PASS  ${label}`)):(fail++,console.log(`  FAIL  ${label}${extra?` -- ${extra}`:''}`));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.setViewport({width:1280,height:800});
await page.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('ffa_active_team_id','settings-test');});
await page.goto(APP_URL,{waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.app?.tagLibrarySettings&&window.app?.settingsScreen);
await page.evaluate(()=>{window.app.tagger._confirmDialog=async()=>true;});

await page.evaluate(() => { window.app.settingsScreen.open(); });
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.click('[data-settings-tab="charting"]');
await page.waitForSelector('[data-settings-panel="charting"]');
let state=await page.evaluate(()=>({
 owners:document.querySelectorAll('[data-settings-panel="charting"]').length,
 legacy:!!document.getElementById('settingsDrawer')||!!document.getElementById('drawerScrim')||!!document.getElementById('tagLibraryDialog'),
 tabs:document.querySelectorAll('[data-settings-panel="charting"] [role="tab"]').length,
 rows:document.querySelectorAll('[data-settings-panel="charting"] [data-tag-value]').length,
 promise:document.querySelector('[data-settings-panel="charting"] .gi-settings-truth')?.textContent||'',
}));
ok(state.owners===1&&!state.legacy&&state.tabs===3&&state.rows===16,'Native Charting is the one owner of all three staff libraries',JSON.stringify(state));
ok(/Hiding is not deleting/.test(state.promise)&&/analytics stay unchanged/.test(state.promise),'Charting states the non-destructive visibility contract');

await page.evaluate(()=>{window.app.tagger.plays=[{id:1,tags:{unit:'offense',formation:'Wing-T',backfield:'',custom:[]}}];});
await page.click('[data-tag-value="Wing-T"] input');
state=await page.evaluate(()=>({enabled:window.app.customChips.library.group('formation').enabled.includes('Wing-T'),hidden:document.querySelector('#tagFormation .pick[data-value="Wing-T"]')?.classList.contains('library-hidden'),tag:window.app.tagger.plays[0].tags.formation}));
ok(!state.enabled&&state.hidden,'Hiding a default removes it from future charting choices',JSON.stringify(state));
ok(state.tag==='Wing-T','Hiding a choice never rewrites historical play tags',JSON.stringify(state));

await page.click('[data-chart-group="front"]');
await page.type('[data-tag-add]','Bear');await page.click('.gi-library-add button');
state=await page.evaluate(()=>({stored:window.app.customChips.library.group('front').custom.includes('Bear'),chip:!!document.querySelector('#tagDefFront .pick[data-value="Bear"]'),checked:document.querySelector('[data-tag-value="Bear"] input')?.checked}));
ok(state.stored&&state.chip&&state.checked,'A custom Front is persisted, enabled, and immediately chartable',JSON.stringify(state));

await page.type('[data-tag-add]','Bear "Zero"');await page.click('.gi-library-add button');
state=await page.evaluate(()=>{const value='Bear "Zero"';const row=[...document.querySelectorAll('[data-tag-value]')].find(el=>el.dataset.tagValue===value);const remove=row?.querySelector('button');return{stored:window.app.customChips.library.group('front').custom.includes(value),row:!!row,aria:remove?.getAttribute('aria-label'),stray:!!row?.getAttribute('zero"')};});
ok(state.stored&&state.row&&state.aria==='Remove Bear "Zero"'&&!state.stray,'Quoted custom names remain exact inert DOM data',JSON.stringify(state));

for(const [group,value] of [['formation','Trey Open'],['backfield','Ace Offset']]){await page.click(`[data-chart-group="${group}"]`);await page.type('[data-tag-add]',value);await page.click('.gi-library-add button');}
await page.click('[data-overlay-action="done"]');await page.waitForFunction(()=>!document.querySelector('[data-overlay-id="team-film-settings"]'));
state=await page.evaluate(()=>{const play={id:77,timestamp:{start:0,end:5},tags:{unit:'offense',formation:'',backfield:'',defFront:'',players:{},grades:{},custom:[]}};window.app.tagger.plays=[play];window.app.tagger.currentPlayId=77;window.app.tagger._loadTagForm(play);document.querySelector('#tagFormation .pick[data-value="Trey Open"]').click();document.querySelector('#tagBackfield .pick[data-value="Ace Offset"]').click();document.querySelector('#tagDefFront .pick[data-value="Bear"]').click();return{tags:{...play.tags}};});
ok(state.tags.formation==='Trey Open'&&state.tags.backfield==='Ace Offset'&&state.tags.defFront==='Bear','Custom Formation, Backfield, and Front write through PlayTagger',JSON.stringify(state));

await page.evaluate(()=>document.querySelector('#tagUnit .pick[data-value="defense"]').click());
state=await page.evaluate(()=>({visible:getComputedStyle(document.querySelector('#tagDefFront .pick[data-value="Bear"]')).display!=='none',value:window.app.tagger.getCurrentPlay().tags.defFront}));
ok(state.visible&&state.value==='Bear','Custom Front remains chartable as Our Defensive Call',JSON.stringify(state));
await page.evaluate(()=>document.querySelector('#tagUnit .pick[data-value="offense"]').click());
state=await page.evaluate(()=>({visible:getComputedStyle(document.querySelector('#tagDefFront .pick[data-value="Bear"]')).display!=='none',value:window.app.tagger.getCurrentPlay().tags.defFront}));
ok(state.visible&&state.value==='Bear','Custom Front remains chartable in Defense Faced',JSON.stringify(state));

state=await page.evaluate(()=>{localStorage.setItem('ffa_active_team_id','settings-other-team');window.app.customChips.reload();const absent=['Trey Open','Ace Offset','Bear'].every(value=>!document.querySelector(`.pick[data-value="${value}"]`));localStorage.setItem('ffa_active_team_id','settings-test');window.app.customChips.reload();const restored=['Trey Open','Ace Offset','Bear'].every(value=>!!document.querySelector(`.pick[data-value="${value}"]`));return{absent,restored};});
ok(state.absent&&state.restored,'Switching teams isolates and restores each staff vocabulary',JSON.stringify(state));

await page.evaluate(()=>{ window.app.tagLibrarySettings.open('front'); });
await page.waitForSelector('[data-settings-panel="charting"] [data-chart-group="front"].is-selected');
await page.click('[data-tag-value="Bear"] button');await page.waitForSelector('[data-overlay-action="remove"]');await page.click('[data-overlay-action="remove"]');
await page.waitForFunction(()=>!document.querySelector('[data-tag-value="Bear"]'));
state=await page.evaluate(()=>({stored:window.app.customChips.library.group('front').custom.includes('Bear'),chip:!!document.querySelector('#tagDefFront .pick[data-value="Bear"]')}));
ok(!state.stored&&!state.chip,'Removing a custom choice updates both native Settings and charting UI',JSON.stringify(state));

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
