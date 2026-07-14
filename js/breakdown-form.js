/**
 * Opt-in composition layer for the production tag form. It moves no controls
 * and owns no tag state; existing PlayTagger fields remain the only data path.
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';

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
    this._mountPenalties();
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
    this._renderPenalties(play);
  }

  _mountPenalties() {
    const target = this.form.querySelector('#tagPlayersSection');
    if (!target || this.form.querySelector('.bdv-penalties')) return;
    const section = document.createElement('section');
    section.className = 'bdv-penalties';
    section.addEventListener('click', event => this._onPenaltyClick(event));
    section.addEventListener('change', event => this._onPenaltyChange(event));
    target.insertAdjacentElement('beforebegin', section);
    this._renderPenalties(this.tagger.getCurrentPlay());
  }

  _renderPenalties(play) {
    const section = this.form.querySelector('.bdv-penalties');
    if (!section) return;
    const penalties = PenaltyModel.normalizeList(play?.penalties);
    const legacy = !penalties.length && String(play?.tags?.result || '').split(/\s*\+\s*/).includes('Penalty');
    const subject = this.form.classList.contains('is-scout') ? 'Scouted team' : 'Our team';
    const other = this.form.classList.contains('is-scout') ? 'Other team' : 'Opponent';
    const foulOptions = ['False Start','Holding','Illegal Formation','Illegal Motion','Delay of Game','Ineligible Receiver','Offensive Pass Interference','Intentional Grounding','Offside','Encroachment','Defensive Pass Interference','Facemask','Roughing the Passer','Personal Foul','Unsportsmanlike','Targeting','Block in the Back','Kick Catch Interference','Illegal Block','Roughing the Kicker','Running Into Kicker','Illegal Substitution'];
    section.innerHTML = `<datalist id="bdvPenaltyFouls">${foulOptions.map(value => `<option value="${value}"></option>`).join('')}</datalist><div class="bdv-pen-head"><div><strong>Penalties</strong><span>${penalties.length ? `${penalties.length} foul${penalties.length === 1 ? '' : 's'}` : 'None charted'}</span></div><button type="button" class="btn btn-sm" data-pen-add>Add penalty</button></div>
      ${legacy ? '<div class="bdv-pen-legacy">Legacy penalty · details uncharted</div>' : ''}
      <div class="bdv-pen-list">${penalties.map((penalty, index) => this._penaltyCard(penalty, index, subject, other)).join('')}</div>
      ${penalties.length ? this._resultingSituation(play?.resultingSituation) : ''}`;
  }

  _penaltyCard(penalty, index, subject, other) {
    const chip = (field, value, label) => `<button type="button" class="pick${penalty[field] === value ? ' active' : ''}" data-pen-chip="${index}:${field}:${value}">${label}</button>`;
    return `<article class="bdv-pen-card" data-penalty="${index}">
      <div class="bdv-pen-card-head"><strong>${penalty.foul || 'New penalty'}</strong><button type="button" class="bdv-pen-remove" data-pen-remove="${index}" aria-label="Remove penalty">&times;</button></div>
      <div class="chip-section"><label class="chip-label">Charged to</label><div class="pick-group">${chip('team','subject',subject)}${chip('team','opponent',other)}${chip('team','unknown','Unknown')}</div></div>
      <label class="bdv-pen-field"><span>Foul</span><input type="text" data-pen-input="${index}:foul" value="${this._esc(penalty.foul)}" list="bdvPenaltyFouls" placeholder="Foul name"></label>
      <div class="chip-section"><label class="chip-label">Ruling</label><div class="pick-group">${chip('disposition','accepted','Accepted')}${chip('disposition','declined','Declined')}${chip('disposition','offsetting','Offsetting')}${chip('disposition','unknown','Unknown')}</div></div>
      <div class="bdv-pen-grid">
        <label class="bdv-pen-field"><span>Actual yards</span><input type="number" data-pen-input="${index}:yards" value="${penalty.yards ?? ''}" min="0" max="99" placeholder="yds"></label>
        <label class="bdv-pen-field"><span>Player #</span><input type="number" data-pen-input="${index}:player" value="${this._esc(penalty.player)}" min="0" max="99" placeholder="#"></label>
        <label class="bdv-pen-field"><span>Phase</span><select data-pen-input="${index}:phase">${[['offense','Offense'],['defense','Defense'],['special','Special Teams'],['deadBall','Dead ball'],['unknown','Unknown']].map(([v,l]) => `<option value="${v}"${penalty.phase === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="chip-section"><label class="chip-label">Play status</label><div class="pick-group">${chip('playCounts',true,'Play counts')}${chip('playCounts',false,'No play')}<button type="button" class="pick${penalty.playCounts == null ? ' active' : ''}" data-pen-chip="${index}:playCounts:unknown">Unknown</button></div></div>
      <label class="bdv-pen-field"><span>Notes</span><input type="text" data-pen-input="${index}:notes" value="${this._esc(penalty.notes)}" placeholder="Enforcement notes"></label>
    </article>`;
  }

  _resultingSituation(value) {
    const sit = PenaltyModel.normalizeSituation(value) || { down:'', distance:'', fieldSide:'', yardLine:'', confirmed:false };
    return `<div class="bdv-pen-situation"><div><strong>Resulting situation</strong><span>Next snap</span></div><div class="bdv-pen-sit-grid">
      <label><span>Down</span><select data-pen-sit="down"><option value=""></option>${['1','2','3','4'].map(v => `<option value="${v}"${sit.down === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label><span>Distance</span><input type="number" data-pen-sit="distance" value="${this._esc(sit.distance)}" min="1" max="99"></label>
      <label><span>Side</span><select data-pen-sit="fieldSide"><option value=""></option><option value="own"${sit.fieldSide === 'own' ? ' selected' : ''}>Own</option><option value="opp"${sit.fieldSide === 'opp' ? ' selected' : ''}>Opp</option></select></label>
      <label><span>Yard line</span><input type="number" data-pen-sit="yardLine" value="${this._esc(sit.yardLine)}" min="1" max="50"></label>
    </div><label class="bdv-pen-confirm"><input type="checkbox" data-pen-sit="confirmed"${sit.confirmed ? ' checked' : ''}> Confirm for Auto D&amp;D</label></div>`;
  }

  _penaltyPhase(play) {
    const unit = play?.tags?.unit || 'offense';
    return unit === 'special' ? 'special' : unit === 'defense' ? 'defense' : 'offense';
  }

  _savePenaltyPlay(play, invalidateSituation = false) {
    if (invalidateSituation && play.resultingSituation?.confirmed) play.resultingSituation.confirmed = false;
    PenaltyModel.normalizePlay(play);
    this.tagger._updateTimeline();
    this.tagger._emit('play-updated', play);
    this._renderPenalties(play);
  }

  async _onPenaltyClick(event) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    if (event.target.closest('[data-pen-add]')) {
      play.penalties = PenaltyModel.normalizeList([...(play.penalties || []), { team:'subject', phase:this._penaltyPhase(play), foul:'', disposition:'accepted', yards:null, playCounts:null, player:'', automaticFirstDown:null, lossOfDown:null, notes:'', legacy:false }]);
      this._savePenaltyPlay(play, true); return;
    }
    const remove = event.target.closest('[data-pen-remove]');
    if (remove) {
      const ok = await this.tagger._confirmDialog('Remove this structured penalty?', 'Remove Penalty');
      if (!ok) return;
      play.penalties.splice(Number(remove.dataset.penRemove), 1);
      if (!play.penalties.length) delete play.resultingSituation;
      this._savePenaltyPlay(play, true); return;
    }
    const chip = event.target.closest('[data-pen-chip]');
    if (!chip) return;
    const [indexRaw, field, raw] = chip.dataset.penChip.split(':');
    const penalty = play.penalties?.[Number(indexRaw)];
    if (!penalty) return;
    penalty[field] = field === 'playCounts' ? (raw === 'true' ? true : raw === 'false' ? false : null) : raw;
    this._savePenaltyPlay(play, true);
  }

  _onPenaltyChange(event) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    if (event.target.dataset.penInput) {
      const [indexRaw, field] = event.target.dataset.penInput.split(':');
      const penalty = play.penalties?.[Number(indexRaw)];
      if (!penalty) return;
      penalty[field] = field === 'yards' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value;
      this._savePenaltyPlay(play, true); return;
    }
    const field = event.target.dataset.penSit;
    if (!field) return;
    const sit = PenaltyModel.normalizeSituation(play.resultingSituation) || { down:'',distance:'',fieldSide:'',yardLine:'',confirmed:false };
    sit[field] = field === 'confirmed' ? event.target.checked : event.target.value;
    play.resultingSituation = PenaltyModel.normalizeSituation(sit);
    this._savePenaltyPlay(play);
  }

  _esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

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
