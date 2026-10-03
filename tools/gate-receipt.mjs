import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, writeFile, rename } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { CANONICAL_SEASON, CANONICAL_SEASON_ID } from './canonical-season.mjs';

const git = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));

async function fileIdentity(path, name) {
  try {
    const bytes = await readFile(path);
    return { path: name, bytes: bytes.length, sha256: hash(bytes) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { path: name, missing: true };
  }
}

async function treeFiles(root, prefix = '') {
  const files = [];
  for (const name of (await readdir(resolve(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(resolve(root, path));
    if (info.isSymbolicLink()) throw new Error(`Fingerprint refuses symbolic link: ${path}`);
    if (info.isDirectory()) files.push(...await treeFiles(root, path));
    else if (info.isFile()) files.push(path);
  }
  return files;
}

export async function buildIdentity(root) {
  const files = await treeFiles(root);
  if (!files.includes('index.html')) throw new Error(`Build entry missing: ${root}`);
  const manifest = [];
  for (const file of files) manifest.push(await fileIdentity(resolve(root, file), file));
  if (manifest.some(file => file.missing)) throw new Error('Build changed while fingerprinting');
  return { root: resolve(root), sha256: digest(manifest), files: manifest };
}

export async function sourceIdentity(root) {
  const options = { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 };
  const commit = (await git('git', ['rev-parse', 'HEAD'], options)).stdout.trim();
  const status = (await git('git', ['status', '--porcelain', '--untracked-files=all'], options)).stdout;
  const names = (await git('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], options)).stdout;
  const files = [];
  for (const name of [...new Set(names.split('\0').filter(Boolean))].sort()) {
    files.push(await fileIdentity(resolve(root, name), name));
  }
  return { commit, dirty: status.length > 0, sha256: digest(files) };
}

export async function fixtureIdentity(root) {
  const fixtures = [{ ...await fileIdentity(CANONICAL_SEASON, CANONICAL_SEASON), id: CANONICAL_SEASON_ID }];
  for (const name of ['synthetic-edge.json', 'mavericks-6game.json']) {
    fixtures.push(await fileIdentity(resolve(root, 'tools/parity-golden', name), `tools/parity-golden/${name}`));
  }
  for (const name of await treeFiles(resolve(root, 'tools/fixtures'))) {
    fixtures.push(await fileIdentity(resolve(root, 'tools/fixtures', name), `tools/fixtures/${name}`));
  }
  return { sha256: digest(fixtures), files: fixtures };
}

export async function evidenceFile(path, root) {
  const result = await fileIdentity(path, relative(root, path).replaceAll('\\', '/'));
  if (result.missing) throw new Error(`Evidence log missing: ${path}`);
  return result;
}

export function newReceipt({ scope, files, source, fixtures, buildRoot, environment = {} }) {
  if (!files.length || new Set(files).size !== files.length) throw new Error('Receipt requires a unique nonempty harness plan');
  return { schemaVersion: 1, startedAt: new Date().toISOString(), finishedAt: null,
    scope, state: 'running', outcome: 'incomplete', installedApproval: 'not-assessed',
    releaseEligible: false, reasons: ['Run has not completed'], source: { before: source, after: null },
    fixtures: { before: fixtures, after: null }, build: { root: buildRoot, state: 'not-run', before: null, after: null },
    environment, errors: [], results: files.map(file => ({ file, status: 'not-run' })) };
}

export function recordResult(receipt, result) {
  const index = receipt.results.findIndex(item => item.file === result.file);
  if (index < 0 || receipt.results[index].status !== 'not-run') throw new Error(`Unexpected or duplicate harness result: ${result.file}`);
  if (!['pass', 'fail', 'skip'].includes(result.status)) throw new Error(`Invalid harness status: ${result.status}`);
  receipt.results[index] = result;
}

export function finishReceipt(receipt, { source, fixtures, build, exitCode, error = null }) {
  receipt.finishedAt = new Date().toISOString();
  receipt.source.after = source;
  receipt.fixtures.after = fixtures;
  receipt.build.after = build;
  if (error) receipt.errors.push(error);
  const reasons = [];
  const stable = (a, b) => !!a && !!b && a.sha256 === b.sha256;
  if (!stable(receipt.source.before, source) || receipt.source.before.commit !== source?.commit) reasons.push('Source changed during run');
  if (!stable(receipt.fixtures.before, fixtures)) reasons.push('Fixture identities changed during run');
  const noAppBuild = receipt.scope === 'self-test' && receipt.build.state === 'not-required';
  if (!noAppBuild && (!['pass', 'skipped'].includes(receipt.build.state) || !stable(receipt.build.before, build))) reasons.push('No stable build evidence');
  if (receipt.errors.length || exitCode !== 0) reasons.push('Run failed or interrupted');
  if (receipt.results.some(item => item.status === 'fail')) reasons.push('Harness failure');
  if (receipt.results.some(item => item.status === 'not-run')) reasons.push('Incomplete harness plan');
  if (receipt.results.some(item => item.status !== 'not-run' &&
    (!item.log || !/^[a-f0-9]{64}$/.test(item.log.sha256) || !Number.isInteger(item.log.bytes)
      || item.log.bytes < 0 || (item.status !== 'fail' &&
        (item.code !== 0 || item.timedOut || item.interrupted || item.logError || !item.resultLine))))) {
    reasons.push('Inconsistent harness evidence');
  }
  receipt.state = 'finished';
  receipt.outcome = reasons.length ? 'fail' : receipt.results.some(item => item.status === 'skip') ? 'skipped' : 'pass';
  if (receipt.scope !== 'full') reasons.push('Not a full gate');
  if (receipt.source.before.dirty || source?.dirty) reasons.push('Working tree is dirty');
  if (receipt.results.some(item => item.status === 'skip')) reasons.push('Harnesses skipped');
  if (receipt.fixtures.before.files.some(item => item.missing)) reasons.push('Registered fixtures missing');
  if (receipt.build.state === 'skipped') reasons.push('Build was skipped');
  if (receipt.build.state === 'not-required') reasons.push('No app build tested');
  if (receipt.environment.appRootOverride) reasons.push('App root overridden');
  receipt.reasons = reasons;
  receipt.releaseEligible = reasons.length === 0;
  return receipt;
}

export async function saveReceipt(path, receipt) {
  const temporary = `${path}.pending`;
  const bytes = JSON.stringify(receipt, null, 2) + '\n';
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
  if (await readFile(path, 'utf8') !== bytes) throw new Error('Receipt read-back mismatch');
}
