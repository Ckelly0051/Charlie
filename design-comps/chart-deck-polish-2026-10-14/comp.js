(() => {
  const host=document.getElementById('comp-root');
  const keyFor=title => title.toLowerCase().replaceAll('&','and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const inputValue = el => el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.textContent : el.value;
  function summary(group) {
    const title=group.querySelector('summary strong').textContent;
    const value=field=>{const el=group.querySelector(`[data-native-field="${field}"]`);return el?.querySelector('input')?.value || [...(el?.querySelectorAll('button[aria-pressed=true]')||[])].map(b=>b.textContent.trim()).join(' + ') || '';};
    if(title === 'Situation') {
      const down=value('down'),distance=value('distance'),side=value('fieldSide'),yard=value('yardLine'),drive=value('driveNumber');
      return [down ? `${down}${['','st','nd','rd','th'][Number(down)]} & ${distance || '—'}` : '',yard ? `${side} ${yard}` : '',value('hash'),value('quarter'),drive ? `Drive ${drive}` : ''].filter(Boolean).join(' · ') || 'Not charted';
    }
    if(title === 'Players & Grades') {
      const players=[...group.querySelectorAll('.gi-tag-players>div')].map(row=>{const input=row.querySelector('input'),role=row.querySelector('strong')?.textContent;return input?.value ? `${role} #${input.value}` : '';}).filter(Boolean);
      const detail=group.querySelector('.gi-receiver-toggle>span:last-child')?.textContent;
      return [...players,detail&&detail!=='Not charted'?detail:''].filter(Boolean).join(' · ') || 'Not charted';
    }
    if(title === 'Play & Result') return [value('runPass'),value('playType'),value('playDir'),value('gap'),value('result'),value('yardage')?`${value('yardage')} yds`:''].filter(Boolean).join(' · ') || 'Not charted';
    if(title === 'Play Diagram') return group.querySelector('img[src]') ? 'Diagram charted' : 'None';
    if(title === 'More Tools') return 'Charting setup';
    if(title === 'Penalties') return [...group.querySelectorAll('.gi-penalty-card header strong')].map(el=>el.textContent).join(' / ') || 'None';
    const pressed=[...group.querySelectorAll('button[aria-pressed=true]')].map(el => el.textContent.trim());
    const inputs=[...group.querySelectorAll('input:not([type=checkbox]),textarea')].map(el=>el.value.trim()).filter(Boolean);
    return [...new Set([...pressed,...inputs])].join(' / ') || 'Not charted';
  }
  function render() {
    const parts=location.hash.slice(1).split('/'), stateKey=window.COMP_STATES[parts[0]] ? parts[0] : 'full';
    const state=window.COMP_STATES[stateKey];host.innerHTML=state.html;
    const deck=host.querySelector('[data-native-tagging]'), form=deck.querySelector('.gi-native-form');
    const nav=deck.querySelector('.gi-tag-nav');deck.append(nav);
    const previous=[...nav.querySelectorAll('button')].find(b=>b.textContent.includes('Previous'));previous.textContent='Previous';
    const save=nav.querySelector('[data-native-save]');nav.prepend(save);
    // Save remains a real command in its own position, not a disabled spacer.
    host.querySelectorAll('input[placeholder]').forEach(el=> {if(el.placeholder.startsWith('e.g.')) el.removeAttribute('placeholder');});
    form.querySelectorAll('.gi-tag-field-toggle').forEach(button => {
      const label=document.createElement('span');label.textContent=button.querySelector('span')?.textContent || button.textContent;button.replaceWith(label);
    });
    form.querySelectorAll('.gi-tag-hint').forEach(el=>el.hidden=true);
    const groups=[...form.querySelectorAll('.gi-tag-group')];
    groups.forEach((group,index) => {
      const title=group.querySelector('summary strong').textContent, id=keyFor(title);
      group.dataset.section=id;group.open=parts[1] ? parts[1]===id : index===0;
      const heading=group.querySelector('summary'), caret=heading.querySelector('i');heading.prepend(caret);
      const value=document.createElement('span');value.className='gi-comp-summary';value.textContent=summary(group);value.title=value.textContent;heading.append(value);
      heading.addEventListener('click',event => {event.preventDefault();const open=!group.open;groups.forEach(item=>item.open=false);group.open=open;caret.textContent=open?'▾':'▸';groups.forEach(item=>item.querySelector('summary i').textContent=item.open?'▾':'▸');});
      caret.textContent=group.open?'▾':'▸';
    });
    if(parts[1]==='closed') groups.forEach(group=>{group.open=false;group.querySelector('summary i').textContent='▸';});
    // Names are read-only text; editable jersey and grade controls stay intact.
    const roster=window.COMP_NAMES || {};
    deck.querySelectorAll('.gi-tag-players>div:not(.gi-receiver-row)').forEach(row => {
      const input=row.querySelector('input');if(!input)return;
      const name=document.createElement('span');name.className='gi-comp-player-name';
      name.textContent=input.value.split(/\s*[,;+]\s*/).map(n=>roster[n]).filter(Boolean).join(' / ') || (input.value ? '' : 'Not charted');input.after(name);
    });
    const receiver=deck.querySelector('.gi-receiver-toggle');
    if(receiver) receiver.addEventListener('click',() => {
      const open=receiver.getAttribute('aria-expanded')!=='true';receiver.setAttribute('aria-expanded',String(open));receiver.nextElementSibling.hidden=!open;receiver.firstElementChild.textContent=open?'▾':'▸';
    });
    const chooser=deck.querySelector('[data-receiver-editor]:not(:has(.gi-receiver-toggle))');
    chooser?.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
      const template=document.createElement('div');template.innerHTML=window.COMP_STATES.full.html;
      const editor=template.querySelector('[data-receiver-editor]');
      editor.dataset.target=button.textContent.replace('#','');
      editor.querySelector('.gi-receiver-toggle>span:last-child').textContent='Not charted';
      editor.querySelectorAll('[aria-pressed]').forEach(el=>el.setAttribute('aria-pressed','false'));
      chooser.replaceWith(editor);
      editor.querySelector('.gi-receiver-toggle').onclick=()=>{const toggle=editor.querySelector('.gi-receiver-toggle'),open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.nextElementSibling.hidden=!open;toggle.firstElementChild.textContent=open?'▾':'▸';};
      editor.querySelectorAll('.gi-receiver-chips button').forEach(chip=>chip.onclick=()=>{
        const active=chip.getAttribute('aria-pressed')==='true';chip.parentElement.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed','false'));chip.setAttribute('aria-pressed',String(!active));
        editor.querySelector('.gi-receiver-toggle>span:last-child').textContent=[...editor.querySelectorAll('[aria-pressed=true]')].map(el=>el.textContent).join(' / ') || 'Not charted';updateSummary(editor.closest('.gi-tag-group'));
      });
    }));
    deck.querySelectorAll('.gi-tag-chips button,.gi-receiver-chips button,.gi-play-call-quick button').forEach(button => button.addEventListener('click',() => {
      const field=button.closest('[data-native-field]');
      const multi=['playType','result','defFront','blitz'].includes(field?.dataset.nativeField);
      const selected=button.getAttribute('aria-pressed')==='true';
      if(!multi) button.parentElement.querySelectorAll('button').forEach(other=>{other.setAttribute('aria-pressed','false');other.classList.remove('is-active');});
      button.setAttribute('aria-pressed',String(!selected));button.classList.toggle('is-active',!selected);
      const editor=button.closest('.gi-receiver-editor');
      if(editor?.querySelector('.gi-receiver-toggle')) editor.querySelector('.gi-receiver-toggle>span:last-child').textContent=[...editor.querySelectorAll('[aria-pressed=true]')].map(el=>el.textContent.trim()).join(' / ') || 'Not charted';
      updateSummary(button.closest('.gi-tag-group'));
    }));
    deck.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('change',()=>updateSummary(el.closest('.gi-tag-group'))));
    deck.querySelectorAll('.gi-tag-library,.gi-receiver-label button').forEach(button => button.addEventListener('click',()=>{
      const field=button.closest('[data-native-field],.gi-play-call,.gi-receiver-editor');
      const existing=field.querySelector('.gi-comp-library');if(existing){existing.remove();return;}
      const panel=document.createElement('div');panel.className='gi-comp-library';
      const chips=field.querySelector('.gi-tag-chips,.gi-receiver-chips');
      [...(chips?.querySelectorAll('button')||[])].forEach(chip=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;label.append(check,document.createTextNode(chip.textContent));check.onchange=()=>chip.hidden=!check.checked;panel.append(label);});
      const input=document.createElement('input');input.type='text';input.setAttribute('aria-label','New library value');const add=document.createElement('button');add.textContent='Add';add.onclick=()=>{if(input.value.trim()&&chips){const chip=document.createElement('button');chip.textContent=input.value.trim();chip.setAttribute('aria-pressed','false');chips.append(chip);input.value='';}};panel.append(input,add);field.append(panel);
    }));
    host.querySelector('.gi-transport-more-trigger')?.addEventListener('click',()=>host.querySelector('.gi-theater-transport').classList.toggle('is-tools-open'));
    host.querySelector('[data-bd-tools-toggle]')?.addEventListener('click',()=>host.querySelector('.gi-breakdown-tools').classList.toggle('is-open'));
    window.COMP_CURRENT={state:stateKey,sections:groups.map(g=>g.dataset.section)};
    window.COMP_RAW=()=>{host.innerHTML=state.html;};
    window.COMP_OPEN=id=>{groups.forEach(g=>{g.open=g.dataset.section===id;g.querySelector('summary i').textContent=g.open?'▾':'▸';});};
    window.COMP_REFRESH=render;
  }
  function updateSummary(group){if(group)group.querySelector('.gi-comp-summary').textContent=summary(group);}
  // Prototype only: keep keyboard commands live, update closed summaries and
  // announce the field without stealing the coach's open section.
  document.addEventListener('keydown',event => {
    if(event.target.matches('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey)return;
    const commands={R:['playType','Run Inside'],O:['playType','Run Outside'],S:['playType','Screen'],P:['playType','Short Pass'],M:['playType','Medium Pass'],D:['playType','Deep Pass'],A:['playType','Play Action'],Q:['playType','RPO'],B:['playType','Option'],X:['playType','Trick Play'],H:['playType','QB Run'],J:['playType','Reverse'],G:['result','Gain'],L:['result','Loss'],N:['result','No Gain'],I:['result','Incomplete'],T:['result','TD'],W:['result','Sack'],U:['result','INT'],F:['result','Fumble']};
    const digit=event.code.match(/^Digit([1-4])$/)?.[1];
    const command=event.shiftKey&&digit?['down',digit]:commands[event.key.toUpperCase()];
    if(!command)return;
    const field=host.querySelector(`[data-native-field="${command[0]}"]`),button=[...(field?.querySelectorAll('button')||[])].find(b=>b.textContent.trim()===command[1]);
    if(!button)return;event.preventDefault();button.click();
    const group=field.closest('.gi-tag-group');updateSummary(group);
    host.querySelector('.gi-comp-key-feedback')?.remove();
    const feedback=document.createElement('div');feedback.className='gi-comp-key-feedback';feedback.setAttribute('role','status');feedback.textContent=`${field.querySelector('.gi-tag-field-label')?.textContent.replace('Edit library','').trim() || command[0]}: ${command[1]}`;host.querySelector('.gi-tag-title').append(feedback);setTimeout(()=>feedback.remove(),1500);
  });
  addEventListener('hashchange',render);render();
})();
