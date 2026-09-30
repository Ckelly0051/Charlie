import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* CSV EXPORT/IMPORT of the look fields (GRIDIRON-IQ-TAG-MODEL.md §20, coach
   contract). Every look field is its own column: Formation, Receiver Distribution,
   QB Alignment, Backfield, Strength, Coverage Call, Coverage Family, and the run
   and motion details (Motion Starts/Ends, Gap, RPO Read/Defender/Decision, QB Run
   Type). Export writes the stored field; import stores each column in its own
   field; a blank optional stays blank (never "Unknown" — that reads as a real
   analytics category). Plays are current format; a combined look, a bare
   Formation column and an inconsistent detail are refused on import, which
   e2e-csv-roundtrip and e2e-charting-cutover-csv pin.

   Run after build:  node tools/e2e-csv-projection.mjs */
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
  // The StatsEngine class, reached through the live public service that owns it.
  const SE = window.app.stats.constructor;
  const blank = () => ({ custom: [], players: {}, grades: {} });
  store.data = store._normalize({
    version: 5, type: 'season', id: 'csvproj', seasonName: 'CSVProj', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: { opponent: 'X' }, status: 'active', plays: [], annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false }],
  });
  store.currentSeasonId = 'csvproj';
  sm._loadActiveGame();

  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, notes: '', annotations: [], tags: { ...blank(), ...tags } });
  sm.tagger.plays = [
    // 1. Formation and QB alignment, each in its own field.
    mk(1, { unit: 'offense', formationFamily: 'Spread', receiverSet: '3x1', qbAlignment: 'Shotgun', backfield: '', strength: 'Right',
            playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '7', down: '1', distance: '10' }),
    // 2. A coverage family with no coverage call.
    mk(2, { unit: 'defense', coverage: '', coverageFamily: 'Man', defFront: '4-3',
            playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '4', down: '2', distance: '6' }),
    // 3. A real coverage CALL that merely CONTAINS a family word — must survive whole.
    mk(3, { unit: 'defense', coverage: 'Cover 3 Match', defFront: '3-3-5',
            playType: 'Deep Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', down: '3', distance: '8' }),
    // 4. An Empty backfield with a Pistol alignment.
    mk(4, { unit: 'offense', formationFamily: 'Spread', receiverSet: '2x2', qbAlignment: 'Pistol', backfield: 'Empty', strength: 'Left',
            playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3', down: '1', distance: '10' }),
    // 5. Modern SPLIT play: explicit fields already correct, nothing to move.
    mk(5, { unit: 'offense', formationFamily: 'I-Form', qbAlignment: 'Under Center', backfield: 'I', strength: 'Balanced',
            coverage: 'Cover 2', coverageFamily: 'Zone',
            playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '9', down: '2', distance: '9' }),
    // 6. Sparse play: every optional look field blank — must stay blank.
    mk(6, { unit: 'offense', playType: 'Screen', runPass: 'Pass', result: 'No Gain', yardage: '0', down: '3', distance: '3' }),
    // 7-8. MINIMALLY charted: the coach charted ONLY a look. No playType, result,
    //      yardage, down, or penalty. Charting only the fields you want is an
    //      explicit product rule — these rows must survive a round trip, not vanish.
    mk(7, { unit: 'offense', formationFamily: 'Spread', receiverSet: '3x1', qbAlignment: 'Shotgun' }),
    mk(8, { unit: 'defense', coverageFamily: 'Match', defFront: '3-3-5' }),
    // 9. Special Teams: unit must survive. StatsEngine reads a unit-less play as
    //    OFFENSE, so a dropped unit silently corrupts every unit-partitioned metric.
    mk(9, { unit: 'special', result: 'Punt' }),
    // 10-12. The run and motion details, each with the field that opens it.
    mk(10, { unit: 'offense', playType: 'Run Outside', runPass: 'Run', playDir: 'Right', gap: 'R-B', motion: 'Jet', motionStart: 'Left', motionEnd: 'Right', result: 'Gain', yardage: '6' }),
    mk(11, { unit: 'offense', playType: 'RPO + Short Pass', runPass: 'Pass', rpoRead: 'Apex', rpoDefender: '24', rpoDecision: 'Throw', result: 'Gain', yardage: '11' }),
    mk(12, { unit: 'offense', playType: 'QB Run', runPass: 'Run', qbRun: 'Designed', playDir: 'Middle', gap: 'Center', result: 'Gain', yardage: '4' }),
  ];
  const exportedUnits = sm.tagger.plays.map(p => p.tags.unit);
  const LOOK = ['formationFamily', 'receiverSet', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily'];
  const DETAIL = ['motionStart', 'motionEnd', 'gap', 'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun'];
  const detailOf = p => DETAIL.map(k => p.tags[k] || '');
  const exportedDetails = sm.tagger.plays.map(detailOf);
  const lookOf = p => LOOK.map(k => p.tags[k] || '');
  const exportedLooks = sm.tagger.plays.map(lookOf);

  // Capture the export synchronously. Blob.text() inside page.evaluate is subject
  // to a Chromium "Promise was collected" intermittent that tests the browser's
  // Blob reader rather than GridIron IQ's CSV contract.
  const NativeBlob = window.Blob;
  let blob = null;
  window.Blob = class TestBlob {
    constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; }
  };
  try {
    sm._download = (b) => { blob = b; };
    sm.exportCsv();
  } finally {
    window.Blob = NativeBlob;
  }
  const csv = blob.parts.map(part => String(part)).join('');

  // Parse the CSV back through the app's own parser so the assertions read cells,
  // not substrings (a substring match would pass on a value in the WRONG column).
  const parsed = sm.importPlaysFromText(csv);
  const headers = parsed.headers.map(h => String(h).trim());
  const cell = (rowIdx, header) => {
    const i = headers.indexOf(header);
    return i < 0 ? null : (parsed.lines[rowIdx][i] ?? '');
  };

  const COLS = ['Formation', 'Receiver Distribution', 'QB Alignment', 'Backfield', 'Offensive Strength', 'Coverage Call', 'Coverage Family'];
  const KEYS = ['formationFamily', 'receiverSet', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily'];
  const DETAIL_COLS = ['Motion Starts', 'Motion Ends', 'Gap', 'RPO Read', 'RPO Defender', 'RPO Decision', 'QB Run Type'];

  // Per-row equality: every exported look cell equals the play's own field, as
  // StatsEngine.proj() (the analytics read) reads it.
  const mismatches = [];
  sm.tagger.plays.forEach((p, r) => {
    const proj = SE.proj(p);
    COLS.forEach((col, k) => {
      const got = cell(r, col);
      const want = proj[KEYS[k]] ?? '';
      if (got !== want) mismatches.push({ play: p.id, col, got, want });
    });
  });

  // The detail columns export what is stored, in the columns named for them.
  const detailMismatches = [];
  sm.tagger.plays.forEach((p, r) => DETAIL_COLS.forEach((col, k) => { const got = cell(r, col), want = detailOf(p)[k]; if (got !== want) detailMismatches.push({ play: p.id, col, got, want }); }));

  // No alignment token may appear in ANY Formation cell, on any row.
  const align = ['Under Center', 'Shotgun', 'Pistol'];
  const formationLeak = parsed.lines
    .map((_, r) => cell(r, 'Formation'))
    .filter(v => align.some(a => String(v).split(' + ').map(s => s.trim()).includes(a)));

  // Round trip: import the exported CSV into a clean play list, then re-project.
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(parsed);
  const imported = sm.tagger.plays.map(lookOf);

  const importedUnits = sm.tagger.plays.map(p => p.tags.unit);
  const importedDetails = sm.tagger.plays.map(detailOf);
  const importedLooks = sm.tagger.plays.map(p => {
    const q = SE.proj(p);
    return { formation: q.formationFamily, receiverSet: q.receiverSet, qbAlignment: q.qbAlignment, coverage: q.coverage, coverageFamily: q.coverageFamily };
  });

  // A row with genuinely nothing charted must STILL be skipped — the fix for the
  // minimal-play drop must not widen into "import every blank line".
  const emptyRowCsv = 'Play #,Unit,Formation,Coverage Call,Play Type,Result\n7,offense,,,,\n8,offense,Spread,,,';
  const emptyParsed = sm.importPlaysFromText(emptyRowCsv);
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(emptyParsed);
  const emptyRowResult = { count: sm.tagger.plays.length, formations: sm.tagger.plays.map(p => p.tags.formationFamily) };

  // The plain `Coverage` header is still the coverage call.
  const legacyCsv = 'Down,Distance,Formation,Coverage,Play Type,Result,Yardage\n1,10,Spread,Cover 3,Short Pass,Gain,6';
  const legacyParsed = sm.importPlaysFromText(legacyCsv);
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(legacyParsed);
  const legacyPlay = sm.tagger.plays[0];
  // The superseded Receiver Look column is refused whole.
  const oldColumn = sm.importPlaysFromText('Down,Distance,Receiver Look,Play Type\n1,10,Trips,Short Pass');
  // ...even beside a current Formation column: never drop a supplied Receiver Look silently.
  const oldBeside = sm.importPlaysFromText('Down,Distance,Receiver Look,Formation,Play Type\n1,10,Trips,Spread,Short Pass');
  const oldBesideAlias = sm.importPlaysFromText('Down,Distance,Family,Form,Play Type\n1,10,Spread,Trips,Short Pass');

  return {
    oldColumn, oldBeside, oldBesideAlias, detailMismatches, exportedDetails, importedDetails,
    headers, mismatches, formationLeak, imported, exportedLooks,
    exportedUnits, importedUnits, importedLooks, emptyRowResult,
    row1: { formation: cell(0, 'Formation'), set: cell(0, 'Receiver Distribution'), qb: cell(0, 'QB Alignment'), strength: cell(0, 'Offensive Strength') },
    row2: { call: cell(1, 'Coverage Call'), family: cell(1, 'Coverage Family') },
    row3: { call: cell(2, 'Coverage Call'), family: cell(2, 'Coverage Family') },
    row4: { formation: cell(3, 'Formation'), set: cell(3, 'Receiver Distribution'), qb: cell(3, 'QB Alignment'), backfield: cell(3, 'Backfield') },
    row6: COLS.map(c => cell(5, c)),
    legacy: { coverage: legacyPlay?.tags?.coverage, formation: legacyPlay?.tags?.formationFamily },
  };
});

// --- Column contract ---
for (const col of ['Formation', 'Receiver Distribution', 'QB Alignment', 'Backfield', 'Offensive Strength', 'Coverage Call', 'Coverage Family', 'Motion Starts', 'Motion Ends', 'Gap', 'RPO Read', 'RPO Defender', 'RPO Decision', 'QB Run Type']) {
  ok(res.headers.includes(col), `CSV header carries the "${col}" column`, JSON.stringify(res.headers));
}

// --- Projection, per column semantic ---
ok(res.row1.formation === 'Spread' && res.row1.set === '3x1' && res.row1.qb === 'Shotgun',
  'Formation, Receiver Distribution and QB Alignment export in their own columns',
  JSON.stringify(res.row1));
ok(res.row1.strength === 'Right', 'Strength exports the coach\'s stored value');
ok(res.row2.call === '' && res.row2.family === 'Man',
  'a coverage family with no call exports Coverage Call blank + Coverage Family=Man', JSON.stringify(res.row2));
ok(res.row3.call === 'Cover 3 Match' && res.row3.family === '',
  'a real call containing a family word ("Cover 3 Match") survives whole in Coverage Call',
  JSON.stringify(res.row3));
ok(res.row4.formation === 'Spread' && res.row4.set === '2x2' && res.row4.qb === 'Pistol' && res.row4.backfield === 'Empty',
  'Backfield=Empty and QB Alignment=Pistol export in their own columns',
  JSON.stringify(res.row4));
ok(res.row6.every(v => v === ''),
  'a play with no look charted exports SEVEN blank cells (never "Unknown"/"None")', JSON.stringify(res.row6));
ok(res.detailMismatches.length === 0 && res.exportedDetails[9].join() === 'Left,Right,R-B,,,,' && res.exportedDetails[10].join() === ',,,Apex,24,Throw,' && res.exportedDetails[11].join() === ',,Center,,,,Designed',
  'the motion path, gap, RPO and QB run details export in their own columns', JSON.stringify({ mismatches: res.detailMismatches, rows: res.exportedDetails.slice(9) }));

// --- The whole-export invariants ---
ok(res.mismatches.length === 0,
  'EVERY exported look cell equals the play\'s own field (per-row equality)',
  JSON.stringify(res.mismatches));
ok(res.formationLeak.length === 0,
  'NO Formation cell in the export contains an alignment token', JSON.stringify(res.formationLeak));

// --- Round trip ---
ok(res.imported.length === 12, 'export→import produces one play per exported row — INCLUDING minimally charted ones',
  `${res.imported.length} of 12; formations back: ${JSON.stringify(res.importedLooks?.map(l => l.formation))}`);
ok(JSON.stringify(res.importedUnits) === JSON.stringify(res.exportedUnits),
  'every play\'s UNIT survives the round trip (a lost unit reads as offense and corrupts unit-partitioned analytics)',
  `exported ${JSON.stringify(res.exportedUnits)} -> imported ${JSON.stringify(res.importedUnits)}`);
ok(res.importedLooks?.[6]?.formation === 'Spread' && res.importedLooks?.[6]?.receiverSet === '3x1' && res.importedLooks?.[6]?.qbAlignment === 'Shotgun',
  'a play charted with ONLY a family, receiver set and alignment survives import', JSON.stringify(res.importedLooks?.[6]));
ok(res.importedLooks?.[7]?.coverageFamily === 'Match' && res.importedLooks?.[7]?.coverage === '',
  'a play charted with ONLY a coverage family survives import', JSON.stringify(res.importedLooks?.[7]));
ok(res.emptyRowResult?.count === 1 && res.emptyRowResult?.formations?.[0] === 'Spread',
  'a row with NOTHING charted is still skipped — the fix does not widen into importing blank lines',
  JSON.stringify(res.emptyRowResult));
ok(JSON.stringify(res.imported) === JSON.stringify(res.exportedLooks),
  'every play\'s seven look fields come back exactly as exported (field-for-field round trip)',
  JSON.stringify({ exported: res.exportedLooks, imported: res.imported }));
ok(JSON.stringify(res.importedDetails) === JSON.stringify(res.exportedDetails),
  'the run and motion details come back exactly as exported (CSV round trip)', JSON.stringify({ exported: res.exportedDetails.slice(9), imported: res.importedDetails.slice(9) }));

// --- Headers ---
ok(res.legacy.coverage === 'Cover 3' && res.legacy.formation === 'Spread',
  'the plain "Coverage" header is still the coverage call', JSON.stringify(res.legacy));
ok(res.oldColumn.count === 0 && /old GridIron IQ format/.test(res.oldColumn.error || ''),
  'a CSV with the retired Receiver Look column is refused whole with the plain message', JSON.stringify(res.oldColumn));
ok(res.oldBeside.count === 0 && /old GridIron IQ format/.test(res.oldBeside.error || '') && res.oldBesideAlias.count === 0 && /old GridIron IQ format/.test(res.oldBesideAlias.error || ''),
  'a retired receiver-look header or Form alias is refused even beside current Formation', JSON.stringify([res.oldBeside, res.oldBesideAlias]));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
