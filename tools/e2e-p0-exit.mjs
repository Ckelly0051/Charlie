/* P0 composition audit.
   This verifies that the accepted foundation pieces are wired and specified.
   Coach-visible behavior is proven by the focused e2e journeys that the
   canonical gate discovers and runs separately. */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { P0_CAPABILITIES, P0_CRITICAL_CAPABILITY_IDS } from './p0-capability-inventory.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');

const [pkgText, lockText, vite, appEntry, gate, tauri, nativeRoot, overlay, filmNav, stats, study, reports, plan, teamHubSpec, overlaySpec] = await Promise.all([
  read('package.json'), read('package-lock.json'), read('vite.config.js'), read('tools/app-entry.mjs'),
  read('tools/run-gate.sh'), read('src-tauri/tauri.conf.json'), read('js/native-root.jsx'),
  read('js/native-overlay-service.js'), read('js/film-navigation-service.js'), read('js/stats-engine.js'),
  read('js/study-screen.js'), read('js/reports-screen.js'), read('js/plan-screen.js'),
  read('GRIDIRON-IQ-TEAM-HUB-SPEC.md'), read('GRIDIRON-IQ-OVERLAY-SPEC.md'),
]);
const pkg = JSON.parse(pkgText);
const tauriConfig = JSON.parse(tauri);

ok(pkg.dependencies?.preact === '10.29.7' && pkg.devDependencies?.vite === '8.1.5'
  && pkg.devDependencies?.['@preact/preset-vite'] === '2.10.6',
  'Vite, Preact, and the Preact preset are pinned exactly');
ok(lockText.includes('"lockfileVersion"') && existsSync(resolve(root, 'package-lock.json')),
  'committed npm lockfile is present');
ok(/emptyOutDir:\s*true/.test(vite) && /target:\s*'es2022'/.test(vite)
  && /'\.\.', 'dist'/.test(appEntry),
  'browser build and shared test entry target Vite dist');
ok(tauriConfig.build?.beforeBuildCommand === 'npm run build' && tauriConfig.build?.frontendDist === '../dist',
  'Tauri build consumes the same Vite output');
ok(/npm run build/.test(gate) && /for f in tools\/e2e-\*\.mjs/.test(gate),
  'canonical gate builds Vite and discovers every e2e harness');

const toolFiles = (await readdir(resolve(root, 'tools'))).filter(name => /^e2e-.*\.mjs$/.test(name));
const browserHarnesses = [];
const staleBrowserEntries = [];
for (const name of toolFiles) {
  const source = await read(`tools/${name}`);
  if (!source.includes("from 'puppeteer'")) continue;
  browserHarnesses.push(name);
  if (!source.includes("from './app-entry.mjs'")) staleBrowserEntries.push(name);
}
ok(browserHarnesses.length >= 41 && staleBrowserEntries.length === 0,
  'every browser journey uses the shared Vite test-entry resolver', staleBrowserEntries.join(', '));

ok(nativeRoot.includes('NativeOverlayService') && nativeRoot.includes('giNativeRoot')
  && overlay.includes('dialog(options') && overlay.includes('sheet(options') && overlay.includes('toast(options'),
  'one native host exposes dialog, sheet, and toast primitives');
ok(nativeRoot.includes('service.subscribe') && nativeRoot.includes('render(null')
  && existsSync(resolve(root, 'tools/e2e-native-overlay.mjs')),
  'native test route has explicit service injection and clean unmount coverage');
ok(filmNav.includes('refsForGame') && filmNav.includes('gameId}::${play.id}')
  && study.includes('filmNavigation.watch') && reports.includes('stats.showDashboard')
  && plan.includes('filmNavigation.watch') && stats.includes('filmNavigation.refsForGame'),
  'Study, Reports, and Plan share composite-ref film navigation');

const capabilityIds = new Set(P0_CAPABILITIES.map(item => item.id));
ok(P0_CRITICAL_CAPABILITY_IDS.every(id => capabilityIds.has(id))
  && new Set(P0_CAPABILITIES.map(item => item.surface)).size === 10
  && existsSync(resolve(root, 'GRIDIRON-IQ-P0-CAPABILITY-INVENTORY.md')),
  'composition: named critical journeys and all ten migration surfaces are inventoried');
ok(existsSync(resolve(root, 'tools/e2e-operation-diff.mjs'))
  && existsSync(resolve(root, 'tools/operation-diff.mjs')),
  'operation-scoped canonical season diff is part of the permanent gate');
const teamHubClauses = [
  'Settings access before a game is open',
  'Film-health states',
  'Empty, loading, error states',
  'Create / delete flows',
  'Keyboard',
  'Mobile / narrow',
];
const overlayClauses = [
  'Dialog vs sheet',
  'Focus',
  'Escape and scrim',
  'Destructive confirmation',
  'Toasts',
  'Mobile / narrow presentation',
  'Verification',
];
ok(teamHubClauses.every(clause => teamHubSpec.includes(clause))
  && overlayClauses.every(clause => overlaySpec.includes(clause)),
  'composition: Team Hub and overlay specs contain every required interaction contract');
ok(nativeRoot.includes("../design-system/plex.css") && nativeRoot.includes("../design-system/tokens.css")
  && existsSync(resolve(root, 'tools/e2e-design-system.mjs')),
  'bundled Plex and route token enforcement are wired into production');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
