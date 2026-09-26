import { TagLibrary } from './tag-library.js';
import { TeamRegistry } from './team-registry.js';

/**
 * THE ONE-TIME CONVERSION OF OLD APP-SETTINGS KEYS (legacy excision Pass 2b;
 * coach direction 2026-09-26: saved settings do not keep old readers
 * indefinitely). It is the only code that knows the retired settings shapes.
 * The per-feature readers that used to understand them are deleted, so every
 * preference still in use is carried into its current key HERE, once per
 * profile, before anything reads it:
 *
 *   tagLibraries   `ffa_custom_chips_<team>` -> `ffa_tag_libraries_<team>`, and a
 *                  stored library below version 4 gets the defaults added since
 *                  (I-Form, Split Back; Option) made visible
 *   filmRoomColumns the old global list `ffa_film_room_cols` (stock presets
 *                  upgraded, a custom list kept) -> the active program's sets
 *   studyViews     saved Study views naming a renamed measure get its new id
 *   homeParent     `giq_home_workspace` (mode only) -> `giq_home_parent`
 *   teamRegistry   a pre-registry install (a profile, no `ffa_teams`) becomes
 *                  the first registry team
 *   betaDefaults   one `ffa_beta_defaults_<version>` marker per version -> one
 *                  `ffa_beta_defaults` key holding the version
 *   deadKeys       UI state nothing reads any more is removed
 *
 * Every write is read back before the old key is removed; a conversion that
 * fails keeps its old key and leaves the run unfinished, so the next launch
 * retries it. The outcome is recorded under MARKER, which makes it run once.
 * Version history and season files are NOT settings and are never touched here
 * (see storage-cleanup.js and SeasonFormat).
 *
 * Delete this module once the coach's installed profile has run it and the
 * smoke confirms the report.
 */
export class SettingsFormat {
  static MARKER = 'giq_settings_format_2026_09_26';

  /** The saved-column lists that were stock presets before E3b and before Play
   *  Call; an exact match is upgraded to the current preset. */
  static STOCK_COLUMNS = Object.freeze({
    default: [['sit', 'formation', 'playType', 'result', 'yardage', 'penalty'], ['sit', 'formation', 'qbAlignment', 'playType', 'result', 'yardage', 'penalty']],
    offense: [['sit', 'formation', 'personnel', 'runPass', 'playType', 'result', 'yardage', 'penalty', 'penaltyYards'], ['sit', 'formation', 'qbAlignment', 'personnel', 'runPass', 'playType', 'result', 'yardage', 'penalty', 'penaltyYards']],
    defense: [['sit', 'defFront', 'coverage', 'blitz', 'result', 'yardage', 'penalty', 'penaltyYards']],
    special: [['sit', 'stUnit', 'stOutcome', 'stKick', 'stReturn', 'penalty', 'penaltyYards', 'notes']],
  });

  static STUDY_MEASURE_RENAMES = Object.freeze({ successRate: 'success', explosiveRate: 'explosive', negativeRate: 'negative', havocRate: 'havoc' });

  static DEAD_KEYS = Object.freeze(['ffa_video_controls_y', 'ffa_wizard_dismissed', 'ffa_wizard_v2', 'ffa_workspace_shell_v2',
    'ffa_breakdown_form_v2', 'ffa_film_room_collapsed', 'ffa_film_room_hint_dismissed', 'ffa_tour_done', 'ffa_season_games']);

  /**
   * @param {object} o
   * @param {Storage} o.storage
   * @param {string} o.version  the running app version (for the beta marker)
   * @param {string[]} o.gridColumns  every Film Room column key (PlayGrid.COLUMNS)
   * @param {object} o.gridPresets  PlayGrid.PRESETS
   */
  static convertOnce({ storage = (typeof localStorage !== 'undefined' ? localStorage : null), version = '', gridColumns = [], gridPresets = {}, marker = SettingsFormat.MARKER } = {}) {
    if (!storage) return { skipped: true, report: null };
    let done = null;
    try { done = storage.getItem(marker); } catch (e) { return { skipped: true, report: null }; }
    if (done) { try { return { skipped: true, report: JSON.parse(done) }; } catch (e) { return { skipped: true, report: null }; } }

    const s = new SettingsFormat.Ops(storage);
    const steps = [
      // The registry first: the column conversion needs the active program.
      ['teamRegistry', () => SettingsFormat._teamRegistry(s)],
      ['tagLibraries', () => SettingsFormat._tagLibraries(s)],
      ['filmRoomColumns', () => SettingsFormat._filmRoomColumns(s, gridColumns, gridPresets)],
      ['studyViews', () => SettingsFormat._studyViews(s)],
      ['homeParent', () => SettingsFormat._homeParent(s)],
      ['betaDefaults', () => SettingsFormat._betaDefaults(s, version)],
      ['deadKeys', () => SettingsFormat._deadKeys(s)],
    ];
    const results = [];
    for (const [id, fn] of steps) {
      try { results.push({ id, ...fn() }); }
      catch (e) { results.push({ id, status: 'failed', detail: String(e && e.message || e) }); }
    }
    const report = { ranAt: new Date().toISOString(), results };
    let receipt = 'written';
    if (!results.some(r => r.status === 'failed')) {
      try { storage.setItem(marker, JSON.stringify(report)); } catch (e) { receipt = 'failed'; }
    } else receipt = 'unfinished';
    try { (receipt === 'written' ? console.info : console.error)('[settings-format]', JSON.stringify(report)); } catch (e) {}
    return { skipped: false, report, receipt };
  }

  /** Storage operations that verify every write and removal. */
  static Ops = class {
    constructor(storage) { this.storage = storage; }
    keys() { const out = []; for (let i = 0; i < this.storage.length; i++) out.push(this.storage.key(i)); return out; }
    has(key) { return this.storage.getItem(key) !== null; }
    get(key) { return this.storage.getItem(key); }
    json(key) { try { return JSON.parse(this.storage.getItem(key) || 'null'); } catch (e) { return undefined; } }
    set(key, value) {
      this.storage.setItem(key, value);
      if (this.storage.getItem(key) !== value) throw new Error(`${key} did not read back`);
    }
    remove(key) {
      this.storage.removeItem(key);
      if (this.storage.getItem(key) !== null) throw new Error(`${key} is still present`);
    }
  };

  static _tagLibraries(s) {
    const done = [];
    for (const key of s.keys().filter(k => k && k.startsWith('ffa_custom_chips_'))) {
      const team = key.slice('ffa_custom_chips_'.length);
      const lib = new TagLibrary({ storage: s.storage, teamId: team });
      if (!s.has(lib.key())) {
        const legacy = s.json(key) || {};
        const state = lib._blank();
        for (const group of ['formation', 'backfield']) {
          const defaults = TagLibrary.DEFINITIONS[group];
          const custom = [...new Set((Array.isArray(legacy[group]) ? legacy[group] : []).map(v => String(v).trim()).filter(v => v && !defaults.includes(v)))];
          state.groups[group].custom = custom;
          state.groups[group].enabled.push(...custom);
          state.groups[group].order.push(...custom);
        }
        s.set(lib.key(), JSON.stringify(lib._normalize(state)));
      }
      s.remove(key);
      done.push(`${key} -> ${lib.key()}`);
    }
    for (const key of s.keys().filter(k => k && k.startsWith('ffa_tag_libraries_'))) {
      const raw = s.json(key);
      if (!raw || typeof raw !== 'object') continue;
      const stored = Number(raw.version) || 1;
      if (stored >= 4) continue;
      const groups = raw.groups || {};
      const add = (group, values) => {
        if (!Array.isArray(groups[group]?.enabled)) return;
        for (const v of values) if (!groups[group].enabled.includes(v)) groups[group].enabled.push(v);
      };
      if (stored < 2) add('formation', ['I-Form', 'Split Back']);
      add('playType', ['Option']);
      raw.groups = groups;
      raw.version = 4;
      s.set(key, JSON.stringify(raw));
      done.push(`${key} v${stored} -> v4`);
    }
    return { status: done.length ? 'converted' : 'none', detail: done };
  }

  static _upgradeColumns(cols, presets) {
    const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    for (const [name, lists] of Object.entries(SettingsFormat.STOCK_COLUMNS)) {
      if (lists.some(list => same(cols, list)) && Array.isArray(presets[name])) return presets[name].slice();
    }
    return cols;
  }

  static _filmRoomColumns(s, gridColumns, gridPresets) {
    const done = [];
    const team = s.get('ffa_active_team_id') || 'default';
    const current = `ffa_film_room_columns_${team}`;
    if (s.has('ffa_film_room_cols')) {
      const owner = s.get('ffa_film_room_cols_claimed_by');
      const list = s.json('ffa_film_room_cols');
      const known = new Set(gridColumns);
      const cols = Array.isArray(list) ? list.filter(k => known.has(k)) : [];
      if (!s.has(current) && (!owner || owner === team) && cols.length) {
        s.set(current, JSON.stringify({ all: SettingsFormat._upgradeColumns(cols, gridPresets) }));
        done.push(`ffa_film_room_cols -> ${current}`);
      }
      s.remove('ffa_film_room_cols');
      done.push('ffa_film_room_cols removed');
    }
    if (s.has('ffa_film_room_cols_claimed_by')) { s.remove('ffa_film_room_cols_claimed_by'); done.push('ffa_film_room_cols_claimed_by removed'); }
    return { status: done.length ? 'converted' : 'none', detail: done };
  }

  static _studyViews(s) {
    const views = s.json('ffa_study_views_v1');
    if (!Array.isArray(views)) return { status: 'none', detail: [] };
    const renamed = [];
    for (const view of views) {
      const measure = view?.state?.measure;
      if (measure && SettingsFormat.STUDY_MEASURE_RENAMES[measure]) {
        view.state.measure = SettingsFormat.STUDY_MEASURE_RENAMES[measure];
        renamed.push(`${measure} -> ${view.state.measure}`);
      }
    }
    if (renamed.length) s.set('ffa_study_views_v1', JSON.stringify(views));
    return { status: renamed.length ? 'converted' : 'none', detail: renamed };
  }

  static _homeParent(s) {
    if (!s.has('giq_home_workspace')) return { status: 'none', detail: [] };
    const done = [];
    if (!s.has('giq_home_parent')) {
      const mode = s.get('giq_home_workspace') === 'scout' ? 'scout' : 'program';
      s.set('giq_home_parent', JSON.stringify({ programSeasonId: '', mode }));
      done.push(`giq_home_workspace (${mode}) -> giq_home_parent`);
    }
    s.remove('giq_home_workspace');
    done.push('giq_home_workspace removed');
    return { status: 'converted', detail: done };
  }

  static _teamRegistry(s) {
    const teams = s.json('ffa_teams');
    const profile = s.json('ffa_team_profile') || {};
    if ((Array.isArray(teams) && teams.length) || !profile.teamName) return { status: 'none', detail: [] };
    const team = { id: new TeamRegistry().newTeamId(profile.teamName, []), teamName: profile.teamName,
      school: profile.school || '', nickname: profile.nickname || '', jerseyColor: profile.jerseyColor || '' };
    s.set('ffa_teams', JSON.stringify([team]));
    s.set('ffa_active_team_id', team.id);
    return { status: 'converted', detail: [`ffa_team_profile -> ffa_teams (${team.id})`] };
  }

  static _betaDefaults(s, version) {
    const markers = s.keys().filter(k => k && k.startsWith('ffa_beta_defaults_'));
    if (!markers.length) return { status: 'none', detail: [] };
    if (version && s.get(`ffa_beta_defaults_${version}`) === '1' && s.get('ffa_beta_defaults') !== String(version)) s.set('ffa_beta_defaults', String(version));
    for (const key of markers) s.remove(key);
    return { status: 'converted', detail: [`${markers.length} per-version markers -> ffa_beta_defaults`] };
  }

  static _deadKeys(s) {
    const removed = [];
    for (const key of SettingsFormat.DEAD_KEYS) if (s.has(key)) { s.remove(key); removed.push(key); }
    return { status: removed.length ? 'converted' : 'none', detail: removed };
  }
}
