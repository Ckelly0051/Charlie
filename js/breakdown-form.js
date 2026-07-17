/**
 * Opt-in composition layer for the production tag form. It moves the existing
 * controls into coach-facing groups and owns no tag state; PlayTagger remains
 * the only data path.
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';

export class BreakdownForm {
  static FLAG = 'ffa_breakdown_form_v2';
  constructor(tagger, { storage, tagLibrarySettings } = {}) {
    this.tagger = tagger;
    this.form = tagger.tagForm;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.tagLibrarySettings = tagLibrarySettings || null;
    if (!this.form || !this.enabled()) return;
    this.mount();
  }

  enabled() { try { return this.storage?.getItem(BreakdownForm.FLAG) === '1' || this.storage?.getItem('ffa_workspace_shell_v2') === '1'; } catch { return false; } }

  mount() {
    if (this.form.classList.contains('breakdown-form-v2')) return;
    this.form.classList.add('breakdown-form-v2');
    this._mountSpecialTeams();
    this._mountPenalties();
    this._composeGroups();
    this._mountLibraryLinks();
    this._syncPerspective();
    this.observer = new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'class')) this._syncPerspective();
    });
    this.observer.observe(this.form, { attributes: true, attributeFilter: ['class'] });
  }

  _group(key, title, detail, nodes, open = false) {
    const live = nodes.filter(Boolean);
    if (!live.length) return null;
    const details = document.createElement('details');
    details.className = `bdv-group bdv-group-${key}`;
    details.dataset.bdvGroup = key;
    details.open = open;
    details.innerHTML = `<summary><strong>${title}</strong><span>${detail}</span><i aria-hidden="true">▾</i></summary><div class="bdv-group-body"></div>`;
    live[0].insertAdjacentElement('beforebegin', details);
    details.querySelector('.bdv-group-body').append(...live);
    return details;
  }

  _composeGroups() {
    const sideGroups = this.form.querySelector('.tag-side-groups');
    const down = this.form.querySelector('#tagDown')?.closest('.chip-section');
    const legacyDetails = this.form.querySelector('.chip-details');
    const detailSections = legacyDetails ? [...legacyDetails.querySelectorAll(':scope > .chip-section')] : [];
    const situation = detailSections.filter(section => section.querySelector('#tagHash, #tagQuarter, #tagFieldSide'));
    this._group('situation', 'Situation', 'down, distance, field position', [down, ...situation], true);

    const playNodes = [...this.form.children].filter(node =>
      node.classList?.contains('core-hide-st') || node.querySelector?.('#tagResult, #tagYardage'));
    const play = this._group('play', 'Play & Result', 'call, direction, outcome', playNodes, true);
    if (sideGroups && play) sideGroups.append(play);

    this._group('penalties', 'Penalties', 'foul, enforcement, resulting situation', [this.form.querySelector('.bdv-penalties')]);
    this._group('people', 'Players & Grades', 'individual performance and responsibility', [this.form.querySelector('#tagPlayersSection')]);
    this._group('notes', 'Notes & Details', 'staff notes, custom fields, drive context', [
      this.form.querySelector('#customFieldsSection'), this.form.querySelector('.tag-notes'), legacyDetails,
    ]);
    this._moveTemplateTools();
  }

  _moveTemplateTools() {
    const helpers = this.form.querySelector('.tag-helpers');
    const nav = this.form.querySelector('.tag-nav');
    if (!helpers || !nav || this.form.querySelector('.bdv-template-tools')) return;
    const details = document.createElement('details');
    details.className = 'bdv-template-tools';
    details.innerHTML = '<summary>Templates <span>Reusable staff presets</span><i aria-hidden="true">▾</i></summary><div></div>';
    details.querySelector('div').append(helpers);
    nav.insertAdjacentElement('beforebegin', details);
  }

  _mountLibraryLinks() {
    const groups = [['tagFormation','formation'], ['tagBackfield','backfield'], ['tagDefFront','front']];
    for (const [id, group] of groups) {
      const label = this.form.querySelector(`#${id}`)?.previousElementSibling;
      if (!label || label.querySelector('[data-edit-library]')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bdv-field-link';
      button.dataset.editLibrary = group;
      button.textContent = 'Edit library';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        this.tagLibrarySettings?.open(group);
      });
      label.append(button);
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
    const people = this.form.querySelector('[data-bdv-group="people"] summary span');
    if (people) people.textContent = unit === 'defense' ? 'tackles, takeaways, and grades' : unit === 'special' ? 'specialists live in the phase above' : 'ball carrier, passer, receiver, and grades';
    if (unit === 'special') this.loadPlay(this.tagger.getCurrentPlay());
    const side = this.form.querySelector('.tag-side-groups');
    const primary = unit === 'defense' ? this.form.querySelector('.group-defense') : unit === 'special' ? this.form.querySelector('.group-special') : this.form.querySelector('.group-offense');
    const faced = unit === 'defense' ? this.form.querySelector('.group-offense') : this.form.querySelector('.group-defense');
    const play = this.form.querySelector('[data-bdv-group="play"]');
    if (side && primary) side.prepend(primary);
    if (side && play && unit !== 'special') primary?.insertAdjacentElement('afterend', play);
    if (side && faced && unit !== 'special') play?.insertAdjacentElement('afterend', faced);
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
      ['try', this.form.classList.contains('is-scout') ? 'Scouted Team Try' : 'Our Team Try'], ['tryDefense', 'Defending a Try'],
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

  _tryDetails(st) {
    const subject = this.form.classList.contains('is-scout') ? 'Scouted team' : 'Our team';
    const other = this.form.classList.contains('is-scout') ? 'Other team' : 'Opponent';
    const penalties = PenaltyModel.normalizeList(this.tagger.getCurrentPlay()?.penalties);
    const penaltyUnresolved = penalties.some(penalty => penalty.playCounts == null || penalty.disposition === 'unknown');
    const noPlayMismatch = penalties.some(penalty => penalty.playCounts === false) && st.result !== 'noPlay';
    const tryIncomplete = !st.attemptType || !st.result;
    const returnUnresolved = st.events.defensiveReturn && st.outcome.returnAward == null;
    const chip = (attr, value, label, active) => `<button type="button" class="pick${active ? ' active' : ''}" ${attr}="${value}">${label}</button>`;
    return `
      <div class="bdv-try-summary"><strong>${st.subjectRole === 'attempting' ? `${subject} try` : `${other} try`}</strong><span>${st.subjectRole === 'attempting' ? 'Chart the attempt and official result' : `Chart ${subject.toLowerCase()} defending the try`}</span></div>
      <div class="chip-section"><label class="chip-label">Attempt</label><div class="pick-group">
        ${chip('data-st-try-attempt','extraPoint','Kick XP',st.attemptType === 'extraPoint')}
        ${chip('data-st-try-attempt','twoPoint','Two-Point',st.attemptType === 'twoPoint')}
      </div></div>
      <div class="chip-section"><label class="chip-label">Official result</label><div class="pick-group">
        ${chip('data-st-try-result','converted','Converted',st.result === 'converted')}
        ${chip('data-st-try-result','failed','Failed',st.result === 'failed')}
        ${chip('data-st-try-result','noPlay','No Play / Retry',st.result === 'noPlay')}
      </div></div>
      <div class="chip-section"><label class="chip-label">What happened <span class="bdv-optional">Optional</span></label><div class="pick-group">
        ${chip('data-st-try-event','badSnap','Bad Snap',st.events.badSnap)}
        ${chip('data-st-try-event','blocked','Blocked',st.events.blocked)}
        ${chip('data-st-try-turnover','interception','Interception',st.events.turnover === 'interception')}
        ${chip('data-st-try-turnover','fumble','Fumble',st.events.turnover === 'fumble')}
        ${chip('data-st-try-event','defensiveReturn','Defensive Return',st.events.defensiveReturn)}
      </div></div>
      ${st.result === 'converted' && !st.events.defensiveReturn ? `<div class="chip-section bdv-try-points"><label class="chip-label">Points awarded</label><div class="pick-group">
        ${st.attemptType === 'extraPoint' ? chip('data-st-try-score','extraPoint','1 Point',st.outcome.score === 'extraPoint') : ''}
        ${chip('data-st-try-score','twoPoint','2 Points',st.outcome.score === 'twoPoint')}
      </div></div>` : ''}
      ${st.events.defensiveReturn ? `<div class="chip-section bdv-try-ruling"><label class="chip-label">Official return ruling</label><div class="pick-group">
        ${chip('data-st-return-award','none','No Score',st.outcome.returnAward === 'none')}
        ${chip('data-st-return-award','subject',`2 Points - ${subject}`,st.outcome.returnAward === 'subject')}
        ${chip('data-st-return-award','opponent',`2 Points - ${other}`,st.outcome.returnAward === 'opponent')}
      </div></div>` : ''}
      ${tryIncomplete ? '<div class="bdv-try-warning" role="status">Choose the attempt and official result before finishing this play.</div>' : ''}
      ${returnUnresolved ? '<div class="bdv-try-warning" role="status">Choose the official return ruling before finishing this play.</div>' : ''}
      ${penaltyUnresolved || noPlayMismatch ? '<div class="bdv-try-warning" role="status">Resolve the penalty ruling and set No Play / Retry when the snap does not count.</div>' : ''}`;
  }
  _specialDetails(st) {
    if (st.unit === 'try' || st.unit === 'tryDefense') return this._tryDetails(st);
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
      result: null, events: {}, kick: {}, return: {}, outcome: {}, isOnside: false, isFake: false, players: {}, notes: '', legacy: false });
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
    return !!(st.attemptType || st.result || Object.values(st.events || {}).some(Boolean) || st.outcome.returnAward || st.outcome.status || st.outcome.score || st.outcome.recoveredBy || st.outcome.scoredBy
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
    if (button.dataset.stTryAttempt) {
      this._saveSpecial(st => {
        st.attemptType = button.dataset.stTryAttempt;
        if (st.result === 'converted' && !st.events.defensiveReturn) st.outcome.score = st.attemptType;
      });
      return;
    }
    if (button.dataset.stTryResult) {
      this._saveSpecial(st => {
        st.result = button.dataset.stTryResult;
        if (st.result === 'converted' && !st.events.defensiveReturn) st.outcome.score = st.outcome.score || st.attemptType;
        else if (!st.events.defensiveReturn || !['subject','opponent'].includes(st.outcome.returnAward)) { st.outcome.score = null; st.outcome.scoredBy = null; }
      });
      return;
    }
    if (button.dataset.stTryScore) {
      this._saveSpecial(st => {
        st.result = 'converted';
        st.outcome.score = button.dataset.stTryScore;
        st.outcome.scoredBy = null;
      });
      return;
    }
    if (button.dataset.stTryTurnover) {
      this._saveSpecial(st => { st.events.turnover = st.events.turnover === button.dataset.stTryTurnover ? null : button.dataset.stTryTurnover; });
      return;
    }
    if (button.dataset.stTryEvent) {
      this._saveSpecial(st => {
        const key = button.dataset.stTryEvent;
        st.events[key] = !st.events[key];
        if (key === 'defensiveReturn') {
          st.outcome.returnAward = null;
          st.outcome.score = st.events.defensiveReturn ? null : (st.result === 'converted' ? st.attemptType : null);
          st.outcome.scoredBy = null;
          if (st.events.defensiveReturn && st.result === 'converted') st.result = 'failed';
        }
      });
      return;
    }
    if (button.dataset.stReturnAward) {
      this._saveSpecial(st => {
        st.outcome.returnAward = button.dataset.stReturnAward;
        st.outcome.score = st.outcome.returnAward === 'none' ? null : 'twoPoint';
        st.outcome.scoredBy = st.outcome.returnAward === 'none' ? null : st.outcome.returnAward;
      });
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
