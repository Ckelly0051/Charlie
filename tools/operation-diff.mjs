const clone = value => JSON.parse(JSON.stringify(value));

/** Convert identity-bearing arrays into maps so paths remain stable when order changes. */
export function canonicalSeason(value) {
  const season = clone(value);
  if (!Array.isArray(season?.games)) return season;
  season.games = Object.fromEntries(season.games.map(game => {
    const copy = { ...game };
    if (Array.isArray(copy.plays)) {
      copy.plays = Object.fromEntries(copy.plays.map(play => [String(play.id), play]));
    }
    return [String(game.id), copy];
  }));
  return season;
}

function walk(before, after, path, output) {
  if (Object.is(before, after)) return;
  const beforeObject = before !== null && typeof before === 'object';
  const afterObject = after !== null && typeof after === 'object';
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    output.push(path || '<root>');
    return;
  }
  if (Array.isArray(before)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index++) {
      walk(before[index], after[index], `${path}[${index}]`, output);
    }
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    walk(before[key], after[key], path ? `${path}.${key}` : key, output);
  }
}

export function changedSeasonPaths(before, after) {
  const output = [];
  walk(canonicalSeason(before), canonicalSeason(after), '', output);
  return output;
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRegex = pattern => new RegExp(`^${String(pattern)
  .split('*')
  .map(escapeRegex)
  .join('[^.\\[\\]]+')}$`);

export function auditSeasonOperation(before, after, allowed = []) {
  const changed = changedSeasonPaths(before, after);
  const rules = allowed.map(patternRegex);
  return {
    changed,
    unexpected: changed.filter(path => !rules.some(rule => rule.test(path))),
  };
}
