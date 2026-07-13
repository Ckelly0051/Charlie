/**
 * plan-export.js — PURE plan → export serializer (Phase 3 ordering/presentation/
 * export, the data half). Turns a game plan + the season's games into an ORDERED,
 * film-linked export structure and a self-contained printable HTML document.
 *
 * WHY PURE + UNWIRED (like clip-identity.js / study-plan.js): resolving a plan's
 * composite `gameId::playId` refs to play context, ordering, and escaping are data
 * concerns the Plan UI (Codex) shouldn't re-implement. `build()` gives the
 * presentation/teaching view AND the export the SAME resolved structure (items in
 * plan order, each ref resolved to its game + situation), so on-screen and printed
 * output can't drift. `html()` renders a standalone printable doc. Node-tested; the
 * Plan screen wires an Export/Print button + presentation view to these.
 *
 *   const exp = PlanExport.build(plan, seasonStore.data.games);
 *   printWindow.document.write(PlanExport.html(exp));   // or feed exp to a view
 *
 * Escaping: plan name/notes/labels + play notes travel in importable seasons, so
 * html() escapes every interpolated string (stored-XSS boundary, lesson #18).
 */
export class PlanExport {
  /**
   * Resolve a plan into an ordered, film-linked export object:
   *   { name, audience, notes, createdAt, updatedAt, itemCount, playCount, missingCount,
   *     items: [{ id, kind, label, note, query, refCount, resolved, missing,
   *               plays: [{ ref, gameId, gameName, playId, missing,
   *                         situation, formation, playType, result, yardage, notes }] }] }
   * Items stay in plan order; refs within an item resolve in their stored order.
   */
  static build(plan, games) {
    const gmeta = new Map((games || []).map(g => [String(g && g.id), g]));
    const items = (((plan && plan.items) || [])).map(item => {
      const refs = Array.isArray(item.refs) ? item.refs.map(String) : [];
      const plays = refs.map(ref => PlanExport._resolveRef(ref, gmeta)).filter(Boolean);
      const missing = plays.filter(p => p.missing).length;
      return {
        id: item.id, kind: item.kind || 'note', label: item.label || '',
        note: item.note || '', query: item.query || null,
        refCount: refs.length, resolved: plays.length - missing, missing, plays,
      };
    });
    const playCount = items.reduce((s, it) => s + it.resolved, 0);
    const missingCount = items.reduce((s, it) => s + it.missing, 0);
    return {
      name: (plan && plan.name) || 'Game Plan',
      audience: (plan && plan.audience) || 'staff',
      notes: (plan && plan.notes) || '',
      createdAt: (plan && plan.createdAt) || '',
      updatedAt: (plan && plan.updatedAt) || '',
      itemCount: items.length, playCount, missingCount, items,
    };
  }

  static _resolveRef(ref, gmeta) {
    const sep = String(ref).indexOf('::');
    if (sep <= 0) return { ref, gameId: '', gameName: 'Unknown game', playId: ref, missing: true, invalid: true };
    const gid = ref.slice(0, sep), pid = ref.slice(sep + 2);
    const g = gmeta.get(gid);
    const gameName = (g && (g.name || (g.gameInfo && g.gameInfo.opponent))) || gid;
    const base = { ref, gameId: gid, gameName, playId: pid };
    const play = g && (g.plays || []).find(p => p && String(p.id) === pid);
    if (!play) return { ...base, missing: true };
    const t = play.tags || {};
    return {
      ...base, missing: false,
      situation: PlanExport._situation(t),
      formation: t.formation || '', playType: t.playType || '',
      result: t.result || '', yardage: (t.yardage != null ? String(t.yardage) : ''),
      notes: play.notes || '',
    };
  }

  static _situation(t) {
    if (!t || !t.down) return '';
    return `${PlanExport._ord(t.down)} & ${t.distance || '?'}`;
  }
  static _ord(d) { return ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[String(d)] || String(d); }

  /** Render a built export object as a standalone printable HTML document. */
  static html(exp) {
    const e = PlanExport._esc;
    const dt = s => { const d = s ? new Date(s) : null; return (d && !isNaN(d)) ? d.toLocaleDateString() : ''; };
    const meta = [
      `${exp.itemCount} item${exp.itemCount === 1 ? '' : 's'}`,
      `${exp.playCount} linked play${exp.playCount === 1 ? '' : 's'}`,
      exp.missingCount ? `${exp.missingCount} missing` : '',
      exp.audience ? `Audience: ${PlanExport._audience(exp.audience)}` : '',
      dt(exp.updatedAt) ? `Updated ${dt(exp.updatedAt)}` : '',
    ].filter(Boolean).join(' · ');

    const items = exp.items.map((it, i) => {
      const rows = it.plays.length ? it.plays.map(p => p.missing
        ? `<tr class="miss"><td>${e(p.gameName)}</td><td colspan="5">${p.invalid ? `Film reference ${e(p.ref)} is invalid` : `Play ${e(p.playId)} — film not found`}</td></tr>`
        : `<tr><td>${e(p.gameName)}</td><td>${e(p.situation)}</td><td>${e(p.formation)}</td><td>${e(p.playType)}</td><td>${e(p.result)}${p.yardage ? ` ${e(p.yardage)}` : ''}</td><td>${e(p.notes)}</td></tr>`
      ).join('') : '<tr><td colspan="6" class="muted">No linked film.</td></tr>';
      return `<section class="item"><h2><span class="num">${i + 1}</span>${e(it.label || 'Untitled item')} <span class="kind">${e(it.kind)}</span></h2>${it.note ? `<p class="note">${e(it.note)}</p>` : ''}<table><thead><tr><th>Game</th><th>Situation</th><th>Formation</th><th>Play</th><th>Result</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>${e(exp.name)} — Game Plan</title><style>
      body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;max-width:900px}
      h1{font-size:24px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:18px}
      .staff{white-space:pre-wrap;background:#f6f7f9;border-left:3px solid #c9a227;padding:10px 12px;margin:0 0 22px}
      .item{margin:0 0 20px;break-inside:avoid} h2{font-size:15px;margin:0 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .num{display:inline-block;min-width:20px;color:#888;font-weight:700} .kind{color:#888;font-weight:400;font-size:11px;text-transform:uppercase}
      .note{margin:2px 0 8px;color:#333} table{width:100%;border-collapse:collapse;font-size:12px} th{text-align:left;color:#666;border-bottom:1px solid #ddd;padding:4px 6px}
      td{padding:4px 6px;border-bottom:1px solid #f0f0f0} .muted,.miss td{color:#999} .miss td{font-style:italic}
      @media print{body{margin:0}}
    </style></head><body><h1>${e(exp.name)}</h1><div class="meta">${e(meta)}</div>${exp.notes ? `<div class="staff">${e(exp.notes)}</div>` : ''}${items || '<p class="muted">This plan has no items yet.</p>'}</body></html>`;
  }

  static _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  static _audience(value) { return ({ staff: 'Coaching staff', players: 'Players', all: 'Staff and players' })[value] || value; }
}
