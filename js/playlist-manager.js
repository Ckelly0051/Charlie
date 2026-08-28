import { planClipMatch } from './clip-identity.js';

/**
 * PlaylistManager - Manages multiple video clips where each clip is one play.
 *
 * Game film is typically recorded play-by-play as individual clips, not as one
 * continuous video. This module handles:
 * - Loading multiple video files at once (multi-select or folder drop)
 * - Maintaining an ordered playlist of clips
 * - Navigating between clips (prev/next, click-to-select)
 * - Auto-creating a play entry in PlayTagger for each loaded clip
 * - Syncing the active clip with the video player
 */
export class PlaylistManager {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.listeners = {};

    // Each entry: { id, file: File|null, name: string, assetUrl: string|null, objectUrl: string|null, duration: number|null, playId: number|null }
    this.clips = [];
    this.activeClipIndex = -1;

    this.playlistEl = document.getElementById('playlistItems');
    this.clipCountEl = document.getElementById('clipCount');
    this.btnAddClips = document.getElementById('btnAddClips');
    this.clipFileInput = document.getElementById('clipFileInput');
    this.btnPrevClip = document.getElementById('btnPrevClip');
    this.btnNextClip = document.getElementById('btnNextClip');
    this.clipIndicator = document.getElementById('clipIndicator');

    this._nextClipId = 1;
    this._nextPreloadEl = null;
    this._nextPreloadIndex = -1;

    this._bindEvents();
  }

  _bindEvents() {
    // Add clips button
    this.btnAddClips?.addEventListener('click', () => {
      this.clipFileInput.click();
    });

    this.clipFileInput?.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.addFiles(Array.from(e.target.files));
        // Reset so the same files can be re-selected if needed
        e.target.value = '';
      }
    });

    // Prev/next clip
    this.btnPrevClip?.addEventListener('click', () => this.prevClip());
    this.btnNextClip?.addEventListener('click', () => this.nextClip());

    // Drop handling is centralized in VideoController → files-selected → App.
    // No duplicate handler here — that caused double-adds.
  }

  /**
   * Add multiple video files to the playlist.
   * Sorts them naturally by filename.
   */
  async addFiles(files) {
    // Sort files naturally by folder path + name (play_01, play_02, etc.).
    const sorted = files.slice().sort((a, b) =>
      this._fileIdentity(a).localeCompare(this._fileIdentity(b), undefined, { numeric: true, sensitivity: 'base' }));

    // A file whose path identity already matches a LIVE clip is a duplicate. The coach
    // chooses (Windows-conflict-dialog style): SKIP it — re-add a folder and
    // import only what's new — or RE-LINK it: repoint the existing (possibly
    // tagged) play at the freshly-selected file and refresh its video, keeping
    // the tags. Cross-session re-link of SAVED plays (stale/null clipId) stays
    // automatic below and needs no prompt.
    const liveByIdentity = new Map(this.clips.map(c => [this._clipIdentity(c), c]));
    const dups = sorted.filter(f => liveByIdentity.has(this._fileIdentity(f)));
    const fresh = sorted.filter(f => !liveByIdentity.has(this._fileIdentity(f)));

    let relinkDups = false;
    if (dups.length) {
      const choice = await this.tagger._choiceDialog(
        `${dups.length} of these ${sorted.length} clip${sorted.length === 1 ? '' : 's'} ` +
        `${dups.length === 1 ? 'is' : 'are'} already in this game` +
        (fresh.length ? `, ${fresh.length} ${fresh.length === 1 ? 'is' : 'are'} new. ` : '. ') +
        `Skip the duplicates and add only what's new, or re-link them to your existing ` +
        `plays (refreshes the video, keeps your tags)?`,
        [
          { key: 'skip', label: fresh.length ? `Skip dupes · add ${fresh.length} new` : 'Skip (nothing new)', variant: 'btn-accent' },
          { key: 'relink', label: 'Re-link duplicates' },
          { key: 'cancel', label: 'Cancel' },
        ]);
      if (!choice || choice === 'cancel') return;
      relinkDups = choice === 'relink';
    }

    const liveIds = new Set(this.clips.map(c => c.id));
    const candidates = fresh.map(file => ({
      file,
      name: this._displayName(file),
      clipPath: this._fileIdentity(file),
      catalogClipId: file.catalogClipId || null,
      objectUrl: null,
      duration: null,
      playId: null
    }));

    // Plan the relink before mutating clips, plays, or durable film. When a
    // tagged game has orphaned saved film and only some selected files match,
    // treating every remainder as a new play silently creates ghost plays.
    // Make that destructive interpretation an explicit coach choice instead.
    const primaries = this._savedRelinkPrimaries(liveIds);
    const plan = planClipMatch(primaries, candidates);
    let acceptedIndexes = candidates.map((_, i) => i);
    if (primaries.length && plan.unmatchedClips.length) {
      const matchedCount = plan.matches.length;
      const unmatchedCount = plan.unmatchedClips.length;
      const choice = await this.tagger._choiceDialog(
        `${matchedCount} of ${candidates.length} selected clip${candidates.length === 1 ? '' : 's'} ` +
        `${matchedCount === 1 ? 'matches' : 'match'} saved film. ${unmatchedCount} ` +
        `${unmatchedCount === 1 ? 'clip does' : 'clips do'} not match this game's saved plays. ` +
        `Use only the matched film to keep existing tags safe, or intentionally add the unmatched film as new plays?`,
        [
          { key: 'matched', label: matchedCount ? `Use ${matchedCount} matched only` : 'Choose another folder', variant: 'btn-accent' },
          { key: 'new', label: `Add ${unmatchedCount} as new ${unmatchedCount === 1 ? 'play' : 'plays'}` },
          { key: 'cancel', label: 'Cancel' },
        ]);
      if (!choice || choice === 'cancel' || (choice === 'matched' && !matchedCount)) return;
      if (choice === 'matched') {
        const matched = new Set(plan.matches.map(match => match.clipIndex));
        acceptedIndexes = acceptedIndexes.filter(index => matched.has(index));
      }
    }

    // Re-link live duplicates only after every safety prompt has completed, so
    // Cancel is a true no-op (including no URL/file mutation).
    if (relinkDups) {
      let refreshActive = false;
      for (const f of dups) {
        const clip = liveByIdentity.get(this._fileIdentity(f));
        if (!clip) continue;
        if (clip.objectUrl) { try { URL.revokeObjectURL(clip.objectUrl); } catch (e) {} }
        clip.file = f; clip.objectUrl = null; clip.assetUrl = null;
        clip.name = this._displayName(f);
        clip.clipPath = this._fileIdentity(f);
        if (this.clips[this.activeClipIndex] === clip) refreshActive = true;
      }
      if (refreshActive && this.activeClipIndex >= 0) this.switchToClip(this.activeClipIndex);
    }

    const newClips = acceptedIndexes.map(index => {
      const clip = { id: this._nextClipId++, ...candidates[index] };
      this.clips.push(clip);
      return clip;
    });
    const acceptedFiles = newClips.map(clip => clip.file);

    const relinked = this._relinkSavedPlays(newClips, liveIds);

    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();

    // Persist genuinely-new film to the desktop library through the single
    // choke point (App wires this to storage.importFilm). BOTH the top-bar
    // picker and the Playlist-panel "Add Clips" button funnel through addFiles,
    // so wiring the hook here means no add path can skip persistence — the panel
    // path used to bypass importFilm entirely, so its clips vanished on reopen.
    // The hook no-ops on the browser build and skips linked games (never copied).
    if (this.onFilmFiles && acceptedFiles.length) { try { this.onFilmFiles(acceptedFiles); } catch (e) {} }

    // Auto-create play entries for each new clip. MUST be awaited: it probes
    // durations asynchronously, THEN pushes plays to this.tagger.plays — if the
    // caller (or a game switch) proceeds before it finishes, a late push lands
    // the new clip's play in the WRONG game (the cross-game corruption the
    // integrity fuzzer caught under load). Awaiting makes addFiles atomic for
    // its callers (e.g. the desktop importFilm persist path commits after).
    await this._autoCreatePlays();

    // If nothing is playing, activate the first clip — except after a save
    // re-link, where the saved current play's clip is where the coach was.
    if (this.activeClipIndex === -1) {
      const cur = relinked ? this.tagger.getCurrentPlay() : null;
      if (cur && cur.clipId != null && this.clips.some(c => c.id === cur.clipId)) {
        this.switchToClipByPlayId(cur.id);
      } else if (this.clips.length) {
        this.switchToClip(0);
      }
    } else {
      this._preloadNext(this.activeClipIndex);
    }

    if (relinked) this.tagger.toast?.(`Re-linked ${relinked} clip${relinked === 1 ? '' : 's'} to your saved plays`);
    if (relinkDups) this.tagger.toast?.(`Re-linked ${dups.length} duplicate${dups.length === 1 ? '' : 's'} — tags kept`);
    else if (dups.length) this.tagger.toast?.(`Skipped ${dups.length} clip${dups.length === 1 ? '' : 's'} already loaded`);

    this._emit('clips-added', { count: acceptedFiles.length, total: this.clips.length });
  }

  /** One matcher row per saved clip. Extra marked plays within a stale clip
   * follow their primary play after relink instead of competing for files. */
  _savedRelinkPrimaries(liveIds) {
    const stale = id => id != null && !liveIds.has(id);
    const seenStaleIds = new Set();
    const primaries = [];
    for (const play of this.tagger.plays) {
      if (!this._playIdentity(play) || (play.clipId != null && !stale(play.clipId))) continue;
      if (play.clipId != null) {
        if (seenStaleIds.has(play.clipId)) continue;
        seenStaleIds.add(play.clipId);
      }
      primaries.push(play);
    }
    return primaries;
  }

  /**
   * Match incoming clips back to plays saved in a previous session, keyed by
   * clip path when present, with clip name as a legacy fallback. The first
   * orphaned play per identity is the auto-created whole-clip play; any extra
   * plays marked inside that clip share its stale clipId and follow it to
   * the new id. Returns how many clips were re-linked.
   */
  _relinkSavedPlays(newClips, liveIds) {
    const stale = id => id != null && !liveIds.has(id);
    // Orphaned saved plays: carried over from a previous session (clipId is null
    // or points at a clip that isn't live). These are what a folder re-add must
    // reconnect to — never duplicate.
    const orphans = this._savedRelinkPrimaries(liveIds);
    if (!orphans.length) return 0;

    // Snapshot original clipIds before mutating — new ids can numerically
    // collide with stale ones (both sequences start at 1).
    const origId = new Map(this.tagger.plays.map(p => [p, p.clipId]));
    const staleToNew = new Map();
    let relinked = 0;

    const link = (clip, primary) => {
      clip.playId = primary.id;
      // Reuse the saved play's end time so this clip skips the duration probe
      // (999 is the failed-probe sentinel — don't adopt it as a real length).
      if (primary.timestamp && primary.timestamp.end && primary.timestamp.end !== 999) {
        clip.duration = primary.timestamp.end;
      }
      if (stale(origId.get(primary))) staleToNew.set(origId.get(primary), clip.id);
      primary.clipId = clip.id;
      clip.catalogClipId = clip.catalogClipId || primary.catalogClipId || this._newCatalogClipId();
      primary.catalogClipId = clip.catalogClipId;
      primary.clipName = clip.name;
      primary.clipPath = clip.clipPath || clip.name;
      relinked++;
    };

    // The shared pure matcher owns every fallback tier: exact path, basename,
    // Windows `(n)` normalization, then deterministic order when counts agree.
    const plan = planClipMatch(orphans, newClips);
    for (const match of plan.matches) link(newClips[match.clipIndex], orphans[match.playIndex]);

    if (staleToNew.size) {
      for (const p of this.tagger.plays) {
        const o = origId.get(p);
        if (stale(o) && staleToNew.has(o) && p.clipId === o) p.clipId = staleToNew.get(o);
      }
    }
    return relinked;
  }

  async _autoCreatePlays() {
    let created = false;
    let firstNewId = null;
    const newClips = this.clips.filter(c => c.playId === null);
    // Create the plays SYNCHRONOUSLY — there must be NO await between deciding to
    // create them and pushing them into this.tagger.plays. _deserialize reassigns
    // tagger.plays to another game's array on a switch, so any yield here let a
    // late push land a clip's play in the WRONG game (cross-game corruption) OR,
    // if we aborted to avoid that, ORPHANED already-copied film with no play.
    // Pushing synchronously into the current game closes the window on both:
    // durations are unknown for a beat and get backfilled in the background below.
    // (Pinned by tools/e2e-addfiles-race.mjs + e2e-integrity.)
    for (const clip of newClips) {
      const play = {
        id: this.tagger.nextId++,
        // Unknown duration (not yet probed / corrupt clip) → large sentinel end,
        // so a cut-up doesn't instantly skip a play whose end would be 0. The
        // real duration is backfilled by _backfillDurations once it resolves.
        timestamp: { start: 0, end: clip.duration || 999 },
        tags: {
          down: '', distance: '', formation: '', qbAlignment: '', playCall: '', playCallId: '', playConcept: '', playType: '', runPass: '',
          defFront: '', coverage: '', coverageFamily: '', blitz: '', result: '', yardage: '',
          hash: '', custom: []
        },
        annotations: [],
        notes: '',
        clipName: clip.name,
        clipPath: clip.clipPath || clip.name,
        catalogClipId: clip.catalogClipId || (clip.catalogClipId = this._newCatalogClipId()),
        clipId: clip.id
      };

      this.tagger.plays.push(play);
      clip.playId = play.id;
      created = true;
      if (firstNewId === null) firstNewId = play.id;
    }

    // Backfill real durations in the background — the plays already exist in the
    // correct game, so this can never misplace or lose them.
    this._backfillDurations(newClips);

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
    // Plays were pushed directly (not via tagger.createPlay), so listeners —
    // the Film Room grid, the play strip — only hear about them via this emit
    // (same pattern as the CSV import path in storage.js).
    if (created) this.tagger._emit('play-created');
    // Land ready to tag: select the first new play so the selector and the
    // tag form reflect clip 1 (otherwise the form keeps the PREVIOUS game's
    // chips lit and taps edit nothing until a play is picked by hand).
    // Only when nothing is selected — adding clips mid-session must not
    // steal the coach's current play.
    if (created && !this.tagger.getCurrentPlay()) {
      this.tagger.selectPlay(firstNewId);
    }
  }

  /** Probe clip durations in the background (capped pool) and write the real end
   *  time onto the already-created plays. Fire-and-forget: the plays exist in the
   *  correct game regardless, so a game switch mid-probe can't misplace them —
   *  at worst a play keeps its sentinel end until the coach reopens/repairs. */
  _backfillDurations(clips) {
    const POOL = 8;
    let next = 0;
    const worker = async () => {
      while (next < clips.length) {
        const clip = clips[next++];
        const source = clip.assetUrl || clip.file;
        if (!source) continue;
        const dur = await this._probeDuration(source);
        if (dur && dur > 0) {
          clip.duration = dur;
          const play = this.tagger.plays.find(p => p.clipId === clip.id);
          if (play && play.timestamp && (!play.timestamp.end || play.timestamp.end === 999)) {
            play.timestamp.end = dur;
          }
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(POOL, clips.length) }, worker)).catch(() => {});
  }

  _probeDuration(source) {
    return new Promise((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      const isUrl = typeof source === 'string';
      const url = isUrl ? source : URL.createObjectURL(source);
      // No crossOrigin: a detached metadata probe never touches the canvas,
      // and the attribute makes the probe fail when CORS headers are absent.
      tempVideo.src = url;
      tempVideo.addEventListener('loadedmetadata', () => {
        const dur = tempVideo.duration;
        if (!isUrl) URL.revokeObjectURL(url);
        tempVideo.removeAttribute('src');
        tempVideo.load();
        resolve(dur);
      });
      tempVideo.addEventListener('error', () => {
        if (!isUrl) URL.revokeObjectURL(url);
        resolve(0);
      });
    });
  }

  async rehydrateFromDisk(diskFiles, plays) {
    // Rehydration is a replacement (reopen or managed -> linked), never an
    // append. Keeping old live clips here produces duplicate playlist entries.
    this.reset();
    const sorted = diskFiles.slice().sort((a, b) =>
      String(a.path || a.name || '').localeCompare(String(b.path || b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));

    const entries = sorted.map(file => {
      const displayName = String(file.name || '').replace(/\.[^.]+$/, '');
      const clipPath = this._pathWithoutExt(file.path || file.name);
      return { id: this._nextClipId++, file: null, name: displayName, clipPath, catalogClipId: file.catalogClipId || null, assetUrl: file.url, objectUrl: null, duration: null, playId: null };
    });

    // One matcher row per original clip. Multiple marked regions can share a
    // clipId and must all follow the primary when that clip is rehydrated.
    const seenIds = new Set();
    const primaries = [];
    for (const play of (plays || [])) {
      if (!this._playIdentity(play)) continue;
      if (play.clipId != null) {
        if (seenIds.has(play.clipId)) continue;
        seenIds.add(play.clipId);
      }
      primaries.push(play);
    }
    const originalIds = new Map((plays || []).map(play => [play, play.clipId]));
    const staleToNew = new Map();
    const plan = planClipMatch(primaries, entries);
    for (const match of plan.matches) {
      const entry = entries[match.clipIndex];
      const play = primaries[match.playIndex];
      entry.playId = play.id;
      entry.catalogClipId = entry.catalogClipId || play.catalogClipId || this._newCatalogClipId();
      entry.duration = play.timestamp ? play.timestamp.end : null;
      if (originalIds.get(play) != null) staleToNew.set(originalIds.get(play), entry.id);
      play.clipId = entry.id;
      play.catalogClipId = entry.catalogClipId;
      play.clipName = entry.name;
      play.clipPath = entry.clipPath;
    }
    if (staleToNew.size) {
      for (const play of (plays || [])) {
        const oldId = originalIds.get(play);
        if (oldId != null && staleToNew.has(oldId)) play.clipId = staleToNew.get(oldId);
      }
    }

    for (const entry of entries) this.clips.push(entry);

    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
  }

  /**
   * Replace the live playlist with files matched to existing plays. This is for
   * film repair/migration only: it never creates or deletes plays, so tags stay
   * attached to the same play ids.
   */
  async repairWithMatches(matches) {
    this.reset();
    for (const m of (matches || [])) {
      const file = m.file;
      const play = m.play;
      const assetUrl = m.url || m.assetUrl || null;
      const refPath = m.path || m.clipPath || null;
      if ((!file && !assetUrl) || !play) continue;
      const clip = {
        id: this._nextClipId++,
        file: assetUrl ? null : file,
        name: this._displayName(refPath || file),
        clipPath: this._pathWithoutExt(refPath || this._fileIdentity(file)),
        catalogClipId: m.catalogClipId || play.catalogClipId || this._newCatalogClipId(),
        objectUrl: null,
        assetUrl,
        duration: (play.timestamp && play.timestamp.end && play.timestamp.end !== 999) ? play.timestamp.end : null,
        playId: play.id
      };
      play.clipId = clip.id;
      play.catalogClipId = clip.catalogClipId;
      play.clipName = clip.name;
      play.clipPath = clip.clipPath;
      this.clips.push(clip);
    }
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();

    const cur = this.tagger.getCurrentPlay();
    if (cur && cur.clipId != null && this.clips.some(c => c.id === cur.clipId)) {
      this.switchToClipByPlayId(cur.id);
    } else if (this.clips.length) {
      this.switchToClip(0);
    }
  }

  _clearNextPreload() {
    const media = this._nextPreloadEl;
    this._nextPreloadEl = null;
    this._nextPreloadIndex = -1;
    if (!media) return;
    try { media.pause(); } catch {}
    media.removeAttribute('src');
    try { media.load(); } catch {}
  }

  _sourceForClip(clip) {
    if (!clip) return null;
    if (clip.assetUrl) return clip.assetUrl;
    if (!clip.file) return null;
    if (!clip.objectUrl) clip.objectUrl = URL.createObjectURL(clip.file);
    return clip.objectUrl;
  }

  _releaseObjectUrlsExcept(indexes) {
    const keep = new Set(indexes);
    this.clips.forEach((clip, index) => {
      if (keep.has(index) || !clip.objectUrl) return;
      try { URL.revokeObjectURL(clip.objectUrl); } catch {}
      clip.objectUrl = null;
    });
  }

  _preloadNext(index) {
    this._clearNextPreload();
    const nextIndex = index + 1;
    const next = this.clips[nextIndex];
    if (!next) {
      this._releaseObjectUrlsExcept([index]);
      return;
    }
    const source = this._sourceForClip(next);
    if (!source) {
      this._releaseObjectUrlsExcept([index]);
      return;
    }
    const media = document.createElement('video');
    media.preload = 'auto';
    media.muted = true;
    media.playsInline = true;
    media.src = source;
    try { media.load(); } catch {}
    this._nextPreloadEl = media;
    this._nextPreloadIndex = nextIndex;
    this._releaseObjectUrlsExcept([index, nextIndex]);
  }
  /**
   * Switch the video player to show a specific clip by index.
   */
  switchToClip(index) {
    if (index < 0 || index >= this.clips.length) return;

    const clip = this.clips[index];
    const source = this._sourceForClip(clip);
    if (!source) return;
    this.activeClipIndex = index;

    if (clip.assetUrl) {
      if (clip.objectUrl) { URL.revokeObjectURL(clip.objectUrl); clip.objectUrl = null; }
      this.vc.currentFile = null;
      // VideoController.setSrc owns the crossOrigin-vs-corsBlocked decision (and
      // the load() call) so this path can't drift from the single-video one.
      this.vc.setSrc(source);
    } else {
      this.vc.currentFile = clip.file;
      this.vc.video.removeAttribute('crossorigin');
      this.vc.video.src = source;
      this.vc.video.load();
    }

    // Route through VideoController's own status seam -- fileLabel is optional
    // (deleted with #giLegacyEngineHost); currentFileName is the real owner.
    this.vc._setFilmStatus(clip.file ? clip.file.name : clip.name);
    this.vc.placeholder.classList.add('hidden');

    // Select the associated play in the tagger
    if (clip.playId !== null) {
      // Use internal method to avoid re-seeking since we just loaded
      this.tagger.currentPlayId = clip.playId;
      const play = this.tagger.getPlay(clip.playId);
      if (play) {
        this.tagger.playSelect.value = clip.playId;
        this.tagger._loadTagForm(play);
        this.tagger._updateTimeline();
        this.tagger._emit('play-selected', play);
      }
    }

    this._preloadNext(index);
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._emit('clip-switched', { index, clip });
  }

  nextClip() {
    if (this.activeClipIndex < this.clips.length - 1) {
      this.switchToClip(this.activeClipIndex + 1);
    }
  }

  prevClip() {
    if (this.activeClipIndex > 0) {
      this.switchToClip(this.activeClipIndex - 1);
    }
  }

  /**
   * Find the clip associated with a given play ID and switch to it.
   */
  switchToClipByPlayId(playId) {
    const index = this.clips.findIndex(c => c.playId === playId);
    if (index !== -1 && index !== this.activeClipIndex) {
      this.switchToClip(index);
    }
  }

  removeClip(index) {
    if (index < 0 || index >= this.clips.length) return;
    this._clearNextPreload();
    const wasActive = index === this.activeClipIndex;
    const clip = this.clips[index];

    // Remove the associated play
    const removedPlay = clip.playId !== null;
    if (removedPlay) {
      this.tagger.plays = this.tagger.plays.filter(p => p.id !== clip.playId);
      if (this.tagger.currentPlayId === clip.playId) {
        this.tagger.currentPlayId = null;
        this.tagger._clearTagForm();
      }
    }

    // Clean up URL
    if (clip.objectUrl) {
      URL.revokeObjectURL(clip.objectUrl);
      clip.objectUrl = null;
    }

    this.clips.splice(index, 1);

    // Adjust active index.
    if (this.clips.length === 0) {
      this.activeClipIndex = -1;
      this.vc.unloadVideo();
    } else if (index < this.activeClipIndex) {
      // Removed a clip before the active one: shift pointer, no reload needed.
      this.activeClipIndex -= 1;
    } else if (index === this.activeClipIndex) {
      // Removed the active clip: stay at this index, which now holds the NEXT
      // clip, so deleting flows forward. Clamp when we removed the last one.
      this.activeClipIndex = Math.min(index, this.clips.length - 1);
      this.switchToClip(this.activeClipIndex);
    }
    // index > activeClipIndex: the active clip's position is unchanged.
    if (this.clips.length && !wasActive) this._preloadNext(this.activeClipIndex);

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
    // The playlist panel's per-clip ✕ calls this directly (not through
    // tagger.deleteCurrentPlay), so the play removal must be announced here
    // or the Film Room grid keeps a ghost row.
    if (removedPlay) this.tagger._emit('play-deleted');
  }

  /**
   * Drop every clip (revoking object URLs) and reset the playlist UI. Used when
   * switching to a different game in the season so its clips don't linger.
   * Does not touch tagger.plays — the caller loads the new game's plays.
   */
  reset() {
    this._clearNextPreload();
    for (const clip of this.clips) {
      if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl);
      clip.objectUrl = null;
    }
    this.clips = [];
    this.activeClipIndex = -1;
    this._nextClipId = 1;
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
  }

  get hasClips() {
    return this.clips.length > 0;
  }

  get activeClip() {
    return this.clips[this.activeClipIndex] || null;
  }

  // --- UI ---

  _updatePlaylistUI() {
    if (!this.playlistEl) return;
    this.playlistEl.innerHTML = '';

    this.clips.forEach((clip, i) => {
      const item = document.createElement('div');
      item.className = 'playlist-item' + (i === this.activeClipIndex ? ' active' : '');
      item.dataset.index = i;

      const num = document.createElement('span');
      num.className = 'playlist-num';
      num.textContent = (i + 1);

      const name = document.createElement('span');
      name.className = 'playlist-name';
      name.textContent = clip.name;
      name.title = clip.file ? this._fileIdentity(clip.file) : (clip.clipPath || clip.name);

      const dur = document.createElement('span');
      dur.className = 'playlist-dur';
      dur.textContent = clip.duration ? this._fmt(clip.duration) : '--:--';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'playlist-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove clip';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeClip(i);
      });

      item.appendChild(num);
      item.appendChild(name);
      item.appendChild(dur);
      item.appendChild(removeBtn);

      item.addEventListener('click', () => this.switchToClip(i));

      this.playlistEl.appendChild(item);
    });
  }

  _updateClipIndicator() {
    if (!this.clipIndicator) return;
    if (this.clips.length === 0) {
      this.clipIndicator.textContent = '';
    } else {
      this.clipIndicator.textContent = `Clip ${this.activeClipIndex + 1}/${this.clips.length}`;
    }
  }

  _updateClipCount() {
    if (!this.clipCountEl) return;
    this.clipCountEl.textContent = `${this.clips.length} clip${this.clips.length !== 1 ? 's' : ''}`;
  }

  _fmt(sec) {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  _displayName(fileOrPath) {
    const raw = typeof fileOrPath === 'string' ? fileOrPath : (fileOrPath && fileOrPath.name) || '';
    const leaf = raw.split(/[\\/]/).pop() || raw;
    return this._pathWithoutExt(leaf);
  }

  _pathWithoutExt(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
  }

  _fileIdentity(file) {
    const raw = (file && (file.webkitRelativePath || file.relativePath || file.path || file.name)) || '';
    return this._pathWithoutExt(raw);
  }

  _clipIdentity(clip) {
    return (clip && (clip.clipPath || clip.name)) || '';
  }

  _playIdentity(play) {
    return (play && (play.clipPath || play.clipName)) || '';
  }

  _newCatalogClipId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `clip_${crypto.randomUUID()}`;
    return `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
