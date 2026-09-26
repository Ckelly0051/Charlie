/* The one-time conversion of old app-settings keys (js/settings-format.js;
   legacy excision Pass 2b, coach direction 2026-09-26). Each conversion on a
   seeded old profile, the old key removed only after the new one reads back, a
   failed or unverified write keeping the old key and leaving the run
   unfinished for a retry, once-only, nothing unrelated touched, and the real
   app converting a seeded old profile at boot.

   Run after build: node tools/e2e-settings-format.mjs */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { SettingsFormat } from '../js/settings-format.js';
import { TagLibrary } from '../js/tag-library.js';

let pass = 0, fail = 0;
const ok = (c, label, d = '') => c ? (pass++, console.log('  PASS  ' + label)) : (fail++, console.log('  FAIL  ' + label + (d ? ' -- ' + d : '')));
class Mem {
  constructor(seed = {}) { this.m = new Map(Object.entries(seed)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const GRID_COLUMNS = ['sit', 'formation', 'qbAlignment', 'personnel', 'runPass', 'playType', 'playCall', 'result', 'yardage', 'penalty', 'penaltyYards', 'defFront', 'coverage', 'blitz', 'notes'];
const GRID_PRESETS = { default: ['sit', 'formation', 'qbAlignment', 'playType', 'playCall', 'result', 'yardage', 'penalty'], offense: ['sit', 'formation'], defense: ['sit', 'defFront'], special: ['sit'] };
const run = (storage, version = '1.12.0-103') => SettingsFormat.convertOnce({ storage, version, gridColumns: GRID_COLUMNS, gridPresets: GRID_PRESETS });
const step = (r, id) => r.report.results.find(x => x.id === id);

console.log('\n== 1. Each conversion on an old profile ==');
{
  const st = new Mem({
    ffa_active_team_id: 'mav', ffa_teams: '[{"id":"mav","teamName":"Mav"}]',
    ffa_custom_chips_mav: JSON.stringify({ formation: ['Trey', 'Power-I', ' '], backfield: ['Ace'] }),
    ffa_tag_libraries_old: JSON.stringify({ version: 1, groups: { formation: { custom: [], enabled: ['Wing-T'] }, playType: { custom: [], enabled: ['Run Inside'] } } }),
    ffa_tag_libraries_cur: JSON.stringify({ version: 4, groups: { playType: { custom: [], enabled: ['Run Inside'] } } }),
    ffa_film_room_cols: JSON.stringify(['sit', 'formation', 'playType', 'result', 'yardage', 'penalty']),
    ffa_study_views_v1: JSON.stringify([{ id: 'v1', name: 'A', state: { measure: 'successRate' } }, { id: 'v2', name: 'B', state: { measure: 'runShare' } }]),
    giq_home_workspace: 'scout',
    'ffa_beta_defaults_1.12.0-102': '1', 'ffa_beta_defaults_1.12.0-99': '1',
    ffa_wizard_v2: '1', ffa_video_controls_y: '12', ffa_film_room_collapsed: '1',
    ffa_linked_dirs: '{"keep":1}',
  });
  const r = run(st, '1.12.0-102');
  const lib = JSON.parse(st.getItem('ffa_tag_libraries_mav'));
  ok(lib && lib.groups.formation.custom.join(',') === 'Trey' && lib.groups.formation.enabled.includes('Trey') && lib.groups.formation.enabled.includes('Power-I')
     && lib.groups.backfield.custom.join(',') === 'Ace' && st.getItem('ffa_custom_chips_mav') === null,
    'custom chips become the team library (defaults not duplicated) and the chips key is removed', JSON.stringify(lib?.groups?.formation));
  ok(new TagLibrary({ storage: st, teamId: 'mav' }).group('formation').values.includes('Trey'), 'the converted library is read by TagLibrary with no conversion code of its own');
  const old = JSON.parse(st.getItem('ffa_tag_libraries_old'));
  ok(old.version === 4 && ['Wing-T', 'I-Form', 'Split Back'].every(v => old.groups.formation.enabled.includes(v)) && old.groups.playType.enabled.includes('Option'),
    'a version 1 library gets the defaults added since (I-Form, Split Back, Option) made visible, and is stamped version 4', JSON.stringify(old));
  ok(JSON.parse(st.getItem('ffa_tag_libraries_cur')).groups.playType.enabled.join(',') === 'Run Inside', 'a current library is left as it is (a hidden Option stays hidden)');
  ok(JSON.stringify(JSON.parse(st.getItem('ffa_film_room_columns_mav'))) === JSON.stringify({ all: GRID_PRESETS.default }) && st.getItem('ffa_film_room_cols') === null,
    'a stock pre-E3b column list is upgraded to the current preset for the active program, and the global key is removed', st.getItem('ffa_film_room_columns_mav'));
  const views = JSON.parse(st.getItem('ffa_study_views_v1'));
  ok(views[0].state.measure === 'success' && views[1].state.measure === 'runShare', 'a saved Study view naming a renamed measure gets its new id; others are unchanged', JSON.stringify(views));
  ok(JSON.stringify(JSON.parse(st.getItem('giq_home_parent'))) === '{"programSeasonId":"","mode":"scout"}' && st.getItem('giq_home_workspace') === null,
    'the mode-only Home key becomes the parent key with no parent invented', st.getItem('giq_home_parent'));
  ok(st.getItem('ffa_beta_defaults') === '1.12.0-102' && st.getItem('ffa_beta_defaults_1.12.0-102') === null && st.getItem('ffa_beta_defaults_1.12.0-99') === null,
    'per-version beta markers become one key holding the version', st.getItem('ffa_beta_defaults'));
  ok(['ffa_wizard_v2', 'ffa_video_controls_y', 'ffa_film_room_collapsed'].every(k => st.getItem(k) === null), 'dead UI keys are removed');
  ok(st.getItem('ffa_linked_dirs') === '{"keep":1}' && st.getItem('ffa_teams') === '[{"id":"mav","teamName":"Mav"}]', 'current keys are not touched');
  ok(r.receipt === 'written' && JSON.parse(st.getItem(SettingsFormat.MARKER)).results.length === 7, 'the outcome is recorded under the marker', JSON.stringify(r.report));
  st.setItem('giq_home_workspace', 'program');
  const again = run(st);
  ok(again.skipped && st.getItem('giq_home_workspace') === 'program', 'with the marker present it never runs again');
}

console.log('\n== 2. Ownership rules carried over from the old readers ==');
{
  // A custom global list is kept.
  const a = new Mem({ ffa_active_team_id: 'mav', ffa_film_room_cols: JSON.stringify(['sit', 'notes', 'bogus']) });
  run(a);
  ok(JSON.stringify(JSON.parse(a.getItem('ffa_film_room_columns_mav'))) === '{"all":["sit","notes"]}', 'a custom column list is kept (unknown columns dropped)', a.getItem('ffa_film_room_columns_mav'));
  // Sets saved while no program was active are current, not retired: PlayGrid
  // hands them to the first program, so the converter leaves them alone.
  const b = new Mem({ ffa_active_team_id: 'mav', ffa_film_room_columns_default: '{"all":["sit"]}' });
  run(b);
  ok(b.getItem('ffa_film_room_columns_default') === '{"all":["sit"]}' && b.getItem('ffa_film_room_columns_mav') === null, 'the no-program key is current and left for PlayGrid');
  // A global list already claimed by another program seeds nothing here.
  const c = new Mem({ ffa_active_team_id: 'other', ffa_film_room_cols: '["sit","notes"]', ffa_film_room_cols_claimed_by: 'mav' });
  run(c);
  ok(c.getItem('ffa_film_room_columns_other') === null && c.getItem('ffa_film_room_cols') === null && c.getItem('ffa_film_room_cols_claimed_by') === null,
    'a list claimed by another program seeds nothing; both old keys are removed');
  // Program sets that already exist are never overwritten.
  const d = new Mem({ ffa_active_team_id: 'mav', ffa_film_room_columns_mav: '{"all":["notes"]}', ffa_film_room_cols: '["sit","formation"]' });
  run(d);
  ok(d.getItem('ffa_film_room_columns_mav') === '{"all":["notes"]}', 'existing program sets are never overwritten');
  // Chips with a library already present: the library wins, the chips go.
  const e = new Mem({ ffa_tag_libraries_t: '{"version":4,"groups":{}}', ffa_custom_chips_t: '{"formation":["X"]}' });
  run(e);
  ok(e.getItem('ffa_tag_libraries_t') === '{"version":4,"groups":{}}' && e.getItem('ffa_custom_chips_t') === null, 'an existing library is never overwritten by old chips');
  // Pre-registry install; and an installed registry is left alone.
  const f = new Mem({ ffa_team_profile: '{"teamName":"St. Joseph Mavericks","jerseyColor":"#003"}' });
  run(f);
  ok(f.getItem('ffa_teams') === '[{"id":"st-joseph-mavericks","teamName":"St. Joseph Mavericks","school":"","nickname":"","jerseyColor":"#003"}]' && f.getItem('ffa_active_team_id') === 'st-joseph-mavericks',
    'a pre-registry profile becomes the first registry team', f.getItem('ffa_teams'));
  const g = new Mem({ ffa_team_profile: '{"teamName":"X"}', ffa_teams: '[{"id":"y","teamName":"Y"}]' });
  run(g);
  ok(g.getItem('ffa_teams') === '[{"id":"y","teamName":"Y"}]', 'an existing registry is not touched');
  // Beta: a profile that never ran this version keeps no key, so its defaults apply once.
  // A pre-registry profile with the old global list: the list reaches the new program, not `default`.
  const pr = new Mem({ ffa_team_profile: '{"teamName":"Pre Reg"}', ffa_film_room_cols: '["sit","notes"]' });
  run(pr);
  ok(pr.getItem('ffa_film_room_columns_pre-reg') === '{"all":["sit","notes"]}' && pr.getItem('ffa_film_room_columns_default') === null,
    "a pre-registry profile's column list is carried to the program it becomes", JSON.stringify([...pr.m.keys()]));
  const h = new Mem({ 'ffa_beta_defaults_1.12.0-99': '1' });
  run(h, '1.12.0-103');
  ok(h.getItem('ffa_beta_defaults') === null && h.getItem('ffa_beta_defaults_1.12.0-99') === null, 'older beta markers are removed without claiming the running version');
  // A Home parent that already exists is kept.
  const i = new Mem({ giq_home_parent: '{"programSeasonId":"s1","mode":"program"}', giq_home_workspace: 'scout' });
  run(i);
  ok(i.getItem('giq_home_parent') === '{"programSeasonId":"s1","mode":"program"}' && i.getItem('giq_home_workspace') === null, 'an existing Home parent is kept; the old key is removed');
}

console.log('\n== 3. A failed or unverified write keeps the old key and retries ==');
{
  const seed = { ffa_custom_chips_mav: '{"formation":["Trey"]}', giq_home_workspace: 'scout' };
  const st = new Mem(seed); const set = st.setItem.bind(st);
  st.setItem = (k, v) => { if (k === 'ffa_tag_libraries_mav') throw new Error('quota'); set(k, v); };
  const r = run(st);
  ok(step(r, 'tagLibraries').status === 'failed' && st.getItem('ffa_custom_chips_mav') === seed.ffa_custom_chips_mav && st.getItem(SettingsFormat.MARKER) === null && r.receipt === 'unfinished',
    'a write that throws keeps the old key and writes no marker', JSON.stringify(r.report));
  ok(step(r, 'homeParent').status === 'converted' && st.getItem('giq_home_workspace') === null, 'the other conversions still run');
  st.setItem = set;
  const retry = run(st);
  ok(step(retry, 'tagLibraries').status === 'converted' && st.getItem('ffa_custom_chips_mav') === null && retry.receipt === 'written', 'the next launch retries and finishes');

  const silent = new Mem({ giq_home_workspace: 'scout' }); silent.setItem = () => {};
  const s = run(silent);
  ok(step(s, 'homeParent').status === 'failed' && /did not read back/.test(step(s, 'homeParent').detail) && silent.getItem('giq_home_workspace') === 'scout',
    'a write that does not read back keeps the old key', JSON.stringify(step(s, 'homeParent')));
}

console.log('\n== 4. The real app converts an old profile at boot ==');
{
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    const seed = { ffa_team_profile: '{"teamName":"Boot Mavericks"}', ffa_custom_chips_boot: '{"formation":["Trey"]}',
      ffa_film_room_cols: '["sit","notes","formation"]', giq_home_workspace: 'program',
      ffa_workspace_shell_v2: '1', 'ffa_beta_defaults_1.12.0-2': '1' };
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    sessionStorage.setItem('seeded', '1');
  });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  const r = await page.evaluate(() => {
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return { report: window.app.settingsFormat?.report, keys, teams: localStorage.getItem('ffa_teams'), active: localStorage.getItem('ffa_active_team_id'),
      marker: !!localStorage.getItem('giq_settings_format_2026_09_26'), preset: window.app.playGrid.constructor.PRESETS.default,
      cols: JSON.stringify(JSON.parse(localStorage.getItem('ffa_film_room_columns_boot-mavericks') || 'null')?.all ? { all: JSON.parse(localStorage.getItem('ffa_film_room_columns_boot-mavericks')).all } : null) };
  });
  const old = ['ffa_custom_chips_boot', 'ffa_film_room_cols', 'giq_home_workspace', 'ffa_workspace_shell_v2', 'ffa_beta_defaults_1.12.0-2'];
  ok(r.marker && old.every(k => !r.keys.includes(k)), 'boot converts the old profile: every old key is gone and the marker is written', JSON.stringify(r));
  ok(r.active === 'boot-mavericks' && /"id":"boot-mavericks"/.test(r.teams), 'the pre-registry profile became the registry team before the app read it', JSON.stringify(r));
  ok(r.cols === JSON.stringify({ all: ['sit', 'notes', 'formation'] }), "the old custom column list is carried to the new program's key (the registry is converted first)", JSON.stringify({ cols: r.cols }));
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await browser.close();
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
