import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass=0,fail=0;
const ok=(value,label,detail='')=>value?(pass++,console.log('  PASS  '+label)):(fail++,console.log('  FAIL  '+label+(detail?' -- '+detail:'')));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
await page.goto(APP_URL,{waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.app?.storage);

console.log('\n== Restore-point throttling and season pinning ==');
const state=await page.evaluate(async()=>{
  await app.storage.createSeason({name:'Restore Proof',team:'Mavericks',year:'2026'});
  const storage=app.storage,store=storage.seasonStore;
  const originalSnapshot=store.snapshot;
  const pausedDescriptor=Object.getOwnPropertyDescriptor(storage.vc,'paused');
  const originalLast=storage._lastSnapAt,originalDeferred=storage._deferredSnapshot;
  const originalTimer=storage._snapshotIdleTimer;
  let paused=false,snapshots=[];
  Object.defineProperty(storage.vc,'paused',{configurable:true,get:()=>paused});
  store.snapshot=async label=>{snapshots.push({label,seasonId:store.currentSeasonId});return{}};
  clearTimeout(storage._snapshotIdleTimer);storage._snapshotIdleTimer=null;storage._lastSnapAt=0;storage._deferredSnapshot=null;

  storage._maybeSnapshot(false,'Playback-safe auto');
  const duringPlayback={count:snapshots.length,pending:{...storage._deferredSnapshot}};
  paused=true;
  const flushed=storage._flushDeferredSnapshot();
  const afterPause={count:snapshots.length,last:snapshots.at(-1),pending:storage._deferredSnapshot};

  paused=false;storage._lastSnapAt=0;
  storage._maybeSnapshot(false,'Superseded auto');
  storage._maybeSnapshot(true,'Manual safety point');
  const afterForced={count:snapshots.length,last:snapshots.at(-1),pending:storage._deferredSnapshot};

  storage._lastSnapAt=0;
  storage._maybeSnapshot(false,'Old-season auto');
  storage._deferredSnapshot.seasonId='not-the-active-season';
  paused=true;
  const crossSeasonFlushed=storage._flushDeferredSnapshot();
  const afterCrossSeason={count:snapshots.length,pending:storage._deferredSnapshot};

  store.snapshot=originalSnapshot;
  if(pausedDescriptor)Object.defineProperty(storage.vc,'paused',pausedDescriptor);else delete storage.vc.paused;
  clearTimeout(storage._snapshotIdleTimer);storage._snapshotIdleTimer=originalTimer;storage._lastSnapAt=originalLast;storage._deferredSnapshot=originalDeferred;
  return{seasonId:store.currentSeasonId,duringPlayback,flushed,afterPause,afterForced,crossSeasonFlushed,afterCrossSeason};
});
ok(state.duringPlayback.count===0&&state.duringPlayback.pending?.label==='Playback-safe auto'&&state.duringPlayback.pending?.seasonId===state.seasonId,'Automatic restore point defers during playback and pins the active season',JSON.stringify(state));
ok(state.flushed&&state.afterPause.count===1&&state.afterPause.last?.label==='Playback-safe auto'&&!state.afterPause.pending,'Paused playback flushes the deferred restore point exactly once',JSON.stringify(state.afterPause));
ok(state.afterForced.count===2&&state.afterForced.last?.label==='Manual safety point'&&!state.afterForced.pending,'Forced restore point supersedes a deferred automatic point',JSON.stringify(state.afterForced));
ok(!state.crossSeasonFlushed&&state.afterCrossSeason.count===2&&!state.afterCrossSeason.pending,'Deferred restore point never crosses season ownership',JSON.stringify(state.afterCrossSeason));
ok(errors.length===0,'Restore-point journey has zero page errors',errors.join(' | '));
console.log('\n== RESULT: '+pass+' passed, '+fail+' failed ==');
await browser.close();
process.exit(fail?1:0);
