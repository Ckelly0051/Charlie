import { mountNativeTagging } from './native-tagging.jsx';
import { StatsEngine } from './stats-engine.js';
import { PenaltyModel } from './penalty-model.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PlayCallModel } from './play-call-model.js';

/**
 * S5c native tag-form presentation.
 *
 * PlayTagger and BreakdownForm remain the behavior/data owners. The native view
 * renders model state in Preact-owned markup and delegates explicit coach actions
 * to those owners. The compatibility source stays mounted off-screen until S7
 * removes #app; no coach-visible markup is copied from it.
 */
export class NativeTaggingScreen {
  constructor(app) {
    this.app = app;
    this.tagger = app.tagger;
    // S7 demolition: .tag-section's permanent authored home is
    // #giLegacyEngineHost, not #app (deleted). getElementById-style lookups
    // elsewhere in this file are unaffected — id lookups don't care where in
    // the document a node lives.
    this.source = document.querySelector('.tag-section');
    this.host = null;
    this._view = null;
    this._listeners = new Set();
    this._sourceState = null;
    this.activeRole = 'ballCarrier';
    this._observer = null;
    this._publishQueued = false;
    this._saveConfirmed = false;
    this._saveTimer = null;
    this._bindDomainEvents();
  }

  _bindDomainEvents() {
    ['play-selected', 'play-created', 'play-updated', 'play-deleted', 'plays-loaded']
      .forEach(event => this.tagger?.on(event, () => this._queuePublish()));
  }

  mount(host) {
    if (!host || !this.source) return false;
    if (this.host === host && this._view) return true;
    if (this.host) this.restore();
    this.host = host;
    this._sourceState = {
      style: this.source.getAttribute('style'),
      ariaHidden: this.source.getAttribute('aria-hidden'),
      nativeSource: this.source.getAttribute('data-native-tag-source'),
    };
    this.source.setAttribute('aria-hidden', 'true');
    this.source.setAttribute('data-native-tag-source', '');
    this.source.style.cssText += ';position:fixed!important;left:-100000px!important;top:0!important;width:560px!important;height:900px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;';
    try {
      this._observer = new MutationObserver(() => this._queuePublish());
      this._observer.observe(this.source, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'hidden', 'open', 'disabled', 'aria-pressed'],
      });
      this._view = mountNativeTagging({ host, screen: this });
      this._publish();
      return true;
    } catch (error) {
      this._observer?.disconnect();
      this._observer = null;
      this._restoreSource();
      this.host = null;
      this._view = null;
      throw error;
    }
  }

  restore() {
    if (!this.host) return false;
    this._observer?.disconnect();
    this._observer = null;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._saveConfirmed = false;
    this._view?.unmount?.();
    this._view = null;
    this._restoreSource();
    this.host = null;
    return true;
  }

  _restoreSource() {
    if (!this._sourceState || !this.source) return;
    const restore = (name, value) => value == null
      ? this.source.removeAttribute(name)
      : this.source.setAttribute(name, value);
    restore('style', this._sourceState.style);
    restore('aria-hidden', this._sourceState.ariaHidden);
    restore('data-native-tag-source', this._sourceState.nativeSource);
    if (this._sourceState.style == null) { this.source.style.cssText = ''; this.source.removeAttribute('style'); }
    this._sourceState = null;
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
    let diagram = '';
    try { diagram = document.getElementById('playDiagramPreview')?.toDataURL('image/png') || ''; } catch {}
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
      unit: raw.unit || this.tagger?.defaultUnit || 'offense',
      perspective: gameInfo.perspective || 'offense', direction: gameInfo.direction || '',
      progress: document.getElementById('tagProgressLabel')?.textContent || '0 / 0 tagged',
      values: { ...raw, ...projected, yardage: raw.yardage === '' || raw.yardage == null ? '' : String(Math.abs(Number(raw.yardage) || 0)) },
      libraries: { formation: library('formation'), backfield: library('backfield'), defFront: library('front') },
      playbookCalls, recentCalls,
      appliedCallDefaults: raw.playCallDefaults && typeof raw.playCallDefaults === 'object' ? { ...raw.playCallDefaults } : {},
      players: { ...(raw.players || {}) }, grades: { ...(raw.grades || {}) }, notes: play?.notes || '',
      roster: (this.app.roster?.players || []).map(player => ({ ...player })), activeRole: this.app.roster?.activeRole || this.activeRole,
      customTags: Array.isArray(raw.custom) ? [...raw.custom] : [],
      customFields: (this.app.customFields?.defs || []).map(def => ({ ...def, value: raw.customFields?.[def.id] || '' })),
      penalties: PenaltyModel.normalizeList(play?.penalties),
      resultingSituation: PenaltyModel.normalizeSituation(play?.resultingSituation),
      special: SpecialTeamsModel.normalize(play?.specialTeams),
      legacySpecial: !play?.specialTeams && !!(raw.stType || raw.kickOutcome || raw.scoreFor),
      templates: Object.keys(this.tagger?._templateStore?.() || {}).sort(),
      selectedTemplate: this.tagger?.templateSelect?.value || '',
      canCopyPrevious: index > 0, canPrevious: index > 0,
      autoDD: !!this.tagger?.autoDD, carryScheme: !!this.tagger?.carryScheme, diagram,
      autoOcr: !!this.app.ocr?.autoOnPlayEnd, saveConfirmed: this._saveConfirmed,
    };
  }


  toggleField(key, value) {
    const field = this.tagger?.tagFields?.[key];
    if (!field?.toggle || !this.tagger?.getCurrentPlay?.()) return false;
    this._protectCallOverride(key);
    field.toggle(value);
    const play = this.tagger.getCurrentPlay();
    if (key === 'result' && value === 'Fumble' && !field.value.split(' + ').includes('Fumble')) play.tags.fumbleRecovery = '';
    this.tagger._saveField(key); this._queuePublish(); return true;
  }
  setFumbleRecovery(value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play || !StatsEngine.hasResult(play, 'Fumble')) return false;
    const owner = ['subject', 'opponent', 'unknown'].includes(value) ? value : 'unknown';
    play.tags.fumbleRecovery = owner;
    this.tagger._updateTimeline();
    this.tagger._emit('play-updated', play);
    this._queuePublish();
    return true;
  }
  setField(key, value) {
    const field = this.tagger?.tagFields?.[key];
    if (!field || !this.tagger?.getCurrentPlay?.()) return false;
    this._protectCallOverride(key);
    field.value = value; this.tagger._saveField(key); this._queuePublish(); return true;
  }

  _protectCallOverride(key) {
    PlayCallModel.protectOverride(this.tagger?.getCurrentPlay?.(), key);
  }

  selectPlayCall(value) {
    const play = this.tagger?.getCurrentPlay?.();
    if (!play) return false;
    PlayCallModel.apply(play, value, this.app.playbook,
      playType => this.tagger?.constructor?.runPassForPlayType?.(playType));
    this.tagger._loadTagForm(play);
    this.tagger._updateTimeline();
    this.tagger._emit('play-updated', play);
    this._queuePublish();
    return true;
  }

  editPlayCallLibrary(name = '') {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.app.settingsScreen?.openPlaybook?.({ name:String(name || '').trim(), returnFocus });
  }
  setPlayer(role, value) { const field=this.tagger?.playerFields?.[role]; if(!field)return false; field.value=value; this.tagger._savePlayer(role); this._queuePublish(); return true; }
  setGrade(role, value) { const field=this.tagger?.gradeFields?.[role]; if(!field)return false; field.value=value; this.tagger._saveGrade(role); this._queuePublish(); return true; }
  setNotes(value) { const field=this.app.notes?.notesArea; if(!field||!this.tagger?.getCurrentPlay?.())return false; field.value=value; field.dispatchEvent(new Event('input',{bubbles:true})); this._queuePublish(); return true; }
  addCustomTag(value) { const play=this.tagger?.getCurrentPlay?.(),clean=String(value||'').trim(); if(!play||!clean)return false; if(!Array.isArray(play.tags.custom))play.tags.custom=[]; if(!play.tags.custom.includes(clean))play.tags.custom.push(clean); this.tagger._emit('play-updated',play); return true; }
  removeCustomTag(index) { const play=this.tagger?.getCurrentPlay?.(); if(!play||!Array.isArray(play.tags.custom))return false; play.tags.custom.splice(index,1); this.tagger._emit('play-updated',play); return true; }
  setCustomField(id,value) { this.app.customFields?._write?.(id,value); this._queuePublish(); }
  openCustomFields() { this.app.customFields?.openManager?.(); }
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
  addPenalty() { return this.app.breakdownForm?.addPenalty?.() === true; }
  penaltyAction(index,field,value) { return this.app.breakdownForm?.penaltyChip?.(index,field,value) === true; }
  penaltyInput(index,field,value) { return this.app.breakdownForm?.penaltyInput?.(index,field,value) === true; }
  removePenalty(index) { return this.app.breakdownForm?.removePenalty?.(index); }
  penaltySituation(field,value,checked=false) { return this.app.breakdownForm?.penaltySituation?.(field,value,checked) === true; }
  setSpecialUnit(value) { return this.app.breakdownForm?.setSpecialUnit?.(value); }
  specialAction(key,value) {
    const map={status:'stOutcome',attempt:'stAttempt',score:'stScore',owner:'stOwner',recovery:'stRecovery',toggle:'stToggle',spot:'stSpotSide',tryAttempt:'stTryAttempt',tryResult:'stTryResult',tryEvent:'stTryEvent',tryTurnover:'stTryTurnover',tryScore:'stTryScore',returnAward:'stReturnAward'};
    const dataKey=map[key];
    return dataKey ? this.app.breakdownForm?.specialAction?.(dataKey,value) === true : false;
  }
  specialInput(key,value) { return this.app.breakdownForm?.specialInput?.(key,value) === true; }
  drawDiagram() { this.app.playDiagram?.openEditor?.(); }
  clearDiagram() { this.app.playDiagram?.clearCurrent?.(); }
  setScoreboardRegion() { this.app.ocr?.startRegionSelect?.(); }
  readScoreboard() { this.app.ocr?.readNow?.(); }
  setAutoOcr(value) { return this.app.ocr?.setAutoOcr?.(value); }
  runAutoDetect() { document.getElementById('btnAutoDetect')?.click(); }
  newDrive() { return this.tagger?.newDrive?.(); }
  addNoteTimestamp() { return this.app.notes?.insertTimestamp?.(); }

  setActiveRole(role) { this.activeRole=role; this.app.roster.activeRole=role; this.app.roster._markActiveRole?.(); this._queuePublish(); }
  quickPickPlayer(number) {
    const role=this.app.roster?.activeRole || this.activeRole, current=String(this.tagger?.getCurrentPlay?.()?.tags?.players?.[role]||'');
    if (this.app.roster?.multiRoles?.has(role)) {
      const values=new Set(current.match(/\d+/g)||[]);
      values.has(String(number)) ? values.delete(String(number)) : values.add(String(number));
      this.setPlayer(role,[...values].join(', '));
    } else this.setPlayer(role,String(number));
  }

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

  applyTemplate(name) {
    if (!name) return false;
    this.tagger.applyTemplate(name);
    this._queuePublish();
    return true;
  }

  saveTemplate() {
    if (!this.tagger?.getCurrentPlay?.()) return false;
    this.tagger.saveTemplate();
    return true;
  }

  deleteTemplate(name) {
    if (!name || !this.tagger?.templateSelect) return false;
    this.tagger.templateSelect.value = name;
    this.tagger.deleteSelectedTemplate();
    return true;
  }

  setPerspective(value) {
    if (!this.app.gameContext?.update({ perspective: value })) return false;
    this.app._saveGameInfo?.();
    this._queuePublish();
    return true;
  }

  setDirection(value) {
    if (!this.app.gameContext?.update({ direction: value })) return false;
    this.app._saveGameInfo?.();
    this._queuePublish();
    return true;
  }
}
