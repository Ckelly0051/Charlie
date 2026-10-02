import { SeasonFormat } from '../js/season-format.js';
import { SpecialTeamsModel } from '../js/special-teams.js';

/** Ordinary input fixtures must pass before normalization can hide old data. */
export function assertCurrentFixture(season, label) {
  const problems = SeasonFormat.seasonProblems(season);
  for (const game of Array.isArray(season?.games) ? season.games : []) for (const play of Array.isArray(game?.plays) ? game.plays : []) {
    if (play.specialTeams != null && !SpecialTeamsModel.normalize(play.specialTeams)) {
      problems.push({ where: `${game.id} play ${play.id}`, problem: 'invalid Special Teams event' });
    }
  }
  if (problems.length) throw new Error(`${label}: invalid ordinary fixture: ${JSON.stringify(problems.slice(0, 10))}`);
  return season;
}
