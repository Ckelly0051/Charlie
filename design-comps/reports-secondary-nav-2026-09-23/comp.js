/* Reports secondary navigation - DESIGN COMP prototype layer (2026-09-23).
 *
 * Applied by build.mjs on top of the production build loaded with a read-only
 * copy of the canonical 2025 JV season. It changes PRESENTATION ONLY: every
 * board, module, cohort, film action and export on screen is production's own.
 * The one shared secondary bar mirrors each board's existing section, scope and
 * export controls and forwards clicks to them, so the real handlers run.
 * Offense and Defense, which are long pages with jump links today, become
 * selectable pages by showing one existing zone/section at a time.
 *
 * The down-and-distance chart is a PROPOSAL rendered from existing charted
 * fields (down, distance, runPass, playType, yardage) through StatsEngine's own
 * `_ddKey` and success predicates. Its analytics are a separate checkpoint.
 */
(() => {
  const app = () => window.app;
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const state = { page: {}, ddCell: {} };

  /* ── Section sources: each report's EXISTING navigation, read not rebuilt ── */
  const OFFENSE_SHORT = { 'gi-off-z1': 'Identity', 'gi-off-z2': 'Calls & tendencies', 'gi-off-z3': 'Structure',
    'gi-off-z4': 'Situations', 'gi-off-z5': 'Field & production', 'gi-off-z6': 'Advanced' };
  const DEFENSE_SHORT = ['Performance', 'Opponent offense', 'Scheme & passing', 'Situations'];

  function splitCount(button) {
    const b = q('b', button);
    if (!b) return { label: text(button), count: '' };
    const unit = q('i', b);
    const number = text(b).replace(text(unit), '').trim();
    const count = unit ? `${number} ${text(unit)}` : number;
    const label = [...button.childNodes].filter(n => n !== b).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    return { label, count };
  }

  function sources(tab) {
    const content = q('.gi-reports-content');
    if (!content) return null;
    if (tab === 'offense') {
      const board = q('.gi-offense-board', content);
      if (!board) return null;
      return { kind: 'pages', sections: qa('.gi-zone-rule', board).map(rule => ({ id: rule.id, label: OFFENSE_SHORT[rule.id] || text(q('h2', rule)) })) };
    }
    if (tab === 'defense') {
      const secs = qa('[data-def2-section]', content);
      if (!secs.length) return null;
      return { kind: 'pages', sections: secs.map((sec, i) => ({ id: sec.id || `def2-${i}`, label: DEFENSE_SHORT[i] || text(q('h2', sec)) })),
        scope: qa('.gi-def2-scope button', content), exportBtn: qa('.gi-def2-controls button', content).find(b => /export/i.test(text(b))) };
    }
    if (tab === 'special') return { kind: 'forward', sections: qa('.gi-def-secnav-item', content), scope: qa('.gi-st-scope button', content), exportBtn: q('.gi-st-export', content) };
    if (tab === 'players') return { kind: 'forward', sections: qa('.gi-players-nav button', content), scope: qa('.gi-players-scope button', content) };
    if (tab === 'selfscout') return { kind: 'forward', sections: qa('.gi-selfscout-nav button', content), exportBtn: q('.gi-selfscout-acts button', content) };
    if (tab === 'season') return { kind: 'forward', sections: qa('.gi-season-nav button', content), exportBtn: q('.gi-season-acts button', content) };
    if (tab === 'matchup') return { kind: 'forward', sections: qa('.gi-mu-tabs button', content), opponent: q('.gi-mu-pick select', content) };
    return null;
  }

  /* ── Offense / Defense: one existing zone or section on screen at a time ── */
  function paginate(tab, src) {
    const content = q('.gi-reports-content');
    const active = state.page[tab] && src.sections.some(s => s.id === state.page[tab]) ? state.page[tab] : src.sections[0].id;
    state.page[tab] = active;
    /* Both boards are FLAT: a zone rule / section heading is a sibling of the
       modules that follow it, so a page is everything from one marker to the
       next. Nothing is moved or re-parented. */
    const container = tab === 'offense' ? q('.gi-offense-board', content) : q('.gi-def2-body', content);
    const isMarker = child => tab === 'offense' ? child.classList.contains('gi-zone-rule') : child.hasAttribute('data-def2-section');
    let current = null;
    for (const child of container.children) {
      if (child.classList.contains('gi-zone-nav')) continue;
      if (isMarker(child)) current = child.id;
      child.dataset.cmpPage = current || '';
      child.classList.toggle('cmp-off', current !== active);
    }
    return active;
  }

  /* ── The one shared secondary bar ─────────────────────────────────────── */
  function bar() {
    let node = q('#cmpSecbar');
    if (!node) {
      node = document.createElement('div');
      node.id = 'cmpSecbar';
      node.className = 'cmp-secbar';
      q('[data-reports-strip]').after(node);
    }
    return node;
  }

  function button(label, count, active, onClick, extra = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cmp-sec${active ? ' is-active' : ''}${extra}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(active));
    b.innerHTML = `<span></span>${count ? '<b></b>' : ''}`;
    b.querySelector('span').textContent = label;
    if (count) b.querySelector('b').textContent = count;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const screen = app()?.reportsScreen;
    const tab = screen?.activeTab;
    const node = bar();
    document.body.dataset.cmpTab = tab || '';
    const src = screen?.perspective === 'self' ? sources(tab) : null;
    if (!src || !src.sections.length) { node.hidden = true; node.replaceChildren(); return; }
    node.hidden = false;
    const nav = document.createElement('nav');
    nav.className = 'cmp-sections';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Report sections');
    if (src.kind === 'pages') {
      const active = paginate(tab, src);
      src.sections.forEach((s, i) => nav.append(button(s.label, String(i + 1), s.id === active,
        () => { state.page[tab] = s.id; render(); q('.ws-reports')?.scrollTo(0, 0); }, ' is-numbered')));
      if (tab === 'offense') ddChart('offense');
      if (tab === 'defense') ddChart('defense');
    } else {
      src.sections.forEach(source => {
        const { label, count } = splitCount(source);
        const active = source.classList.contains('active') || source.classList.contains('is-active') || source.getAttribute('aria-selected') === 'true';
        nav.append(button(label, count, active, () => { source.click(); setTimeout(render, 60); }));
      });
    }
    const right = document.createElement('div');
    right.className = 'cmp-right';
    if (src.scope?.length) {
      const scope = document.createElement('div');
      scope.className = 'cmp-scope';
      scope.innerHTML = '<span>Scope</span><div class="cmp-seg" role="group" aria-label="Report scope"></div>';
      /* Current game first, as every scope control now lists it. */
      const ordered = [...src.scope].sort((a, b) => (/current/i.test(text(b)) ? 1 : 0) - (/current/i.test(text(a)) ? 1 : 0));
      ordered.forEach(source => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text(source);
        const on = source.classList.contains('active') || source.classList.contains('is-active') || source.getAttribute('aria-pressed') === 'true';
        b.className = on ? 'is-active' : '';
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { source.click(); setTimeout(render, 80); });
        scope.querySelector('.cmp-seg').append(b);
      });
      right.append(scope);
    }
    if (src.opponent) {
      const pick = document.createElement('label');
      pick.className = 'cmp-scope';
      pick.innerHTML = '<span>Opponent</span>';
      const select = src.opponent.cloneNode(true);
      select.value = src.opponent.value;
      select.addEventListener('change', () => { src.opponent.value = select.value; src.opponent.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(render, 80); });
      pick.append(select);
      right.append(pick);
    }
    if (src.exportBtn) {
      const ex = document.createElement('button');
      ex.type = 'button';
      ex.className = 'cmp-export';
      ex.textContent = 'Export report';
      ex.addEventListener('click', () => src.exportBtn.click());
      right.append(ex);
    }
    node.replaceChildren(nav, right);
  }

  /* ── Overview: a compact, nonduplicative score ─────────────────────────── */
  /* A result needs BOTH scores. `Number('')` and `Number(null)` are 0, so a
     missing opponent score used to read as a shutout Win. A score counts only
     when it is a finite, non-negative number actually entered. */
  function scoreOf(value) {
    if (value == null) return null;
    const raw = typeof value === 'string' ? value.trim() : value;
    if (raw === '' || typeof raw === 'boolean') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function resultOf(scoreUs, scoreThem) {
    const us = scoreOf(scoreUs), them = scoreOf(scoreThem);
    if (us == null || them == null) return null;
    return us > them ? 'Win' : us < them ? 'Loss' : 'Tie';
  }

  function compactScore() {
    const bug = q('[data-reports-scorebug]');
    if (!bug || bug.hidden) return;
    let facts = q('.cmp-facts', bug);
    const stats = app().stats;
    const data = stats._kpiRailData?.(stats.compute());
    if (!data) return;
    const game = app().storage?.gameInfo || {};
    const result = resultOf(game.scoreUs, game.scoreThem);
    const t = data.turnovers || {};
    const margin = t.giveaways != null && t.takeaways != null ? t.takeaways - t.giveaways : null;
    const when = [game.week ? `Week ${game.week}` : '', game.date ? new Date(`${game.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
    const items = [
      ['Result', result || 'No data', when],
      ['Charted', `${data.playsCharted} of ${data.totalPlays}`, 'plays'],
      ['Turnover margin', margin == null ? 'No data' : (margin > 0 ? `+${margin}` : String(margin)),
        t.giveaways == null || t.takeaways == null ? '' : `${t.takeaways} takeaway${t.takeaways === 1 ? '' : 's'}, ${t.giveaways} turnover${t.giveaways === 1 ? '' : 's'}`],
    ];
    if (!facts) { facts = document.createElement('div'); facts.className = 'cmp-facts'; bug.append(facts); }
    facts.replaceChildren(...items.map(([label, value, sub]) => {
      const d = document.createElement('div');
      d.innerHTML = '<span></span><strong></strong><small></small>';
      d.children[0].textContent = label; d.children[1].textContent = String(value); d.children[2].textContent = sub;
      return d;
    }));
  }

  /* ── Proposal: the down-and-distance chart ─────────────────────────────── */
  const DOWNS = ['1', '2', '3', '4'];
  const BUCKETS = [['Short', '1-3'], ['Medium', '4-6'], ['Long', '7+']];
  const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

  function ddCohort(side) {
    const s = app().stats;
    if (side === 'offense') return { plays: s.compute().offPlays || [], success: p => s._isSuccessfulPlay(p), succLabel: 'Success', yppLabel: 'Yds/play' };
    const { scoped } = app().reportsScreen._defenseCohort();
    /* The board's own measured cohort: charted DEFENSIVE snaps classified
       Run or Pass (the `15 with Run/Pass charted` the section header states). */
    const measured = scoped.filter(p => p.tags?.unit === 'defense' && /^(Run|Pass)$/i.test(p.tags?.runPass || ''));
    return { plays: measured, success: p => s.constructor.isOpponentSuccess ? s.constructor.isOpponentSuccess(p) : s._isSuccessfulPlay(p), succLabel: 'Opp success', yppLabel: 'Yds/play allowed' };
  }

  function ddChart(side) {
    const s = app().stats;
    const content = q('.gi-reports-content');
    const host = side === 'offense' ? q('#gi-off-z4', content) : qa('[data-def2-section]', content)[3];
    const pageFor = side === 'offense' ? 'gi-off-z4' : host?.id;
    if (!host) return;
    let module = q(`.cmp-dd[data-side="${side}"]`, content);
    if (!module) {
      module = document.createElement('section');
      module.className = 'cmp-dd';
      module.dataset.side = side;
      module.dataset.cmpPage = pageFor;
      host.after(module);
    }
    module.classList.toggle('cmp-off', state.page[side] !== pageFor);
    const { plays, success, succLabel, yppLabel } = ddCohort(side);
    const eligible = plays.filter(p => s._ddKey(p.tags || {}));
    const cells = {};
    for (const p of eligible) (cells[s._ddKey(p.tags)] ||= []).push(p);
    const gid = app().storage?.seasonStore?.data?.activeGameId || '';
    const ref = p => `${p.__gid || gid}::${p.id}`;
    const stat = list => {
      const run = list.filter(p => /run/i.test(p.tags.runPass || '')).length;
      const pass = list.filter(p => /pass/i.test(p.tags.runPass || '')).length;
      const yards = list.reduce((sum, p) => sum + (parseFloat(p.tags.yardage) || 0), 0);
      const succ = list.filter(success).length;
      const calls = {};
      list.forEach(p => String(p.tags.playType || '').split(' + ').filter(Boolean).forEach(c => { calls[c] = (calls[c] || 0) + 1; }));
      const top = Object.entries(calls).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
      return { n: list.length, run, pass, ypp: list.length ? (yards / list.length).toFixed(1) : '—', succ: list.length ? Math.round(succ / list.length * 100) : null, top, refs: list.map(ref) };
    };
    const keys = DOWNS.flatMap(d => BUCKETS.map(([b]) => `${d}|${b}`));
    const populated = keys.filter(k => cells[k]?.length);
    const selected = state.ddCell[side] && cells[state.ddCell[side]] ? state.ddCell[side]
      : populated.sort((a, b) => cells[b].length - cells[a].length)[0];
    state.ddCell[side] = selected;
    const label = k => { const [d, b] = k.split('|'); return `${ORD[d]} & ${BUCKETS.find(x => x[0] === b)[1]}`; };
    const max = Math.max(1, ...populated.map(k => cells[k].length));
    const cellHtml = keys.map(k => {
      const list = cells[k] || [];
      if (!list.length) return `<div class="cmp-dd-cell is-held" aria-label="${label(k)}: none charted"><span>—</span></div>`;
      const st = stat(list);
      return `<button type="button" class="cmp-dd-cell${k === selected ? ' is-selected' : ''}" data-dd="${k}" style="--v:${(list.length / max).toFixed(3)}" aria-pressed="${k === selected}">
        <strong>${st.n}</strong><em class="cmp-mix"><i style="--n:${st.run}"></i><i style="--n:${st.pass}"></i></em>
        <small>${st.succ == null ? '—' : `${st.succ}%`} · ${st.ypp}</small></button>`;
    });
    const pick = selected ? stat(cells[selected]) : null;
    const scope = side === 'offense' ? 'offensive snaps' : 'opponent run/pass snaps';
    module.innerHTML = `<header><strong>${side === 'offense' ? 'Down &amp; distance' : 'Opponent down &amp; distance'}</strong>
        <span>${eligible.length} of ${plays.length} ${scope} carry down and distance</span><em>Proposal · analytics checkpoint pending</em></header>
      <div class="cmp-dd-body">
        <div class="cmp-dd-grid"></div>
        <aside class="cmp-dd-detail">${pick ? `<h4>${label(selected)} <span>${pick.n} plays</span></h4>
          <dl><div><dt>Run / pass</dt><dd>${pick.run} / ${pick.pass}</dd></div><div><dt>${yppLabel}</dt><dd>${pick.ypp}</dd></div>
          <div><dt>${succLabel}</dt><dd>${pick.succ == null ? '—' : `${pick.succ}%`}</dd></div></dl>
          <p>Top play types</p><ol>${pick.top.length ? pick.top.map(([c, n]) => `<li><span>${c}</span><b>${n}</b></li>`).join('') : '<li><span>No play type charted</span></li>'}</ol>
          <button type="button" class="cmp-watch" data-dd-watch>Watch ${pick.n} plays</button>` : '<p>No down and distance charted.</p>'}</aside>
      </div>`;
    /* Grid: header row, then one row per down with its three cells. */
    const g = q('.cmp-dd-grid', module);
    g.innerHTML = `<i></i>${BUCKETS.map(([, t]) => `<i>${t}</i>`).join('')}` + DOWNS.map((d, r) =>
      `<i>${ORD[d]}</i>${cellHtml.slice(r * 3, r * 3 + 3).join('')}`).join('');
    qa('[data-dd]', module).forEach(b => b.addEventListener('click', () => { state.ddCell[side] = b.dataset.dd; ddChart(side); }));
    q('[data-dd-watch]', module)?.addEventListener('click', () => app().reportsScreen.watchRefs?.(pick.refs, `${label(selected)} — ${side}`));
  }

  /* ── Annotation overlay: which control is which ────────────────────────── */
  function annotate(on) {
    qa('.cmp-note').forEach(n => n.remove());
    if (!on) return;
    const mark = (el, role, label) => {
      if (!el || !el.getClientRects().length) return;
      const r = el.getBoundingClientRect();
      const n = document.createElement('div');
      n.className = `cmp-note is-${role}`;
      Object.assign(n.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      n.innerHTML = `<span>${label}</span>`;
      document.body.append(n);
    };
    mark(q('[data-reports-strip] .gi-reports-tabs'), 'global', 'Global navigation · fixed position');
    mark(q('[data-reports-strip] .gi-reports-model'), 'global is-quiet', '');
    mark(q('[data-reports-strip] .gi-reports-actions'), 'export is-up', 'Full export menu');
    mark(q('#cmpSecbar .cmp-sections'), 'secondary', 'Secondary navigation · this report');
    mark(q('#cmpSecbar .cmp-scope'), 'scope', 'Scope · filters this report');
    mark(q('#cmpSecbar .cmp-export'), 'export', 'Report export');
  }

  function apply() {
    document.body.classList.add('cmp-on');
    render();
    compactScore();
  }

  let pending = null;
  new MutationObserver(() => { clearTimeout(pending); pending = setTimeout(apply, 40); })
    .observe(document.querySelector('.gi-reports-content') || document.body, { childList: true });
  window.__cmp = { apply, render, annotate, resultOf, section: (tab, index) => {
    const src = sources(tab);
    if (!src) return false;
    if (src.kind === 'pages') { state.page[tab] = src.sections[index]?.id; render(); return true; }
    src.sections[index]?.click();
    return new Promise(r => setTimeout(() => { apply(); r(true); }, 120));
  }, ddSelect: (side, key) => { state.ddCell[side] = key; ddChart(side); } };
  apply();
})();
