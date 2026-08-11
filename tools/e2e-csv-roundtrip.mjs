import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* REGRESSION: exportCsv must quote-escape EVERY cell (not just notes), guard
   against CSV formula injection without mangling real numbers, and its own
   importPlaysFromText parser must round-trip doubled "" back to a literal quote.
   Pre-fix, only the notes cell escaped, so a formation/custom value containing a
   " produced a malformed row (broke Excel/Hudl import).

   Run after build:  node tools/e2e-csv-roundtrip.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = TEST_APP_URL;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const res = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore;
  store.data = store._normalize({
    version: 5, type: 'season', id: 'csv', seasonName: 'CSV', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: { opponent: 'X' }, status: 'active', plays: [], annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false }],
  });
  store.currentSeasonId = 'csv';
  sm._loadActiveGame();
  // Plays with adversarial cell values.
  sm.tagger.plays = [
    { id: 1, timestamp: { start: 0, end: 5 }, notes: 'said "hi", ok', annotations: [], penalties: [
      { id: 'p1', team: 'subject', foul: 'Holding', disposition: 'accepted', yards: 8, playCounts: false, phase: 'offense' },
      { id: 'p2', team: 'opponent', foul: 'Facemask', disposition: 'declined', yards: null, playCounts: true, phase: 'defense' },
    ], resultingSituation: { down: '1', distance: '10', fieldSide: 'opp', yardLine: '35', confirmed: true }, tags: { formation: 'A"B', playCall: '26 Blast', playCallId: 'call_26_blast', playConcept: 'Blast', playType: 'Run Inside', runPass: 'Run', result: 'Gain + Fumble', fumbleRecovery: 'opponent', yardage: '-5', down: '1', distance: '10', custom: [], players: {}, grades: {} } },
    { id: 2, timestamp: { start: 0, end: 5 }, notes: '', annotations: [], tags: { formation: '=EVIL', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '7', down: '2', distance: '4', custom: [], players: {}, grades: {} } },
    { id: 3, timestamp: { start: 0, end: 0 }, notes: '', annotations: [], penalties: [
      { id: 'p3', team: 'subject', foul: 'False Start', disposition: 'accepted', yards: 5, playCounts: false, phase: 'offense' },
    ], tags: { formation: '', playType: '', runPass: '', result: '', yardage: '', down: '', distance: '', custom: [], players: {}, grades: {} } },
  ];
  let blob = null;
  sm._download = (b) => { blob = b; };
  sm.exportCsv();
  const csv = await blob.text();
  const parsed = sm.importPlaysFromText(csv);
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(parsed);
  const structured = sm.tagger.plays[0];
  const penaltyOnly = sm.tagger.plays.find(play => play.penalties?.[0]?.foul === 'False Start');
  const roundtrippedQuote = (parsed.lines || []).some(row => row.some(c => c === 'A"B'));
  const roundtrippedNotes = (parsed.lines || []).some(row => row.some(c => c === 'said "hi", ok'));
  return { csv, roundtrippedQuote, roundtrippedNotes, penalties: structured?.penalties,
    situation: structured?.resultingSituation, penaltyOnly,
    callFields: structured ? [structured.tags.playCall, structured.tags.playCallId, structured.tags.playConcept] : null,
    fumbleRecovery: structured?.tags?.fumbleRecovery || '',
    blankCallFields: penaltyOnly ? [penaltyOnly.tags.playCall, penaltyOnly.tags.playCallId, penaltyOnly.tags.playConcept] : null };
});

ok(res.csv.includes('"A""B"'), 'embedded quote in formation is escaped ("→"") on export', JSON.stringify(res.csv.split('\n')[1]?.slice(0, 60)));
ok(res.csv.includes('"said ""hi"", ok"'), 'notes with quote AND comma exported as one escaped cell');
ok(res.csv.includes(`"'=EVIL"`), 'formula-injection cell (=EVIL) is neutralized with a leading apostrophe');
ok(res.csv.includes('"-5"') && !res.csv.includes(`"'-5"`), 'signed number -5 stays numeric (NOT formula-guarded)');
ok(res.roundtrippedQuote, 'export→import round-trips a doubled "" back to a literal quote (A"B)');
ok(res.roundtrippedNotes, 'export→import round-trips notes containing a quote and a comma');
ok(res.fumbleRecovery === 'opponent', 'export→import preserves coach-confirmed fumble recovery ownership', JSON.stringify(res.fumbleRecovery));
ok(res.penalties?.length === 2 && res.penalties[0].yards === 8 && res.penalties[1].disposition === 'declined', 'export→import preserves multiple structured penalties');
ok(res.situation?.confirmed === true && res.situation?.fieldSide === 'opp' && res.situation?.yardLine === '35', 'export→import preserves the coach-confirmed resulting situation');
ok(res.penaltyOnly?.penalties?.[0]?.yards === 5, 'CSV import retains a structured penalty-only row without legacy charting fields');
ok(JSON.stringify(res.callFields) === JSON.stringify(['26 Blast', 'call_26_blast', 'Blast']),
  'CSV export/import round-trips exact call identity and concept', JSON.stringify(res.callFields));
ok(JSON.stringify(res.blankCallFields) === JSON.stringify(['', '', '']),
  'CSV-imported plays without call data retain backward-compatible blank fields');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
