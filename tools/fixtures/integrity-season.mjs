import { PlayTagger } from '../../js/play-tagger.js';
import { SpecialTeamsModel } from '../../js/special-teams.js';

export function integritySeason() {
  const games = Array.from({ length: 4 }, (_, g) => {
    const plays = Array.from({ length: 12 }, (_, p) => {
      const unit = ['offense', 'defense', 'special'][p % 3];
      const tags = { ...PlayTagger.blankTags({ unit }), down: String(1 + p % 4), distance: '10',
        ...(unit === 'special' ? {} : { formationFamily: 'Spread', backfield: 'Single', strength: 'Right',
          playType: unit === 'offense' ? 'Run Inside' : 'Short Pass',
          runPass: unit === 'offense' ? 'Run' : 'Pass', result: 'Gain', yardage: String(p % 9) }),
        ...(unit === 'defense' ? { defFront: '4-3', coverage: 'Cover 3' } : {}) };
      return { id: p + 1, timestamp: { start: 0, end: 5 }, clipName: `g${g}_clip${p}`, notes: '', tags,
        ...(unit === 'special' ? { specialTeams: SpecialTeamsModel.normalize({ unit: 'punt',
          kick: { distance: 35 }, outcome: { status: 'downed' } }) } : {}) };
    });
    return { id: `synG${g}`, name: `Game ${g + 1}`, gameInfo: { opponent: `Team ${g + 1}` }, status: 'active',
      plays, annotations: [], nextId: 13, currentPlayId: null, videoFileName: '',
      clipNames: plays.map(p => p.clipName), isMultiClip: true };
  });
  return { version: 5, type: 'season', id: 'synthetic', seasonName: 'Synthetic Stress Season', games, activeGameId: 'synG0' };
}
