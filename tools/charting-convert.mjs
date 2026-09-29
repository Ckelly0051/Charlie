/**
 * THROWAWAY: the one-time Formation -> Formation Family / Receiver Set conversion
 * (GRIDIRON-IQ-PLAN-V2.md, "Approved Break Down charting comp - build contract",
 * item 3). Delete this file and tools/convert-charting-once.mjs after the live
 * conversion; nothing in js/ imports either.
 *
 * The old `tags.formation` field mixed family, receiver and package words in one
 * multi-select ("Spread + Doubles", "Trips + Unbalanced"). The current format
 * keeps `formationFamily` and `receiverSet`, each one value, and has no
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
 *   { "tokens": { "Trips": { "receiverSet": "3x1" }, "Ace": { "formationFamily": "Ace" },
 *                 "Victory": { "blank": true } },
 *     "plays":  { "<seasonId>|<gameId>|<playId>": { "formationFamily": "Spread", "receiverSet": "3x1" } } }
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

/** Tokens that are exactly a Formation Family in the current vocabulary. */
export const DETERMINISTIC = Object.freeze(Object.fromEntries(
  TagLibrary.DEFINITIONS.formationFamily.map(name => [name, { formationFamily: name }])));

export const tokensOf = value => String(value == null ? '' : value).split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);

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
    if (rule.blank) return;
    if (rule.receiverSet && !ChartingDetails.RECEIVER_SETS.includes(rule.receiverSet)) out.push(`${where}: receiverSet "${rule.receiverSet}" is not offered`);
    if (rule.formationFamily) {
      const owner = TagLibrary.reservedOwner('formationFamily', rule.formationFamily);
      if (owner) out.push(`${where}: "${rule.formationFamily}" is a ${owner} value, not a Family`);
    }
    if (!rule.formationFamily && !rule.receiverSet) out.push(`${where}: names neither a family nor a receiver set`);
  };
  for (const [token, rule] of Object.entries(mapping?.tokens || {})) check(`token "${token}"`, rule);
  for (const [ref, rule] of Object.entries(mapping?.plays || {})) check(`play ${ref}`, rule);
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
  const override = ref && mapping?.plays && has(mapping.plays, ref) ? mapping.plays[ref] : null;
  if (override) {
    return { status: 'convert', formationFamily: override.formationFamily || '', receiverSet: override.receiverSet || '', dropped: [], override: true };
  }
  const families = new Set(), sets = new Set(), dropped = [], reasons = [];
  for (const token of tokens) {
    const rule = ruleFor(token, mapping);
    if (!rule) { reasons.push(`"${token}" has no mapping`); continue; }
    if (rule.blank) { dropped.push(token); continue; }
    if (rule.formationFamily) families.add(rule.formationFamily);
    if (rule.receiverSet) sets.add(rule.receiverSet);
  }
  if (families.size > 1) reasons.push(`two families (${[...families].join(' + ')})`);
  if (sets.size > 1) reasons.push(`two receiver sets (${[...sets].join(' + ')})`);
  if (reasons.length) return { status: 'unresolved', reasons };
  return { status: 'convert', formationFamily: [...families][0] || '', receiverSet: [...sets][0] || '', dropped };
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
  delete tags[OLD_KEY];
  tags.formationFamily = decision.status === 'convert' ? decision.formationFamily : (tags.formationFamily || '');
  tags.receiverSet = decision.status === 'convert' ? decision.receiverSet : (tags.receiverSet || '');
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
    delete defaults[OLD_KEY];
    if (decision.formationFamily) defaults.formationFamily = decision.formationFamily;
    if (decision.receiverSet) defaults.receiverSet = decision.receiverSet;
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
  const r = { plays: 0, withFormation: 0, converted: 0, blankKept: 0, unresolved: [], old: [], dropped: [], tokens: {}, playbook: null };
  const seasonId = season.id || label;
  for (const game of season.games || []) {
    for (const play of game.plays || []) {
      r.plays++;
      const tags = play.tags || {};
      const ref = `${seasonId}|${game.id}|${play.id}`;
      const oldValue = has(tags, OLD_KEY) ? tags[OLD_KEY] : undefined;
      if (oldValue) { r.withFormation++; for (const token of tokensOf(oldValue)) r.tokens[token] = (r.tokens[token] || 0) + 1; }
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
