import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass=0, fail=0;
const ok=(value,label,detail='')=>value?(pass++,console.log('  PASS  '+label)):(fail++,console.log('  FAIL  '+label+(detail?' -- '+detail:'')));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[];
const screenshotPath=process.env.GIQ_NATIVE_TAGGING_SCREENSHOT||'';
page.on('pageerror',error=>errors.push(error.stack||error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
await page.setViewport({width:1440,height:900});
await page.goto(APP_URL,{waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.app?.nativeTagging&&document.querySelector('[data-native-team-hub]'));

console.log('\n== 1. Native owner and complete capability manifest ==');
const fixture=await page.evaluate(async()=>{
  const app=window.app;
  await app.storage.createSeason({name:'S5c Native Tagging',team:'Mavericks',year:'2026'});
  app.roster.loadFrom([{num:'7',name:'Miller',side:'O'},{num:'22',name:'Jones',side:'B'},{num:'55',name:'Reed',side:'D'}]);
  const store=app.storage.seasonStore,first=store.activeGame();
  first.gameInfo={...(first.gameInfo||{}),opponent:'Alpha',week:'1',gameType:'game',perspective:'scout',direction:'left'};
  first.plays=Array.from({length:20},(_,i)=>({id:i+1,timestamp:{start:i*6,end:i*6+5},notes:'',diagram:i===0?[{t:'O',x:.5,y:.6}]:[],tags:{unit:'offense',down:'',distance:'',quarter:'',fieldSide:'own',yardLine:'',formation:'',qbAlignment:'',backfield:'',strength:'',personnel:'',motion:'',runPass:'',playType:'',result:'',yardage:'',hash:'',playDir:'',defFront:'',coverage:'',coverageFamily:'',blitz:'',driveNumber:'',players:{},grades:{},custom:[],customFields:{}}}));
  const second=store.addGame();
  second.gameInfo={...(second.gameInfo||{}),opponent:'Beta',week:'2',gameType:'game',perspective:'defense',direction:'right'};
  second.plays=[{id:101,timestamp:{start:0,end:4},notes:'',tags:{unit:'defense',defFront:'4-2-5',coverage:'Cover 3',players:{},grades:{},custom:[]}}];
  store.setActive(first.id);await store.persist();await app.storage._loadActiveGame({renderGames:false});app.tagger.selectPlay(1);await app.workspaceShell.show('breakdown');
  const source=app.nativeTagging.source,before={style:source.getAttribute('style'),aria:source.getAttribute('aria-hidden'),marker:source.getAttribute('data-native-tag-source'),data:JSON.stringify(store.data)};
  const host=document.createElement('div');host.id='nativeTaggingTestHost';host.style.cssText='width:min(560px,100%);min-height:800px';document.body.append(host);
  const mounted=app.nativeTagging.mount(host);await new Promise(r=>setTimeout(r,0));
  return{seasonId:store.data.id,firstId:first.id,secondId:second.id,mounted,before};
});
let state=await page.evaluate(()=>{
  const root=document.querySelector('[data-native-tagging]'),source=app.nativeTagging.source;
  const fields=[...root.querySelectorAll('[data-native-field]')].map(n=>n.dataset.nativeField).sort();
  const controls=[...root.querySelectorAll('button,select,input,textarea,summary')].filter(n=>n.getClientRects().length);
  const text=root.textContent;
  return{roots:document.querySelectorAll('[data-native-tagging]').length,sourceMoved:source.dataset.nativeTagSource===''&&source.getBoundingClientRect().right<0,
    ids:[...root.querySelectorAll('[id]')].map(n=>n.id),proxy:root.querySelectorAll('[data-native-tag-proxy]').length,fields,controls:controls.length,
    context:[...root.querySelectorAll('[data-native-context]')].map(n=>n.dataset.nativeContext).sort(),
    capabilities:['Same as Last','Templates','Save Template','Play Diagram','Draw','Set OCR Region','Read Scoreboard','Auto OCR','Auto-detect plays','Save & Next','New Drive','Edit custom fields'].filter(label=>text.includes(label))};
});
ok(fixture.mounted&&state.roots===1&&state.sourceMoved,'One native owner mounts and compatibility markup is off-screen',JSON.stringify(state));
ok(state.proxy===0&&!state.ids.some(id=>id.startsWith('tag')||id.startsWith('btn')),'Visible markup is Preact-owned, not a legacy clone',JSON.stringify({ids:state.ids,proxy:state.proxy}));
const expectedFields=['backfield','blitz','coverage','coverageFamily','defFront','distance','down','driveNumber','fieldSide','formation','hash','motion','personnel','playDir','playType','qbAlignment','quarter','result','runPass','strength','yardLine','yardage'];
ok(expectedFields.every(field=>state.fields.includes(field)),'Every standard offense/defense/situation field has a native owner',JSON.stringify(state.fields));
ok(state.context.join(',')==='direction,perspective,unit','Unit, perspective, and direction are explicit native context controls',JSON.stringify(state.context));
ok(state.capabilities.length===12,'Templates, diagram, OCR, detection, commit, drive, and customization remain reachable',JSON.stringify(state.capabilities));
state=await page.evaluate(()=>{
  const root=document.querySelector('[data-native-tagging]');
  const values=field=>[...root.querySelectorAll(`[data-native-field="${field}"] button`)].map(button=>button.textContent.trim());
  const rows=[...root.querySelectorAll('[data-situation-row]')].map(row=>({name:row.dataset.situationRow,fields:[...row.querySelectorAll('[data-native-field]')].map(field=>field.dataset.nativeField)}));
  const primary=[...root.querySelectorAll('[data-native-field="result"] .gi-tag-chips button')].map(button=>button.textContent.trim());
  const more=[...root.querySelectorAll('[aria-label="More results"] option')].map(option=>option.value).filter(Boolean);
  const yards=root.querySelector('[data-native-field="yardage"] input');
  const resultRow=root.querySelector('.gi-tag-result-row');
  return{formations:values('formation'),backfields:values('backfield'),rows,primary,more,yardWidth:yards.getBoundingClientRect().width,resultOverflow:resultRow.scrollWidth-resultRow.clientWidth};
});
ok(['I-Form','Split Back'].every(value=>state.formations.includes(value))&&['I','Split'].every(value=>state.backfields.includes(value))&&!state.backfields.includes('I-Form')&&!state.backfields.includes('Split Back'),'Formation and Backfield expose distinct football-correct I/Split vocabularies',JSON.stringify({formations:state.formations,backfields:state.backfields}));
ok(JSON.stringify(state.rows)===JSON.stringify([{name:'primary',fields:['quarter','down','distance']},{name:'field',fields:['hash','fieldSide','yardLine']}]),'Situation uses two ordered rows: Quarter + D/D, then Hash + Field Position',JSON.stringify(state.rows));
ok(state.primary.at(-1)==='Fumble'&&!state.primary.includes('Punt')&&state.more[0]==='Punt','Punt moves behind More while common results remain one row',JSON.stringify({primary:state.primary,more:state.more}));
ok(state.resultOverflow<=1,'Common results and More fit the production-width tag column without horizontal scrolling',JSON.stringify(state.resultOverflow));
ok(state.yardWidth>=80,'Yardage input reserves enough width for three digits and spinner controls',JSON.stringify(state.yardWidth));
if(screenshotPath) await (await page.$('[data-native-tagging]')).screenshot({path:screenshotPath});
state=await page.evaluate(async()=>{const group=[...document.querySelectorAll('.gi-tag-group')].find(node=>node.querySelector('summary strong')?.textContent==='Notes & Details');group.querySelector('summary').click();await new Promise(r=>setTimeout(r,0));const opened=group.open;app.nativeTagging._publish();await new Promise(r=>setTimeout(r,0));return{opened,stayedOpen:group.open}});
ok(state.opened&&state.stayedOpen,'Coach section expansion survives native state updates',JSON.stringify(state));

console.log('\n== 2. Context lifecycle and isolation ==');
state=await page.evaluate(async secondId=>{await app.storage.switchToGame(secondId,{persist:false});await new Promise(r=>setTimeout(r,0));const root=document.querySelector('[data-native-tagging]');return{perspective:root.querySelector('[data-native-context="perspective"]').value,direction:root.querySelector('[data-native-context="direction"]').value,opponent:app.storage.gameInfo.opponent,unit:app.tagger.defaultUnit}},fixture.secondId);
ok(state.perspective==='defense'&&state.direction==='right'&&state.opponent==='Beta'&&state.unit==='defense','Native context follows game switch without inheritance',JSON.stringify(state));
state=await page.evaluate(async firstId=>{await app.storage.switchToGame(firstId,{persist:false});await new Promise(r=>setTimeout(r,0));const before={...app.storage.gameInfo};const p=document.querySelector('[data-native-context="perspective"]');p.value='offense';p.dispatchEvent(new Event('change',{bubbles:true}));const d=document.querySelector('[data-native-context="direction"]');d.value='right';d.dispatchEvent(new Event('change',{bubbles:true}));app.storage.commitActive();await app.storage.seasonStore.persist();return{before,after:{...app.storage.gameInfo}}},fixture.firstId);
ok(state.after.perspective==='offense'&&state.after.direction==='right'&&state.after.opponent===state.before.opponent&&state.after.week===state.before.week&&state.after.gameType===state.before.gameType,'Context edits only perspective and direction',JSON.stringify(state));

console.log('\n== 3. Realistic 20-play multi-select session ==');
state=await page.evaluate(async()=>{
  const root=()=>document.querySelector('[data-native-tagging]');
  const click=(field,label)=>{const group=root().querySelector('[data-native-field="'+field+'"]');const button=[...group.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw new Error('Missing native '+field+':'+label);button.click()};
  const command=label=>{const button=[...root().querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw new Error('Missing command '+label);button.click()};
  for(let i=0;i<20;i++){
    if(app.tagger.currentPlayId!==i+1)throw new Error('Expected play '+(i+1)+', got '+app.tagger.currentPlayId);
    click('formation',i%2?'Power-I':'Trips');click('formation','Unbalanced');click('qbAlignment',i%3?'Shotgun':'Under Center');
    click('playType',i%2?'Run Inside':'Run Outside');click('playType','RPO');click('result','Gain');
    await new Promise(r=>setTimeout(r,0));
    const active=root().querySelectorAll('[data-native-field="formation"] button.is-active').length;
    if(active!==2)throw new Error('Formation collapsed on play '+(i+1)+': '+active);
    if(i<19){command('Save & Next');await new Promise(r=>setTimeout(r,0))}
  }
  const advancedTo=app.tagger.currentPlayId;
  app.tagger.selectPlay(1);click('formation','I-Form');click('backfield','I');
  app.tagger.selectPlay(2);click('formation','Split Back');click('backfield','Split');
  app.tagger.selectPlay(3);const yards=root().querySelector('[data-native-field="yardage"] input');yards.value='100';yards.dispatchEvent(new Event('change',{bubbles:true}));
  app.storage.commitActive();await app.storage.seasonStore.persist();
  return{current:advancedTo,plays:app.tagger.plays.map(p=>({id:p.id,formation:p.tags.formation,qb:p.tags.qbAlignment,backfield:p.tags.backfield,playType:p.tags.playType,result:p.tags.result,yardage:p.tags.yardage}))};
});
ok(state.plays.length===20&&state.plays.every(p=>p.formation.includes('Unbalanced')&&(p.formation.includes('Power-I')||p.formation.includes('Trips'))),'All 20 plays retain both Formation selections',JSON.stringify(state.plays.slice(0,3)));
ok(state.plays.every(p=>p.playType.includes('RPO')&&(p.playType.includes('Run Inside')||p.playType.includes('Run Outside'))&&p.result==='Gain'),'All 20 plays retain multi-select Play Type and Result',JSON.stringify(state.plays.slice(0,3)));
ok(state.current===20,'Save & Next advances chronologically without collapse',JSON.stringify(state.current));
ok(state.plays[0].formation.includes('I-Form')&&state.plays[0].backfield==='I'&&state.plays[1].formation.includes('Split Back')&&state.plays[1].backfield==='Split','I-Form/I and Split Back/Split can be charted together without collapsing dimensions',JSON.stringify(state.plays.slice(0,2)));
ok(String(state.plays[2].yardage)==='100','Three-digit yardage is accepted without truncation',JSON.stringify(state.plays[2]));
await page.evaluate(()=>{window.__s5cReload='must disappear'});
await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>window.app?.nativeTagging);
state=await page.evaluate(async fixture=>{await app.storage.openSeasonById(fixture.seasonId);const game=app.storage.seasonStore.data.games.find(g=>g.id===fixture.firstId);return{fresh:!('__s5cReload'in window),plays:game.plays.map(p=>({formation:p.tags.formation,backfield:p.tags.backfield,playType:p.tags.playType,result:p.tags.result,yardage:p.tags.yardage})),other:app.storage.seasonStore.data.games.find(g=>g.id===fixture.secondId)?.plays?.[0]?.tags}},fixture);
ok(state.fresh&&state.plays.length===20&&state.plays.every(p=>p.formation.includes('Unbalanced')&&p.playType.includes('RPO')&&p.result==='Gain'),'Canonical persist and relaunch preserve the 20-play session',JSON.stringify(state.plays.slice(0,2)));
ok(state.plays[0].formation.includes('I-Form')&&state.plays[0].backfield==='I'&&state.plays[1].formation.includes('Split Back')&&state.plays[1].backfield==='Split'&&String(state.plays[2].yardage)==='100','Canonical reload preserves dual-dimension formations and three-digit yardage',JSON.stringify(state.plays.slice(0,3)));
ok(state.other?.defFront==='4-2-5'&&state.other?.coverage==='Cover 3','Charting session leaves the other game byte-semantically isolated',JSON.stringify(state.other));

console.log('\n== 4. Structured football workflows ==');
state=await page.evaluate(async fixture=>{
  await app.storage.switchToGame(fixture.firstId,{persist:false});app.tagger.selectPlay(1);
  const source=app.nativeTagging.source;window.__nativeRestoreBefore={style:source.getAttribute('style'),aria:source.getAttribute('aria-hidden'),marker:source.getAttribute('data-native-tag-source')};const host=document.createElement('div');host.id='nativeTaggingTestHost';document.body.append(host);app.nativeTagging.mount(host);await new Promise(r=>setTimeout(r,0));
  const root=()=>document.querySelector('[data-native-tagging]');
  const button=label=>{const found=[...root().querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!found)throw new Error('Missing native button '+label+' among '+[...root().querySelectorAll('button')].map(b=>b.textContent.trim()).join('|'));return found};
  app.nativeTagging.setUnit('special');await new Promise(r=>setTimeout(r,30));
  const unitChoice=()=>root().querySelector('[data-native-choice=Unit]');for(let i=0;i<10&&!unitChoice();i++)await new Promise(r=>setTimeout(r,10));if(!unitChoice())throw new Error('No ST unit choice after unit change');const punt=[...unitChoice().querySelectorAll('button')].find(b=>b.textContent.trim()==='Punt');punt.click();await new Promise(r=>setTimeout(r,30));if(!app.tagger.getCurrentPlay().specialTeams)throw new Error('Punt did not create structured model');button('Returned').click();await new Promise(r=>setTimeout(r,30));
  const stInputs=[...root().querySelectorAll('.gi-tag-input')];const returnInput=stInputs.find(l=>l.textContent.includes('Return yards'))?.querySelector('input');returnInput.value='12';returnInput.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));
  button('Add penalty').click();await new Promise(r=>setTimeout(r,0));const card=root().querySelector('.gi-penalty-card');const inputs=[...card.querySelectorAll('input')];inputs.find(i=>i.getAttribute('list')) .value='Holding';inputs.find(i=>i.getAttribute('list')).dispatchEvent(new Event('change',{bubbles:true}));button('Play counts').click();await new Promise(r=>setTimeout(r,0));
  const returner=[...root().querySelectorAll('.gi-tag-players strong')].find(n=>n.textContent.trim()==='returner')?.parentElement;returner.querySelector('input').click();app.nativeTagging.setActiveRole('returner');await new Promise(r=>setTimeout(r,10));button('#22 Jones').click();
  const notes=[...root().querySelectorAll('textarea')][0];notes.value='Punt return right';notes.dispatchEvent(new Event('input',{bubbles:true}));
  const calls={draw:0,clear:0,set:0,read:0};
  app.playDiagram.openEditor=()=>calls.draw++;app.playDiagram.clearCurrent=()=>calls.clear++;app.ocr.startRegionSelect=()=>calls.set++;app.ocr.readNow=()=>calls.read++;
  document.getElementById('btnAutoDetect').addEventListener('click',()=>calls.detect++,{once:true});
  button('Draw').click();button('Clear').click();button('Set OCR Region').click();button('Read Scoreboard').click();
  const play=app.tagger.getCurrentPlay();const puntModel=structuredClone(play.specialTeams);app.nativeTagging.penaltyInput(0,'phase','special');app.nativeTagging.penaltyInput(0,'notes','Accepted from end of return');app.nativeTagging.penaltySituation('down','2');app.nativeTagging.penaltySituation('distance','7');app.nativeTagging.penaltySituation('fieldSide','opp');app.nativeTagging.penaltySituation('yardLine','38');app.nativeTagging.penaltySituation('confirmed','',true);const playOne={penalties:structuredClone(play.penalties),situation:structuredClone(play.resultingSituation),player:play.tags.players.returner,notes:play.notes};app.tagger.selectPlay(2);app.nativeTagging.setUnit('special');await app.nativeTagging.setSpecialUnit('try');app.nativeTagging.specialAction('tryAttempt','twoPoint');app.nativeTagging.specialAction('tryResult','failed');app.nativeTagging.specialAction('tryTurnover','interception');app.nativeTagging.specialAction('tryEvent','defensiveReturn');app.nativeTagging.specialAction('returnAward','opponent');return{punt:puntModel,tryPlay:structuredClone(app.tagger.getCurrentPlay().specialTeams),...playOne,calls};
},fixture);
ok(state.punt?.unit==='punt'&&state.punt?.outcome?.status==='returned'&&state.punt?.return?.yards===12,'Native Special Teams writes the structured punt model',JSON.stringify(state.punt));
ok(state.penalties?.length===1&&state.penalties[0].foul==='Holding'&&state.penalties[0].playCounts===true&&state.penalties[0].phase==='special'&&state.situation?.confirmed&&state.situation?.down==='2','Native penalty form writes enforcement and the confirmed resulting snap',JSON.stringify({penalties:state.penalties,situation:state.situation}));
ok(state.tryPlay?.unit==='try'&&state.tryPlay?.attemptType==='twoPoint'&&state.tryPlay?.events?.turnover==='interception'&&state.tryPlay?.events?.defensiveReturn&&state.tryPlay?.outcome?.returnAward==='opponent','Native try editor preserves compound events and official return ruling',JSON.stringify(state.tryPlay));
ok(state.player==='22'&&state.notes==='Punt return right','Roster quick-pick and notes write the selected play',JSON.stringify({player:state.player,notes:state.notes}));
ok(Object.values(state.calls).every(v=>v===1),'Diagram and OCR commands reach canonical owners exactly once',JSON.stringify(state.calls));

console.log('\n== 5. Responsive geometry and exact restore ==');
state=await page.evaluate(()=>{const root=document.querySelector('[data-native-tagging]');return{overflow:document.documentElement.scrollWidth-innerWidth,width:root.getBoundingClientRect().width,data:JSON.stringify(app.storage.seasonStore.data)}});
ok(state.overflow<=1&&state.width>0,'Desktop native form has no page-level horizontal overflow',JSON.stringify(state));
await page.setViewport({width:390,height:844});
state=await page.evaluate(()=>{const root=document.querySelector('[data-native-tagging]');const targets=[...root.querySelectorAll('button,select,input:not([type="checkbox"]),textarea,.gi-tag-check')].filter(n=>n.getClientRects().length);return{overflow:document.documentElement.scrollWidth-innerWidth,min:Math.min(...targets.map(n=>n.getBoundingClientRect().height)),small:targets.filter(n=>n.getBoundingClientRect().height<44).map(n=>({tag:n.tagName,text:n.textContent.trim().slice(0,30),h:n.getBoundingClientRect().height,cls:n.className})).slice(0,12),count:targets.length}});
ok(state.overflow<=1&&state.min>=44,'Mobile native form has no page overflow and keeps 44px action targets',JSON.stringify(state));
state=await page.evaluate(before=>{const source=app.nativeTagging.source,host=document.getElementById('nativeTaggingTestHost');const restored=app.nativeTagging.restore();return{restored,empty:!host.childElementCount,actual:{style:source.getAttribute('style'),aria:source.getAttribute('aria-hidden'),marker:source.getAttribute('data-native-tag-source')},before,exact:(source.getAttribute('style')||null)===(before.style||null)&&source.getAttribute('aria-hidden')===before.aria&&source.getAttribute('data-native-tag-source')===before.marker}},await page.evaluate(()=>window.__nativeRestoreBefore));
ok(state.restored&&state.empty&&state.exact,'Unmount restores compatibility source attributes exactly',JSON.stringify(state));
ok(!errors.length,'No page errors',errors.join(' | '));
console.log('\n== RESULT: '+pass+' passed, '+fail+' failed ==');
await browser.close();
process.exit(fail?1:0);
