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

/**
 * UX-4 (S6-4b): the SHELL stylesheets join enforcement. They are not `native-*`
 * — they style the workspace the native routes sit inside — and until now they
 * were unenforced, which is how 89 raw colours across 52 near-duplicate hexes
 * accumulated there while the native set stayed at zero. The rule is one step
 * looser than the native rule, and deliberately so: a shell file MAY declare
 * raw colour inside its `:root` token block (that is what a token block is
 * for), and may not use raw colour anywhere else.
 */
const shellCss = ['workspace-shell.css', 'study-screen.css', 'plan-screen.css'].map(name => resolve(root, 'css', name));
const shellSources = await Promise.all(shellCss.map(async path => ({ path, source: await readFile(path, 'utf8') })));
// Blank the token block rather than removing it, so reported line numbers still
// point at the real line in the file.
const stripRoot = source => source.replace(/:root\s*\{[\s\S]*?\n?\}/g, match => match.replace(/[^\n]/g, ' '));
const shellRaw = shellSources.flatMap(({ path, source }) => stripRoot(source).split(/\r?\n/).flatMap((line, index) =>
  /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i.test(line) ? [`${path}:${index + 1}`] : []));
ok(shellRaw.length === 0, 'shell styles use tokens outside their :root token block', shellRaw.slice(0, 8).join(', '));

const shellTokens = new Set(shellSources.flatMap(({ source }) => [...source.matchAll(/(--ws-[\w-]+)\s*:/g)].map(match => match[1])));
const shellMissing = shellSources.flatMap(({ path, source }) =>
  [...new Set([...source.matchAll(/var\((--ws-[\w-]+)/g)].map(match => match[1]))]
    .filter(name => !shellTokens.has(name))
    .map(name => `${path}:${name}`));
ok(shellMissing.length === 0, 'every shell token reference resolves to a declared token', shellMissing.join(', '));

// One palette, not two. Every SHARED shell role must resolve to a design-system
// token; only the genuinely shell-specific selected-surface roles may stand alone.
const shellRoot = [...(shellSources[0].source.match(/:root\s*\{[\s\S]*?\n\}/) || [''])][0];
const shellDecls = [...shellRoot.matchAll(/(--ws-[\w-]+)\s*:\s*([^;\n]+)/g)]
  .map(match => ({ name: match[1], value: match[2].trim() }))
  .filter(entry => !/^--ws-(side|top)$/.test(entry.name));
const standalone = shellDecls.filter(entry => !/var\(--gi-/.test(entry.value)).map(entry => entry.name);
ok(shellDecls.length > 12 && standalone.length === 0,
  'every shell colour role derives from a design-system token — one palette, not two', JSON.stringify(standalone));

/**
 * AX-1 (S6-4c). `redesign-stats.css` styles the Reports route, and 115 of its
 * 122 rules were scoped to `.stats-overlay` — the modal the native route
 * retired. The file was linked and loaded, so the dead-stylesheet guard added
 * after 1.12.0-13 passed; the rules simply never matched, and every KPI hero
 * rendered as raw stacked text. That is the fourth instance of this class and
 * the first where the stylesheet WAS reachable, so reachability alone is not a
 * sufficient check: a Reports rule scoped to a container the native route does
 * not have is dead in exactly the same way.
 */
const reportCssPath = resolve(root, 'css', 'redesign-stats.css');
const reportCss = await readFile(reportCssPath, 'utf8');
const retiredScopes = [...reportCss.matchAll(/([^{}]*\.stats-overlay[^{}]*)\{/g)]
  .map(match => match[1].trim())
  .filter(selector => !selector.includes('.gi-reports'));
ok(retiredScopes.length === 0,
  'no Reports rule is scoped only to the retired stats-overlay container', retiredScopes.slice(0, 4).join(' | '));

const reportRoles = [...reportCss.matchAll(/(--gi-[\w-]+)\s*:\s*([^;\n]+)/g)]
  .map(match => ({ name: match[1], value: match[2].trim() }));
const reportStandalone = reportRoles.filter(entry => !/var\(--gi-/.test(entry.value)).map(entry => entry.name);
ok(reportRoles.length > 8 && reportStandalone.length === 0,
  'Reports colour and type roles derive from design-system tokens rather than a third palette', JSON.stringify(reportStandalone));

const reportRefs = [...new Set([...reportCss.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1]))];
const reportDeclared = new Set(reportRoles.map(entry => entry.name));
const reportMissing = reportRefs.filter(name => !definitions.has(name) && !reportDeclared.has(name));
ok(reportMissing.length === 0, 'every token the Reports stylesheet references is declared somewhere', reportMissing.join(', '));

const shellGiMissing = shellSources.flatMap(({ path, source }) =>
  [...new Set([...source.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1]))]
    .filter(name => !definitions.has(name))
    .map(name => `${path}:${name}`));
ok(shellGiMissing.length === 0, 'every design-system token the shell references is declared', shellGiMissing.join(', '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);