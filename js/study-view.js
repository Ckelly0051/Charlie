/** Structured Study view models. All football formulas remain in StudyQuery. */
const uniq = xs => [...new Set(xs || [])];
const scopeName = (s, sets) => s.scope === 'game' ? 'current game' : s.scope === 'range' ? sets.rangeName : 'full season';
const watchLabel = mode => mode === 'rangePrior' ? 'Watch date range' : mode === 'recent' ? 'Watch recent period' : 'Watch current game';
const metricState = m => !m ? '' : m.state === 'unavailable' ? 'No data' : m.state === 'insufficient' ? 'Low sample' : m.state === 'partial-film' ? `Partial film · ${m.unlinkedCount} unlinked` : '';

function compare(screen, s, sets, args, metrics) {
  const method = metrics ? 'compareMetrics' : 'compare';
  if (s.compare === 'rangePrior') return screen.app.study[method]({ ...args, base: sets.range, against: sets.beforeRange, labels: { base: sets.rangeName, against: 'Prior dated games' } });
  if (s.compare === 'recent') return screen.app.study[method]({ ...args, base: sets.recent, against: sets.priorPeriod, labels: { base: sets.recentName, against: sets.priorPeriodName } });
  return screen.app.study[method]({ ...args, base: sets.game, against: sets[s.compare], labels: { base: sets.activeName, against: s.compare === 'prior' ? 'Prior games' : 'Season' } });
}

function bars(screen, groups, measure, refs, rich) {
  if (!groups.length) return null;
  const usable = rich ? groups.filter(g => ['ok', 'partial-film'].includes(g.metrics[measure]?.state)) : groups;
  const polarity = rich ? (usable[0]?.metrics[measure]?.polarity || 'higher') : 'higher';
  const value = g => Number(rich ? g.metrics[measure]?.value : g.measures[measure]) || 0;
  const ranked = usable.slice().sort((a, b) => (polarity === 'lower' ? 1 : -1) * (value(a) - value(b)));
  const max = Math.max(1, ...ranked.map(g => Math.abs(value(g))));
  return ranked.slice(0, 8).map(g => ({
    label: String(g.value), width: Math.max(2, Math.round(Math.abs(value(g)) / max * 100)),
    value: rich ? screen._richDisplay(rich.concept, g.metrics[measure]) : screen._measure(measure, g.measures[measure]),
    refs: rich ? g.metrics[measure]?.refs || [] : screen._groupRefs(g, measure),
  }));
}

function queryModel(screen, s, sets, result, metric, rich) {
  const groups = result.groups.filter(g => g.sampleSize > 0);
  const refsFor = g => rich ? g.metrics[metric]?.refs || [] : screen._groupRefs(g, metric);
  const refs = uniq(groups.flatMap(refsFor));
  const mix = screen._runPassForRefs(refs);
  const name = rich?.pair.name || screen.app.analyticsRegistry.getMeasure(metric)?.name || metric;
  const ranked = groups.filter(g => !rich || ['ok', 'partial-film'].includes(g.metrics[metric]?.state));
  const polarity = rich ? ranked[0]?.metrics[metric]?.polarity || 'higher' : 'higher';
  ranked.sort((a, b) => (polarity === 'lower' ? 1 : -1) * ((Number(rich ? a.metrics[metric]?.value : a.measures[metric]) || 0) - (Number(rich ? b.metrics[metric]?.value : b.measures[metric]) || 0)));
  const top = ranked.find(g => Number(rich ? g.metrics[metric]?.denominator : g.sampleSize) >= 4);
  return {
    kind: 'rows', metricHead: name, deltaHead: rich ? '' : 'Explosive',
    summary: `${refs.length} matching play${refs.length === 1 ? '' : 's'}`,
    summaryMeta: `${screen.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension} · ${scopeName(s, sets)}`,
    rows: groups.map(g => {
      const m = rich ? g.metrics[metric] : null;
      const rowMix = rich ? screen._runPassForRefs(m?.refs || []) : g.measures;
      return { label: String(g.value), refs: refsFor(g), dim: rich ? m?.state === 'insufficient' : g.belowMinSample,
        plays: rich ? screen._metricPlaysText(m, g.sampleSize) : screen._playsText(g, metric),
        metric: rich ? screen._richDisplay(rich.concept, m) : screen._measure(metric, g.measures[metric]), state: metricState(m),
        mix: `${screen._pct(rowMix.run)} / ${screen._pct(rowMix.pass)}`, delta: rich ? '' : screen._pct(g.measures.explosiveRate) };
    }),
    visual: { kpis: [
      ['Matching plays', String(refs.length), ''],
      [`${rich ? 'Best' : 'Highest'} ${name}`, top ? String(top.value) : '—', top ? `${rich ? screen._richDisplay(rich.concept, top.metrics[metric]) : screen._measure(metric, top.measures[metric])} · ${rich ? top.metrics[metric].denominator : top.sampleSize} snaps` : `no group with 4+ ${rich ? 'eligible ' : ''}snaps`],
      ['Run / Pass', `${screen._pct(mix.run)} / ${screen._pct(mix.pass)}`, `${mix.classified} classified plays`],
    ], title: `${name} by group`, meta: 'Select a bar to watch film', bars: bars(screen, groups, metric, refs, rich) },
    warnings: result.warnings || [], watchAll: { refs, label: 'Watch results' }, saveCohorts: [{ id: 'result', label: scopeName(s, sets), refs }],
  };
}

function compareModel(screen, s, result, metric, rich, player) {
  const rows = result.rows.filter(row => row.a.sampleSize > 0 || row.b.sampleSize > 0);
  const refsFor = side => rich || player ? side.metrics[metric]?.refs || [] : screen._groupRefs(side, metric);
  const aRefs = uniq(rows.flatMap(row => refsFor(row.a))), bRefs = uniq(rows.flatMap(row => refsFor(row.b)));
  const rowLabel = value => player?.labelValue ? player.labelValue(value) : String(value);
  const display = m => player ? screen._playerDisplay(metric, m) : screen._richDisplay(rich.concept, m);
  const name = player?.name || rich?.pair.name || screen.app.analyticsRegistry.getMeasure(metric)?.name || metric;
  const deltaRows = rows.filter(row => row.deltas[metric] != null).slice().sort((a, b) => Math.abs(Number(b.deltas[metric])) - Math.abs(Number(a.deltas[metric])));
  const max = Math.max(1, ...deltaRows.map(row => Math.abs(Number(row.deltas[metric]) || 0)));
  return {
    kind: 'rows', compare: true, metricHead: name, deltaHead: 'Delta', summary: `${aRefs.length} vs ${bRefs.length} plays`, summaryMeta: `${result.a.label} compared with ${result.b.label}${player?.context || ''}`,
    rows: rows.map(row => {
      const ma = row.a.metrics?.[metric], mb = row.b.metrics?.[metric], delta = row.deltas[metric];
      const ar = refsFor(row.a), br = refsFor(row.b), mixA = rich || player ? screen._runPassForRefs(ar) : row.a.measures, mixB = rich || player ? screen._runPassForRefs(br) : row.b.measures;
      const favorable = rich || player ? screen._richFavorable(ma || mb, delta) : screen._isFavorableDelta(metric, delta);
      const neutral = delta == null || delta === 0 || (!rich && !player && screen._measurePolarity(metric) === 'neutral');
      return { label: rowLabel(row.value), refs: ar.length ? ar : br,
        plays: rich || player ? `${screen._metricPlaysText(ma, row.a.sampleSize)} / ${screen._metricPlaysText(mb, row.b.sampleSize)}` : `${screen._playsText(row.a, metric)} / ${screen._playsText(row.b, metric)}`,
        metric: rich || player ? `${display(ma)} / ${display(mb)}` : `${screen._measure(metric, row.a.measures[metric])} / ${screen._measure(metric, row.b.measures[metric])}`,
        state: [metricState(ma), metricState(mb)].filter(Boolean).join(' / '), mix: `${screen._pct(mixA.run)} / ${screen._pct(mixB.run)}`,
        delta: delta == null ? '—' : `${delta > 0 ? '+' : ''}${player ? screen._playerNumber(metric, delta) : rich ? screen._richNumber(rich.concept, delta) : screen._measure(metric, delta, false)}`,
        deltaTone: neutral ? '' : favorable ? 'is-positive' : 'is-negative' };
    }),
    visual: player ? null : { title: rich ? `Largest changes · ${name}` : 'Largest changes', meta: `${result.a.label} vs ${result.b.label}`, deltas: deltaRows.slice(0, 8).map(row => { const delta = Number(row.deltas[metric]) || 0, favorable = rich ? screen._richFavorable(row.a.metrics[metric] || row.b.metrics[metric], delta) : screen._isFavorableDelta(metric, delta), neutral = delta === 0 || (!rich && screen._measurePolarity(metric) === 'neutral'); return { label: String(row.value), width: Math.max(2, Math.round(Math.abs(delta) / max * 50)), negative: delta < 0, tone: neutral ? '' : favorable ? 'is-favorable' : 'is-unfavorable', value: `${delta > 0 ? '+' : ''}${rich ? screen._richNumber(rich.concept, delta) : screen._measure(metric, delta, false)}`, refs: (refsFor(row.a).length ? refsFor(row.a) : refsFor(row.b)) }; }) },
    warnings: result.warnings || [], watchAll: { refs: aRefs, label: watchLabel(s.compare) }, saveCohorts: [{ id: 'base', label: result.a.label, refs: aRefs }, { id: 'against', label: result.b.label, refs: bRefs }, { id: 'both', label: 'Both cohorts', refs: uniq([...aRefs, ...bRefs]) }],
  };
}

function playerModel(screen, s, sets) {
  const role = screen.constructor.PLAYER_ROLES[s.playerRole];
  if (!role) return { kind: 'empty', message: 'Choose a player role.' };
  const metric = role.metrics.includes(s.playerMetric) ? s.playerMetric : role.metrics[0];
  const specific = !!s.player, dimension = specific ? s.dimension : role.dimension;
  const filters = specific ? [...s.filters, { dimension: role.dimension, values: [s.player] }] : s.filters;
  const args = { dimension, metricIds: [metric], filters, minSample: s.minSample, gradeRole: role.gradeRole || undefined };
  let result; try { result = s.compare ? compare(screen, s, sets, args, true) : screen.app.study.runMetrics({ ...args, plays: sets[s.scope] }); } catch (e) { return { kind: 'empty', message: e.message }; }
  const name = screen.constructor.PLAYER_METRIC_LABELS[s.playerRole]?.[metric] || metric;
  const labelValue = value => specific ? String(value) : screen.app.roster.getLabel(value);
  if (s.compare) return compareModel(screen, s, result, metric, null, { name, labelValue, context: specific ? ` for ${screen.app.roster.getLabel(s.player)}` : '' });
  const groups = result.groups.filter(g => g.sampleSize > 0), polarity = groups.find(g => g.metrics[metric]?.polarity)?.metrics[metric]?.polarity || 'higher';
  groups.sort((a, b) => { const av = a.metrics[metric]?.value, bv = b.metrics[metric]?.value; if (av == null) return 1; if (bv == null) return -1; return polarity === 'lower' ? av - bv : bv - av; });
  const refs = uniq(groups.flatMap(g => g.metrics[metric]?.refs || []));
  return { kind: 'rows', metricHead: name, deltaHead: '', summary: `${refs.length} matching play${refs.length === 1 ? '' : 's'}`, summaryMeta: `${screen.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension}${specific ? ` for ${screen.app.roster.getLabel(s.player)}` : ''}`,
    rows: groups.map(g => { const m = g.metrics[metric], mix = screen._runPassForRefs(m?.refs || []); return { label: labelValue(g.value), refs: m?.refs || [], dim: m?.state === 'insufficient', plays: screen._metricPlaysText(m, g.sampleSize), metric: screen._playerDisplay(metric, m), state: metricState(m), mix: `${screen._pct(mix.run)} / ${screen._pct(mix.pass)}`, delta: '' }; }),
    warnings: result.warnings || [], watchAll: { refs, label: 'Watch results' }, saveCohorts: [{ id: 'result', label: screen.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension, refs }] };
}

function pivotModel(screen, s, sets, rich) {
  const plays = sets[s.scope] || [], metric = rich?.metricId || s.measure;
  const filters = [...s.filters, ...(s.unit ? [{ dimension: 'unit', values: [s.unit] }] : [])];
  const args = rich ? { dimension: s.dimension, metricIds: [metric], filters, minSample: s.minSample } : { dimension: s.dimension, measures: screen.constructor.MEASURES, filters, minSample: s.minSample };
  const method = rich ? 'runMetrics' : 'run';
  const rr = screen.app.study[method]({ ...args, plays });
  const cr = screen.app.study[method]({ ...args, dimension: s.column, plays });
  const cols = screen._pivotValues(s.column, plays), totals = new Map(cr.groups.map(g => [String(g.value), g])), cells = new Map();
  for (const col of cols) {
    const result = screen.app.study[method]({ ...args, plays, filters: [...filters, { dimension: s.column, values: [col] }] });
    for (const group of result.groups) cells.set(`${group.value}\u0000${col}`, group);
  }
  const read = g => { if (!g?.sampleSize) return null; if (rich) { const m = g.metrics[metric]; return m ? { value: screen._richDisplay(s.measure, m), count: screen._metricPlaysText(m, g.sampleSize), state: metricState(m), refs: m.refs || [], dim: ['insufficient', 'unavailable'].includes(m.state) } : null; } const refs = screen._groupRefs(g, metric); return { value: screen._measure(metric, g.measures[metric]), count: String(refs.length), state: g.belowMinSample ? 'Low sample' : '', refs, dim: g.belowMinSample }; };
  const groups = rr.groups.filter(g => g.sampleSize > 0), refs = uniq(groups.flatMap(g => read(g)?.refs || [])), label = scopeName(s, sets);
  return { kind: 'pivot', metricHead: rich?.pair.name || screen.app.analyticsRegistry.getMeasure(metric)?.name || metric, summary: `${refs.length} matching play${refs.length === 1 ? '' : 's'}`, summaryMeta: `${screen.app.analyticsRegistry.getDimension(s.dimension)?.name || s.dimension} × ${screen.app.analyticsRegistry.getDimension(s.column)?.name || s.column} · ${label}`,
    pivot: { corner: screen.app.analyticsRegistry.getDimension(s.dimension)?.name || s.dimension, columns: cols, rows: groups.map(g => ({ label: String(g.value), cells: cols.map(col => read(cells.get(`${g.value}\u0000${col}`))), total: read(g) })), totals: cols.map(col => read(totals.get(String(col)))), refs, caption: `${rich?.pair.name || screen.app.analyticsRegistry.getMeasure(metric)?.name || metric} · every cell plays its own ${rich ? 'eligible ' : ''}film` },
    warnings: [...(rr.warnings || []), ...(cr.warnings || [])], watchAll: { refs, label: 'Watch results' }, saveCohorts: [{ id: 'result', label, refs }] };
}

function buildStudyViewUnsafe(screen, s) {
  const sets = screen._playSets(s);
  if (s.playerRole) return playerModel(screen, s, sets);
  const pair = screen.constructor.RICH_METRIC_PAIRS[s.measure], metricId = pair?.[s.unit];
  if (pair && !metricId) return { kind: 'unit-prompt', message: 'Choose Offense or Defense in Unit to see this coaching metric. Production and prevention are different questions, so this metric is never guessed.' };
  if (!s.compare && s.column && s.column !== s.dimension) return pivotModel(screen, s, sets, pair ? { pair, metricId } : null);
  const filters = [...s.filters, ...(s.unit ? [{ dimension: 'unit', values: [s.unit] }] : [])];
  const args = pair ? { dimension: s.dimension, metricIds: [metricId], filters, minSample: s.minSample } : { dimension: s.dimension, measures: screen.constructor.MEASURES, filters, minSample: s.minSample };
  let result; try { result = s.compare ? compare(screen, s, sets, args, !!pair) : screen.app.study[pair ? 'runMetrics' : 'run']({ ...args, plays: sets[s.scope] }); } catch (e) { return { kind: 'empty', message: e.message || 'Study could not run this query.' }; }
  return s.compare ? compareModel(screen, s, result, pair ? metricId : s.measure, pair ? { pair, concept: s.measure } : null) : queryModel(screen, s, sets, result, pair ? metricId : s.measure, pair ? { pair, concept: s.measure } : null);
}

export function buildStudyView(screen, state) {
  try {
    return buildStudyViewUnsafe(screen, state);
  } catch (error) {
    return { kind: 'empty', message: error?.message || 'Study could not run this query.' };
  }
}
