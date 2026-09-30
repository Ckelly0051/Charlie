/**
 * THROWAWAY: the one-time Formation -> Formation Family / Receiver Set conversion
 * (GRIDIRON-IQ-PLAN-V2.md, "Approved Break Down charting comp - build contract",
 * item 3). Delete this file and tools/convert-charting-once.mjs after the live
 * conversion; nothing in js/ imports either.
 *
 * The old `tags.formation` field mixed family, receiver and package words in one
 * multi-select ("Spread + Doubles", "Trips + Unbalanced"). The current format
 * keeps Family, numeric Set, receiver Look/Side and Line Balance separately, and has no
 * `formation` field. This module decides, for one stored value, what it becomes,
 * and refuses to decide when the mapping does not say:
 *
 *   - a token the coach's mapping (or the built-in deterministic list) names
 *     converts;
 *   - any other token, a value carrying two families or two receiver sets, or a
 *     value that still holds an old alignment ("Shotgun + Trips") is UNRESOLVED:
 *     the play is left exactly as stored and listed for the coach;
 *   - nothing is guessed, split by football sense, or discarded, and a blank
 *     Formation stays blank.
 *
 * The mapping file (the coach's decisions):
 *   { "tokens": { "Trips": { "receiverLook": "Trips" }, "Ace": { "formationFamily": "Ace" },
 *                 "Victory": { "blank": true } },
 *     "combinations": { "Trips + Bunch": { "receiverLook": "Bunch" } },
 *     "plays":  { "<seasonId>|<gameId>|<playId>": { "formationFamily": "Spread", "receiverLook": "Bunch", "receiverSide": "Left" } } }
 * `blank` is the coach choosing to drop a token; the play is listed for re-charting
 * with its old value.
 */
import { TagLibrary } from '../js/tag-library.js';
import { TagProjection } from '../js/tag-projection.js';
import { ChartingDetails } from '../js/charting-details.js';
import { SeasonFormat } from '../js/season-format.js';

export const OLD_KEY = 'formation';
export const NEW_KEYS = ChartingDetails.KEYS;
const clone = o => JSON.parse(JSON.stringify(o));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const LOOK_KEYS = ['formationFamily', 'receiverSet', 'receiverLook', 'receiverSide', 'lineBalance'];
const EXTRA_KEYS = ['receiverLook', 'receiverSide', 'lineBalance'];

/** Tokens that are exactly a Formation Family in the current vocabulary. */
export const DETERMINISTIC = Object.freeze(Object.fromEntries(
  TagLibrary.DEFINITIONS.formationFamily.map(name => [name, { formationFamily: name }])));

export const tokensOf = value => String(value == null ? '' : value).split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
export const combinationOf = value => [...new Set(tokensOf(value))].sort().join(' + ');

export function emptyMapping() { return { tokens: {}, plays: {} }; }

/** The rule for one token: the coach's mapping first, else the exact family name. */
export function ruleFor(token, mapping) {
  const own = mapping?.tokens && has(mapping.tokens, token) ? mapping.tokens[token] : null;
  return own || DETERMINISTIC[token] || null;
}

/** Check a mapping's own values: a Receiver Set must be one the app offers. */
export function mappingProblems(mapping) {
  const out = [];
  const check = (where, rule) => {
    if (!rule || typeof rule !== 'object') { out.push(`${where}: not a rule`); return; }
    if (rule.blank) {
      if (rule.blank !== true || LOOK_KEYS.some(key => rule[key]) || Object.keys(rule).some(key => ![...LOOK_KEYS, 'blank'].includes(key))) out.push(`${where}: blank cannot carry a look value or an unknown field`);
      return;
    }
    for (const key of LOOK_KEYS) if (rule[key] != null && typeof rule[key] !== 'string') out.push(`${where}: ${key} must be text`);
    if (rule.receiverSet && !ChartingDetails.RECEIVER_SETS.includes(rule.receiverSet)) out.push(`${where}: receiverSet "${rule.receiverSet}" is not offered`);
    for (const [key, allowed] of [['receiverLook', ChartingDetails.RECEIVER_LOOKS], ['receiverSide', ChartingDetails.RECEIVER_SIDES], ['lineBalance', ChartingDetails.LINE_BALANCES]]) {
      if (rule[key] && !allowed.includes(rule[key])) out.push(`${where}: ${key} "${rule[key]}" is not offered`);
    }
    for (const key of Object.keys(rule)) if (![...LOOK_KEYS, 'blank'].includes(key)) out.push(`${where}: unknown mapping field ${key}`);
    if (rule.formationFamily) {
      if (String(rule.formationFamily).includes('+')) out.push(`${where}: a Family must be one value`);
      const owner = TagLibrary.reservedOwner('formationFamily', rule.formationFamily);
      if (owner) out.push(`${where}: "${rule.formationFamily}" is a ${owner} value, not a Family`);
    }
    if (!LOOK_KEYS.some(key => rule[key])) out.push(`${where}: names no look field`);
  };
  for (const [token, rule] of Object.entries(mapping?.tokens || {})) check(`token "${token}"`, rule);
  for (const [ref, rule] of Object.entries(mapping?.plays || {})) check(`play ${ref}`, rule);
  const seenCombinations = new Map();
  for (const [name, rule] of Object.entries(mapping?.combinations || {})) {
    check(`combination "${name}"`, rule);
    const key = combinationOf(name);
    if (seenCombinations.has(key) && JSON.stringify(seenCombinations.get(key)) !== JSON.stringify(rule)) out.push(`combination "${name}": conflicting rules for the same words`);
    seenCombinations.set(key, rule);
  }
  return out;
}

/**
 * Decide one stored Formation value. Returns
 *   { status: 'blank' }                                  nothing was charted
 *   { status: 'convert', formationFamily, receiverSet, dropped: [tokens the coach blanked] }
 *   { status: 'unresolved', reasons: [...] }
 *   { status: 'old-format', reasons: [...] }             holds an old alignment / Empty
 */
export function decide(value, mapping, ref = '') {
  const tokens = tokensOf(value);
  if (!tokens.length) return { status: 'blank' };
  const leaked = tokens.filter(t => TagProjection.QB_ALIGNMENTS.includes(t) || TagProjection.FORMATION_BACKFIELD_TOKENS.includes(t));
  if (leaked.length) return { status: 'old-format', reasons: [`holds ${leaked.join(', ')} (an old combined look)`] };
  const perPlay = ref && mapping?.plays && has(mapping.plays, ref) ? mapping.plays[ref] : null;
  const matches = Object.entries(mapping?.combinations || {}).filter(([name]) => combinationOf(name) === combinationOf(value));
  if (matches.length > 1 && matches.some(([, rule]) => JSON.stringify(rule) !== JSON.stringify(matches[0][1]))) return { status: 'unresolved', reasons: ['conflicting combination rules'] };
  const override = perPlay || matches[0]?.[1] || null;
  if (override) {
    const next = { formationFamily: override.formationFamily || '', receiverSet: override.receiverSet || '' };
    for (const key of EXTRA_KEYS) if (override[key]) next[key] = override[key];
    const problems = [...mappingProblems({ plays: { [ref]: override } }), ...ChartingDetails.problems(next)];
    if (problems.length) return { status: 'unresolved', reasons: problems };
    return { status: 'convert', ...next, dropped: override.blank ? tokens : [], override: true };
  }
  const families = new Set(), sets = new Set(), dropped = [], reasons = [];
  const extras = Object.fromEntries(EXTRA_KEYS.map(key => [key, new Set()]));
  for (const token of tokens) {
    const rule = ruleFor(token, mapping);
    if (!rule) { reasons.push(`"${token}" has no mapping`); continue; }
    const invalid = mappingProblems({ tokens: { [token]: rule } });
    if (invalid.length) { reasons.push(...invalid); continue; }
    if (rule.blank) { dropped.push(token); continue; }
    if (rule.formationFamily) families.add(rule.formationFamily);
    if (rule.receiverSet) sets.add(rule.receiverSet);
    for (const key of EXTRA_KEYS) if (rule[key]) extras[key].add(rule[key]);
  }
  if (families.size > 1) reasons.push(`two families (${[...families].join(' + ')})`);
  if (sets.size > 1) reasons.push(`two receiver sets (${[...sets].join(' + ')})`);
  for (const key of EXTRA_KEYS) if (extras[key].size > 1) reasons.push(`two ${key} values (${[...extras[key]].join(' + ')})`);
  const next = { formationFamily: [...families][0] || '', receiverSet: [...sets][0] || '' };
  for (const key of EXTRA_KEYS) if (extras[key].size === 1) next[key] = [...extras[key]][0];
  reasons.push(...ChartingDetails.problems(next), ...ChartingDetails.vocabularyProblems(next));
  if (reasons.length) return { status: 'unresolved', reasons };
  return { status: 'convert', ...next, dropped };
}

/** Add the current keys a converted play carries, blank, exactly as a new play is born. */
function completeKeys(tags) { for (const k of NEW_KEYS) if (!has(tags, k)) tags[k] = ''; }

/**
 * Convert one play in place. `ref` names it ("season|game|play") for a per-play
 * override. Returns { status, ...decision, oldValue }.
 */
export function convertPlay(play, mapping, ref) {
  const tags = play && play.tags;
  if (!tags || typeof tags !== 'object') return { status: 'no-tags' };
  if (!has(tags, OLD_KEY)) { completeKeys(tags); return { status: 'current' }; }
  const oldValue = tags[OLD_KEY];
  const decision = decide(oldValue, mapping, ref);
  if (decision.status === 'unresolved' || decision.status === 'old-format') return { ...decision, oldValue };
  for (const key of LOOK_KEYS) {
    if (decision[key] && tags[key] && tags[key] !== decision[key]) return { status: 'unresolved', reasons: [`${key} already holds ${tags[key]}`], oldValue };
  }
  delete tags[OLD_KEY];
  tags.formationFamily = decision.status === 'convert' ? decision.formationFamily : (tags.formationFamily || '');
  tags.receiverSet = decision.status === 'convert' ? decision.receiverSet : (tags.receiverSet || '');
  for (const key of EXTRA_KEYS) {
    if (decision[key]) {
      tags[key] = decision[key];
    }
  }
  completeKeys(tags);
  return { ...decision, oldValue };
}

/** Convert a play call's saved default (season.playbook.calls[].defaults.formation). */
export function convertPlaybook(playbook, mapping, where) {
  const out = { converted: 0, unresolved: [], oldFormatCalls: [] };
  for (const call of (playbook && Array.isArray(playbook.calls) ? playbook.calls : [])) {
    const defaults = call && call.defaults;
    if (!defaults || !has(defaults, OLD_KEY)) continue;
    const decision = decide(defaults[OLD_KEY], mapping);
    if (decision.status === 'unresolved' || decision.status === 'old-format') { out.unresolved.push({ where: `${where} call "${call.name}"`, oldValue: defaults[OLD_KEY], reasons: decision.reasons }); continue; }
    const conflicts = LOOK_KEYS.filter(key => decision[key] && defaults[key] && defaults[key] !== decision[key]);
    if (conflicts.length) { out.unresolved.push({ where: `${where} call "${call.name}"`, oldValue: defaults[OLD_KEY], reasons: conflicts.map(key => `${key} already holds ${defaults[key]}`) }); continue; }
    delete defaults[OLD_KEY];
    if (decision.formationFamily) defaults.formationFamily = decision.formationFamily;
    if (decision.receiverSet) defaults.receiverSet = decision.receiverSet;
    for (const key of EXTRA_KEYS) if (decision[key]) defaults[key] = decision[key];
    out.converted++;
  }
  return out;
}

/**
 * Convert a season body (games with plays, and its playbook) in place. Returns
 * counts and the lists the coach needs: `unresolved` plays (left unchanged),
 * `old` plays holding an old alignment (a document that carries any is not
 * convertible), `dropped` (the coach blanked a token; re-chart list), and the
 * distinct tokens seen with their counts.
 */
export function convertSeason(season, mapping, label = '') {
  const r = { plays: 0, withFormation: 0, converted: 0, blankKept: 0, unresolved: [], old: [], dropped: [], tokens: {}, combinations: {}, playbook: null };
  const seasonId = season.id || label;
  for (const game of season.games || []) {
    for (const play of game.plays || []) {
      r.plays++;
      const tags = play.tags || {};
      const ref = `${seasonId}|${game.id}|${play.id}`;
      const oldValue = has(tags, OLD_KEY) ? tags[OLD_KEY] : undefined;
      if (oldValue) { r.withFormation++; for (const token of tokensOf(oldValue)) r.tokens[token] = (r.tokens[token] || 0) + 1; }
      if (oldValue) {
        const combination = combinationOf(oldValue);
        (r.combinations[combination] ||= []).push({ seasonId, gameId: game.id, playId: play.id, ref, oldValue });
      }
      const result = convertPlay(play, mapping, ref);
      const where = { season: season.seasonName || seasonId, game: game.name || game.id, play: play.id, ref, oldValue: oldValue ?? '' };
      if (result.status === 'convert') { if (oldValue) r.converted++; if (result.dropped?.length) r.dropped.push({ ...where, dropped: result.dropped }); }
      else if (result.status === 'blank') r.blankKept++;
      else if (result.status === 'unresolved') r.unresolved.push({ ...where, reasons: result.reasons });
      else if (result.status === 'old-format') r.old.push({ ...where, reasons: result.reasons });
    }
  }
  r.playbook = convertPlaybook(season.playbook, mapping, season.seasonName || seasonId);
  return r;
}

/** Whether a stored document (season body or game snapshot) is current once its
 *  Formation is converted: what remains after the retired-Formation refusals. */
export function otherProblems(data) {
  const isSeason = data && Array.isArray(data.games);
  const list = isSeason ? SeasonFormat.seasonProblems(data) : SeasonFormat.gameProblems(data);
  return list.filter(p => !/retired Formation/.test(p.problem));
}

export { clone };
