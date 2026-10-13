// Isolated design states. No app modules, persistence or coach-data access.
const ROUTES = ['Flat','Slant','Hitch','Out','In','Cross','Comeback','Corner','Post','Go','Wheel','Angle','Screen','Option','Double Move'];
const $ = id => document.getElementById(id);
let shown = [...ROUTES];
const state = { route:'Slant',release:'Inside',target:'Short-Middle',catch:'Short-Middle',layer:'target',open:true,checkpoint:1,receiver:'22',complete:true };
const ZONES = ['Deep','Medium','Short'].flatMap(depth => ['Left','Middle','Right'].map(side => ({ id:`${depth}-${side}`,depth,side,band:depth === 'Deep' ? '20+' : depth === 'Medium' ? '10-19' : 'Behind LOS - 9' })));
const zoneLabel = id => { const zone = ZONES.find(value => value.id === id); return zone ? `${zone.side} / ${zone.depth}` : 'Not charted'; };
function clearDetail() { state.route=''; state.release=''; state.target=''; state.catch=''; }
function render() {
  $('routes').replaceChildren(...shown.map(route => {
    const button = document.createElement('button'); button.textContent=route; button.dataset.route=route;
    button.setAttribute('aria-pressed',String(state.route === route));
    button.addEventListener('click',() => { state.route=state.route === route ? '' : route; render(); }); return button;
  }));
  $('editor').hidden=!state.open; $('detail-toggle').setAttribute('aria-expanded',String(state.open));
  $('detail-toggle').querySelector('.caret').textContent=state.open ? '\u25be' : '\u25b8';
  const summary = [state.route,state.release].filter(Boolean);
  if(state.checkpoint === 2 && !state.open) { if(state.target) summary.push(`Target ${zoneLabel(state.target)}`); if(state.catch) summary.push(`Catch ${zoneLabel(state.catch)}`); }
  $('summary').textContent=summary.join(' / ') || 'Not charted';
  document.querySelectorAll('[data-release]').forEach(button => button.setAttribute('aria-pressed',String(state.release === button.dataset.release)));
  $('zone-editor').hidden=state.checkpoint !== 2;
  document.querySelectorAll('[data-layer]').forEach(button => button.setAttribute('aria-selected',String(state.layer === button.dataset.layer)));
  $('catch-tab').disabled=!state.complete;
  $('target-summary').textContent=zoneLabel(state.target); $('catch-summary').textContent=state.complete ? zoneLabel(state.catch) : 'No completion';
  $('field').setAttribute('aria-labelledby',`${state.layer}-tab`);
  $('zones').setAttribute('aria-label',`${state.layer === 'target' ? 'Target' : 'Catch'} zone`); $('zones').classList.toggle('catch',state.layer === 'catch');
  $('zones').replaceChildren(...ZONES.map(zone => {
    const button=document.createElement('button'); button.dataset.zone=zone.id;
    button.setAttribute('aria-label',`${zone.side}, ${zone.depth}, ${zone.band} yards`); button.setAttribute('aria-pressed',String(state[state.layer] === zone.id));
    const depth=document.createElement('b'); depth.textContent=zone.depth; const band=document.createElement('span'); band.textContent=zone.band;
    button.append(depth,band); button.addEventListener('click',() => { state[state.layer]=state[state.layer] === zone.id ? '' : zone.id; render(); }); return button;
  }));
  $('location-state').textContent=`${state.layer === 'target' ? 'Target' : 'Catch'}: ${zoneLabel(state[state.layer])}`;
  const single=/^\d{1,2}$/.test(state.receiver);
  const numbers=state.receiver.split(/\s*[,;+]\s*/).filter(number => /^\d{1,2}$/.test(number));
  $('receiver-detail').hidden=!single; $('target-choice').hidden=single || numbers.length < 2;
  $('target-options').replaceChildren(...[...new Set(numbers)].map(number => {
    const button=document.createElement('button'); button.textContent=`#${number}`;
    button.addEventListener('click',() => { state.receiver=number; $('receiver').value=number; $('receiver-name').textContent=number === '22' ? 'Andrew Keasey' : 'Ben Kelly'; clearDetail(); render(); }); return button;
  }));
  $('save').disabled=!single;
  $('result-value').textContent=state.complete ? 'Gain' : 'Incomplete'; $('gain').textContent=state.complete ? '+18' : 'Not charted';
}
function scenario() {
  const mode=location.hash.slice(1) || 'route';
  Object.assign(state,{route:'Slant',release:'Inside',target:'Short-Middle',catch:'Short-Middle',layer:'target',open:mode !== 'closed',checkpoint:['target','catch','incomplete','stress'].includes(mode) ? 2 : 1,receiver:'22',complete:mode !== 'incomplete'});
  if(mode === 'catch') { state.layer='catch'; state.catch='Medium-Right'; }
  if(mode === 'incomplete') { state.catch=''; state.target='Deep-Left'; }
  if(mode === 'multiple') { state.receiver='22, 7'; clearDetail(); }
  $('receiver-name').textContent=mode === 'stress' ? 'Christopher Montgomery-Washington' : mode === 'multiple' ? 'Andrew Keasey / Ben Kelly' : 'Andrew Keasey';
  $('receiver').value=state.receiver;
  $('preview-state').textContent=state.checkpoint === 2 ? 'Pass location - checkpoint 2' : mode === 'closed' ? 'Closed summary' : mode === 'multiple' ? 'Choose target' : 'Route & release';
  render();
}
$('detail-toggle').addEventListener('click',() => { state.open=!state.open; render(); });
document.querySelectorAll('[data-release]').forEach(button => button.addEventListener('click',() => { state.release=state.release === button.dataset.release ? '' : button.dataset.release; render(); }));
document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click',() => { state.layer=button.dataset.layer; render(); }));
$('receiver').addEventListener('input',event => { const value=event.target.value.trim(); if(value !== state.receiver) clearDetail(); state.receiver=value; render(); });
$('zone-clear').addEventListener('click',() => { state[state.layer]=''; render(); });
$('library-open').addEventListener('click',() => {
  $('library-rows').replaceChildren(...ROUTES.map(route => {
    const label=document.createElement('label'), input=document.createElement('input'); input.type='checkbox'; input.checked=shown.includes(route);
    input.addEventListener('change',() => { shown=input.checked ? ROUTES.filter(value => value === route || shown.includes(value)) : shown.filter(value => value !== route); render(); });
    label.append(input,document.createTextNode(route)); return label;
  })); $('editor').appendChild($('library')); $('library').show(); $('new-route').focus();
});
$('library').addEventListener('keydown',event => { if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('library').close(); } });
$('library').addEventListener('close',() => $('library-open').focus());
$('add-route').addEventListener('click',() => { const value=$('new-route').value.trim(); if(!value || ROUTES.some(route => route.toLowerCase() === value.toLowerCase())) return; ROUTES.push(value); shown.push(value); $('new-route').value=''; render(); });
for(const id of ['previous','skip','save']) $(id).addEventListener('click',() => { $(id).textContent=id === 'save' ? 'Preview only' : 'Play 24'; setTimeout(() => $(id).textContent=id === 'save' ? 'Save & Next' : id === 'skip' ? 'Skip' : 'Previous',700); });
window.addEventListener('hashchange',scenario);
scenario();
