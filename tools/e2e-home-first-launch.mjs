import puppeteer from 'puppeteer';
import {APP_URL} from './app-entry.mjs';
let pass=0,fail=0;
const ok=(value,label,detail='')=>value?(pass++,console.log(`  PASS  ${label}`)):(fail++,console.log(`  FAIL  ${label}${detail?' -- '+detail:''}`));
async function scenario(run){
  const browser=await puppeteer.launch({args:['--no-sandbox']});
  try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});await page.goto(APP_URL,{waitUntil:'networkidle0'});await page.waitForSelector('[data-first-launch]');const result=await run(page);return{...result,errors};}finally{await browser.close();}
}
console.log('== Approved first-launch Home ==');
let r=await scenario(async page=>{
  const initial=await page.evaluate(()=>{
    const first=document.querySelector('[data-first-launch]'),rail=document.querySelector('.rail-year'),fields=[...first.querySelectorAll('label')].map(label=>({label:label.querySelector('span')?.getBoundingClientRect().toJSON(),control:label.querySelector('input,select')?.getBoundingClientRect().toJSON()}));
    return{route:document.querySelector('#workspaceShell')?.dataset.route,hubHidden:document.querySelector('#wsTeamHub')?.hidden,first:!!first,rail:!!rail,title:first.querySelector('h1')?.textContent,choices:[...first.querySelectorAll('.gi-hub-workspace-choice strong')].map(node=>node.textContent),library:document.querySelector('.rail-foot')?.textContent,overflow:document.documentElement.scrollWidth-innerWidth,overlap:fields.some(x=>x.label&&x.control&&x.label.bottom>x.control.top)};
  });
  await page.evaluate(()=>app.workspaceShell._openLibrary());
  await page.waitForFunction(()=>document.activeElement?.name==='school');
  const guardedLibrary=await page.evaluate(()=>({route:app.workspace.currentRoute(),hubHidden:document.querySelector('#wsTeamHub')?.hidden,first:!!document.querySelector('[data-first-launch]')}));
  const responsive=[];
  for(const width of [1440,1280,768,390]){await page.setViewport({width,height:width>768?900:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));responsive.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,first:document.querySelector('[data-first-launch]').getBoundingClientRect().toJSON()})));await page.screenshot({path:`artifacts/home-first-launch-${width}.png`});}
  await page.setViewport({width:1440,height:900});
  await page.type('[data-first-launch] input[name="school"]','St. Joseph');await page.type('[data-first-launch] input[name="nickname"]','Mavericks');
  const preview=await page.$eval('.first-name-preview strong',node=>node.textContent);
  await page.click('[data-first-launch] [role="radio"][aria-checked="false"]');await page.click('[data-first-launch] .ws-primary');
  await page.waitForFunction(()=>!document.querySelector('[data-first-launch]')&&window.app.storage.seasonStore.hasCurrent());
  const saved=await page.evaluate(()=>({team:app.teamRegistry.teams()[0],year:app.storage.seasonStore.data.year,level:app.storage.seasonStore.data.level,seasonName:app.storage.seasonStore.data.seasonName,heading:document.querySelector('#wsGreeting')?.textContent,rail:document.querySelector('.rail-scope')?.textContent,guide:!!document.querySelector('.gi-season-guide'),route:app.workspace.currentRoute()}));
  return{initial,guardedLibrary,responsive,preview,saved};
});
ok(r.initial.route==='home'&&r.initial.hubHidden&&r.initial.first&&r.initial.rail,'First launch is the real Home route with its persistent rail, never the old Team Hub panel',JSON.stringify(r));
ok(r.initial.title==='Football workspace'&&r.initial.choices.join('|')==='Program|Opponent Scout'&&/Your coaching workspace/.test(r.initial.library),'First launch renders the approved Home copy rather than the rejected onboarding copy',JSON.stringify(r.initial));
ok(r.guardedLibrary.route==='home'&&r.guardedLibrary.hubHidden&&r.guardedLibrary.first,'Season Library cannot strand a no-program coach in Team Hub',JSON.stringify(r.guardedLibrary));
ok(r.initial.overflow<=1&&!r.initial.overlap,'First-launch fields have no page overflow or label/control overlap',JSON.stringify(r.initial));
ok(r.responsive.every(item=>item.overflow<=1&&item.first.left>=0&&item.first.right<=item.width+1),'Approved first-launch composition remains contained at all release widths',JSON.stringify(r.responsive));
ok(r.saved.team.school==='St. Joseph'&&r.saved.team.nickname==='Mavericks'&&r.saved.year==='2026'&&r.saved.level==='JV','Manual setup writes structured program and season identity through canonical owners',JSON.stringify(r.saved));
ok(r.preview==='2026 · St. Joseph Mavericks · JV'&&r.saved.seasonName===r.preview&&r.saved.heading===r.preview&&r.saved.rail===r.preview,'Preview, stored season, Home heading, and rail share the full year + program + level identity',JSON.stringify({preview:r.preview,saved:r.saved}));
ok(!r.saved.guide&&r.saved.route==='home','Set up manually goes straight to populated Home',JSON.stringify(r.saved));
ok(r.errors.length===0,'Manual first launch has zero page errors',r.errors.join('\n'));

r=await scenario(async page=>{
  await page.type('[data-first-launch] input[name="school"]','Guided School');await page.click('[data-first-launch] .ws-primary');
  await page.waitForFunction(()=>!!document.querySelector('.gi-season-guide'));
  const state=await page.evaluate(()=>({title:document.querySelector('.gi-season-guide h2')?.textContent,skip:[...document.querySelectorAll('.gi-season-guide button')].some(b=>/Skip guide/.test(b.textContent)),season:app.storage.seasonStore.data.seasonName}));
  return state;
});
ok(r.title===r.season&&r.skip,'Guided setup is the default, opens after creation, and remains wholly skippable',JSON.stringify(r));
ok(r.errors.length===0,'Guided first launch has zero page errors',r.errors.join('\n'));

r=await scenario(async page=>{
  await page.evaluate(()=>[...document.querySelectorAll('[data-first-launch] .gi-hub-workspace-choice button')].find(b=>/Opponent Scout/.test(b.textContent))?.click());
  await page.waitForSelector('[data-first-launch] input[name="opponentSchool"]');
  for(const [name,value] of [['school','Our School'],['opponentSchool','Central'],['sourceASchool','Central'],['sourceBSchool','Riverside']])await page.type(`[data-first-launch] input[name="${name}"]`,value);
  await page.click('[data-first-launch] .ws-primary');await page.waitForFunction(()=>window.app.storage.seasonStore.data?.kind==='scout');
  return await page.evaluate(()=>({kind:app.storage.seasonStore.data.kind,opponent:app.storage.seasonStore.data.scout.opponentSchool,game:app.storage.seasonStore.activeGame().name,info:app.storage.seasonStore.activeGame().gameInfo,route:app.workspace.currentRoute()}));
});
ok(r.kind==='scout'&&r.opponent==='Central'&&r.info.sourceTeamA==='Central'&&r.info.sourceTeamB==='Riverside'&&r.info.projectName==='Central vs Riverside'&&r.route==='home','Opponent-first setup creates an isolated scout with both canonical source-game identities',JSON.stringify(r));
ok(r.errors.length===0,'Opponent first launch has zero page errors',r.errors.join('\n'));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);process.exit(fail?1:0);
