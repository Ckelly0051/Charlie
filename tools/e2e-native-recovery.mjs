import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass=0,fail=0;const ok=(v,l,d='')=>v?(pass++,console.log(`  PASS  ${l}`)):(fail++,console.log(`  FAIL  ${l}${d?` -- ${d}`:''}`));
const browser=await puppeteer.launch({args:['--no-sandbox'],protocolTimeout:120000});const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.setViewport({width:1280,height:800});await page.evaluateOnNewDocument(()=>localStorage.clear());await page.goto(APP_URL,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.app?.settingsScreen&&window.app?.storage?.seasonStore);
await page.evaluate(async()=>{
 const app=window.app,store=app.storage.seasonStore;await store.createSeason({name:'Recovery Season',team:'Mavericks',teamId:'recovery-team'});
 const play=(id,note)=>({id,timestamp:{start:id,end:id+1},tags:{unit:'offense',down:'1',distance:'10',formation:'Wing-T',playType:'Run Inside',result:'Gain',yardage:'5',players:{},grades:{},custom:[]},notes:note});
 const a={...store.blankGame(),id:'g-a',name:'Week 1 vs A',gameInfo:{opponent:'A'},plays:[play(1,'baseline-a')],nextId:2,currentPlayId:1};
 const b={...store.blankGame(),id:'g-b',name:'Week 2 vs B',gameInfo:{opponent:'B'},plays:[play(1,'baseline-b')],nextId:2,currentPlayId:1};
 store.data.games=[a,b];store.data.activeGameId='g-a';await store.persist();app.storage._loadActiveGame();app.tagger._confirmDialog=async()=>true;
 const inv=document.createElement('button');inv.id='recovery-invoker';inv.textContent='Recovery';document.body.appendChild(inv);inv.focus();app.settingsScreen.open({initialTab:'recovery',returnFocus:inv});
});
await page.waitForSelector('[data-settings-panel="recovery"]');
let r=await page.evaluate(()=>({seasonCopy:document.querySelector('[data-settings-panel="recovery"]')?.textContent||'',legacy:!!document.getElementById('versionPanel')||!!document.getElementById('settingsDrawer')}));
ok(/Whole season/.test(r.seasonCopy)&&/Current game/.test(r.seasonCopy)&&/Restores every game/.test(r.seasonCopy)&&/Restores only the open game/.test(r.seasonCopy)&&!r.legacy,'Recovery distinguishes durable whole-season restore points from current-game versions',JSON.stringify(r));

await page.click('[aria-label="Restore point label"]');for(const ch of 'Before re-tag'){await page.keyboard.type(ch,{delay:15});}await page.click('[data-settings-panel="recovery"] .gi-settings-section:first-child .gi-settings-primary');await page.waitForFunction(()=>[...document.querySelectorAll('[data-season-restore] strong')].some(el=>el.textContent==='Before re-tag'));
r=await page.evaluate(async()=>({points:await window.app.storage.seasonStore.listBackups(),canonical:await window.app.storage.seasonStore.backend.loadSeason(window.app.storage.seasonStore.currentSeasonId)}));
ok(r.points.some(p=>p.label==='Before re-tag')&&r.canonical.games.length===2,'Create restore point persists a real two-game season snapshot',JSON.stringify(r.points));
const baselineId=await page.$eval('[data-season-restore]',el=>el.dataset.seasonRestore);

await page.evaluate(async()=>{const app=window.app,store=app.storage.seasonStore;app.tagger.plays[0].notes='changed-a';app.storage.commitActive();store.data.games.find(g=>g.id==='g-b').plays[0].notes='changed-b';await store.persist();});
await page.click(`[data-season-restore="${baselineId}"] button`);await page.waitForSelector('[data-overlay-action="restore"]');await page.waitForFunction(()=>document.activeElement?.dataset.overlayAction==='cancel');
r=await page.evaluate(()=>{const panel=document.querySelector('[data-overlay-action="cancel"]')?.closest('.gi-overlay-panel');return{title:panel?.querySelector('h2')?.textContent||'',text:panel?.textContent||'',focused:document.activeElement?.dataset.overlayAction};});
ok(/Restore this season/.test(r.title)&&/Every game/.test(r.text)&&/reversible/.test(r.text)&&r.focused==='cancel','Season restore names its full impact and defaults focus away from the destructive action',JSON.stringify(r));
await page.click('[data-overlay-action="restore"]');await page.waitForFunction(()=>window.app.storage.seasonStore.data.games.every(g=>g.plays[0].notes.startsWith('baseline')));
r=await page.evaluate(async()=>{const store=window.app.storage.seasonStore,canonical=await store.backend.loadSeason(store.currentSeasonId),points=await store.listBackups();return{live:store.data.games.map(g=>g.plays[0].notes),canonical:canonical.games.map(g=>g.plays[0].notes),safety:points.some(p=>p.label==='Before restore'),active:window.app.tagger.plays[0].notes};});
ok(JSON.stringify(r.live)==='["baseline-a","baseline-b"]'&&JSON.stringify(r.canonical)===JSON.stringify(r.live)&&r.safety&&r.active==='baseline-a','Season restore updates every game, reloads the active editor, persists canonical bytes, and saves the prior state',JSON.stringify(r));

// A failed canonical save must leave both the live season and stored season on the pre-restore state.
await page.evaluate(async()=>{const app=window.app,store=app.storage.seasonStore;app.tagger.plays[0].notes='keep-a';app.storage.commitActive();store.data.games.find(g=>g.id==='g-b').plays[0].notes='keep-b';await store.persist();window.__restoreSave=store.backend.saveSeason.bind(store.backend);store.backend.saveSeason=async()=>false;});
await page.click(`[data-season-restore="${baselineId}"] button`);await page.waitForSelector('[data-overlay-action="restore"]');await page.click('[data-overlay-action="restore"]');await new Promise(resolve=>setTimeout(resolve,250));
r=await page.evaluate(async()=>{const store=window.app.storage.seasonStore;store.backend.saveSeason=window.__restoreSave;const canonical=await store.backend.loadSeason(store.currentSeasonId);return{live:store.data.games.map(g=>g.plays[0].notes),canonical:canonical.games.map(g=>g.plays[0].notes),active:window.app.tagger.plays[0].notes,toasts:[...document.querySelectorAll('[role="status"]')].map(el=>el.textContent)};});
ok(JSON.stringify(r.live)==='["keep-a","keep-b"]'&&JSON.stringify(r.canonical)===JSON.stringify(r.live)&&r.active==='keep-a','Failed season restore rolls back in memory, keeps canonical storage unchanged, and never reloads stale backup data',JSON.stringify(r));

// Quick versions stay scoped to the open game.
await page.click('[aria-label="Game version label"]');for(const ch of 'Before QB edit'){await page.keyboard.type(ch,{delay:15});}await page.evaluate(()=>document.querySelector('[aria-label="Game version label"]').nextElementSibling.click());await page.waitForFunction(()=>[...document.querySelectorAll('[data-game-version] strong')].some(el=>el.textContent==='Before QB edit'));
const versionId=await page.$eval('[data-game-version]',el=>el.dataset.gameVersion);
await page.evaluate(()=>{window.app.tagger.plays[0].notes='changed-version';window.app.storage.commitActive();});await page.click(`[data-game-version="${versionId}"] button`);await page.waitForFunction(()=>window.app.tagger.plays[0].notes==='keep-a');
r=await page.evaluate(async()=>{const app=window.app,store=app.storage.seasonStore;const a=app.tagger.plays[0].notes,b=store.data.games.find(g=>g.id==='g-b').plays[0].notes;await app.storage.switchToGame('g-b');const other=app.versions.list();await app.storage.switchToGame('g-a');return{a,b,other};});
ok(r.a==='keep-a'&&r.b==='keep-b'&&r.other.length===0,'Game version restore changes only the open game and versions remain game-scoped',JSON.stringify(r));

await page.evaluate(async()=>{const app=window.app,store=app.storage.seasonStore;app.tagger.plays[0].notes='keep-version-failure';app.storage.commitActive();await store.persist();window.__versionSave=store.backend.saveSeason.bind(store.backend);store.backend.saveSeason=async()=>false;});
await page.click(`[data-game-version="${versionId}"] button`);await new Promise(resolve=>setTimeout(resolve,250));
r=await page.evaluate(async()=>{const store=window.app.storage.seasonStore;store.backend.saveSeason=window.__versionSave;const canonical=await store.backend.loadSeason(store.currentSeasonId);return{live:window.app.tagger.plays[0].notes,stored:store.data.games.find(g=>g.id==='g-a').plays[0].notes,canonical:canonical.games.find(g=>g.id==='g-a').plays[0].notes};});
ok(r.live==='keep-version-failure'&&r.stored===r.live&&r.canonical===r.live,'Failed game-version restore keeps the live game and canonical season on the pre-restore state',JSON.stringify(r));

await page.evaluate(()=>window.app.settingsScreen.close('done'));await page.waitForFunction(()=>document.activeElement?.id==='recovery-invoker');ok(await page.evaluate(()=>document.activeElement?.id==='recovery-invoker'),'Closing Recovery restores its invoking control');
await page.setViewport({width:390,height:844});
await page.evaluate(()=>{window.app.settingsScreen.open({initialTab:'recovery',returnFocus:document.getElementById('recovery-invoker')});});
await page.waitForSelector('[data-settings-panel="recovery"]');
r=await page.evaluate(()=>{const nav=document.querySelector('.gi-settings-tabs'),active=nav?.querySelector('[aria-current="page"]');const nr=nav?.getBoundingClientRect(),ar=active?.getBoundingClientRect();return{label:active?.textContent,left:ar?.left,right:ar?.right,navLeft:nr?.left,navRight:nr?.right,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};});
ok(r.label==='Recovery'&&r.left>=r.navLeft&&r.right<=r.navRight&&!r.pageOverflow,'Mobile Recovery scrolls its active Settings tab into view with no page overflow',JSON.stringify(r));
await page.evaluate(()=>window.app.settingsScreen.close('done'));
ok(errors.length===0,'Native Recovery journey produces zero page/console errors',errors.join(' | '));console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);await browser.close();process.exit(fail?1:0);
