import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (value, label, extra = '') => value ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const browser = await puppeteer.launch({ args:['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.evaluateOnNewDocument(() => { localStorage.setItem('ffa_workspace_shell_v2','1'); localStorage.setItem('ffa_breakdown_form_v2','1'); });
await page.setViewport({ width:1440, height:900 });
await page.goto(URL, { waitUntil:'networkidle0' });
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name:'2026 Varsity', team:'Mavericks', year:'2026' });
  const game=window.app.storage.seasonStore.activeGame();
  game.plays=[{id:1,timestamp:{start:0,end:5},notes:'',tags:{unit:'offense',down:'1',distance:'10',formation:'Shotgun',backfield:'Single',playType:'Run Inside',result:'Gain',yardage:'5',players:{},grades:{},custom:[]}}];
  await window.app.storage._loadActiveGame(); await window.app.workspaceShell.show('breakdown');
});

let state = await page.evaluate(() => {
  const ratio=(fg,bg)=>{const lum=c=>{const a=c.map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};const L1=lum(fg),L2=lum(bg);return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)};
  const rgb=value=>(value.match(/\d+/g)||[]).slice(0,3).map(Number);
  const ui=getComputedStyle(document.querySelector('.bd-context-bar'));
  const chipEl=document.querySelector('#tagFormation .pick'); chipEl.classList.add('active');
  const chip=getComputedStyle(chipEl);
  const buttons=[...document.querySelectorAll('.bd-context-bar button')];
  return {
    font:ui.fontFamily, chipFont:getComputedStyle(document.querySelector('#tagFormation .pick')).fontFamily,
    contrast:ratio(rgb(chip.color),rgb(chip.backgroundColor)),
    names:buttons.every(button => (button.getAttribute('aria-label')||button.textContent).trim().length>0),
    summaries:[...document.querySelectorAll('.bdv-group > summary')].every(summary=>summary.textContent.trim() && summary.tabIndex===0),
  };
});
ok(/Segoe UI/.test(state.font) && /Segoe UI/.test(state.chipFont), 'Workspace and charting chips use the approved readable UI font', JSON.stringify(state));
ok(state.contrast >= 4.5, 'Selected chip text meets WCAG AA contrast', String(state.contrast));
ok(state.names && state.summaries, 'Header commands and collapsible groups expose keyboard-accessible names');

await page.focus('[data-bd-context="scout"]');
await page.keyboard.press('Enter');
state = await page.evaluate(() => ({ scout:document.getElementById('tagForm').classList.contains('is-scout'), outline:getComputedStyle(document.activeElement).outlineStyle }));
ok(state.scout && state.outline !== 'none', 'Keyboard activation works and retains a visible focus ring', JSON.stringify(state));

state = await page.evaluate(() => {
  window.app.history._toast('Saved next play', { action:{label:'Undo',fn:()=>{}} });
  const toast=document.getElementById('undoToast'), style=getComputedStyle(toast);
  return { text:toast.childNodes[0]?.textContent, action:toast.querySelector('button')?.textContent, background:style.backgroundColor, page:getComputedStyle(document.body).backgroundColor };
});
ok(state.text==='SAVED NEXT PLAY' && state.action==='UNDO' && state.background!==state.page, 'Toast content is semantic all-caps with a distinct restrained blue surface', JSON.stringify(state));

for (const [label,width,height] of [['125%',1152,720],['150%',960,600]]) {
  await page.setViewport({ width,height });
  await new Promise(resolve=>setTimeout(resolve,60));
  state=await page.evaluate(() => {
    const bar=document.querySelector('.bd-context-bar'), br=bar.getBoundingClientRect();
    const controls=[...bar.querySelectorAll('button')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,clipped:el.scrollWidth>el.clientWidth};});
    return { pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, barOverflow:bar.scrollWidth>bar.clientWidth,
      controlsInside:controls.every(r=>r.left>=br.left-1&&r.right<=br.right+1&&r.top>=br.top-1&&r.bottom<=br.bottom+1&&!r.clipped), controls };
  });
  ok(!state.pageOverflow && !state.barOverflow && state.controlsInside, `${label} effective Windows scaling keeps header controls visible and unclipped`, JSON.stringify(state));
}

ok(errors.length===0,'No page errors',errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail?1:0);
