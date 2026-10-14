import { PlayShape } from './play-shape.js';

export const joinSummary = values => values.filter(value => value !== '' && value != null).map(String).join(' · ');
export function isBlankChartPlay(play) {
  if (!play) return true;
  const hasValue = value => value != null && value !== '' && (typeof value !== 'object' || Object.values(value).some(hasValue));
  if (String(play.notes || '').trim() || play.diagram?.length || play.penalties?.length || play.specialTeams?.unit || hasValue(play.receiverDetail)) return false;
  // Unit, Own field position and drive 1 are seeded even on untouched plays.
  // Completion/accounting predicates must not classify partial charting as blank.
  return !Object.entries(play.tags || {}).some(([key,value]) => key !== 'unit' && !key.startsWith('_')
    && !(key === 'fieldSide' && value === 'own') && !(key === 'driveNumber' && String(value) === '1') && hasValue(value));
}
export function chartSections(play) {
  const ids = ['situation'];
  if (play?.tags?.unit === 'special') ids.push('special-teams');
  if (PlayShape.lookSide(play)) ids.push('formation-and-call', 'defense-faced', 'play-and-result');
  else if (PlayShape.isKickFake(play)) ids.push('play-and-result');
  return [...ids, 'players-and-grades', 'penalties', 'notes-and-details', 'play-diagram', 'more-tools'];
}

export function sectionSummary(id, state) {
  const t = state.values;
  const fields = keys => keys.map(key => ['playType','result','defFront','blitz'].includes(key) ? String(t[key] || '').split(' + ').join(' · ') : t[key]);
  let values = [];
  if (id === 'situation') {
    values = [t.down ? `${t.down}${['','st','nd','rd','th'][Number(t.down)] || ''} & ${t.distance || '—'}` : '',
      t.yardLine ? `${t.fieldSide === 'opp' ? 'Opp' : 'Own'} ${t.yardLine}` : '', t.hash, t.quarter,
      t.driveNumber ? `Drive ${t.driveNumber}` : ''];
  } else if (id === 'formation-and-call') {
    values = fields(['playCall','formationFamily','personnel','qbAlignment','backfield','strength','receiverSet','motion']);
    if (t.motion) values.push(...fields(['motionStart','motionEnd']));
  } else if (id === 'defense-faced') values = fields(['defFront','coverage','coverageFamily','blitz']);
  else if (id === 'play-and-result') values = [...fields(['runPass','playType','playDir','gap','result']), t.yardage !== '' ? `${t.yardage} yds` : ''];
  else if (id === 'penalties') return joinSummary(state.penalties.map(p => p.foul || 'New penalty')) || 'None';
  else if (id === 'notes-and-details') values = [state.notes, ...state.customTags, ...state.customFields.map(f => f.value)];
  else return '';
  return joinSummary(values) || 'Not charted';
}
