/* Shared synthetic-edge parity fixture (imported by tools/e2e-parity.mjs and
   tools/e2e-study-query.mjs so the committed parity golden and the Study query
   test exercise the IDENTICAL season). Two games, ids restart at 1 per game
   (season scope needs composite gameId::playId), the games lean opposite ways,
   game 2 carries dimension values absent from game 1 (Flexbone, Cover 2), and
   the season totals equal neither game — a broken aggregation or bare-id
   collision fails the diff. */
export function syntheticEdge() {
  const mkGame = (gid, opp, specs) => {
    let pid = 0;
    const plays = specs.map(t => ({ id: ++pid, timestamp: { start: 0, end: 6 }, notes: '', annotations: [], clipName: `${gid}_${pid}`, tags: Object.assign({ unit: 'offense', custom: [], players: {}, grades: {} }, t) }));
    return { id: gid, name: opp, gameInfo: { opponent: opp, date: `2025-09-0${gid.slice(-1)}` }, status: 'final', plays, annotations: [], nextId: pid + 1, currentPlayId: null, videoFileName: '', clipNames: plays.map(p => p.clipName), isMultiClip: true };
  };
  const g1 = mkGame('g1', 'Edgecases', [
    ...Array.from({ length: 6 }, (_, i) => ({ down: '1', distance: '10', formation: 'Shotgun + Trips', backfield: 'Single', strength: 'Right', personnel: '11', motion: i % 2 ? 'Jet' : '', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', playDir: 'Right', hash: 'Middle', fieldSide: 'own', yardLine: '25', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } })),
    { down: '2', distance: '5', formation: 'Empty', personnel: '10', playType: 'Deep Pass', runPass: 'Pass', result: 'Gain + Touchdown', yardage: '48', playDir: 'Left', hash: 'Left', fieldSide: 'opp', yardLine: '48', players: { passer: '12', receiver: '80' }, grades: { passer: 2, receiver: 2 } },
    { down: '3', distance: '9', formation: 'Shotgun + Trips', personnel: '11', playType: 'RPO + Short Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { passer: '12' } },
    { down: '1', distance: '10', formation: 'Wildcat', personnel: '21', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '3', playDir: 'Right' },
    { down: '2', distance: '7', formation: 'Under Center', personnel: '12', playType: 'Play Action', runPass: 'Pass', result: 'Gain', yardage: '11', custom: ['BOOT'], customFields: { edge: 'Wide' } },
    // coverageFamily on 2 of 5 (Zone), 3 blank — makes the coverage-call × family
    // cross-tab + the coverageFamily dimension non-vacuous (0 family values was a
    // known fixture gap), and exercises the omit-blank-family path.
    ...Array.from({ length: 5 }, (_, i) => ({ unit: 'defense', down: '1', distance: '10', defFront: i % 2 ? '4-3 + Jumbo Shift' : '3-4', coverage: 'Cover 3', coverageFamily: i < 2 ? 'Zone' : '', blitz: i % 2 ? 'A-Gap + Edge' : '', playType: 'Short Pass', runPass: 'Pass', result: i === 0 ? 'Sack' : 'No Gain', yardage: i === 0 ? '-6' : '2', players: { tackler: i === 0 ? '55' : '55, 22' } })),
    { unit: 'special', stType: 'Punt', kickOutcome: 'Downed', kickDistance: '42', hangTime: '4.1', kickedTo: '15', players: { kicker: '19' } },
    { unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', kickDistance: '37', result: 'Good', players: { kicker: '19' } },
    {},
  ]);
  const g2 = mkGame('g2', 'Rivals', [
    ...Array.from({ length: 4 }, () => ({ down: '2', distance: '6', formation: 'Pistol', backfield: 'Power', strength: 'Left', personnel: '21', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7', playDir: 'Left', hash: 'Right', fieldSide: 'own', yardLine: '40' })),
    { down: '1', distance: '10', formation: 'Flexbone', personnel: '22', playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '14', playDir: 'Right', hash: 'Middle' },
    { down: '3', distance: '2', formation: 'Under Center', personnel: '23', playType: 'Short Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', hash: 'Left' },
    ...Array.from({ length: 3 }, (_, i) => ({ unit: 'defense', down: '2', distance: '8', defFront: '4-4', coverage: 'Cover 2', blitz: 'B-Gap', playType: 'Deep Pass', runPass: 'Pass', result: i === 0 ? 'Interception' : 'Incomplete', yardage: '0', players: { tackler: '44' } })),
  ]);
  return { version: 5, type: 'season', id: 'parity-synth', seasonName: 'Parity Synthetic', activeGameId: 'g1', games: [g1, g2] };
}
