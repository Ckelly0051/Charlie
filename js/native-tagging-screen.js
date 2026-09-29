import { mountNativeTagging, unmountNativeTagging } from './native-tagging.jsx';
import { StatsEngine } from './stats-engine.js';
import { countedUnit } from './football-rules.js';
import { PenaltyModel } from './penalty-model.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PlayCallModel } from './play-call-model.js';
import { ChartingDetails } from './charting-details.js';
import { PlayDiagram } from './play-diagram.js';

/**
 * Native tag-form presentation.
 *
 * PlayTagger and BreakdownChartingService remain the behavior/data owners.
 * The native
 * view renders model state in Preact-owned markup (native-tagging.jsx) and
 * delegates explicit coach actions to those owners. Final Engine
 * Independence: this controller has no legacy DOM source to adopt/hide/
 * observe any more — PlayTagger writes a play from explicit values
 * (setTagValue / toggleTagValue), so a coach action reaches state
 * directly and this class republishes on the SAME domain events it always
 * subscribed to. There is nothing left to watch a hidden subtree for.
 */
export class NativeTaggingScreen {
  constructor(app) {
    this.app = app;
    this.tagger = app.tagger;
    // Elements a tagging view is attached to, most recent last: the Break Down
    // route's deck cell, and any standalone host mount() rendered into.
    this._hosts = [];
    this._ownRoots = [];
    this._listeners = new Set();
    this.activeRole = 'ballCarrier';
    this._publishQueued = false;
    this._saveConfirmed = false;
    this._saveTimer = null;
    // Collapsible fields (coach direction 2026-09-23): the custom Play Call and
    // the built-in Play Type lists fold independently. A view preference only,
    // so it lives beside the other Breakdown view settings in localStorage.
    this.collapsedFields = NativeTaggingScreen.readCollapsed();
    this._bindDomainEvents();
    // Formation/Backfield/Front vocabulary can change (Team & Film Settings)
    // while this form is already mounted and showing it, with no play-data
    // event to ride on -- CustomChips.onChange is the explicit republish
    // seam for exactly that case.
    this.app.customChips?.onChange?.(() => this._queuePublish());
  }

  static COLLAPSE_KEY = 'ffa_chart_collapsed_fields';
  static COLLAPSIBLE = Object.freeze(['playCall', 'playType']);
  static readCollapsed(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    let raw = null;
    try { raw = JSON.parse(storage?.getItem(NativeTaggingScreen.COLLAPSE_KEY) || 'null'); } catch (e) { raw = null; }
    return new Set(Array.isArray(raw) ? raw.filter(field => NativeTaggingScreen.COLLAPSIBLE.includes(field)) : []);
  }
  toggleFieldCollapsed(field) {
    if (!NativeTaggingScreen.COLLAPSIBLE.includes(field)) return false;
    if (this.collapsedFields.has(field)) this.collapsedFields.delete(field); else this.collapsedFields.add(field);
    try { localStorage.setItem(NativeTaggingScreen.COLLAPSE_KEY, JSON.stringify([...this.collapsedFields])); }
    catch (e) { console.error('Chart field collapse could not be saved', e); }
    this._queuePublish();
    return this.collapsedFields.has(field);
  }

  _bindDomainEvents() {
    ['play-selected', 'play-created', 'play-updated', 'play-deleted', 'plays-loaded']
      .forEach(event => this.tagger?.on(event, () => this._queuePublish()));
  }

  /** The element the current tagging view is attached to. */
  get host() { return this._hosts[this._hosts.length - 1] || null; }

  /** A standalone mount takes the view over from the Break Down route: one
   *  presentation at a time, as before the route owned its children. The
   *  route draws this screen's view only while this is false. */
  get standalone() { return this._ownRoots.length > 0; }
  _rerenderRoute() { this.app.breakdownWorkspace?._renderRoute?.(); }

  /** Standalone: render the form into a host this screen owns. The Break Down
   *  route renders the same component in its own tree. */
  mount(host) {
    if (!host) return false;
    if (this._hosts.includes(host)) return true;
    this._ownRoots.push(host);
    try {
      this._rerenderRoute();
      mountNativeTagging({ host, screen: this });
      return true;
    } catch (error) {
      unmountNativeTagging(host);
      this._ownRoots.splice(this._ownRoots.indexOf(host), 1);
      this._rerenderRoute();
      throw error;
    }
  }

  restore() {
    if (!this._ownRoots.length) return false;
    for (const host of this._ownRoots.splice(0)) unmountNativeTagging(host);
    this._rerenderRoute();
    return true;
  }

  /** A tagging view's layout effect and cleanup. */
  attachHost(host) {
    this._hosts.push(host);
    this._publish();
  }
  detachHost(host) {
    const index = this._hosts.indexOf(host);
    if (index >= 0) this._hosts.splice(index, 1);
    if (this._hosts.length) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._saveConfirmed = false;
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _queuePublish() {
    if (!this.host || this._publishQueued) return;
    this._publishQueued = true;
    queueMicrotask(() => {
      this._publishQueued = false;
      this._publish();
    });
  }

  _publish() {
    if (!this.host) return;
    const state = this.snapshot();
    this._listeners.forEach(listener => listener(state));
  }

  snapshot() {
    const gameInfo = this.app.storage?.gameInfo || {};
    const play = this.tagger?.getCurrentPlay?.() || null;
    const raw = play?.tags || {};
    const projected = play ? StatsEngine.proj(play) : {};
    const index = this.tagger?.plays?.findIndex(item => item.id === play?.id) ?? -1;
    const library = key => {
      const group = this.app.customChips?.library?.group?.(key);
      return group ? group.values.filter(value => group.enabled.includes(value)) : [];
    };
    // PlayDiagram.toDataURL is the same static renderer the legacy preview
    // canvas and the Call Sheet thumbnail already use — rendering to a fresh
    // detached canvas here instead of reading a persistent <canvas>
    // element's own .toDataURL() means the diagram no longer needs a
    // permanent DOM home. Called for every play with a selection (matching
    // the old preview canvas, which rendered the blank-field background even
    // with zero shapes) so this is a genuine no-op for display, not a
    // behavior change.
    let diagram = '';
    try { if (play) diagram = PlayDiagram.toDataURL(play.diagram || []); } catch {}
    const playbookCalls = this.app.playbook?.list?.() || [];
    const recentCalls = [];
    const seenCalls = new Set();
    for (const item of [...(this.tagger?.plays || [])].reverse()) {
      const name = String(item?.tags?.playCall || '').trim();
      const folded = name.toLowerCase();
      if (!name || seenCalls.has(folded)) continue;
      seenCalls.add(folded); recentCalls.push(name);
      if (recentCalls.length >= 6) break;
    }
    return {
      enabled: !!play, currentPlayId: play?.id ?? null,
      unit: play ? countedUnit(play) : (this.tagger?.defaultUnit || 'offense'),
      perspective: gameInfo.perspective || 'offense', direction: gameInfo.direction || '',
      progress: this.tagger?.progressText?.() || '0 / 0 tagged',
      values: { ...raw, ...projected, yardage: raw.yardage === '' || raw.yardage == null ? '' : String(Math.abs(Number(raw.yardage) || 0)) },
      libraries: {
        formationFamily:library('formationFamily'), backfield:library('backfield'), defFront:library('front'),
        coverage:library('coverage'), playType:library('playType'), blitz:library('blitz'),
      },
      chartingPresets: this.app.customChips?.library?.presets?.().filter(item => item.mode === (this.app.settingsScreen?.chartingPresetMode?.() || 'program')) || [],
      playbookCalls, recentCalls,
      appliedCallDefaults: raw.playCallDefaults && typeof raw.playCallDefaults === 'object' ? { ...raw.playCallDefaults } : {},
      players: { ...(raw.players || {}) }, grades: { ...(raw.grades || {}) }, notes: play?.notes || '',
      roster: (this.app.roster?.players || []).map(player => ({ ...player })), activeRole: this.app.roster?.activeRole || this.activeRole,
      customTags: Array.isArray(raw.custom) ? [...raw.custom] : [],
      customFields: (this.app.customFields?.defs || []).map(def => ({ ...def, value: raw.customFields?.[def.id] || '' })),
      penalties: PenaltyModel.normalizeList(play?.penalties),
      resultingSituation: PenaltyModel.normalizeSituation(play?.resultingSituation),
      special: SpecialTeamsModel.normalize(play?.specialTeams),
      templates: Object.keys(this.tagger?._templateStore?.() || {}).sort(),
      selectedTemplate: this.tagger?.selectedTemplate || '',
      canCopyPrevious: index > 0, canPrevious: index > 0,
      autoDD: !!this.tagger?.autoDD, carryScheme: !!this.tagger?.carryScheme, diagram,
      autoOcr: !!this.app.ocr?.autoOnPlayEnd, saveConfirmed: this._saveConfirmed,
      collapsed: Object.fromEntries(NativeTaggingScreen.COLLAPSIBLE.map(field => [field, this.collapsedFields.has(field)])),
    };
  }


  toggleField(key, value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play) return false;
    this._protectCallOverride(key);
    // Untoggling Fumble clears its recovery owner in the same write.
    if (key === 'result' && value === 'Fumble' && this.tagger.displayTagValue('result').split(/\s*\+\s*/).includes('Fumble')) play.tags.fumbleRecovery = '';
    // A tap that removes the Play Type opening populated details asks first.
    const outcome = this.tagger.requestTagValue(key, value, { toggle: true, play });
    if (outcome && typeof outcome.then === 'function') { outcome.then(() => this._queuePublish()); return outcome; }
    this._queuePublish(); return true;
  }
  setFumbleRecovery(value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play || !StatsEngine.hasResult(play, 'Fumble')) return false;
    const owner = ['subject', 'opponent', 'unknown'].includes(value) ? value : 'unknown';
    play.tags.fumbleRecovery = owner;
    this.tagger._emit('play-updated', play);
    this._queuePublish();
    return true;
  }
  setField(key, value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play) return false;
    this._protectCallOverride(key);
    // A change that removes the field opening populated details (Motion, or the
    // Play Direction a Gap sits under) asks first; declining changes nothing.
    const outcome = this.tagger.requestTagValue(key, value, { play });
    if (outcome && typeof outcome.then === 'function') { outcome.then(() => this._queuePublish()); return outcome; }
    this._queuePublish(); return true;
  }

  _protectCallOverride(key) {
    PlayCallModel.protectOverride(this.tagger?.getCurrentPlay?.(), key);
  }

  selectPlayCall(value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play) return false;
    const infer = playType => this.tagger?.constructor?.runPassForPlayType?.(playType);
    const write = () => {
      PlayCallModel.apply(play, value, this.app.playbook, infer);
      this.tagger._emit('play-updated', play);
      this._queuePublish();
      return true;
    };
    // A call that replaces the Direction, Motion or Play Type a charted Gap,
    // path or RPO detail sits under says what it clears and waits.
    const losses = PlayCallModel.losses(play, value, this.app.playbook, infer);
    if (!losses.length) return write();
    return this.tagger._confirmDialog(ChartingDetails.clearMessage(losses), 'Clear').then(ok => (ok ? write() : false));
  }

  editPlayCallLibrary(name = '') {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.app.settingsScreen?.openPlaybook?.({ name:String(name || '').trim(), returnFocus });
  }
  setPlayer(role, value) { if(!this.tagger?.setPlayerValue?.(role, value))return false; this.app.breakdownCharting?.syncSpecialist?.(role); this._queuePublish(); return true; }
  setGrade(role, value) { if(!this.tagger?.setGradeValue?.(role, value))return false; this._queuePublish(); return true; }
  setNotes(value) { const ok = this.app.notes?.setNotes?.(value); if (ok) this._queuePublish(); return !!ok; }
  addCustomTag(value) { const play=this.tagger?.getCurrentPlay?.(),clean=String(value||'').trim(); if(!play||!clean)return false; if(!Array.isArray(play.tags.custom))play.tags.custom=[]; if(!play.tags.custom.includes(clean))play.tags.custom.push(clean); this.tagger._emit('play-updated',play); return true; }
  removeCustomTag(index) { const play=this.tagger?.getCurrentPlay?.(); if(!play||!Array.isArray(play.tags.custom))return false; play.tags.custom.splice(index,1); this.tagger._emit('play-updated',play); return true; }
  setCustomField(id,value) { this.app.customFields?._write?.(id,value); this._queuePublish(); }
  openCustomFields() { return this.app.customFields?.openManager?.({ overlays: this.app.overlays, onSaved: () => { this._queuePublish(); this.app.overlays?.toast?.({ message: 'Custom fields saved', tone: 'success' }); } }); }
  openLibrary(group) { this.app.tagLibrarySettings?.open?.(group); }
  previous() { this.app.notes?.flush?.(); this.tagger.prevPlay(); this.app._autoPlayCurrent?.(); }
  saveNext() {
    this.app._advancePlay();
    this._saveConfirmed = true;
    clearTimeout(this._saveTimer);
    this._queuePublish();
    this._saveTimer = setTimeout(() => { this._saveConfirmed = false; this._queuePublish(); }, 650);
  }
  skip() { this.app._advancePlay({skip:true}); }
  // S7 demolition: every one of these now calls a real domain method directly
  // — no hidden checkbox, no synthetic click, no fake DOM event/target mock.
  setAutoDD(value) { const ok=this.tagger?.setAutoDD?.(value); if(ok)this._queuePublish(); return !!ok; }
  setCarryScheme(value) { const ok=this.tagger?.setCarryScheme?.(value); if(ok)this._queuePublish(); return !!ok; }
  addPenalty() { return this.app.breakdownCharting?.addPenalty?.() === true; }
  penaltyAction(index,field,value) { return this.app.breakdownCharting?.penaltyChip?.(index,field,value) === true; }
  penaltyInput(index,field,value) { return this.app.breakdownCharting?.penaltyInput?.(index,field,value) === true; }
  removePenalty(index) { return this.app.breakdownCharting?.removePenalty?.(index); }
  penaltySituation(field,value,checked=false) { return this.app.breakdownCharting?.penaltySituation?.(field,value,checked) === true; }
  setSpecialUnit(value) { return this.app.breakdownCharting?.setSpecialUnit?.(value); }
  specialAction(key,value) {
    const map={status:'stOutcome',score:'stScore',owner:'stOwner',recovery:'stRecovery',toggle:'stToggle',spot:'stSpotSide',tryAttempt:'stTryAttempt',tryResult:'stTryResult',tryEvent:'stTryEvent',tryTurnover:'stTryTurnover',tryScore:'stTryScore',returnAward:'stReturnAward'};
    const dataKey=map[key];
    return dataKey ? this.app.breakdownCharting?.specialAction?.(dataKey,value) === true : false;
  }
  specialInput(key,value) { return this.app.breakdownCharting?.specialInput?.(key,value) === true; }
  drawDiagram() { this.app.playDiagram?.openEditor?.(); }
  clearDiagram() { this.app.playDiagram?.clearCurrent?.(); }
  setScoreboardRegion() { this.app.ocr?.startRegionSelect?.(); }
  readScoreboard() { this.app.ocr?.readNow?.(); }
  setAutoOcr(value) { return this.app.ocr?.setAutoOcr?.(value); }
  // Final Engine Independence: opens the real native Auto-Detect operation/
  // state API (js/auto-detect-screen.js) as a visible overlay sheet -- no
  // hidden host, no synthetic click. The scan orchestration itself (progress,
  // settings, results, Review, Apply) lives in AutoDetectScreen; this is just
  // the entry point, matching every other screen.open() call in this file.
  runAutoDetect() { return this.app.autoDetectScreen?.open?.(); }
  newDrive() { return this.tagger?.newDrive?.(); }
  addNoteTimestamp() { return this.app.notes?.insertTimestamp?.(); }

  setActiveRole(role) { this.activeRole=role; this.app.roster.activeRole=role; this._queuePublish(); }
  quickPickPlayer(number) {
    const role=this.app.roster?.activeRole || this.activeRole, current=String(this.tagger?.getCurrentPlay?.()?.tags?.players?.[role]||'');
    if (this.app.roster?.multiRoles?.has(role)) {
      const values=new Set(current.match(/\d+/g)||[]);
      values.has(String(number)) ? values.delete(String(number)) : values.add(String(number));
      this.setPlayer(role,[...values].join(', '));
    } else this.setPlayer(role,String(number));
  }

  /** Chart's unit switch. The play's unit is written by PlayTagger.setPlayUnit,
   *  the same write the Film Room Unit column makes (coach, 2026-09-24: either
   *  view, equally weighted, last write wins). */
  setUnit(value) {
    if (!this.tagger?.setChartingUnit?.(value)) return false;
    this.activeRole = this.app.roster?.activeRole || this.activeRole;
    this._derivePerspective(value);
    this._queuePublish();
    return true;
  }

  /**
   * F2a — perspective is DERIVED, never asked for.
   *
   * Charting our own game, the perspective simply IS the unit: pick Defense and
   * you are looking at our defense. Charting an opponent against a third team,
   * the subject is the team being charted no matter which unit is selected. So
   * the only thing a coach ever had to decide is already decided at game setup,
   * and the per-play control was pure extra clicking.
   *
   * `scout` is therefore sticky: it is a property of the FILM, set when the game
   * is created, and a unit change must never silently turn opponent film into
   * our own game.
   */
  _derivePerspective(unit) {
    // fromUnit: the service refuses this while scouting, so a unit change can
    // never silently turn opponent film into one of our own games.
    return this.app.gameContext?.update({ perspective: unit }, { fromUnit: true }) === true;
  }

  copyPrevious() {
    if (!this.tagger?.getCurrentPlay?.()) return false;
    this.tagger.copyFromPrevious();
    this._queuePublish();
    return true;
  }

  applyChartingPreset(id) {
    const mode = this.app.settingsScreen?.chartingPresetMode?.() || 'program';
    const candidate = this.app.customChips?.library?.presets?.().find(item => item.id === id);
    if (!candidate || candidate.mode !== mode) return false;
    const preset = this.app.customChips?.library?.applyPreset?.(id);
    if (!preset) return false;
    this.app.customChips.reload();
    this.setUnit(preset.unit);
    this._queuePublish();
    return true;
  }

  applyTemplate(name) {
    if (!name || !this.tagger.applyTemplate(name)) return false;
    this._queuePublish();
    return true;
  }

  async saveTemplate() {
    if (!this.tagger?.getCurrentPlay?.()) return false;
    const name = await this.tagger.saveTemplate();
    this._queuePublish();
    return !!name;
  }

  async deleteTemplate(name) {
    if (!name) return false;
    const deleted = await this.tagger.deleteTemplate(name);
    this._queuePublish();
    return deleted;
  }

  setDirection(value) {
    if (!this.app.gameContext?.update({ direction: value })) return false;
    this.app._saveGameInfo?.();
    this._queuePublish();
    return true;
  }
}
