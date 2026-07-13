/**
 * Opt-in composition layer for the production tag form. It moves no controls
 * and owns no tag state; existing PlayTagger fields remain the only data path.
 */
import { SpecialTeamsModel } from './special-teams.js';

export class BreakdownForm {
  static FLAG = 'ffa_breakdown_form_v2';
  static SECTIONS = [
    { before: '.tag-side-groups', key: 'look', title: 'Pre-snap look', detail: 'formation, personnel, structure' },
    { before: '.core-hide-st', key: 'play', title: 'Play & result', detail: 'call, direction, outcome' },
    { before: '#tagPlayersSection', key: 'people', title: 'Players & grades', detail: 'individual performance' },
    { before: '.tag-notes', key: 'notes', title: 'Notes & details', detail: 'staff context and field position' },
  ];

  constructor(tagger, { storage } = {}) {
    this.tagger = tagger;
    this.form = tagger.tagForm;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!this.form || !this.enabled()) return;
    this.mount();
  }

  enabled() { try { return this.storage?.getItem(BreakdownForm.FLAG) === '1'; } catch { return false; } }

  mount() {
    if (this.form.classList.contains('breakdown-form-v2')) return;
    this.form.classList.add('breakdown-form-v2');
    this._addHeader();
    this._addSectionLabels();
    this._mountSpecialTeams();
    this._syncPerspective();
    this.observer = new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'class')) this._syncPerspective();
    });
    this.observer.observe(this.form, { attributes: true, attributeFilter: ['class'] });
  }

  _addHeader() {
    const unit = this.form.querySelector('.unit-toggle-section');
    if (!unit) return;
    const header = document.createElement('div');
    header.className = 'bdv-head';
    header.innerHTML = '<div><span>Charting view</span><strong id="bdvPerspective">Offensive self-scout</strong><small>No tag is required</small></div>';
    unit.insertAdjacentElement('afterend', header);
  }

  _addSectionLabels() {
    for (const section of BreakdownForm.SECTIONS) {
      const target = this.form.querySelector(section.before);
      if (!target || this.form.querySelector(`[data-bdv-section="${section.key}"]`)) continue;
      const label = document.createElement('div');
      label.className = 'bdv-section-label';
      label.dataset.bdvSection = section.key;
      label.innerHTML = `<strong>${section.title}</strong><span>${section.detail}</span>`;
      target.insertAdjacentElement('beforebegin', label);
    }
  }

  _syncPerspective() {
    const unit = this.form.classList.contains('mode-defense') ? 'defense' : this.form.classList.contains('mode-special') ? 'special' : 'offense';
    const scout = this.form.classList.contains('is-scout');
    const subject = scout ? 'Opponent' : 'Our';
    const offense = this.form.querySelector('.group-offense .tag-group-head');
    const defense = this.form.querySelector('.group-defense .tag-group-head');
    const special = this.form.querySelector('.group-special .tag-group-head');
    this._label(offense, unit === 'defense' ? 'Offense Faced' : `${subject} Offensive Look`);
    this._label(defense, unit === 'offense' ? 'Defense Faced' : `${subject} Defensive Call`);
    this._label(special, `${subject} Special Teams`);
    const perspective = this.form.querySelector('#bdvPerspective');
    if (perspective) perspective.textContent = `${scout ? 'Opponent scout' : 'Self-scout'} · ${unit === 'special' ? 'Special Teams' : unit[0].toUpperCase() + unit.slice(1)}`;
    const look = this.form.querySelector('[data-bdv-section="look"] strong');
    if (look) look.textContent = unit === 'special' ? `${subject} Special Teams` : unit === 'defense' ? `${subject} Defensive Call` : `${subject} Offensive Look`;
    const people = this.form.querySelector('[data-bdv-section="people"] span');
    if (people) people.textContent = unit === 'defense' ? 'tackles, takeaways, and grades' : unit === 'special' ? 'specialists live in the phase above' : 'ball carrier, passer, receiver, and grades';
    if (unit === 'special') this.loadPlay(this.tagger.getCurrentPlay());
  }

  _mountSpecialTeams() {
    const body = this.form.querySelector('.group-special .tag-group-body');
    if (!body || body.querySelector('.bdv-st-editor')) return;
    const specialist = [...body.children].find(el => el.querySelector?.('.player-roles'));
    [...body.children].forEach(el => { if (el !== specialist) el.classList.add('bdv-st-legacy'); });
    const editor = document.createElement('div');
    editor.className = 'bdv-st-editor';
    editor.addEventListener('click', event => this._onSpecialClick(event));
    editor.addEventListener('change', event => this._onSpecialChange(event));
    body.insertBefore(editor, specialist || body.firstChild);
    for (const role of ['kicker', 'returner']) {
      this.tagger.playerFields[role]?.addEventListener('change', () => this._syncSpecialist(role));
    }
    this.loadPlay(this.tagger.getCurrentPlay());
  }

  loadPlay(play) {
    const editor = this.form.querySelector('.bdv-st-editor');
    if (!editor) return;
    const st = SpecialTeamsModel.normalize(play?.specialTeams);
    const legacy = !st && !!(play?.tags?.stType || play?.tags?.kickOutcome || play?.tags?.scoreFor);
    const units = [
      ['kickoff', 'Kickoff'], ['kickoffReturn', 'Kick Return'], ['punt', 'Punt'],
      ['puntReturn', 'Punt Return'], ['fieldGoal', 'Field Goal / XP'], ['fieldGoalBlock', 'Field Goal Block'],
    ];
    editor.innerHTML = `
      ${legacy ? '<div class="bdv-st-legacy-note">Legacy Special Teams · details uncharted</div>' : ''}
      <div class="chip-section"><label class="chip-label">Unit</label><div class="pick-group bdv-st-units">
        ${units.map(([value, label]) => `<button type="button" class="pick${st?.unit === value ? ' active' : ''}" data-st-unit="${value}">${label}</button>`).join('')}
      </div></div>
      ${st ? this._specialDetails(st) : ''}`;
    this._syncSpecialistLabels(st);
  }

  _specialDetails(st) {
    const outcomes = {
      kickoff: [['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['outOfBounds','Out of Bounds'],['recovered','Recovered']],
      kickoffReturn: [['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['muffed','Muffed'],['outOfBounds','Out of Bounds']],
      punt: [['returned','Returned'],['fairCatch','Fair Catch'],['downed','Downed'],['outOfBounds','Out of Bounds'],['touchback','Touchback'],['blocked','Blocked'],['muffed','Muffed']],
      puntReturn: [['returned','Returned'],['fairCatch','Fair Catch'],['downed','Let Bounce'],['muffed','Muffed'],['outOfBounds','Out of Bounds']],
      fieldGoal: [['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
      fieldGoalBlock: [['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
    }[st.unit] || [];
    const isKickAttempt = st.unit === 'fieldGoal' || st.unit === 'fieldGoalBlock';
    const kickFields = ['kickoff','punt','fieldGoal','fieldGoalBlock'].includes(st.unit);
    const landingFields = ['kickoff','kickoffReturn','punt','puntReturn'].includes(st.unit);
    const returnFields = ['kickoff','kickoffReturn','punt','puntReturn','fieldGoalBlock'].includes(st.unit);
    const modifier = st.unit === 'kickoff'
      ? `<button type="button" class="pick${st.isOnside ? ' active' : ''}" data-st-toggle="isOnside">Onside</button>`
      : ['punt','fieldGoal','fieldGoalBlock'].includes(st.unit)
        ? `<button type="button" class="pick${st.isFake ? ' active' : ''}" data-st-toggle="isFake">Fake</button>` : '';
    const scoreChoices = st.unit === 'fieldGoal' ? [] : [['touchdown','Touchdown'],['safety','Safety']];
    const needsOwner = st.outcome.score === 'safety' || st.outcome.scoredBy === 'unknown';
    const needsRecovery = ['recovered','muffed','blocked'].includes(st.outcome.status) || (st.outcome.score === 'touchdown' && ['kickoff','fieldGoalBlock'].includes(st.unit));
    const subject = this.form.classList.contains('is-scout') ? 'Scouted team' : 'Our team';
    const other = this.form.classList.contains('is-scout') ? 'Other team' : 'Opponent';
    return `
      ${isKickAttempt ? `<div class="chip-section"><label class="chip-label">Attempt</label><div class="pick-group">
        ${[['fieldGoal','Field Goal'],['extraPoint','Extra Point']].map(([v,l]) => `<button type="button" class="pick${st.attemptType === v ? ' active' : ''}" data-st-attempt="${v}">${l}</button>`).join('')}
      </div></div>` : ''}
      <div class="chip-section"><label class="chip-label">Outcome</label><div class="pick-group">
        ${outcomes.map(([v,l]) => `<button type="button" class="pick${st.outcome.status === v ? ' active' : ''}" data-st-outcome="${v}">${l}</button>`).join('')}
      </div></div>
      ${(modifier || scoreChoices.length) ? `<div class="bdv-st-choice-row">
        ${modifier ? `<div class="chip-section"><label class="chip-label">Type</label><div class="pick-group">${modifier}</div></div>` : ''}
        ${scoreChoices.length ? `<div class="chip-section"><label class="chip-label">Score</label><div class="pick-group">${scoreChoices.map(([v,l]) => `<button type="button" class="pick${st.outcome.score === v ? ' active' : ''}" data-st-score="${v}">${l}</button>`).join('')}</div></div>` : ''}
      </div>` : ''}
      ${needsOwner ? `<div class="chip-section bdv-st-owner"><label class="chip-label">Credited to</label><div class="pick-group">
        <button type="button" class="pick${st.outcome.scoredBy === 'subject' ? ' active' : ''}" data-st-owner="subject">${subject}</button>
        <button type="button" class="pick${st.outcome.scoredBy === 'opponent' ? ' active' : ''}" data-st-owner="opponent">${other}</button>
      </div></div>` : ''}
      ${needsRecovery ? `<div class="chip-section"><label class="chip-label">Possession</label><div class="pick-group">
        <button type="button" class="pick${st.outcome.recoveredBy === 'subject' ? ' active' : ''}" data-st-recovery="subject">${subject}</button>
        <button type="button" class="pick${st.outcome.recoveredBy === 'opponent' ? ' active' : ''}" data-st-recovery="opponent">${other}</button>
        <button type="button" class="pick${st.outcome.recoveredBy === 'unknown' ? ' active' : ''}" data-st-recovery="unknown">Unknown</button>
      </div></div>` : ''}
      <div class="bdv-st-metrics">
        ${kickFields ? this._metric('kick-distance','Kick distance',st.kick.distance,'yds','0','99') + this._metric('hang-time','Hang time',st.kick.hangTime,'sec','0','9.9','0.1') : ''}
        ${landingFields ? this._spotFields('landing','Possession spot',st.kick.landing) : ''}
        ${returnFields ? this._metric('return-yards','Return yards',st.return.yards,'yds','-99','109') + this._spotFields('end','End spot',st.return.end) : ''}
        ${this._metric('blocker','Blocker #',st.players.blocker,'#','0','99') + this._metric('recoverer','Recoverer #',st.players.recoverer,'#','0','99')}
      </div>`;
  }

  _metric(key, label, value, placeholder, min, max, step = '1') {
    return `<label class="bdv-st-field"><span>${label}</span><input type="number" data-st-input="${key}" value="${value ?? ''}" min="${min}" max="${max}" step="${step}" placeholder="${placeholder}"></label>`;
  }

  _spotFields(key, label, spot = {}) {
    return `<div class="bdv-st-spot"><span>${label}</span><div class="pick-group">
      <button type="button" class="pick${spot.fieldSide === 'own' ? ' active' : ''}" data-st-spot-side="${key}:own">Own</button>
      <button type="button" class="pick${spot.fieldSide === 'opp' ? ' active' : ''}" data-st-spot-side="${key}:opp">Opp</button>
      <input type="number" data-st-input="${key}-yard" value="${spot.yardLine || ''}" min="1" max="50" placeholder="YL">
    </div></div>`;
  }

  _newSpecial(unit) {
    return SpecialTeamsModel.normalize({ version: 1, unit, subjectRole: SpecialTeamsModel.ROLES[unit], attemptType: null,
      kick: {}, return: {}, outcome: {}, isOnside: false, isFake: false, players: {}, notes: '', legacy: false });
  }

  _saveSpecial(update) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    const current = SpecialTeamsModel.normalize(play.specialTeams);
    if (!current) return;
    update(current);
    play.specialTeams = SpecialTeamsModel.normalize(current);
    this.tagger._updateTimeline();
    this.tagger._emit('play-updated', play);
    this.loadPlay(play);
  }

  _hasSpecialDetails(st) {
    return !!(st.attemptType || st.outcome.status || st.outcome.score || st.outcome.recoveredBy || st.outcome.scoredBy
      || st.isOnside || st.isFake || st.kick.distance != null || st.kick.hangTime != null
      || st.kick.landing.fieldSide || st.kick.landing.yardLine || st.return.yards != null
      || st.return.end.fieldSide || st.return.end.yardLine || Object.values(st.players).some(Boolean));
  }

  async _onSpecialClick(event) {
    const button = event.target.closest('button');
    if (!button || !this.tagger.getCurrentPlay()) return;
    if (button.dataset.stUnit) {
      const play = this.tagger.getCurrentPlay();
      const current = SpecialTeamsModel.normalize(play.specialTeams);
      if (current && current.unit !== button.dataset.stUnit && this._hasSpecialDetails(current)) {
        const ok = await this.tagger._confirmDialog('Changing the Special Teams unit will clear its charted details.', 'Change Unit');
        if (!ok) return;
      }
      play.specialTeams = this._newSpecial(button.dataset.stUnit);
      this.tagger._updateTimeline();
      this.tagger._emit('play-updated', play);
      this.loadPlay(play);
      return;
    }
    if (button.dataset.stOutcome) this._saveSpecial(st => {
      st.outcome.status = st.outcome.status === button.dataset.stOutcome ? null : button.dataset.stOutcome;
      if (st.outcome.status === 'returned') st.return.attempted = true;
      else if (['touchback','fairCatch','downed','outOfBounds'].includes(st.outcome.status)) st.return.attempted = false;
      else if (!st.outcome.status) st.return.attempted = null;
      if (!['recovered','muffed','blocked'].includes(st.outcome.status)) st.outcome.recoveredBy = null;
      if (st.outcome.status === 'good') st.outcome.score = st.attemptType;
      else if (st.outcome.score === 'fieldGoal' || st.outcome.score === 'extraPoint') st.outcome.score = null;
    });
    else if (button.dataset.stAttempt) this._saveSpecial(st => {
      st.attemptType = button.dataset.stAttempt;
      st.outcome.score = st.outcome.status === 'good' ? st.attemptType : null;
    });
    else if (button.dataset.stScore) this._saveSpecial(st => { st.outcome.score = st.outcome.score === button.dataset.stScore ? null : button.dataset.stScore; st.outcome.scoredBy = null; });
    else if (button.dataset.stOwner) this._saveSpecial(st => { st.outcome.scoredBy = button.dataset.stOwner; });
    else if (button.dataset.stRecovery) this._saveSpecial(st => { st.outcome.recoveredBy = button.dataset.stRecovery; });
    else if (button.dataset.stToggle) this._saveSpecial(st => { st[button.dataset.stToggle] = !st[button.dataset.stToggle]; });
    else if (button.dataset.stSpotSide) {
      const [key, side] = button.dataset.stSpotSide.split(':');
      this._saveSpecial(st => { (key === 'landing' ? st.kick.landing : st.return.end).fieldSide = side; });
    }
  }

  _onSpecialChange(event) {
    const key = event.target.dataset.stInput;
    if (!key) return;
    this._saveSpecial(st => {
      const value = event.target.value === '' ? null : Number(event.target.value);
      if (key === 'kick-distance') st.kick.distance = value;
      if (key === 'hang-time') st.kick.hangTime = value;
      if (key === 'return-yards') { st.return.yards = value; st.return.attempted = value == null ? null : true; }
      if (key === 'landing-yard') st.kick.landing.yardLine = event.target.value;
      if (key === 'end-yard') st.return.end.yardLine = event.target.value;
      if (key === 'blocker') st.players.blocker = event.target.value;
      if (key === 'recoverer') st.players.recoverer = event.target.value;
    });
  }

  _syncSpecialist(role) {
    const play = this.tagger.getCurrentPlay();
    const st = SpecialTeamsModel.normalize(play?.specialTeams);
    if (!play || !st) return;
    st.players[role] = play.tags.players?.[role] || '';
    play.specialTeams = st;
    this.tagger._emit('play-updated', play);
  }

  _syncSpecialistLabels(st) {
    const kicker = this.form.querySelector('.group-special .player-role[data-role="kicker"] .player-role-label');
    const returner = this.form.querySelector('.group-special .player-role[data-role="returner"] .player-role-label');
    if (kicker) kicker.textContent = st?.unit === 'punt' ? 'Punter' : 'Kicker / Punter';
    if (returner) returner.textContent = 'Returner';
  }

  _label(button, text) {
    if (!button) return;
    const caret = button.querySelector('.tag-group-caret');
    for (const node of [...button.childNodes]) if (node !== caret) node.remove();
    button.insertBefore(document.createTextNode(text), caret || null);
  }
}
