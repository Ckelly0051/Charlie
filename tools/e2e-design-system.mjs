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
// A small number of --gi-* custom properties are deliberately instance-scoped:
// set as an inline style by a JSX component at render time (a genuine, dynamic
// per-instance value) rather than declared once in the shared palette. These
// are not design-system tokens and have no business living in tokens.css --
// keep this list explicit and require a real inline-style setter for each.
const instanceScopedVars = new Set(['--gi-kpi-cols']);
const missing = sources.flatMap(({ path, source }) =>
  [...new Set([...source.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1]))]
    .filter(name => !definitions.has(name) && !instanceScopedVars.has(name))
    .map(name => `${path}:${name}`));
ok(missing.length === 0, 'every native design token reference resolves', missing.join(', '));

// The allowlist above is a bare exclusion -- nothing previously checked that
// its stated condition (a real runtime style= setter) actually holds. Removing
// the setter from the JSX component would leave this exception silently in
// place. Scan every native JSX component for a `style={...}` occurrence whose
// content names the variable; a template-literal style attribute can contain
// its own `${...}` braces, so scan a bounded window after `style={` rather
// than stopping at the first `}`.
const jsxDir = resolve(root, 'js');
const jsxSources = await Promise.all((await readdir(jsxDir))
  .filter(name => name.endsWith('.jsx'))
  .map(async name => readFile(resolve(jsxDir, name), 'utf8')));
const hasRuntimeSetter = varName => jsxSources.some(source => {
  let index = source.indexOf('style={');
  while (index !== -1) {
    if (source.slice(index, index + 200).includes(varName)) return true;
    index = source.indexOf('style={', index + 1);
  }
  return false;
});
const uncheckedInstanceScoped = [...instanceScopedVars].filter(name => !hasRuntimeSetter(name));
ok(uncheckedInstanceScoped.length === 0,
  'every declared instance-scoped custom property has a real inline-style runtime setter',
  uncheckedInstanceScoped.join(', '));

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

/**
 * S6-4d: the LEGACY palette joins enforcement.
 *
 * `styles.css` is a layer cake — `body` is redefined six times, `.btn` four —
 * and its LAST `:root` wins the cascade, so that one block paints the product:
 * the app background, every button, the film container, the drop zone. It held
 * a second hand-tuned palette, which is how every route could be on the design
 * system while the app was not. Counting stylesheets made that look like a
 * rounding error; it was not, because one `body` rule is every screen.
 *
 * The rule is the shell rule: colour roles are declared in the winning `:root`
 * and must derive from a `--gi-*` token. Nothing is deleted and no selector
 * moves — the legacy tree stays exactly where it is, and simply inherits the
 * system. Rules elsewhere in the file are NOT swept: ~95% of them are already
 * dead, and S7 removes the markup they target.
 */
const legacyCss = await readFile(resolve(root, 'css', 'styles.css'), 'utf8');
/**
 * The `@media print` re-pin is EXCLUDED, and deliberately: the app is dark and
 * paper is not, so the print palette cannot be derived from a screen token —
 * it is a genuine second palette with a real reason to exist. This guard's
 * first version missed that, picked the print block as the winner, and
 * reported a correct file as broken. Strip print with brace matching rather
 * than a regex, so a nested block cannot fool it again.
 */
const stripPrint = source => {
  let out = source, at;
  while ((at = out.indexOf('@media print')) !== -1) {
    let depth = 0, index = out.indexOf('{', at);
    if (index === -1) break;
    let end = index;
    for (; end < out.length; end++) {
      if (out[end] === '{') depth++;
      else if (out[end] === '}' && --depth === 0) break;
    }
    out = out.slice(0, at) + out.slice(end + 1);
  }
  return out;
};
const legacyRoots = [...stripPrint(legacyCss).matchAll(/:root\s*\{[\s\S]*?\n\}/g)].map(match => match[0]);
/**
 * The palette is spread across SIX `:root` blocks — each redesign appended
 * another — so "the last block" is not the winner. The cascade resolves
 * per PROPERTY: whichever block declares a role LAST is the one that paints.
 * Check exactly that, or a stale hex in an earlier block can hide behind a
 * later block that happens to be tokenised.
 */
const colorRole = /^--(accent|highlight|canvas|bg|surface|border|text|chip|run|pass|success|danger|warning)/;
const winning = new Map();
for (const block of legacyRoots) {
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;\n]+)/g)) {
    const name = match[1], value = match[2].trim();
    if (colorRole.test(name)) winning.set(name, value);
  }
}
// `transparent` / `currentColor` / `none` are keywords, not a second palette.
const KEYWORD = /^(transparent|currentColor|none|inherit)$/i;
const legacyStandalone = [...winning]
  .filter(([, value]) => !/var\(--/.test(value) && !KEYWORD.test(value))
  .map(([name]) => name);
ok(winning.size > 20 && legacyStandalone.length === 0,
  'every legacy colour role derives from a design-system token — one palette across the whole product',
  JSON.stringify({ roles: winning.size, standalone: legacyStandalone }));

const legacyGiMissing = [...new Set([...winning.values()].flatMap(value =>
  [...value.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1])))]
  .filter(name => !definitions.has(name));
ok(legacyGiMissing.length === 0, 'every design-system token the legacy palette references is declared', legacyGiMissing.join(', '));

const shellGiMissing = shellSources.flatMap(({ path, source }) =>
  [...new Set([...source.matchAll(/var\((--gi-[\w-]+)/g)].map(match => match[1]))]
    .filter(name => !definitions.has(name))
    .map(name => `${path}:${name}`));
ok(shellGiMissing.length === 0, 'every design-system token the shell references is declared', shellGiMissing.join(', '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);