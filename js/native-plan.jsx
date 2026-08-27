import { render } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

const AUDIENCES = [['staff', 'Coaching staff'], ['players', 'Players'], ['all', 'Staff and players']];

function PlanItem({ screen, item, index, count, dragging, dropTarget, setDragging, setDropTarget }) {
  const refs = item.refs || [];
  const label = item.label || 'Untitled item';
  const dragStart = event => {
    screen._dragId = item.id;
    setDragging(item.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    }
  };
  const dragEnd = () => {
    screen._dragId = '';
    setDragging('');
    setDropTarget('');
  };
  const drop = event => {
    event.preventDefault();
    const after = event.clientY > event.currentTarget.getBoundingClientRect().top + (event.currentTarget.offsetHeight / 2);
    const dragId = screen._dragId;
    dragEnd();
    screen.reorderItem(dragId, item.id, after);
  };
  return <article data-plan-item={item.id} class={`${dragging === item.id ? 'is-dragging' : ''}${dropTarget === item.id ? ' is-drop-target' : ''}`}
    onDragOver={event => { if (!screen._dragId) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; setDropTarget(item.id); }}
    onDrop={drop}>
    <button class="ws-plan-grip" data-plan-drag={item.id} draggable aria-label={`Drag ${label} to reorder`} title="Drag to reorder" onDragStart={dragStart} onDragEnd={dragEnd}><span aria-hidden="true">⋮⋮</span></button>
    <div class="ws-plan-item-copy"><span>{index + 1} · {item.kind}</span><strong>{label}</strong><small>{refs.length} linked play{refs.length === 1 ? '' : 's'}</small></div>
    <button class="ws-btn ws-small" data-plan-watch={item.id} disabled={!refs.length} onClick={() => screen.watchItem(item.id)}>Watch</button>
    <div class="ws-plan-moves" role="group" aria-label={`Reorder ${label}`}>
      <button class="ws-icon-btn" data-plan-move="-1" data-plan-id={item.id} aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => screen.moveItem(item.id, -1)}>↑</button>
      <button class="ws-icon-btn" data-plan-move="1" data-plan-id={item.id} aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => screen.moveItem(item.id, 1)}>↓</button>
    </div>
    <button class="ws-icon-btn ws-plan-remove" data-plan-remove={item.id} aria-label={`Remove ${label}`} onClick={() => screen.removeItem(item.id)}>×</button>
  </article>;
}

function PlanSections({ screen, plan }) {
  const [dragging, setDragging] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  return <div class="ws-plan-items">{screen._groups(plan).map((group, groupIndex) =>
    <div class="ws-plan-section" data-plan-section={groupIndex} key={`${group.key}-${groupIndex}`}>
      <header class="ws-plan-section-head"><h3>{group.name}</h3><span>{group.entries.length} item{group.entries.length === 1 ? '' : 's'} · {group.refs.length} linked play{group.refs.length === 1 ? '' : 's'}</span>
        <button class="ws-btn ws-small" data-plan-group-watch={groupIndex} disabled={!group.refs.length} aria-label={`Watch ${group.name} film`} onClick={() => screen.watchGroup(groupIndex)}>Watch · {group.refs.length}</button>
      </header>
      {group.entries.map(entry => <PlanItem key={entry.item.id} screen={screen} item={entry.item} index={entry.index} count={plan.items.length}
        dragging={dragging} dropTarget={dropTarget} setDragging={setDragging} setDropTarget={setDropTarget} />)}
    </div>)}</div>;
}

function Presentation({ screen, plan }) {
  const exp = screen.app.planExport.build(plan, screen._store().data?.games || []);
  if (!exp.items.length) return null;
  const index = Math.max(0, Math.min(screen.presentationIndex, exp.items.length - 1));
  if (screen.presentationIndex !== index) screen.presentationIndex = index;
  const item = exp.items[index];
  const resolved = item.plays.filter(play => !play.missing);
  const stripRef = useRef(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector('.is-current');
    if (strip && current) strip.scrollLeft = Math.max(0, current.offsetLeft - ((strip.clientWidth - current.offsetWidth) / 2));
  }, [index]);

  useLayoutEffect(() => {
    const keydown = event => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') screen._closePresentation();
      else screen._stepPresentation(event.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [screen]);

  const query = [item.query?.group, item.query?.dimension, item.query?.measure].filter(Boolean).join(' / ');
  return <div class="ws-plan-present" role="dialog" aria-modal="true" aria-label={`Present ${exp.name}`}>
    <header><div><span>{screen.app.planExport._audience(exp.audience)}</span><strong>{exp.name}</strong></div><div>{index + 1} of {exp.items.length}</div><button class="ws-icon-btn" data-plan-present-action="close" aria-label="Close presentation" onClick={() => screen._closePresentation()}>×</button></header>
    <main><section><div class="ws-present-kicker">{index + 1} · {item.kind}</div><h2>{item.label || 'Untitled item'}</h2>{query ? <p class="ws-present-query">{query}</p> : null}{item.note ? <p class="ws-present-note">{item.note}</p> : null}
      <div class="ws-present-plays">{item.plays.length ? item.plays.map(play => play.missing
        ? <div class="ws-present-play is-missing"><span>{play.gameName}</span><strong>{play.invalid ? 'Invalid film reference' : `Play ${play.playId} not found`}</strong></div>
        : <button class="ws-present-play" data-plan-present-ref={play.ref} onClick={() => screen.watchPresentationRef(play.ref)}><span>{play.gameName}{play.situation ? ` · ${play.situation}` : ''}</span><strong>{play.playCall || play.look || 'Unlabeled play'}</strong><small>{[play.playConcept, play.playType].filter(Boolean).join(' · ') || 'Unlabeled play'}{play.result ? ` · ${play.result}${play.yardage ? `: ${play.yardage}` : ''}` : ''}</small></button>)
        : <div class="ws-present-empty">No film is linked to this item.</div>}</div>
    </section><aside><span>Talking points</span><p>{exp.notes || 'No staff notes added.'}</p></aside></main>
    <nav class="ws-plan-strip" data-plan-strip aria-label="Plan items" ref={stripRef}><div class="ws-plan-strip-track">{exp.items.map((entry, itemIndex) => {
      const resolvedCount = entry.plays.filter(play => !play.missing).length;
      return <button class={`ws-plan-strip-btn${itemIndex === index ? ' is-current' : ''}`} data-plan-present-jump={itemIndex} aria-current={itemIndex === index ? 'true' : null} onClick={() => screen._jumpPresentation(itemIndex)}>
        <span>{itemIndex + 1} · {entry.kind}</span><strong>{entry.label || 'Untitled item'}</strong><small>{resolvedCount} play{resolvedCount === 1 ? '' : 's'}</small>
      </button>;
    })}</div></nav>
    <footer><button class="ws-btn" data-plan-present-action="prev" disabled={index === 0} onClick={() => screen._stepPresentation(-1)}>← Previous</button>
      <button class="ws-btn ws-primary" data-plan-present-watch disabled={!resolved.length} onClick={() => screen.watchPresentationItem()}>Watch item · {resolved.length}</button>
      <button class="ws-btn" data-plan-present-action="next" disabled={index === exp.items.length - 1} onClick={() => screen._stepPresentation(1)}>Next →</button></footer>
  </div>;
}

function NativePlan({ screen, revision }) {
  const plans = screen._store().plans();
  const plan = screen._active();
  if (plan && plan.id !== screen.activeId) screen.activeId = plan.id;
  const refs = plan ? screen.app.studyPlan.planRefs(plan) : [];

  return <>
    <div class="ws-plan-head"><div><div class="ws-eyebrow">Turn findings into action</div><h1>GAME PLAN</h1><p>Build a staff-ready plan from Study results and linked film.</p></div><button class="ws-btn ws-primary" data-plan-action="create" onClick={() => screen.createPlan()}>New plan</button></div>
    {plan ? <><div class="ws-plan-toolbar">
      <label>Plan<select id="wsPlanSelect" value={plan.id} onChange={event => screen.selectPlan(event.currentTarget.value)}>{plans.map(entry => <option value={entry.id}>{entry.name}</option>)}</select></label>
      <label class="grow">Name<input id="wsPlanName" value={plan.name} onChange={event => screen.renamePlan(event.currentTarget.value)} /></label>
      <label>Audience<select id="wsPlanAudience" value={plan.audience} onChange={event => screen.setAudience(event.currentTarget.value)}>{AUDIENCES.map(([id, label]) => <option value={id}>{label}</option>)}</select></label>
      <button class="ws-btn" data-plan-action="watch" disabled={!refs.length} onClick={() => screen.watchPlan()}>Watch plan · {refs.length}</button>
      <button class="ws-btn" data-plan-action="present" disabled={!plan.items.length} onClick={() => screen.openPresentation()}>Present</button>
      <button class="ws-btn" data-plan-action="export" disabled={!plan.items.length} onClick={() => screen._exportPlan()}>Export</button>
      <button class="ws-btn danger" data-plan-action="delete" onClick={() => screen.deleteActive()}>Delete</button>
    </div><div class="ws-plan-grid"><section><h2>PLAN ITEMS <span>{plan.items.length}</span></h2>{plan.items.length ? <PlanSections screen={screen} plan={plan} /> : <div class="ws-plan-empty">Save a finding from Study to begin this plan.</div>}</section>
      <section><h2>STAFF NOTES</h2><textarea id="wsPlanNotes" value={plan.notes} placeholder="Install notes, assignments, and meeting emphasis" onChange={event => screen.setNotes(event.currentTarget.value)} /></section></div>
      {screen.presentationIndex >= 0 ? <Presentation screen={screen} plan={plan} /> : null}</>
      : <div class="ws-plan-empty large"><strong>No game plan yet</strong><span>Create a plan, then save findings from Study.</span><button class="ws-btn ws-primary" data-plan-action="create" onClick={() => screen.createPlan()}>Create game plan</button></div>}
  </>;
}

export function mountNativePlan(screen, host) {
  let revision = 0;
  const refresh = () => render(<NativePlan screen={screen} revision={++revision} />, host);
  refresh();
  return { refresh, unmount: () => render(null, host) };
}
