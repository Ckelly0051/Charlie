/**
 * FILM-01 - linked clip-set reconciliation, and durable clip-identity deletion.
 *
 * The binding rule for LINKED film is exact identity-set EQUALITY between the
 * game's durable clip index and the linked folder's video files. App-only clips
 * and folder-only videos are both mismatches; equal sets are no error. Managed
 * film keeps its existing one-way rule, because that directory is app-owned
 * storage rather than a folder the coach maintains.
 *
 * The other half is deletion. The durable clip index retains everything it has
 * recorded - that is what stops an unloaded save from pruning a game's film
 * record down to its charted plays - so an intentional in-app deletion has to
 * say so explicitly (`StorageManager.forgetClipIdentity`). A recorded removal is
 * honoured only when no surviving play references the clip, which is what makes
 * a shared clip survive one of its plays and what makes Undo restore both. No
 * coach-owned source file is ever touched by any of it, and an externally
 * deleted file stays visible as a mismatch until the coach removes the record.
 *
 * Every fixture here is synthetic and every substitution is restored. No coach
 * season, catalog row or film file is read or written.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const source = name => readFileSync(join(REPO, 'js', name), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== '' ? ' -- ' + JSON.stringify(extra) : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const result = await page.evaluate(async () => {
  const app = window.app;
  const st = app.storage;
  const store = st.seasonStore;
  const tagger = app.tagger;
  const playlist = app.playlist;
  const out = {};

  const original = {
    data: store.data, seasonId: store.currentSeasonId, backend: store.backend,
    plays: tagger.plays, currentPlayId: tagger.currentPlayId,
    clips: playlist ? playlist.clips : null, activeClipIndex: playlist ? playlist.activeClipIndex : -1,
    loadedGameId: st._loadedGameId, confirm: tagger._confirmDialog, toast: tagger.toast,
    unload: app.vc ? app.vc.unloadVideo : null,
  };
  // Never let a fixture reach a real dialog, toast, or the media element.
  tagger._confirmDialog = async () => true;
  tagger.toast = () => {};
  if (app.vc) app.vc.unloadVideo = () => {};

  const ref = id => ({ id, originalRelativePath: id, displayName: id, originalName: id, importStatus: 'ready' });
  const play = (id, clip) => ({ id, clipId: null, clipName: clip, clipPath: clip, tags: {}, timestamp: { start: 0, end: 5 } });
  const seed = ({ seasonId = 'A', gameId = 'g1', clips = [], plays = [], playlistClips = [] }) => {
    store.currentSeasonId = seasonId;
    store.data = {
      id: seasonId, seasonName: `Season ${seasonId}`, activeGameId: gameId,
      games: [{ id: gameId, name: 'Week 1', filmMode: 'linked', filmDir: 'Week 1', clipRefs: clips.map(ref), plays: [] }],
    };
    st._loadedGameId = gameId;
    st._removedClipIds = new Set();
    tagger.plays = plays;
    tagger.currentPlayId = plays.length ? plays[0].id : null;
    if (playlist) {
      playlist.clips = playlistClips;
      playlist.activeClipIndex = playlistClips.length ? 0 : -1;
      // Each section is its own game. Production clears this in reset() on a
      // game switch; seeding the arrays directly bypasses that, and an inherited
      // stash would let one section's removed clip reappear in the next.
      playlist._undoClips.clear();
    }
    app.history?.reset?.();
  };
  const ids = () => st._buildClipIndex().map(c => c.clipPath);
  const node = () => store.data.games[0];

  // -- durable retention: an unloaded save must not prune the game's record ---
  seed({ clips: ['c1', 'c2', 'c3'], plays: [play(1, 'c1')], playlistClips: [] });
  out.unloadedRetains = ids();
  st.commitActive();
  out.unloadedCommitted = (node().clipRefs || []).map(r => r.originalRelativePath);

  // -- deliberate deletion with NO film loaded -------------------------------
  seed({ clips: ['c1', 'c2'], plays: [play(1, 'c1'), play(2, 'c2')], playlistClips: [] });
  tagger.currentPlayId = 1;
  await tagger.deleteCurrentPlay();
  out.unloadedDeleted = ids();
  out.unloadedDeletedPlays = tagger.plays.map(p => p.id);
  st.commitActive();
  out.unloadedDeletedCommitted = (node().clipRefs || []).map(r => r.originalRelativePath);

  // -- Undo restores the play, and the clip comes back with it ---------------
  seed({ clips: ['c1', 'c2'], plays: [play(1, 'c1'), play(2, 'c2')], playlistClips: [] });
  tagger.currentPlayId = 1;
  await tagger.deleteCurrentPlay();
  out.beforeUndo = ids();
  const undone = app.history?.undo?.();
  out.undoReturned = undone === true;
  out.afterUndo = ids();
  out.afterUndoPlays = tagger.plays.map(p => p.id);

  // -- a shared clip survives one of its plays being deleted -----------------
  seed({ clips: ['c1'], plays: [play(1, 'c1'), play(2, 'c1')], playlistClips: [] });
  tagger.currentPlayId = 1;
  await tagger.deleteCurrentPlay();
  out.sharedAfterDelete = ids();
  out.sharedPlaysLeft = tagger.plays.map(p => p.id);

  // -- deliberate deletion WITH film loaded (the playlist path) --------------
  seed({
    clips: ['c1', 'c2'], plays: [play(1, 'c1'), play(2, 'c2')],
    playlistClips: [
      { id: 1, name: 'c1', clipPath: 'c1', playId: 1, file: null, assetUrl: 'x', objectUrl: null, duration: 5 },
      { id: 2, name: 'c2', clipPath: 'c2', playId: 2, file: null, assetUrl: 'x', objectUrl: null, duration: 5 },
    ],
  });
  playlist.removeClip(0);
  out.loadedDeleted = ids();
  out.loadedDeletedPlays = tagger.plays.map(p => p.id);

  // -- a playlist clip with no play at all (folder file, never charted) ------
  seed({
    clips: ['c1', 'c2'], plays: [play(1, 'c1')],
    playlistClips: [
      { id: 1, name: 'c1', clipPath: 'c1', playId: 1, file: null, assetUrl: 'x', objectUrl: null, duration: 5 },
      { id: 2, name: 'c2', clipPath: 'c2', playId: null, file: null, assetUrl: 'x', objectUrl: null, duration: 5 },
    ],
  });
  out.unchartedRetained = ids();
  playlist.removeClip(1);
  out.unchartedRemoved = ids();

  // -- an UNCHARTED clip removal must reach disk on its own ------------------
  // The orphaned-record case this repair exists for emits no play event, so it
  // rode no autosave: closing the app resurrected the record and the mismatch.
  {
    seed({
      clips: ['c1', 'c2'], plays: [play(1, 'c1')],
      playlistClips: [
        { id: 1, name: 'c1', clipPath: 'c1', playId: 1, file: null, assetUrl: 'blob:c1', objectUrl: null, duration: 5 },
        { id: 2, name: 'c2', clipPath: 'c2', playId: null, file: null, assetUrl: 'blob:c2', objectUrl: null, duration: 5 },
      ],
    });
    const realCommit = st._commitAndPersist;
    let commits = 0;
    let committedAt = null;
    st._commitAndPersist = function () { commits++; committedAt = st._buildClipIndex().map(c => c.clipPath); };
    clearTimeout(st.autoSaveTimer); st.autoSaveTimer = null;
    playlist.removeClip(1);                         // the clip with NO play
    out.unchartedArmedSave = st.autoSaveTimer != null;
    out.unchartedEmittedPlayDeleted = false;        // nothing to emit; that is the point
    await new Promise(r => setTimeout(r, 1200));    // let the real debounce fire
    out.unchartedCommits = commits;
    out.unchartedCommittedIndex = committedAt;
    st._commitAndPersist = realCommit;
    clearTimeout(st.autoSaveTimer); st.autoSaveTimer = null;
  }

  // -- Undo restores a LOADED playlist clip, not just its play ---------------
  {
    const vcReal = { setSrc: app.vc?.setSrc, setLoad: app.vc?._setLoadState };
    if (app.vc) {
      app.vc.setSrc = () => {};
      app.vc._setLoadState = () => {};
    }
    // `clipId` is what makes deleteCurrentPlay take its PLAYLIST branch, exactly
    // as loading film sets it; without it the single-video branch runs and the
    // clip is never offered to the playlist at all.
    const backed = (id, clip, clipId) => ({ ...play(id, clip), clipId });
    seed({
      clips: ['c1', 'c2', 'c3'],
      plays: [backed(1, 'c1', 1), backed(2, 'c2', 2), backed(3, 'c3', 3)],
      playlistClips: [
        { id: 1, name: 'c1', clipPath: 'c1', playId: 1, file: { name: 'c1.mp4' }, assetUrl: null, objectUrl: 'blob:keep-1', duration: 5 },
        { id: 2, name: 'c2', clipPath: 'c2', playId: 2, file: null, assetUrl: 'blob:c2', objectUrl: null, duration: 5 },
        { id: 3, name: 'c3', clipPath: 'c3', playId: 3, file: null, assetUrl: 'blob:c3', objectUrl: null, duration: 5 },
      ],
    });
    playlist.activeClipIndex = 2;
    tagger.currentPlayId = 1;
    const removedRef = playlist.clips[0];
    await tagger.deleteCurrentPlay();               // takes the playlist branch
    out.undoClipAfterDelete = playlist.clips.map(c => c.clipPath);
    out.undoIndexAfterDelete = ids();
    out.undoStashSize = playlist._undoClips.size;
    out.selectionAfterDelete = tagger.currentPlayId;
    const didUndo = app.history?.undo?.();
    out.undoClipReturned = didUndo === true;
    out.undoClipAfterUndo = playlist.clips.map(c => c.clipPath);
    // The selection is History's. switchToClip() selects whatever clip it loads,
    // so the reconcile must land on the RESTORED play, not the adjacent clip
    // that happened to be active after the deletion.
    out.undoSelection = tagger.currentPlayId;
    out.undoActiveClip = playlist.clips[playlist.activeClipIndex]?.clipPath || '';
    out.undoFormPlay = tagger.getPlay(tagger.currentPlayId)?.clipPath || '';
    out.undoClipPlayable = playlist.clips[0]
      ? !!(playlist.clips[0].assetUrl || playlist.clips[0].objectUrl || playlist.clips[0].file) : false;
    // `objectUrl` is a recreatable CACHE, not the clip's playability:
    // `_releaseObjectUrlsExcept` revokes it for any clip that is not the active
    // or preloaded one as a standing memory policy, and `_sourceForClip`
    // recreates it from `clip.file` on demand. So the invariant that matters is
    // that the stash returns the SAME clip object with its source intact.
    out.undoClipIsSameObject = playlist.clips[0] === removedRef;
    out.undoClipSource = playlist.clips[0]
      ? !!(playlist.clips[0].assetUrl || playlist.clips[0].file) : false;
    out.undoIndexAfterUndo = ids();
    out.undoPlaysAfterUndo = tagger.plays.map(p => p.id);
    // Redo takes both away again, so the durable record agrees either way.
    const didRedo = app.history?.redo?.();
    out.redoReturned = didRedo === true;
    out.redoClips = playlist.clips.map(c => c.clipPath);
    out.redoIndex = ids();
    // Redo restores the snapshot the deletion produced, whose selection is
    // cleared, so the neighbouring clip's own play is the honest selection here.
    out.redoSelection = tagger.currentPlayId;
    out.redoSelectionSurvives = (tagger.plays || []).some(p => p.id === tagger.currentPlayId);
    out.redoActiveClip = playlist.clips[playlist.activeClipIndex]?.clipPath || '';
    out.redoSelectedClip = tagger.getPlay(tagger.currentPlayId)?.clipPath || '';
    // The stash belongs to the outgoing game: a switch clears it, so Undo can
    // never inject a clip into a different game's playlist.
    playlist.reset();
    out.stashClearedByReset = playlist._undoClips.size;
    if (app.vc) {
      if (vcReal.setSrc) app.vc.setSrc = vcReal.setSrc;
      if (vcReal.setLoad) app.vc._setLoadState = vcReal.setLoad;
    }
  }

  // -- persistence / reopen --------------------------------------------------
  seed({ clips: ['c1', 'c2', 'c3'], plays: [play(1, 'c1'), play(2, 'c2')], playlistClips: [] });
  tagger.currentPlayId = 2;
  await tagger.deleteCurrentPlay();
  st.commitActive();
  const persisted = JSON.parse(JSON.stringify(node()));
  out.persisted = (persisted.clipRefs || []).map(r => r.originalRelativePath);
  // Reopen: the removal set is per game and must start empty, and the reopened
  // index must be exactly what was persisted - not pruned again, not restored.
  store.data.games[0] = persisted;
  st._loadActiveGame({ renderGames: false });
  out.reopenRemovedSetEmpty = st._removedClipIds.size === 0;
  out.reopened = ids();

  // -- season isolation ------------------------------------------------------
  seed({ seasonId: 'A', clips: ['c1', 'c2'], plays: [play(1, 'c1'), play(2, 'c2')], playlistClips: [] });
  tagger.currentPlayId = 1;
  await tagger.deleteCurrentPlay();
  out.isolationA = ids();
  // A DIFFERENT season, same game id and same clip identities. The removal
  // recorded above must not follow it.
  seed({ seasonId: 'B', clips: ['c1', 'c2'], plays: [play(1, 'c1'), play(2, 'c2')], playlistClips: [] });
  out.isolationB = ids();
  // And a cross-game serialize can never inherit another game's film index.
  st._loadedGameId = 'some-other-game';
  out.crossGamePrior = st._priorClipRefs().length;
  st._loadedGameId = 'g1';

  // -- film-health set equality, on a stub backend ---------------------------
  const linkedBackend = files => ({
    currentId: 'A', supportsFilm: () => true, supportsLinkedFilm: () => true,
    getLibraryRoot: () => 'D:/root',
    linkedGameDir: async dir => `D:/root/${dir}`,
    isLinkedDirAllowed: () => true,
    listLinkedFilm: async () => files.map(name => ({ name: `${name}.mp4`, path: `${name}.mp4` })),
    listFilmFiles: async () => files.map(name => ({ name: `${name}.mp4`, path: `${name}.mp4` })),
  });
  const linkedGame = clips => ({
    id: 'g1', filmMode: 'linked', filmDir: 'Week 1', isMultiClip: true,
    clipRefs: clips.map(ref), plays: clips.map((c, i) => play(i + 1, c)),
  });
  const health = async (clips, files) => {
    store.backend = linkedBackend(files);
    return app.workspace.filmHealth(linkedGame(clips), 'A');
  };
  out.equal = await health(['c1', 'c2'], ['c1', 'c2']);
  out.appOnly = await health(['c1', 'c2'], ['c1']);
  out.folderOnly = await health(['c1'], ['c1', 'c2']);
  out.bothWays = await health(['c1', 'c2'], ['c1', 'c3']);
  // Managed film is app-owned storage, so an extra file there is not a
  // coach-facing mismatch. Its one-way rule is unchanged.
  store.backend = linkedBackend(['c1', 'c2']);
  out.managedExtra = await app.workspace.filmHealth({
    id: 'g1', filmMode: 'managed', isMultiClip: true,
    clipRefs: [ref('c1')], plays: [play(1, 'c1')],
  }, 'A');

  // -- Home / game / library agreement on the same result --------------------
  const home = app.homeScreen;
  const homeOriginal = home._state;
  home._state = { ...home._state, filmHealth: { g1: out.folderOnly }, selectedGameId: 'g1' };
  out.homeRow = home.rowFilmView('g1');
  out.homeFact = home.filmFactView('g1');
  home._state = homeOriginal;
  store.backend = linkedBackend(['c1', 'c2']);
  out.libraryAggregate = await app.teamHubScreen._aggregateFilm([linkedGame(['c1'])], 'A');

  // restore
  store.data = original.data; store.currentSeasonId = original.seasonId; store.backend = original.backend;
  tagger.plays = original.plays; tagger.currentPlayId = original.currentPlayId;
  tagger._confirmDialog = original.confirm; tagger.toast = original.toast;
  if (playlist) { playlist.clips = original.clips || []; playlist.activeClipIndex = original.activeClipIndex; }
  if (app.vc && original.unload) app.vc.unloadVideo = original.unload;
  st._loadedGameId = original.loadedGameId;
  st._removedClipIds = new Set();
  return out;
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n-- the durable clip index retains the game\'s own record --');
ok(same(result.unloadedRetains, ['c1', 'c2', 'c3']),
  'An unloaded game keeps every clip it recorded, not just its charted ones', result.unloadedRetains);
ok(same(result.unloadedCommitted, ['c1', 'c2', 'c3']),
  'Committing an unloaded game persists that full record', result.unloadedCommitted);

console.log('\n-- a deliberate in-app deletion removes the durable identity --');
ok(same(result.unloadedDeleted, ['c2']) && same(result.unloadedDeletedPlays, [2]),
  'Deleting a play with NO film loaded drops its clip identity', [result.unloadedDeleted, result.unloadedDeletedPlays]);
ok(same(result.unloadedDeletedCommitted, ['c2']),
  'That removal is what gets persisted, not the retained record', result.unloadedDeletedCommitted);
ok(same(result.loadedDeleted, ['c2']) && same(result.loadedDeletedPlays, [2]),
  'Deleting a play WITH film loaded drops its clip identity through the playlist', [result.loadedDeleted, result.loadedDeletedPlays]);
ok(same(result.unchartedRetained, ['c1', 'c2']),
  'A loaded folder video with no play is still part of the game\'s record', result.unchartedRetained);
ok(same(result.unchartedRemoved, ['c1']),
  'Removing that uncharted clip in the app drops it too', result.unchartedRemoved);

console.log('\n-- an uncharted clip removal is persisted on its own --');
ok(result.unchartedArmedSave,
  'Removing a clip with no play arms the durable save', result.unchartedArmedSave);
ok(result.unchartedCommits === 1,
  'That save actually fires — closing the app can no longer resurrect the record', result.unchartedCommits);
ok(same(result.unchartedCommittedIndex, ['c1']),
  'The write it performs is the one without the removed clip', result.unchartedCommittedIndex);

console.log('\n-- Undo restores the loaded clip, not just its play --');
ok(same(result.undoClipAfterDelete, ['c2', 'c3']) && same(result.undoIndexAfterDelete, ['c2', 'c3']),
  'Deleting a play in the playlist removes its clip and its record',
  [result.undoClipAfterDelete, result.undoIndexAfterDelete]);
ok(result.undoStashSize === 1, 'The removed clip is held for Undo rather than destroyed', result.undoStashSize);
ok(result.undoClipReturned && same(result.undoClipAfterUndo, ['c1', 'c2', 'c3']),
  'Undo puts the live clip back at its original position', result.undoClipAfterUndo);
ok(result.undoClipPlayable, 'The restored clip is still playable, not a revoked shell');
ok(result.undoClipIsSameObject,
  'Undo returns the very clip that was removed, not a reconstruction', result.undoClipIsSameObject);
ok(result.undoClipSource,
  'The restored clip still carries the source its URL is rebuilt from', result.undoClipSource);
ok(same(result.undoIndexAfterUndo, ['c1', 'c2', 'c3']) && same(result.undoPlaysAfterUndo, [1, 2, 3]),
  'The durable record comes back with it', [result.undoIndexAfterUndo, result.undoPlaysAfterUndo]);
ok(result.undoSelection === 1,
  'Undo selects the play it restored, not the adjacent one', [result.selectionAfterDelete, result.undoSelection]);
ok(result.undoActiveClip === 'c1',
  'The active clip is the restored play\'s own clip, so film and selection agree', result.undoActiveClip);
ok(result.undoFormPlay === 'c1',
  'The tag form holds that same restored play', result.undoFormPlay);
ok(result.redoReturned && same(result.redoClips, ['c2', 'c3']) && same(result.redoIndex, ['c2', 'c3']),
  'Redo takes the clip and its record away again', [result.redoClips, result.redoIndex]);
ok(result.redoSelectionSurvives && result.redoSelection !== 1
  && result.redoSelectedClip === result.redoActiveClip,
  'Redo leaves a surviving play selected, on that play\'s own clip',
  [result.redoSelection, result.redoSelectedClip, result.redoActiveClip]);
ok(result.stashClearedByReset === 0,
  'A game switch clears the stash, so Undo cannot cross into another game', result.stashClearedByReset);

console.log('\n-- retention where something still needs the clip --');
ok(same(result.sharedAfterDelete, ['c1']) && same(result.sharedPlaysLeft, [2]),
  'A clip two plays share survives one of them being deleted', [result.sharedAfterDelete, result.sharedPlaysLeft]);
ok(result.undoReturned && same(result.afterUndo, ['c1', 'c2']) && same(result.afterUndoPlays, [1, 2]),
  'Undo restores the play and its clip identity comes back with it',
  [result.undoReturned, result.beforeUndo, result.afterUndo]);

console.log('\n-- persistence, reopen and isolation --');
ok(same(result.persisted, ['c1', 'c3']),
  'A reopened game reads back exactly the clips the deletion left', result.persisted);
ok(result.reopenRemovedSetEmpty, 'Reopening a game starts with no pending removals');
ok(same(result.reopened, ['c1', 'c3']),
  'Reopening neither prunes further nor resurrects the removed clip', result.reopened);
ok(same(result.isolationA, ['c2']) && same(result.isolationB, ['c1', 'c2']),
  'A removal in one season never follows the same clip id into another', [result.isolationA, result.isolationB]);
ok(result.crossGamePrior === 0,
  'A serialize while the tagger holds another game inherits no film index', result.crossGamePrior);

console.log('\n-- linked clip sets are compared in BOTH directions --');
ok(result.equal.state === 'linked' && result.equal.ready && result.equal.missing === 0 && result.equal.extra === 0,
  'Equal sets are no error', result.equal);
ok(result.appOnly.state === 'missing' && result.appOnly.missing === 1 && result.appOnly.extra === 0
  && result.appOnly.detail === 'clip-set-app-only',
  'A clip the game records and the folder lacks is a mismatch', result.appOnly);
ok(result.folderOnly.state === 'mismatch' && result.folderOnly.extra === 1 && result.folderOnly.missing === 0
  && result.folderOnly.detail === 'clip-set-folder-only' && !result.folderOnly.ready,
  'A folder video the game has no record of is a mismatch', result.folderOnly);
ok(result.bothWays.state === 'mismatch' && result.bothWays.missing === 1 && result.bothWays.extra === 1
  && result.bothWays.detail === 'clip-set-both',
  'Both directions at once are reported as both', result.bothWays);
ok(result.folderOnly.label === 'Film does not match folder',
  'The mismatch names the folder rather than claiming film is missing', result.folderOnly.label);
ok(result.managedExtra.state === 'managed' && result.managedExtra.ready && result.managedExtra.extra === 0,
  'Managed film keeps its one-way rule - app-owned storage, not a coach folder', result.managedExtra);

console.log('\n-- Home, game and library agree on one result --');
ok(result.homeRow.text === 'Film does not match folder' && result.homeRow.cls === 'ws-fact-warn',
  'The Home game row shows the mismatch', result.homeRow);
ok(result.homeFact.text === 'Film does not match folder' && result.homeFact.cls === 'ws-fact-warn',
  'The selected-game film fact shows the same mismatch', result.homeFact);
ok(result.libraryAggregate.state === 'partial' && result.libraryAggregate.label === '0 of 1 game linked',
  'The library counts a mismatched game as not linked', result.libraryAggregate);

// The Settings film table maps state to its own short status; a state it does
// not name would silently read "No film", which is a different claim.
{
  const settings = source('native-settings.jsx');
  ok(/health\.state === 'mismatch'/.test(settings),
    'The Settings film table names the mismatch state rather than falling through');
  const storageSrc = source('storage.js');
  ok(/forgetClipIdentity\(identity\)/.test(storageSrc),
    'The durable clip index owns the removal signal');
  ok(/this\._removedClipIds = new Set\(\);/.test(storageSrc) && (storageSrc.match(/_removedClipIds = new Set\(\)/g) || []).length >= 2,
    'The removal set is reset per game, like undo history');
  ok(/window\.app\?\.storage\?\.forgetClipIdentity\?\.\(/.test(source('playlist-manager.js'))
    && /window\.app\?\.storage\?\.forgetClipIdentity\?\.\(/.test(source('play-tagger.js')),
    'Both deliberate-deletion paths signal the removal');
  ok(!/deleteFilm|fs\.remove|unlink/.test(source('playlist-manager.js')),
    'Removing a clip record never reaches a file-deleting API');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
