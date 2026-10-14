import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? pass++ : fail++; };
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await gotoApp(page, APP_URL);
  const results = await page.evaluate(async mutate => {
    const app = window.app, tagger = app.tagger, grid = app.playGrid, quick = app.quickChart;
    await app.storage.createSeason({ name: 'Receiver write guard test', team: 'Test', year: '2026' });
    if (mutate) tagger.requestReceiverChange = (play, apply, write) => write();
    const fixture = id => ({ id, timestamp: { start: 0, end: 4 }, notes: 'keep',
      tags: { ...tagger.constructor.blankTags({ unit: 'offense' }), runPass: 'Pass', playType: 'Short Pass', players: { receiver: '22' } },
      receiverDetail: { receiverNumber: '22', route: 'Slant', releaseDirection: 'Inside' } });
    const out = {};
    for (const path of ['grid-run', 'grid-type', 'quick-type', 'quick-receiver', 'previous', 'template']) {
      for (const accept of [false, true]) {
        tagger.discardDraft();
        const play = fixture(2), previous = fixture(1);
        previous.tags.runPass = 'Run'; previous.tags.playType = 'Run Inside'; delete previous.receiverDetail;
        tagger.plays = [previous, play]; tagger.currentPlayId = null; tagger.selectPlay(2);
        let prompts = 0, advances = 0;
        tagger._confirmDialog = async () => { prompts++; return accept; };
        quick.playlist = { activeClipIndex: 0, clips: [{}, {}], nextClip: () => advances++ };
        quick.currentEntry = { ...quick._emptyEntry(), yardage: '9', ...(path === 'quick-type' ? { playType: 'Run Inside' } : {}) };
        quick.inputReceiver = { value: path === 'quick-receiver' ? '7' : '' };
        quick.inputBallCarrier = quick.inputPasser = quick.inputTackler = null;
        const before = JSON.stringify(play), draftBefore = JSON.stringify(tagger.getCurrentPlay());
        localStorage.setItem('ffa_play_templates', JSON.stringify({ Run: { runPass: 'Run', playType: 'Run Inside' } }));
        if (path === 'grid-run') await grid.nativeCommitEdit(2, 'runPass', 'Run');
        if (path === 'grid-type') await grid.nativeCommitEdit(2, 'playType', 'Run Inside');
        if (path.startsWith('quick-')) await quick._confirmAndAdvance();
        if (path === 'previous') await app.nativeTagging.copyPrevious();
        if (path === 'template') await app.nativeTagging.applyTemplate('Run');
        const current = tagger.getCurrentPlay();
        out[`${path} ${accept ? 'accept' : 'cancel'} prompts once`] = prompts === 1;
        out[`${path} ${accept ? 'clears detail' : 'preserves all values'}`] = accept
          ? !(path.startsWith('grid-') ? play : current).receiverDetail
          : JSON.stringify(play) === before && JSON.stringify(current) === draftBefore;
        if (path.startsWith('quick-')) out[`${path} ${accept ? 'advances once' : 'does not advance or clear input'}`] = accept
          ? advances === 1 : advances === 0 && quick.currentEntry.yardage === '9' && quick.inputReceiver.value === (path === 'quick-receiver' ? '7' : '');
        if (accept && ['previous', 'template'].includes(path)) {
          tagger.undoDraft(); out[`${path} one undo restores both`] = JSON.stringify(tagger.getCurrentPlay()) === draftBefore;
        }
      }
    }
    tagger.discardDraft();
    const play = fixture(3);
    tagger.plays = [play]; tagger.currentPlayId = null; tagger.selectPlay(3);
    let prompts = 0;
    tagger._confirmDialog = async () => { prompts++; return true; };
    await grid.nativeCommitEdit(3, 'playType', 'Medium Pass');
    out['retained target does not prompt'] = prompts === 0 && play.receiverDetail?.route === 'Slant';
    let answer;
    tagger._confirmDialog = () => new Promise(resolve => { answer = resolve; });
    const pending = grid.nativeCommitEdit(3, 'runPass', 'Run');
    if (answer) {
      play.notes = 'newer edit'; answer(true); await pending;
      out['changed play while confirmation pending is not overwritten'] = play.tags.runPass === 'Pass' && !!play.receiverDetail && play.notes === 'newer edit';
    } else out['changed play while confirmation pending is not overwritten'] = false;
    for (const mismatch of ['receiver', 'runPass']) {
      tagger.discardDraft();
      const hidden = fixture(4);
      if (mismatch === 'receiver') hidden.tags.players.receiver = '7';
      else hidden.tags.runPass = 'Run';
      tagger.plays = [hidden]; tagger.currentPlayId = null; tagger.selectPlay(4);
      let asks = 0;
      tagger._confirmDialog = async () => { asks++; return false; };
      await tagger.setTagValue('runPass', 'Run');
      await tagger.setPlayerValue('receiver', '9');
      out[`${mismatch} already hidden detail does not ask`] = asks === 0;
      tagger.saveDraft();
      out[`${mismatch} hidden detail drops on real Save`] = !hidden.receiverDetail && hidden.tags.players.receiver === '9';
    }
    return out;
  }, process.argv.includes('--mutate-guard'));
  for (const [name, ok] of Object.entries(results)) check(name, ok);
} finally { await browser.close(); }
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exitCode = 1;
