/**
 * generate-sample-report.mjs
 *
 * Generates a deck of realistic dummy plays (offense + defense tagged) and runs
 * them through the REAL StatsEngine to produce a standalone HTML analytics
 * report — both offensive and defensive sections — that mirrors the in-app
 * dashboard. Output: sample-analytics-report.html (open in a browser).
 *
 *   node tools/generate-sample-report.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Minimal DOM stub so StatsEngine's constructor/render methods run headless ---
const stubEl = () => ({
  value: '', innerHTML: '', classList: { add() {}, remove() {} },
  addEventListener() {}, querySelector: () => stubEl(), querySelectorAll: () => [],
  appendChild() {}, removeChild() {},
});
globalThis.document = { getElementById: () => stubEl(), createElement: stubEl, body: stubEl() };
globalThis.window = {};

const { StatsEngine } = await import(join(ROOT, 'js/stats-engine.js'));

// --- Dummy data generation -------------------------------------------------
const FORMATIONS = ['Shotgun', 'Shotgun + Trips', 'Singleback', 'I-Form', 'Pistol + Spread', 'Empty', 'Under Center'];
const PERSONNEL = ['11', '12', '21', '10', '22'];
const FRONTS = ['4-3', '3-4', 'Nickel', '4-2-5', 'Dime', '4-6'];
const COVERAGES = ['Cover 1', 'Cover 2', 'Cover 3', 'Cover 4', 'Cover 0', 'Man', 'Zone'];
const BLITZ_TYPES = ['A-Gap', 'B-Gap', 'Edge', 'DB Blitz', 'Zone Blitz'];
const HASHES = ['Left', 'Middle', 'Right'];

const RB = ['22', '28', '34'];
const QB = ['7', '12'];
const WR = ['80', '11', '84', '3', '17'];
const DEF = ['55', '9', '24', '40', '52', '31', '90'];

// Simple seeded RNG for reproducible output.
let seed = 20260604;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = arr => arr[Math.floor(rng() * arr.length)];
const chance = p => rng() < p;
const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));

let playId = 0;
const plays = [];

// Build drives so down/distance/drive-level stats are coherent.
const NUM_DRIVES = 20;
for (let drive = 1; drive <= NUM_DRIVES; drive++) {
  const quarter = `Q${Math.min(4, Math.ceil((drive / NUM_DRIVES) * 4))}`;
  let down = 1, distance = 10;
  // Mix of field positions: some short fields (after takeaways), most own territory.
  let yardLine, fieldSide;
  if (chance(0.25)) { fieldSide = 'opp'; yardLine = randInt(15, 40); }      // good field position
  else { fieldSide = 'own'; yardLine = randInt(15, 45); }
  const driveLen = randInt(3, 9);

  for (let i = 0; i < driveLen; i++) {
    const isRun = chance(0.54);
    const blitz = chance(0.32) ? pick(BLITZ_TYPES) : '';
    const coverage = pick(COVERAGES);
    const defFront = pick(FRONTS);

    // Outcome
    let result = 'Gain';
    let yardage;
    let playType;
    const players = {};
    const grades = {};

    if (isRun) {
      playType = chance(0.5) ? 'Run Inside' : 'Run Outside';
      // ~16% stuffed for a loss (TFL), ~16% explosive, rest moderate gains.
      yardage = chance(0.16) ? randInt(-5, -1) : (chance(0.16) ? randInt(12, 55) : randInt(2, 9));
      players.ballCarrier = pick(RB);
      grades.ballCarrier = randInt(-1, 2);
      if (yardage < 0) { result = 'Loss'; players.tackler = pick(DEF); grades.tackler = 2; }
      else if (yardage === 0) result = 'No Gain';
      else if (chance(0.6)) { players.tackler = pick(DEF); grades.tackler = randInt(-1, 1); }
    } else {
      const r = rng();
      playType = r < 0.25 ? 'Screen' : r < 0.55 ? 'Short Pass' : r < 0.8 ? 'Medium Pass' : 'Deep Pass';
      players.passer = pick(QB);
      grades.passer = randInt(-1, 2);
      const sackP = blitz ? 0.18 : 0.06;
      const intP = blitz ? 0.07 : 0.04;
      if (chance(sackP)) {
        result = 'Sack'; yardage = randInt(-9, -3);
        players.tackler = pick(DEF); grades.tackler = 2;
      } else if (chance(intP)) {
        result = 'Interception'; yardage = 0;
        players.tackler = pick(DEF); grades.tackler = 2;
      } else if (chance(blitz ? 0.40 : 0.32)) {
        result = 'Incomplete'; yardage = 0;
      } else {
        result = 'Gain';
        yardage = playType === 'Deep Pass' ? randInt(15, 48)
          : playType === 'Medium Pass' ? randInt(8, 22)
          : randInt(1, 12);
        players.receiver = pick(WR);
        grades.receiver = randInt(0, 2);
      }
    }

    // Touchdown if it reaches the end zone.
    const absYL = fieldSide === 'opp' ? 100 - yardLine : yardLine;
    if (result === 'Gain' && absYL + yardage >= 100) { result = 'Touchdown'; }
    if (chance(0.02) && (result === 'Gain' || result === 'Loss')) { result = 'Fumble'; players.tackler = pick(DEF); }

    const gained1st = (result === 'Touchdown') || (yardage >= distance && result !== 'Interception' && result !== 'Fumble' && result !== 'Sack');

    plays.push({
      id: ++playId,
      timestamp: { start: playId * 30, end: playId * 30 + 7 },
      clipId: null,
      tags: {
        down: String(down), distance: String(distance),
        quarter, fieldSide, yardLine: String(yardLine),
        formation: pick(FORMATIONS), personnel: pick(PERSONNEL),
        runPass: isRun ? 'Run' : 'Pass',
        playType, result, yardage: String(yardage),
        hash: pick(HASHES),
        defFront, coverage, blitz,
        driveNumber: String(drive),
        unit: 'offense',
        stType: '',
        players, grades,
        custom: gained1st ? ['1st Down'] : [],
      },
      notes: '', analysis: null,
    });

    // Advance situation
    if (result === 'Touchdown' || result === 'Interception' || result === 'Fumble') break;
    if (gained1st) { down = 1; distance = 10; }
    else { down++; distance = Math.max(1, distance - Math.max(0, yardage)); }
    if (down > 4) break;
    // Move ball
    let newAbs = Math.max(1, Math.min(99, absYL + yardage));
    fieldSide = newAbs >= 50 ? 'opp' : 'own';
    yardLine = newAbs >= 50 ? 100 - newAbs : newAbs;
  }
}

// --- Compute via the real engine ------------------------------------------
const engine = new StatsEngine({ plays }, null);
const stats = engine.compute(plays);

// --- Assemble HTML report using the engine's own render methods ------------
const css = readFileSync(join(ROOT, 'css/styles.css'), 'utf8');

const offenseSections = [
  engine._renderTeamStats(stats),
  engine._renderEfficiency(stats),
  engine._renderAdvanced(stats),
  engine._renderDownAnalysis(stats),
  engine._renderSituational(stats),
  engine._renderDrives(stats),
  engine._renderTendencies(stats),
  engine._renderPersonnel(stats),
  engine._renderBigPlays(stats),
  engine._renderIndividualStats(stats),
].join('\n');

const defenseSections = engine._renderDefensive(stats);

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sample Analytics Report</title>
<style>${css}</style>
<style>
  body { background: var(--bg, #14171c); padding: 24px; }
  .report-wrap { max-width: 1100px; margin: 0 auto; }
  .report-banner { background:#1d2128; border:1px solid #2c333d; border-radius:10px; padding:16px 20px; margin-bottom:20px; }
  .report-banner h1 { margin:0 0 6px; font-size:22px; }
  .report-banner p { margin:0; opacity:.7; font-size:13px; }
  .report-divider { margin:28px 0 8px; padding:10px 16px; background:linear-gradient(90deg,#222a35,transparent); border-left:4px solid var(--accent,#4a9eff); border-radius:4px; }
  .report-divider h2 { margin:0; font-size:18px; letter-spacing:.5px; }
  .stats-section { display:block !important; }
</style>
</head><body>
<div class="report-wrap">
  <div class="report-banner">
    <h1>Sample Analytics Report</h1>
    <p>Generated from ${plays.length} dummy plays across ${NUM_DRIVES} drives &middot; ${new Date().toLocaleString()} &middot; reproducible seed</p>
  </div>
  <div class="report-divider"><h2>&#127944; Offensive Analytics</h2></div>
  ${offenseSections}
  <div class="report-divider"><h2>&#128737;&#65039; Defensive Analytics</h2></div>
  ${defenseSections}
</div>
</body></html>`;

const outPath = join(ROOT, 'sample-analytics-report.html');
writeFileSync(outPath, html);

// --- Console summary -------------------------------------------------------
const d = stats.defensive;
console.log(`Wrote ${outPath}`);
console.log(`\nPlays: ${stats.totalPlays}  |  Total yards: ${stats.rushing.yards + stats.passing.yards}  |  TDs: ${stats.scoring.touchdowns}`);
console.log(`Offense  -> Run/Pass ${stats.tendencies.runPassRatio}, Success ${stats.efficiency.successRate}%, EPA/play ${stats.advanced.perPlay?.toFixed?.(2) ?? 'n/a'}`);
console.log(`Defense  -> Havoc ${d.havocRate}%, Sacks ${d.sacks}, TFL ${d.tfl}, INT ${d.interceptions}, Blitz rate ${d.blitzRate}%, Blitz havoc ${d.blitzHavocRate}%`);
