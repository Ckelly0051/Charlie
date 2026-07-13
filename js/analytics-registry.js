/**
 * AnalyticsRegistry - pure contracts for the redesign's shared analytics layer.
 *
 * Ready measures select values already produced by StatsEngine.compute().
 * Required concepts without one canonical production meaning stay explicitly
 * `requires-context`; consumers cannot accidentally invent a denominator.
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';

export class AnalyticsRegistry {
  constructor(statsEngine) {
    if (!statsEngine || typeof statsEngine.compute !== 'function') {
      throw new TypeError('AnalyticsRegistry requires a StatsEngine instance');
    }
    this.stats = statsEngine;
    this._SE = statsEngine.constructor;
    this._dimensions = this._buildDimensions();
    this._measures = this._buildMeasures();
    this._blocks = this._buildBlocks();
    this._dimensionMap = this._index(this._dimensions, 'dimension');
    this._measureMap = this._index(this._measures, 'measure');
    this._blockMap = this._index(this._blocks, 'block');
  }

  _index(entries, kind) {
    const map = new Map();
    for (const entry of entries) {
      if (map.has(entry.id)) throw new Error(`Duplicate analytics ${kind}: ${entry.id}`);
      map.set(entry.id, Object.freeze(entry));
    }
    return map;
  }

  _buildDimensions() {
    const SE = this._SE;
    const tag = key => (p) => this._one(p?.tags?.[key]);
    const special = p => SpecialTeamsModel.normalize(p?.specialTeams);
    const penalties = p => PenaltyModel.normalizeList(p?.penalties);
    const context = key => (_p, ctx) => this._one(ctx?.[key]);
    const pairs = (obj, split = false) => Object.entries(obj || {}).flatMap(([role, value]) => {
      const values = split ? SE.splitPlayers(value) : this._one(value);
      return values.map(v => `${role}=${v}`);
    });
    const ready = (id, name, values, canonical, extra = {}) => ({ id, name, availability: 'ready', values, canonical, ...extra });
    const deferred = (id, name, reason) => ({ id, name, availability: 'requires-context', canonical: null, reason });

    return [
      ready('team', 'Team', context('team'), 'query context.team'),
      ready('season', 'Season', context('season'), 'query context.season'),
      ready('game', 'Game', (p, ctx) => this._one(p?.__gid || ctx?.gameId || ctx?.game), 'play.__gid | query context.gameId'),
      ready('opponent', 'Opponent', context('opponent'), 'query context.opponent'),
      ready('date', 'Date', context('date'), 'query context.date'),
      ready('quarter', 'Quarter', tag('quarter'), 'play.tags.quarter'),
      ready('drive', 'Drive', tag('driveNumber'), 'play.tags.driveNumber'),
      ready('unit', 'Unit', p => [p?.tags?.unit || 'offense'], 'legacy blank => offense'),
      ready('down', 'Down', tag('down'), 'play.tags.down'),
      ready('distance', 'Distance', tag('distance'), 'play.tags.distance'),
      deferred('fieldZone', 'Field Zone', 'No shared production field-zone bucketing function'),
      ready('hash', 'Hash', tag('hash'), 'play.tags.hash'),
      deferred('scoreSituation', 'Score Situation', 'Requires score-at-play context and canonical buckets'),
      ready('formation', 'Formation', p => SE.splitFormations(p?.tags?.formation), 'StatsEngine.splitFormations', { multi: true }),
      ready('backfield', 'Backfield', tag('backfield'), 'play.tags.backfield'),
      ready('strength', 'Strength', tag('strength'), 'play.tags.strength'),
      ready('personnel', 'Personnel', tag('personnel'), 'play.tags.personnel'),
      ready('motion', 'Motion', p => [p?.tags?.motion || 'No Motion'], 'play.tags.motion | No Motion'),
      ready('playType', 'Play Type', p => SE.splitPlayTypes(p?.tags?.playType), 'StatsEngine.splitPlayTypes', { multi: true }),
      ready('playDir', 'Play Direction', tag('playDir'), 'play.tags.playDir'),
      ready('defFront', 'Defensive Front', p => SE.splitFronts(p?.tags?.defFront), 'StatsEngine.splitFronts', { multi: true }),
      ready('coverage', 'Coverage', tag('coverage'), 'play.tags.coverage'),
      ready('blitz', 'Blitz / Pressure', p => SE.splitBlitzes(p?.tags?.blitz), 'StatsEngine.splitBlitzes', { multi: true }),
      ready('playerRole', 'Player Role', p => pairs(p?.tags?.players, true), 'StatsEngine.splitPlayers', { multi: true }),
      ready('grade', 'Grade', p => pairs(p?.tags?.grades), 'play.tags.grades', { multi: true }),
      ready('specialTeamsPhase', 'Special Teams Unit', p => this._one(special(p)?.unit), 'SpecialTeamsModel.normalize.unit'),
      ready('specialTeamsOutcome', 'Special Teams Outcome', p => this._one(special(p)?.outcome.status), 'SpecialTeamsModel.normalize.outcome.status'),
      ready('specialTeamsRole', 'Special Teams Role', p => this._one(special(p)?.subjectRole), 'SpecialTeamsModel.normalize.subjectRole'),
      ready('specialTeamsScore', 'Special Teams Score', p => this._one(special(p)?.outcome.score), 'SpecialTeamsModel.normalize.outcome.score'),
      ready('penaltyTeam', 'Penalty Charged To', p => penalties(p).map(item => item.team), 'PenaltyModel.normalizeList.team', { multi: true }),
      ready('penaltyFoul', 'Penalty Foul', p => penalties(p).map(item => item.foul).filter(Boolean), 'PenaltyModel.normalizeList.foul', { multi: true }),
      ready('penaltyRuling', 'Penalty Ruling', p => penalties(p).map(item => item.disposition), 'PenaltyModel.normalizeList.disposition', { multi: true }),
      ready('penaltyPhase', 'Penalty Phase', p => penalties(p).map(item => item.phase), 'PenaltyModel.normalizeList.phase', { multi: true }),
      ready('penaltyPlayCounts', 'Penalty Play Counts', p => penalties(p).map(item => item.playCounts === true ? 'Play counts' : item.playCounts === false ? 'No play' : 'Unknown'), 'PenaltyModel.normalizeList.playCounts', { multi: true }),
      ready('customTag', 'Custom Tag', p => (p?.tags?.custom || []).filter(Boolean).map(String), 'play.tags.custom', { multi: true }),
      ready('customField', 'Custom Field', p => pairs(p?.tags?.customFields), 'play.tags.customFields', { multi: true }),
      ready('result', 'Result', p => SE.splitResults(p?.tags?.result), 'StatsEngine.splitResults', { multi: true }),
      ready('runPass', 'Run / Pass', p => SE.isRun(p) ? ['Run'] : SE.isPass(p) ? ['Pass'] : [], 'StatsEngine.isRun/isPass'),
    ];
  }

  _buildMeasures() {
    const ready = (id, name, path, canonical, extra = {}) => ({ id, name, availability: 'ready', path, canonical, ...extra });
    const deferred = (id, name, reason) => ({ id, name, availability: 'requires-context', path: null, canonical: null, reason });
    return [
      ready('plays', 'Plays', ['allPlays'], 'StatsEngine.compute().allPlays'),
      deferred('frequency', 'Frequency', 'Requires an explicit parent-cohort denominator'),
      ready('runShare', 'Run Share', ['tendencies', 'runPct'], 'StatsEngine._tendencyStats'),
      ready('passShare', 'Pass Share', ['tendencies', 'passPct'], 'StatsEngine._tendencyStats'),
      deferred('yardsPerPlay', 'Yards / Play', 'Displayed in several reports but has no single canonical output field'),
      ready('successRate', 'Success Rate', ['efficiency', 'successRate'], 'StatsEngine._efficiencyStats'),
      deferred('conversionRate', 'Conversion Rate', 'Requires conversion type/down context'),
      ready('explosiveRate', 'Explosive Rate', ['efficiency', 'explosivePct'], 'StatsEngine._efficiencyStats'),
      ready('negativeRate', 'Negative Play Rate', ['efficiency', 'negativePct'], 'StatsEngine._efficiencyStats'),
      ready('turnovers', 'Turnovers', ['turnovers', 'total'], 'StatsEngine._turnoverStats', { unit: 'offense' }),
      deferred('scoring', 'Scoring', 'Requires an explicit points vs touchdowns contract'),
      ready('touchdowns', 'Touchdowns', ['scoring', 'touchdowns'], 'StatsEngine._scoringStats', { unit: 'offense' }),
      ready('havocRate', 'Havoc Rate', ['defensive', 'havocRate'], 'StatsEngine._defensiveStats', { unit: 'defense' }),
      deferred('stopRate', 'Stop Rate', 'Canonical only inside defensive groups; requires a selected cohort'),
      ready('epaPerPlay', 'EPA / Play', ['advanced', 'perPlay'], 'AdvancedMetrics.summarize'),
      ready('sampleSize', 'Sample Size', ['allPlays'], 'StatsEngine.compute().allPlays'),
      deferred('dataCompleteness', 'Data Completeness', 'No canonical production completeness measure'),
    ];
  }

  _buildBlocks() {
    return [
      'totalPlays', 'allPlays', 'offPlays', 'defPlays', 'filterActive',
      'rushing', 'passing', 'scoring', 'downs', 'turnovers', 'tendencies',
      'bigPlays', 'individuals', 'drives', 'situational', 'efficiency',
      'personnel', 'advanced', 'defensive', 'gameFlow', 'conversions',
      'specialTeams', 'scoreboard', 'hash', 'personnelSituation',
      'frontCoverageCombos', 'playAction', 'dirMotion', 'takeaways'
    ].map(id => ({ id, name: id, availability: 'ready', path: [id], canonical: `StatsEngine.compute().${id}` }));
  }

  _one(value) {
    return value == null || value === '' ? [] : [String(value)];
  }

  _readPath(source, path) {
    return path.reduce((value, key) => value == null ? undefined : value[key], source);
  }

  listDimensions() { return [...this._dimensionMap.values()]; }
  listMeasures() { return [...this._measureMap.values()]; }
  listBlocks() { return [...this._blockMap.values()]; }
  getDimension(id) { return this._dimensionMap.get(id) || null; }
  getMeasure(id) { return this._measureMap.get(id) || null; }
  getBlock(id) { return this._blockMap.get(id) || null; }

  values(id, play, context = {}) {
    const entry = this.getDimension(id);
    if (!entry) throw new Error(`Unknown analytics dimension: ${id}`);
    if (entry.availability !== 'ready' || typeof entry.values !== 'function') {
      throw new Error(`Analytics dimension requires context: ${id}`);
    }
    return entry.values(play, context);
  }

  readMeasures(stats, ids) {
    const out = {};
    for (const id of ids) {
      const entry = this.getMeasure(id);
      if (!entry) throw new Error(`Unknown analytics measure: ${id}`);
      if (entry.availability !== 'ready') throw new Error(`Analytics measure requires context: ${id}`);
      const value = this._readPath(stats, entry.path);
      out[id] = id === 'sampleSize' && Array.isArray(value) ? value.length : value;
    }
    return out;
  }

  readBlocks(stats, ids) {
    const out = {};
    for (const id of ids) {
      const entry = this.getBlock(id);
      if (!entry) throw new Error(`Unknown analytics block: ${id}`);
      out[id] = this._readPath(stats, entry.path);
    }
    return out;
  }

  /**
   * Composite play reference `${gameId}::${id}` — play ids restart per game, so a
   * bare id can't identify a play across the season scope (the "no lost film link"
   * contract). PRODUCTION CONTRACT: live tagger plays do NOT carry `__gid`, so a
   * consumer (Study / Watch / cutups) must stamp `play.__gid` — recommended at
   * season/store load so every scope works uniformly — OR pass `context.gameId`.
   * Supplying neither is a hard error here, never a silently-ambiguous reference.
   */
  playRef(play, context = {}) {
    const gameId = play?.__gid || context.gameId || context.game;
    if (!gameId || play?.id == null) throw new Error('Composite play reference requires gameId and play.id');
    return `${gameId}::${play.id}`;
  }

  matchingRefs(plays, cutType, cutValue, context = {}) {
    const predicate = this.stats._buildCutFilter(cutType, cutValue);
    if (typeof predicate !== 'function') throw new Error(`Unknown analytics cut: ${cutType}`);
    return (plays || []).filter(predicate).map(play => this.playRef(play, context)).sort();
  }
}
