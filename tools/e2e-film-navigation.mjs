/* P0-c shared film-navigation contract.
   Pins composite identity, exact consumer handoff, filtered queue ownership,
   transient cross-game hops, cancellation, and launch-game restoration. */
import { readFile } from 'node:fs/promises';
import { CrossGameCutup } from '../js/cross-game-cutup.js';
import { FilmNavigationService } from '../js/film-navigation-service.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const play = (id, start, end) => ({ id, timestamp: { start, end }, tags: {} });
const games = [
  { id: 'g1', name: 'Week 1', gameInfo: { date: '2026-09-01' }, plays: [play(1, 0, 4), play(2, 5, 9), play(3, 10, 14)] },
  { id: 'g2', name: 'Week 2', gameInfo: { date: '2026-09-08' }, plays: [play(1, 0, 4), play(2, 5, 9), play(3, 10, 14)] },
];

function fixture() {
  const state = {
    active: 'g1', commits: 0, persists: 0, routes: 0, syncs: 0,
    switches: [], starts: [], toasts: [], selected: [], stopCalls: [],
  };
  const tagger = {
    plays: games[0].plays,
    selectPlay(id) { state.selected.push(`${state.active}::${id}`); },
  };
  let pending = null;
  const cutupPlayer = {
    stop(reason) {
      state.stopCalls.push(reason);
      if (pending) { const resolve = pending; pending = null; resolve({ completed: false, reason }); }
    },
    start(ids, label) {
      state.starts.push({ gameId: state.active, ids: ids.map(String), label });
      if (state.hold) return new Promise(resolve => { pending = resolve; });
      if (state.cancel) return Promise.resolve({ completed: false, reason: 'stopped' });
      return Promise.resolve({ completed: true, reason: 'complete' });
    },
  };
  const deps = {
    games: () => games,
    activeGameId: () => state.active,
    commitActive: () => { state.commits++; },
    persist: async () => { state.persists++; return true; },
    switchToGame: async (gameId, options) => {
      state.switches.push({ gameId: String(gameId), options: { ...options } });
      if (state.failSwitch) return false;
      state.active = String(gameId);
      tagger.plays = games.find(game => game.id === state.active)?.plays || [];
      return true;
    },
    filmHealth: async game => ({ ready: !state.missing?.has(game?.id) }),
    showBreakdown: async () => { state.routes++; },
    syncChrome: () => { state.syncs++; },
    cutupPlayer,
    tagger,
    videoController: { video: { src: 'asset://active-film' } },
    planner: new CrossGameCutup(),
    toast: message => state.toasts.push(message),
  };
  return { state, service: new FilmNavigationService(deps) };
}

// 1. Dependency injection is real, not a global-app fallback.
try { new FilmNavigationService({}); ok(false, 'missing dependencies fail closed'); }
catch (error) { ok(/requires games/.test(error.message), 'missing dependencies fail closed', error.message); }

// 2. Composite identity survives duplicate bare ids across games.
{
  const { service } = fixture();
  ok(eq(service.refsForGame([{ id: 1 }, { id: 2 }], 'g2'), ['g2::1', 'g2::2']),
    'refsForGame stamps the owning game onto every play');
  ok(service.refsForGame([{ id: 1 }], 'g1')[0] !== service.refsForGame([{ id: 1 }], 'g2')[0],
    'duplicate bare play ids remain distinct across games');
}

// 3. A filtered reel contains only the requested examples, never chronological neighbors.
{
  const { state, service } = fixture();
  const refs = ['g1::2', 'g2::2'];
  const result = await service.watch(refs, { label: 'Success examples' });
  ok(result.completed && result.played === 2, 'cross-game reel completes with an honest played count', JSON.stringify(result));
  ok(eq(state.starts.map(call => `${call.gameId}::${call.ids.join(',')}`), ['g1::2', 'g2::2']),
    'Next/Save & Next queue contains only exact requested examples', JSON.stringify(state.starts));
  ok(!state.starts.some(call => call.ids.includes('1') || call.ids.includes('3')),
    'chronological neighbors never leak into the filtered queue');
  ok(state.commits === 1 && state.persists === 1,
    'a reel saves launch state once rather than writing on every game hop');
  ok(state.switches.every(call => call.options.commit === false && call.options.persist === false && call.options.reloadActiveFilm === true),
    'all reel hops are transient read-only film reloads', JSON.stringify(state.switches));
  ok(state.active === 'g1' && state.switches.at(-1)?.gameId === 'g1',
    'the launch game is restored after playback');
}

// 4. Cancellation stops before the next owning game and still restores launch state.
{
  const { state, service } = fixture();
  state.cancel = true;
  const result = await service.watch(['g1::2', 'g2::2'], { label: 'Cancelled' });
  ok(!result.completed && result.reason === 'stopped', 'player cancellation is returned honestly', JSON.stringify(result));
  ok(state.starts.length === 1 && state.starts[0].gameId === 'g1',
    'cancellation never advances into the next game', JSON.stringify(state.starts));
  ok(state.active === 'g1', 'cancellation restores the launch game');
}

// 5. A replacement reel invalidates the stale owner rather than advancing it.
{
  const { state, service } = fixture();
  state.hold = true;
  const first = service.watch(['g2::2'], { label: 'First' });
  while (!state.starts.length) await new Promise(resolve => setTimeout(resolve, 0));
  ok(state.active === 'g2', 'replacement probe begins after the first reel has hopped games');
  state.hold = false;
  const second = service.watch(['g2::1'], { label: 'Second' });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  ok(!firstResult.completed && firstResult.reason === 'replaced' && secondResult.completed,
    'a new request replaces the stale reel deterministically', JSON.stringify({ firstResult, secondResult }));
  ok(state.starts.filter(call => /First/.test(call.label)).length === 1
    && state.starts.filter(call => /Second/.test(call.label)).length === 1,
    'the replaced reel cannot resume into a later game', JSON.stringify(state.starts));
  ok(state.active === 'g1', 'replacement restores the original session launch game, not the transient game');
}

// 6. Failed game loads are unavailable, never a false completed reel.
{
  const { state, service } = fixture();
  state.failSwitch = true;
  const result = await service.watch(['g2::2'], { label: 'Unavailable' });
  ok(!result.completed && result.reason === 'unavailable' && result.played === 0,
    'all failed game loads report unavailable rather than complete', JSON.stringify(result));
}

// 7. Reports retain the established no-video select-first fallback.
{
  const { state, service } = fixture();
  games[1].plays[2].timestamp = { start: 10, end: 10 };
  const result = await service.watch(['g1::99', 'g2::3'], { label: 'Report row', fallback: 'select-first' });
  ok(result.reason === 'selected' && eq(state.selected, ['g2::3']),
    'no-video report fallback selects the first resolvable composite ref', JSON.stringify({ result, selected: state.selected }));
}

// 8. Consumer ownership: no UI reaches through another UI or starts the player directly.
{
  const [study, plan, stats] = await Promise.all([
    readFile(new URL('../js/study-screen.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/plan-screen.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/stats-engine.js', import.meta.url), 'utf8'),
  ]);
  ok(!plan.includes('studyScreen._watch') && (plan.match(/filmNavigation\.watch/g) || []).length === 4,
    'all four Plan watch actions use the shared service');
  ok(!study.includes('cutupPlayer.start') && (study.match(/filmNavigation\.watch/g) || []).length === 3,
    'Study delegates playback and retains only a compatibility adapter');
  ok(!stats.includes('window.app.cutupPlayer') && stats.includes('filmNavigation.refsForGame') && stats.includes('filmNavigation.watch'),
    'Reports create composite refs before using the shared service');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);