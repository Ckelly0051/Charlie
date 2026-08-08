import puppeteer from 'puppeteer';
import fs from 'node:fs';
const season = JSON.parse(fs.readFileSync('C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json','utf8'));
let browser;
for (let i=0;i<30;i++) {
  try { browser = await puppeteer.connect({ browserURL:'http://127.0.0.1:9333', defaultViewport:null }); break; }
  catch { await new Promise(r=>setTimeout(r,250)); }
}
if (!browser) throw new Error('Could not attach to isolated GridIron IQ WebView');
const pages = await browser.pages();
const page = pages.find(p=>/tauri|localhost/.test(p.url())) || pages[0];
const errors=[];
page.on('pageerror',e=>errors.push('PAGEERROR '+(e.stack||e.message)));
page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text());});
await page.waitForFunction(()=>window.app?.workspaceShell?.root,{timeout:15000});
const result = await page.evaluate(async season => {
  const app=window.app, store=app.storage.seasonStore;
  store.data=store._normalize(structuredClone(season));
  store.currentSeasonId=store.data.id;
  store.data.activeGameId=store.data.activeGameId || store.data.games[0]?.id;
  app.storage._loadActiveGame();
  const before={route:app.workspace.currentRoute(),mounted:!!app.reportsScreen.content,tab:app.reportsScreen.activeTab};
  let returned=null,error=null;
  try { returned=await app.workspaceShell.show('reports'); }
  catch(e){ error={message:e.message,stack:e.stack}; }
  const host=document.getElementById('wsReports'), content=host?.querySelector('[data-native-report-content]');
  return {before,returned,error,after:{route:app.workspace.currentRoute(),hostHidden:host?.hidden,native:!!host?.querySelector('[data-native-reports]'),contentLength:content?.innerHTML.length||0,text:(content?.textContent||'').replace(/\s+/g,' ').slice(0,300),tab:app.reportsScreen.activeTab,perspective:app.reportsScreen.perspective,gameId:store.data.activeGameId,plays:app.tagger.plays.length}};
},season);
console.log(JSON.stringify({url:page.url(),result,errors},null,2));
await browser.disconnect();