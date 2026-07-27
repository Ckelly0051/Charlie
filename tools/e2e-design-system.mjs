import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const root = resolve(import.meta.dirname, '..');
const tokenPath = resolve(root, 'design-system', 'tokens.css');
const plexPath = resolve(root, 'design-system', 'plex.css');
const entryPath = resolve(root, 'js', 'native-root.jsx');
const nativeCss = (await readdir(resolve(root, 'css')))
  .filter(name => /^native-.*\.css$/.test(name))
  .map(name => resolve(root, 'css', name));

const [tokens, plex, entry] = await Promise.all([
  readFile(tokenPath, 'utf8'),
  readFile(plexPath, 'utf8'),
  readFile(entryPath, 'utf8'),
]);
const sources = await Promise.all(nativeCss.map(async path => ({ path, source: await readFile(path, 'utf8') })));

ok(nativeCss.length > 0, 'at least one production native stylesheet is enforced');
ok(entry.includes("../design-system/plex.css") && entry.includes("../design-system/tokens.css"),
  'native Vite entry imports bundled Plex and design tokens');
ok(/@font-face/.test(plex) && /data:font\/woff2;base64,/.test(plex),
  'Plex font family is bundled locally as WOFF2 data');

const rawColors = sources.flatMap(({ path, source }) => source.split(/\r?\n/).flatMap((line, index) =>
  /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i.test(line) ? [`${path}:${index + 1}`] : []));
ok(rawColors.length === 0, 'native styles contain no raw colors', rawColors.join(', '));

const legacyVars = sources.flatMap(({ path, source }) => source.includes('var(--ws-') ? [path] : []);
ok(legacyVars.length === 0, 'native styles contain no legacy workspace-token fallback', legacyVars.join(', '));

const definitions = new Set([...tokens.matchAll(/(--gi-[\w-]+)\s*:/g)].map(match => match[1]));
const missing = sources.flatMap(({ path, source }) =>
  [...new Set([...source.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1]))]
    .filter(name => !definitions.has(name))
    .map(name => `${path}:${name}`));
ok(missing.length === 0, 'every native design token reference resolves', missing.join(', '));

const literalFonts = sources.flatMap(({ path, source }) =>
  /font(?:-family)?\s*:[^;]*(?:IBM Plex|system-ui)/i.test(source) ? [path] : []);
ok(literalFonts.length === 0, 'native styles consume typography tokens instead of local font stacks', literalFonts.join(', '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);