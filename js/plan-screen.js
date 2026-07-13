export class PlanScreen {
  constructor(app) { this.app = app; this.host = null; this.activeId = ''; this._bound = false; this._dragId = ''; this.presentationIndex = -1; }
  mount(host) { if (!host || this.host === host) return; this.host = host; this._bind(); this.render(); }
  show() { this.render(); }
  _store() { return this.app.storage.seasonStore; }
  _persist() { this._store().persist(); this.render(); }
  _active() { const plans = this._store().plans(); return this._store().getPlan(this.activeId) || plans[0] || null; }
  ensurePlan() { let plan = this._active(); if (!plan) { plan = this._store().createPlan('Game Plan'); if (!plan) return null; this.activeId = plan.id; this._store().persist(); } return plan; }
  addFinding(item) { const plan = this.ensurePlan(); if (!plan) return null; this._store().addPlanItem(plan.id, item); this._store().persist(); this.render(); return plan; }
  render() {
    if (!this.host) return;
    const plans = this._store().plans(), plan = this._active();
    if (plan) this.activeId = plan.id;
    const refs = plan ? this.app.studyPlan.planRefs(plan) : [];
    this.host.innerHTML = `<div class="ws-plan-head"><div><div class="ws-eyebrow">Turn findings into action</div><h1>GAME PLAN</h1><p>Build a staff-ready plan from Study results and linked film.</p></div><button class="ws-btn ws-primary" data-plan-action="create">New plan</button></div>
      ${plan ? `<div class="ws-plan-toolbar"><label>Plan<select id="wsPlanSelect">${plans.map(p=>`<option value="${this._esc(p.id)}"${p.id===plan.id?' selected':''}>${this._esc(p.name)}</option>`).join('')}</select></label><label class="grow">Name<input id="wsPlanName" value="${this._esc(plan.name)}"></label><label>Audience<select id="wsPlanAudience">${this._audienceOptions(plan.audience)}</select></label><button class="ws-btn" data-plan-action="watch" ${refs.length?'':'disabled'}>Watch plan · ${refs.length}</button><button class="ws-btn" data-plan-action="present" ${plan.items.length?'':'disabled'}>Present</button><button class="ws-btn" data-plan-action="export" ${plan.items.length?'':'disabled'}>Export</button><button class="ws-btn danger" data-plan-action="delete">Delete</button></div><div class="ws-plan-grid"><section><h2>PLAN ITEMS <span>${plan.items.length}</span></h2><div class="ws-plan-items">${plan.items.length?plan.items.map((item,index)=>this._itemHtml(item,index,plan.items.length)).join(''):'<div class="ws-plan-empty">Save a finding from Study to begin this plan.</div>'}</div></section><section><h2>STAFF NOTES</h2><textarea id="wsPlanNotes" placeholder="Install notes, assignments, and meeting emphasis">${this._esc(plan.notes)}</textarea></section></div>${this.presentationIndex>=0?this._presentationHtml(plan):''}`:'<div class="ws-plan-empty large"><strong>No game plan yet</strong><span>Create a plan, then save findings from Study.</span><button class="ws-btn ws-primary" data-plan-action="create">Create game plan</button></div>'}`;
  }
  _audienceOptions(value) {
    return [['staff','Coaching staff'],['players','Players'],['all','Staff and players']].map(([id,label])=>`<option value="${id}"${value===id?' selected':''}>${label}</option>`).join('');
  }
  _itemHtml(item, index, count) {
    const id = this._esc(item.id), label = this._esc(item.label || 'Untitled item');
    return `<article data-plan-item="${id}"><button class="ws-plan-grip" data-plan-drag="${id}" draggable="true" aria-label="Drag ${label} to reorder" title="Drag to reorder"><span aria-hidden="true">&#8942;&#8942;</span></button><div class="ws-plan-item-copy"><span>${index + 1} &middot; ${this._esc(item.kind)}</span><strong>${label}</strong><small>${item.refs.length} linked play${item.refs.length===1?'':'s'}</small></div><button class="ws-btn ws-small" data-plan-watch="${id}" ${item.refs.length?'':'disabled'}>Watch</button><div class="ws-plan-moves" role="group" aria-label="Reorder ${label}"><button class="ws-icon-btn" data-plan-move="-1" data-plan-id="${id}" aria-label="Move ${label} up" ${index===0?'disabled':''}>&#8593;</button><button class="ws-icon-btn" data-plan-move="1" data-plan-id="${id}" aria-label="Move ${label} down" ${index===count-1?'disabled':''}>&#8595;</button></div><button class="ws-icon-btn ws-plan-remove" data-plan-remove="${id}" aria-label="Remove ${label}">&times;</button></article>`;
  }
  _presentationHtml(plan) {
    const exp=this.app.planExport.build(plan,this._store().data?.games||[]);
    if(!exp.items.length){this.presentationIndex=-1;return '';}
    this.presentationIndex=Math.max(0,Math.min(this.presentationIndex,exp.items.length-1));
    const item=exp.items[this.presentationIndex],resolved=item.plays.filter(play=>!play.missing);
    const query=[item.query?.group,item.query?.dimension,item.query?.measure].filter(Boolean).map(value=>this._esc(value)).join(' / ');
    const plays=item.plays.length?item.plays.map(play=>play.missing
      ? `<div class="ws-present-play is-missing"><span>${this._esc(play.gameName)}</span><strong>${play.invalid?'Invalid film reference':`Play ${this._esc(play.playId)} not found`}</strong></div>`
      : `<button class="ws-present-play" data-plan-present-ref="${this._esc(play.ref)}"><span>${this._esc(play.gameName)}${play.situation?` · ${this._esc(play.situation)}`:''}</span><strong>${this._esc(play.formation||'Unlabeled formation')}</strong><small>${this._esc(play.playType||'Unlabeled play')}${play.result?` · ${this._esc(play.result)}${play.yardage?`: ${this._esc(play.yardage)}`:''}`:''}</small></button>`).join('')
      : '<div class="ws-present-empty">No film is linked to this item.</div>';
    return `<div class="ws-plan-present" role="dialog" aria-modal="true" aria-label="Present ${this._esc(exp.name)}"><header><div><span>${this._esc(this.app.planExport._audience(exp.audience))}</span><strong>${this._esc(exp.name)}</strong></div><div>${this.presentationIndex+1} of ${exp.items.length}</div><button class="ws-icon-btn" data-plan-present-action="close" aria-label="Close presentation">&times;</button></header><main><section><div class="ws-present-kicker">${this.presentationIndex+1} · ${this._esc(item.kind)}</div><h2>${this._esc(item.label||'Untitled item')}</h2>${query?`<p class="ws-present-query">${query}</p>`:''}${item.note?`<p class="ws-present-note">${this._esc(item.note)}</p>`:''}<div class="ws-present-plays">${plays}</div></section><aside><span>Talking points</span><p>${exp.notes?this._esc(exp.notes):'No staff notes added.'}</p></aside></main><footer><button class="ws-btn" data-plan-present-action="prev" ${this.presentationIndex===0?'disabled':''}>&larr; Previous</button><button class="ws-btn ws-primary" data-plan-present-watch ${resolved.length?'':'disabled'}>Watch item · ${resolved.length}</button><button class="ws-btn" data-plan-present-action="next" ${this.presentationIndex===exp.items.length-1?'disabled':''}>Next &rarr;</button></footer></div>`;
  }
  _presentationItem() {
    const plan=this._active(),exp=plan?this.app.planExport.build(plan,this._store().data?.games||[]):null;
    return exp?.items?.[this.presentationIndex]||null;
  }
  _stepPresentation(delta) {
    const count=this._active()?.items.length||0;
    this.presentationIndex=Math.max(0,Math.min(this.presentationIndex+delta,count-1));
    this.render();
  }
  _closePresentation() { this.presentationIndex=-1; this.render(); }
  _exportPlan() {
    const plan=this._active(); if(!plan)return;
    const html=this.app.planExport.html(this.app.planExport.build(plan,this._store().data?.games||[]));
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    const link=document.createElement('a'),slug=(plan.name||'game-plan').trim().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'game-plan';
    link.href=url;link.download=`${slug}.html`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.app.history?._toast('PLAN EXPORTED');
  }
  _bind() {
    if (this._bound) return;
    this._bound=true;
    this.host.addEventListener('change',e=>{if(e.target.id==='wsPlanSelect'){this.activeId=e.target.value;this.presentationIndex=-1;this.render();}if(e.target.id==='wsPlanName'){this._store().renamePlan(this.activeId,e.target.value);this._persist();}if(e.target.id==='wsPlanAudience'){this._store().setPlanAudience(this.activeId,e.target.value);this._persist();}if(e.target.id==='wsPlanNotes'){this._store().setPlanNotes(this.activeId,e.target.value);this._persist();}});
    this.host.addEventListener('click',async e=>{
      const presentAction=e.target.closest('[data-plan-present-action]')?.dataset.planPresentAction;
      if(presentAction){if(presentAction==='close')this._closePresentation();if(presentAction==='prev')this._stepPresentation(-1);if(presentAction==='next')this._stepPresentation(1);return;}
      const presentRef=e.target.closest('[data-plan-present-ref]')?.dataset.planPresentRef;
      if(presentRef){const item=this._presentationItem();this._closePresentation();this.app.studyScreen._watch([presentRef],item?.label||'Plan film');return;}
      if(e.target.closest('[data-plan-present-watch]')){const item=this._presentationItem(),refs=(item?.plays||[]).filter(play=>!play.missing).map(play=>play.ref);this._closePresentation();if(refs.length)this.app.studyScreen._watch(refs,item.label);return;}
      const action=e.target.closest('[data-plan-action]')?.dataset.planAction;
      if(action==='create'){const p=this._store().createPlan(`Game Plan ${this._store().plans().length+1}`);this.activeId=p.id;this.presentationIndex=-1;this._persist();}
      if(action==='delete'&&this._active()){const plan=this._active();const ok=await this.app.tagger._confirmDialog(`Delete "${plan.name}" and its ${plan.items.length} saved item${plan.items.length===1?'':'s'}?`, 'Delete Plan');if(ok){this._store().deletePlan(plan.id);this.activeId='';this.presentationIndex=-1;this._persist();}}
      if(action==='watch'&&this._active())this.app.studyScreen._watch(this.app.studyPlan.planRefs(this._active()),this._active().name);
      if(action==='present'&&this._active()?.items.length){this.presentationIndex=0;this.render();}
      if(action==='export')this._exportPlan();
      const move=e.target.closest('[data-plan-move]');if(move&&this._store().movePlanItem(this.activeId,move.dataset.planId,Number(move.dataset.planMove)))this._persist();
      const remove=e.target.closest('[data-plan-remove]')?.dataset.planRemove;if(remove){this._store().removePlanItem(this.activeId,remove);this._persist();}
      const watch=e.target.closest('[data-plan-watch]')?.dataset.planWatch;if(watch){const item=this._active()?.items.find(i=>i.id===watch);if(item)this.app.studyScreen._watch(item.refs,item.label);}
    });
    this.host.addEventListener('dragstart',e=>{const handle=e.target.closest('[data-plan-drag]');if(!handle)return;this._dragId=handle.dataset.planDrag;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',this._dragId);handle.closest('[data-plan-item]')?.classList.add('is-dragging');});
    this.host.addEventListener('dragover',e=>{const row=e.target.closest('[data-plan-item]');if(!row||!this._dragId)return;e.preventDefault();e.dataTransfer.dropEffect='move';this.host.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));row.classList.add('is-drop-target');});
    this.host.addEventListener('drop',e=>{const row=e.target.closest('[data-plan-item]');if(!row||!this._dragId)return;e.preventDefault();const plan=this._active(),dragId=this._dragId;this._clearDrag();if(!plan)return;const ids=plan.items.map(item=>item.id).filter(id=>id!==dragId);const target=ids.indexOf(row.dataset.planItem);if(target<0)return;const after=e.clientY>row.getBoundingClientRect().top+(row.offsetHeight/2);ids.splice(target+(after?1:0),0,dragId);if(this._store().reorderPlanItems(plan.id,ids))this._persist();});
    this.host.addEventListener('dragend',()=>this._clearDrag());
    document.addEventListener('keydown',e=>{if(this.presentationIndex<0)return;if(!['Escape','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')this._closePresentation();else this._stepPresentation(e.key==='ArrowLeft'?-1:1);},true);
  }
  _clearDrag(){this._dragId='';this.host.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));}
  _esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
}
