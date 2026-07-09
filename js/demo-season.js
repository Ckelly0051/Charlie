/**
 * DemoSeason — a fully-tagged sample season the coach can explore instantly.
 *
 * The #1 onboarding lesson from Hudl / Notion / Krossover: never show a new user
 * a blank canvas. `DemoSeason.build()` returns a complete, realistic season
 * object (the same schema SeasonStore produces) — two finished games of tagged
 * offense AND defense plays, a roster with real names, and final scores — so a
 * first-time coach lands on a populated Stats dashboard, Self-Scout, and Call
 * Sheet in seconds instead of tagging 40 plays first.
 *
 * It's deterministic (seeded RNG) so the demo looks the same every time, and it
 * loads through the exact same code path as real data — nothing about the demo
 * is special-cased downstream, so what the coach explores is the real product.
 *
 * No video is attached (film can't be bundled), so the film player shows its
 * placeholder; the demo's job is the analytics "aha", which need no video.
 *
 * NOTE: the seeded RNG + play-distribution model below is intentionally close
 * to `tools/generate-sample-report.mjs` (a node-only report generator). They're
 * kept separate (browser ES module vs build-time tool, and this one adds a
 * defense loop + multi-game structure), but if you tune the realism here,
 * consider mirroring it there so the demo and the sample report don't drift.
 */

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

// Roster with real names so the individual-stats tables read "#22 Carter".
const DEMO_ROSTER = [
  { num: '7',  name: 'Jordan Hayes',   pos: 'QB', side: 'O' },
  { num: '12', name: 'Eli Brooks',     pos: 'QB', side: 'O' },
  { num: '22', name: 'Marcus Carter',  pos: 'RB', side: 'O' },
  { num: '28', name: 'DeShawn Pierce', pos: 'RB', side: 'O' },
  { num: '34', name: 'Tyler Nunez',    pos: 'RB', side: 'O' },
  { num: '80', name: 'Cam Whitfield',  pos: 'WR', side: 'O' },
  { num: '11', name: 'Andre Sole',     pos: 'WR', side: 'O' },
  { num: '84', name: 'Reece Lambert',  pos: 'TE', side: 'O' },
  { num: '3',  name: 'Kavon Reid',     pos: 'WR', side: 'O' },
  { num: '17', name: 'Drew Halloran',  pos: 'WR', side: 'O' },
  { num: '55', name: 'Big Mike Osei',  pos: 'LB', side: 'D' },
  { num: '9',  name: 'Trey Bishop',    pos: 'CB', side: 'D' },
  { num: '24', name: 'Xavier Mead',    pos: 'S',  side: 'D' },
  { num: '40', name: 'Sam Okafor',     pos: 'LB', side: 'D' },
  { num: '52', name: 'Nate Ferraro',   pos: 'LB', side: 'D' },
  { num: '31', name: 'Quinn Daly',     pos: 'CB', side: 'D' },
  { num: '90', name: 'Boomer Vance',   pos: 'DL', side: 'D' },
];

export class DemoSeason {
  static SEASON_NAME = '2026 Varsity — Demo';

  /**
   * Jersey # → name map. Applied as a *non-persistent* label overlay
   * (StatsEngine._seasonLabels) only while the demo is the active season, so
   * the demo's individual-stats tables read "#22 Marcus Carter" WITHOUT ever
   * writing to the coach's real global roster.
   */
  static LABELS = DEMO_ROSTER.reduce((m, p) => { m[p.num] = p.name; return m; }, {});

  /** Build the full season object (deterministic). */
  static build() {
    const teamProfile = { teamName: 'GridIron Demo', jerseyColor: 'navy' };
    const games = [
      DemoSeason._game({
        seed: 70021, opponent: 'Riverside Hawks', date: '2026-09-04',
        scoreUs: 28, scoreThem: 21, oDrives: 11, dDrives: 9,
      }),
      DemoSeason._game({
        seed: 81143, opponent: 'Central Tigers', date: '2026-09-11',
        scoreUs: 17, scoreThem: 24, oDrives: 10, dDrives: 11,
      }),
    ];
    return {
      version: 5, type: 'season',
      isDemo: true, kind: 'demo',
      id: '', seasonName: DemoSeason.SEASON_NAME,
      team: teamProfile.teamName, year: '2026', level: 'Varsity',
      teamProfile,
      roster: [],   // empty on purpose — names come from the LABELS overlay, never the global roster
      games,
      activeGameId: games[0].id,
    };
  }

  // ---- one game (offense + defense plays) ----------------------------------

  static _game({ seed, opponent, date, scoreUs, scoreThem, oDrives, dDrives }) {
    let s = seed;
    const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const chance = p => rng() < p;
    const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));

    const plays = [];
    let pid = 0;
    let clock = 0;
    const stamp = () => { const start = clock; clock += randInt(28, 40); return { start, end: start + randInt(5, 9) }; };

    // ----- our OFFENSE -----
    for (let drive = 1; drive <= oDrives; drive++) {
      const quarter = `Q${Math.min(4, Math.ceil((drive / oDrives) * 4))}`;
      let down = 1, distance = 10, fieldSide, yardLine;
      if (chance(0.25)) { fieldSide = 'opp'; yardLine = randInt(15, 40); }
      else { fieldSide = 'own'; yardLine = randInt(15, 45); }
      const driveLen = randInt(3, 9);

      for (let i = 0; i < driveLen; i++) {
        const isRun = chance(0.54);
        const blitz = chance(0.30) ? pick(BLITZ_TYPES) : '';
        const coverage = pick(COVERAGES);
        const defFront = pick(FRONTS);
        let result = 'Gain', yardage, playType;
        const players = {}, grades = {};

        if (isRun) {
          playType = chance(0.5) ? 'Run Inside' : 'Run Outside';
          yardage = chance(0.16) ? randInt(-5, -1) : (chance(0.16) ? randInt(12, 55) : randInt(2, 9));
          players.ballCarrier = pick(RB); grades.ballCarrier = randInt(-1, 2);
          if (yardage < 0) result = 'Loss';
          else if (yardage === 0) result = 'No Gain';
        } else {
          const r = rng();
          playType = r < 0.25 ? 'Screen' : r < 0.55 ? 'Short Pass' : r < 0.8 ? 'Medium Pass' : 'Deep Pass';
          players.passer = pick(QB); grades.passer = randInt(-1, 2);
          const sackP = blitz ? 0.16 : 0.05, intP = blitz ? 0.06 : 0.035;
          if (chance(sackP)) { result = 'Sack'; yardage = randInt(-9, -3); }
          else if (chance(intP)) { result = 'Interception'; yardage = 0; }
          else if (chance(blitz ? 0.40 : 0.31)) { result = 'Incomplete'; yardage = 0; }
          else {
            result = 'Gain';
            yardage = playType === 'Deep Pass' ? randInt(15, 48) : playType === 'Medium Pass' ? randInt(8, 22) : randInt(1, 12);
            players.receiver = pick(WR); grades.receiver = randInt(0, 2);
          }
        }

        const absYL = fieldSide === 'opp' ? 100 - yardLine : yardLine;
        if (result === 'Gain' && absYL + yardage >= 100) result = 'Touchdown';
        if (chance(0.02) && (result === 'Gain' || result === 'Loss')) result = 'Fumble';
        const gained1st = result === 'Touchdown' ||
          (yardage >= distance && !['Interception', 'Fumble', 'Sack'].includes(result));

        plays.push({
          id: ++pid, timestamp: stamp(), clipId: null,
          tags: {
            down: String(down), distance: String(distance), quarter, fieldSide, yardLine: String(yardLine),
            formation: pick(FORMATIONS), personnel: pick(PERSONNEL),
            runPass: isRun ? 'Run' : 'Pass', playType, result, yardage: String(yardage),
            hash: pick(HASHES), defFront, coverage, blitz,
            driveNumber: String(drive), unit: 'offense', stType: '',
            players, grades, custom: gained1st ? ['1st Down'] : [],
          },
          notes: '', analysis: null,
        });

        if (['Touchdown', 'Interception', 'Fumble'].includes(result)) break;
        if (gained1st) { down = 1; distance = 10; }
        else { down++; distance = Math.max(1, distance - Math.max(0, yardage)); }
        if (down > 4) break;
        const newAbs = Math.max(1, Math.min(99, absYL + yardage));
        fieldSide = newAbs >= 50 ? 'opp' : 'own';
        yardLine = newAbs >= 50 ? 100 - newAbs : newAbs;
      }
    }

    // ----- our DEFENSE (powers the Defense tab + tackles / INT / FR) -----
    for (let drive = 1; drive <= dDrives; drive++) {
      const quarter = `Q${Math.min(4, Math.ceil((drive / dDrives) * 4))}`;
      let down = 1, distance = 10;
      const driveLen = randInt(3, 8);
      for (let i = 0; i < driveLen; i++) {
        const isRun = chance(0.5);
        const blitz = chance(0.34) ? pick(BLITZ_TYPES) : '';
        const coverage = pick(COVERAGES);
        const defFront = pick(FRONTS);
        let result = 'Gain', yardage, playType;
        const players = {}, grades = {};

        if (isRun) {
          playType = chance(0.5) ? 'Run Inside' : 'Run Outside';
          yardage = chance(0.22) ? randInt(-4, -1) : (chance(0.12) ? randInt(11, 40) : randInt(1, 8));
          if (yardage <= 0) { result = yardage < 0 ? 'Loss' : 'No Gain'; }
          // credit a tackler (sometimes a shared tackle)
          players.tackler = chance(0.3) ? `${pick(DEF)}, ${pick(DEF)}` : pick(DEF);
          grades.tackler = randInt(0, 2);
        } else {
          const r = rng();
          playType = r < 0.25 ? 'Screen' : r < 0.55 ? 'Short Pass' : r < 0.8 ? 'Medium Pass' : 'Deep Pass';
          const sackP = blitz ? 0.18 : 0.06, intP = blitz ? 0.08 : 0.04;
          if (chance(sackP)) { result = 'Sack'; yardage = randInt(-9, -3); players.tackler = pick(DEF); grades.tackler = 2; }
          else if (chance(intP)) { result = 'Interception'; yardage = 0; players.tackler = pick(['9', '24', '31']); grades.tackler = 2; }
          else if (chance(blitz ? 0.42 : 0.34)) { result = 'Incomplete'; yardage = 0; }
          else {
            result = 'Gain';
            yardage = playType === 'Deep Pass' ? randInt(14, 44) : playType === 'Medium Pass' ? randInt(8, 20) : randInt(1, 11);
            players.tackler = chance(0.3) ? `${pick(DEF)}, ${pick(DEF)}` : pick(DEF);
            grades.tackler = randInt(-1, 1);
          }
        }
        if (chance(0.03) && (result === 'Gain' || result === 'Loss')) { result = 'Fumble'; players.tackler = pick(DEF); grades.tackler = 2; }

        plays.push({
          id: ++pid, timestamp: stamp(), clipId: null,
          tags: {
            down: String(down), distance: String(distance), quarter, fieldSide: 'own', yardLine: String(randInt(20, 45)),
            formation: '', personnel: '',
            runPass: isRun ? 'Run' : 'Pass', playType, result, yardage: String(yardage),
            hash: pick(HASHES), defFront, coverage, blitz,
            driveNumber: String(drive), unit: 'defense', stType: '',
            players, grades, custom: [],
          },
          notes: '', analysis: null,
        });

        const stop = yardage <= 0 || ['Sack', 'Interception', 'Incomplete', 'Fumble'].includes(result);
        if (['Interception', 'Fumble'].includes(result)) break;
        if (!stop && yardage >= distance) { down = 1; distance = 10; }
        else { down++; distance = Math.max(1, distance - Math.max(0, yardage)); }
        if (down > 4) break;
      }
    }

    return {
      id: 'g_demo_' + seed, name: `vs ${opponent}`, status: 'final',
      gameInfo: {
        projectName: `Week ${date.endsWith('04') ? '1' : '2'} vs ${opponent}`,
        teamName: 'GridIron Demo', opponent, date,
        scoreUs, scoreThem, jerseyColor: 'navy', perspective: 'offense',
      },
      plays, annotations: [],
      nextId: pid + 1, currentPlayId: null,
      videoFileName: null, clipNames: [], isMultiClip: false,
    };
  }
}
